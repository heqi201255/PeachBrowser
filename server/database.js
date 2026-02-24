const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let db = null;
let config = null;
let SQL = null;

async function init(configObj) {
  config = configObj;
  const dbPath = config.database.path;
  const dbDir = path.dirname(dbPath);
  
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  SQL = await initSqlJs();
  
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  db.run('PRAGMA foreign_keys = ON');
  createTables();
  await ensureAdminUser();
  return db;
}

async function ensureAdminUser() {
  const database = getDb();
  const admin = database.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  
  if (!admin) {
    const passwordHash = await bcrypt.hash('admin', 10);
    database.prepare(`
      INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)
    `).run('admin', passwordHash);
  }
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS libraries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_scanned DATETIME
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS user_libraries (
      user_id INTEGER NOT NULL,
      library_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, library_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS media_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      library_id INTEGER NOT NULL,
      relative_path TEXT NOT NULL,
      filename TEXT NOT NULL,
      extension TEXT NOT NULL,
      file_size INTEGER,
      content_md5 TEXT NOT NULL,
      file_type TEXT NOT NULL,
      has_thumbnail INTEGER DEFAULT 0,
      is_corrupted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(library_id, relative_path),
      FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS media_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id INTEGER UNIQUE NOT NULL,
      width INTEGER,
      height INTEGER,
      duration REAL,
      fps REAL,
      bitrate INTEGER,
      codec TEXT,
      metadata_json TEXT,
      FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      position REAL DEFAULT 0,
      completed INTEGER DEFAULT 0,
      last_played DATETIME DEFAULT CURRENT_TIMESTAMP,
      play_count INTEGER DEFAULT 1,
      UNIQUE(media_id, user_id),
      FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      library_id INTEGER,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, library_id, user_id),
      FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS media_tags (
      media_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (media_id, tag_id),
      FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS media_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 0 AND rating <= 5),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(media_id, user_id),
      FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE
    )
  `);
  
  createIndexIfNotExists('idx_media_library', 'media_files(library_id)');
  createIndexIfNotExists('idx_media_md5', 'media_files(content_md5)');
  createIndexIfNotExists('idx_media_type', 'media_files(file_type)');
  createIndexIfNotExists('idx_play_history_user', 'play_history(user_id)');
  createIndexIfNotExists('idx_tags_library', 'tags(library_id, user_id)');
  createIndexIfNotExists('idx_user_libraries', 'user_libraries(user_id, library_id)');
  save();
}

function addColumnIfNotExists(tableName, columnName, columnDef) {
  try {
    const result = db.exec(`PRAGMA table_info(${tableName})`);
    const columns = result[0]?.values.map(v => v[1]) || [];
    if (!columns.includes(columnName)) {
      db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
      save();
    }
  } catch (err) {}
}

function createIndexIfNotExists(indexName, indexDef) {
  try {
    db.run(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${indexDef}`);
  } catch (err) {}
}

function save() {
  if (db && config) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(config.database.path, buffer);
  }
}

function prepare(sql) {
  return {
    run: (...params) => {
      try {
        db.run(sql, params);
        const lastId = getLastInsertRowId();
        const changesCount = getChanges();
        save();
        const info = { lastInsertRowid: lastId, changes: changesCount };
        return info;
      } catch (err) {
        console.error('SQL run error:', err, sql, params);
        throw err;
      }
    },
    get: (...params) => {
      try {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          stmt.free();
          return row;
        }
        stmt.free();
        return undefined;
      } catch (err) {
        console.error('SQL get error:', err, sql, params);
        throw err;
      }
    },
    all: (...params) => {
      try {
        const results = [];
        const stmt = db.prepare(sql);
        stmt.bind(params);
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      } catch (err) {
        console.error('SQL all error:', err, sql, params);
        throw err;
      }
    }
  };
}

function getLastInsertRowId() {
  const result = db.exec("SELECT last_insert_rowid() as id");
  if (result.length > 0 && result[0].values.length > 0) {
    return result[0].values[0][0];
  }
  return 0;
}

function getChanges() {
  const result = db.exec("SELECT changes()");
  if (result.length > 0 && result[0].values.length > 0) {
    return result[0].values[0][0];
  }
  return 0;
}

function exec(sql) {
  db.exec(sql);
  save();
}

function getDb() {
  return {
    prepare,
    exec,
    run: (sql, params) => {
      db.run(sql, params || []);
      save();
    }
  };
}

function close() {
  if (db) {
    save();
    db.close();
    db = null;
  }
}

module.exports = { init, getDb, close, save };
