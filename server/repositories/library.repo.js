const db = require('../database');

function findById(libraryId) {
  return db.getDb().prepare('SELECT * FROM libraries WHERE id = ?').get(libraryId);
}

function findAll() {
  return db.getDb().prepare('SELECT * FROM libraries ORDER BY id DESC').all();
}

function findByUserId(userId) {
  return db.getDb().prepare(`
    SELECT l.* FROM libraries l
    INNER JOIN user_libraries ul ON l.id = ul.library_id
    WHERE ul.user_id = ?
    ORDER BY l.id DESC
  `).all(userId);
}

function findUserLibraries(userId, isAdmin) {
  if (isAdmin) {
    return findAll();
  }
  return findByUserId(userId);
}

function create(name, folderPath) {
  const result = db.getDb().prepare(
    'INSERT INTO libraries (name, path) VALUES (?, ?)'
  ).run(name, folderPath);
  return { id: result.lastInsertRowid, name, path: folderPath };
}

function deleteById(libraryId) {
  db.getDb().prepare('DELETE FROM user_libraries WHERE library_id = ?').run(libraryId);
  db.getDb().prepare('DELETE FROM tags WHERE library_id = ?').run(libraryId);
  db.getDb().prepare('DELETE FROM libraries WHERE id = ?').run(libraryId);
}

function checkUserAccess(userId, libraryId) {
  const user = db.getDb().prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
  if (user?.is_admin) {
    return findById(libraryId);
  }
  return db.getDb().prepare(`
    SELECT l.* FROM libraries l
    INNER JOIN user_libraries ul ON l.id = ul.library_id
    WHERE l.id = ? AND ul.user_id = ?
  `).get(libraryId, userId);
}

function associateUser(userId, libraryId) {
  db.getDb().prepare(
    'INSERT OR IGNORE INTO user_libraries (user_id, library_id) VALUES (?, ?)'
  ).run(userId, libraryId);
}

function updateUserLibraries(userId, libraryIds) {
  db.getDb().prepare('DELETE FROM user_libraries WHERE user_id = ?').run(userId);
  
  if (libraryIds && libraryIds.length > 0) {
    const stmt = db.getDb().prepare('INSERT INTO user_libraries (user_id, library_id) VALUES (?, ?)');
    for (const libraryId of libraryIds) {
      stmt.run(userId, libraryId);
    }
  }
}

function updateLastScanned(libraryId) {
  db.getDb().prepare('UPDATE libraries SET last_scanned = datetime("now") WHERE id = ?').run(libraryId);
}

module.exports = {
  findById,
  findAll,
  findByUserId,
  findUserLibraries,
  create,
  deleteById,
  checkUserAccess,
  associateUser,
  updateUserLibraries,
  updateLastScanned
};