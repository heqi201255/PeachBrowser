const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const config = require('../config.json');
const db = require('./database');
const scanner = require('./scanner');
const thumbnail = require('./thumbnail');
const metadata = require('./metadata');

const { spawn } = require('child_process');

const app = express();
const upload = multer({ dest: 'data/uploads/' });

const scanProgress = {
  active: new Map(),
  start(libraryId, libraryName, stage, total) {
    this.active.set(libraryId, {
      libraryId,
      libraryName,
      stage,
      current: 0,
      total,
      startTime: Date.now()
    });
  },
  update(libraryId, current) {
    const progress = this.active.get(libraryId);
    if (progress) {
      progress.current = current;
    }
  },
  setStage(libraryId, stage, total) {
    const progress = this.active.get(libraryId);
    if (progress) {
      progress.stage = stage;
      progress.current = 0;
      progress.total = total;
    }
  },
  complete(libraryId) {
    this.active.delete(libraryId);
  },
  get(libraryId) {
    return this.active.get(libraryId);
  },
  getAll() {
    return Array.from(this.active.values());
  }
};

app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.userId = decoded.userId;
    req.username = decoded.username;
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

function batchDeleteMediaFiles(database, libraryName, deletedFiles){
  for (const file of deletedFiles) {
    const { thumbnailPath } = thumbnail.getThumbnailPath(libraryName, file.relative_path);
    if (fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath);
    }
  }
  const placeholders = deletedFiles.map(() => '?').join(',');
  database.prepare(`DELETE FROM media_metadata WHERE media_id IN (${placeholders})`).run(...deletedFiles.map(f => f.id));
  database.prepare(`DELETE FROM play_history WHERE media_id IN (${placeholders})`).run(...deletedFiles.map(f => f.id));
  database.prepare(`DELETE FROM media_tags WHERE media_id IN (${placeholders})`).run(...deletedFiles.map(f => f.id));
  database.prepare(`DELETE FROM media_ratings WHERE media_id IN (${placeholders})`).run(...deletedFiles.map(f => f.id));
  database.prepare(`DELETE FROM media_files WHERE id IN (${placeholders})`).run(...deletedFiles.map(f => f.id));
}

function checkLibraryAccess(database, userId, libraryId) {
  const user = database.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
  if (user?.is_admin) {
    return database.prepare('SELECT * FROM libraries WHERE id = ?').get(libraryId);
  }
  return database.prepare(`
    SELECT l.* FROM libraries l
    INNER JOIN user_libraries ul ON l.id = ul.library_id
    WHERE l.id = ? AND ul.user_id = ?
  `).get(libraryId, userId);
}

/** Build path condition for media queries (table alias for main/count: m, for dir: none) */
function buildPathCondition(currentPath, tableAlias = 'm', recursive = false) {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  if (recursive) {
    if (currentPath) {
      return {
        pathCondition: ` AND ${prefix}relative_path LIKE ?`,
        pathParams: [`${currentPath}/%`]
      };
    }
    return { pathCondition: '', pathParams: [] };
  }
  if (currentPath) {
    return {
      pathCondition: ` AND ${prefix}relative_path LIKE ? AND ${prefix}relative_path NOT LIKE ?`,
      pathParams: [`${currentPath}/%`, `${currentPath}/%/%`]
    };
  }
  return {
    pathCondition: ` AND ${prefix}relative_path NOT LIKE ?`,
    pathParams: ['%/%']
  };
}

/** Build type/tag/search filter conditions and append to params */
function buildMediaFilters(baseParams, { type, tag, search, userId }, tableAlias = 'm') {
  let conditions = '';
  const params = [...baseParams];
  const prefix = tableAlias ? `${tableAlias}.` : '';
  if (type && type !== 'all') {
    conditions += ` AND ${prefix}file_type = ?`;
    params.push(type);
  }
  if (tag) {
    conditions += ` AND ${prefix}id IN (SELECT mt.media_id FROM media_tags mt INNER JOIN tags t ON mt.tag_id = t.id WHERE t.user_id = ? AND t.name = ?)`;
    params.push(userId, tag);
  }
  if (search) {
    conditions += ` AND (${prefix}filename LIKE ? OR ${prefix}relative_path LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  return { conditions, params };
}

/** Build SQL to get immediate subdirectory names under currentPath */
function buildDirSql(libraryId, currentPath, { type, search }) {
  const dirTypeCondition = type && type !== 'all' ? ' AND file_type = ?' : '';
  const dirTypeParams = type && type !== 'all' ? [type] : [];
  const dirSearchCondition = search ? ' AND (filename LIKE ? OR relative_path LIKE ?)' : '';
  const dirSearchParams = search ? [`%${search}%`, `%${search}%`] : [];
  if (currentPath) {
    return {
      sql: `
        SELECT DISTINCT
          CASE
            WHEN substr(relative_path, length(?) + 2) LIKE '%/%'
            THEN substr(substr(relative_path, length(?) + 2), 1, instr(substr(relative_path, length(?) + 2), '/') - 1)
            ELSE NULL
          END as dir_name
        FROM media_files
        WHERE library_id = ? AND relative_path LIKE ? AND relative_path LIKE ?${dirTypeCondition}${dirSearchCondition}
      `,
      params: [currentPath, currentPath, currentPath, libraryId, `${currentPath}/%`, `${currentPath}/%/%`, ...dirTypeParams, ...dirSearchParams]
    };
  }
  return {
    sql: `
      SELECT DISTINCT
        CASE
          WHEN relative_path LIKE '%/%'
          THEN substr(relative_path, 1, instr(relative_path, '/') - 1)
          ELSE NULL
        END as dir_name
      FROM media_files
      WHERE library_id = ? AND relative_path LIKE '%/%'${dirTypeCondition}${dirSearchCondition}
    `,
    params: [libraryId, ...dirTypeParams, ...dirSearchParams]
  };
}

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  if (username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Username must be at least 3 characters, password at least 4' });
  }
  
  const database = db.getDb();
  const existing = database.prepare('SELECT id FROM users WHERE username = ?').get(username);
  
  if (existing) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  
  const passwordHash = await bcrypt.hash(password, 10);
  
  try {
    const result = database.prepare(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)'
    ).run(username, passwordHash);
    
    const token = jwt.sign({ userId: result.lastInsertRowid, username }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn
    });
    
    res.json({ token, userId: result.lastInsertRowid, username });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const database = db.getDb();
  const user = database.prepare('SELECT * FROM users WHERE username = ?').get(username);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const valid = await bcrypt.compare(password, user.password_hash);
  
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  database.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').run(user.id);
  
  const token = jwt.sign({ userId: user.id, username: user.username }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn
  });
  
  res.json({ token, userId: user.id, username: user.username });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, userId: req.userId, username: req.username });
});

app.get('/api/libraries', authMiddleware, (req, res) => {
  const database = db.getDb();
  const user = database.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId);
  
  let libraries;
  if (user?.is_admin) {
    // Admin sees all libraries
    libraries = database.prepare('SELECT * FROM libraries ORDER BY id DESC').all();
  } else {
    // Regular user sees only assigned libraries
    libraries = database.prepare(`
      SELECT l.* FROM libraries l
      INNER JOIN user_libraries ul ON l.id = ul.library_id
      WHERE ul.user_id = ?
      ORDER BY l.id DESC
    `).all(req.userId);
  }
  
  res.json(libraries || []);
});

app.post('/api/libraries', authMiddleware, async (req, res) => {
  const { name, folderPath } = req.body;
  
  // Check if user is admin
  const database = db.getDb();
  const user = database.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId);
  if (!user?.is_admin) {
    return res.status(403).json({ error: 'Only admin can create libraries' });
  }
  
  if (!name || !folderPath) {
    return res.status(400).json({ error: 'Name and folder path required' });
  }
  
  if (!fs.existsSync(folderPath)) {
    return res.status(400).json({ error: 'Folder does not exist' });
  }
  
  // Check if library already exists at this path
  const existing = database.prepare('SELECT id FROM libraries WHERE path = ?').get(folderPath);
  
  if (existing) {
    return res.status(400).json({ error: 'Library already exists at this path' });
  }
  
  try {
    // Insert library without user_id (using user_libraries table instead)
    const result = database.prepare(
      'INSERT INTO libraries (name, path) VALUES (?, ?)'
    ).run(name, folderPath);
    
    const libraryId = result.lastInsertRowid;
    
    // Associate the library with the creating user
    database.prepare(
      'INSERT OR IGNORE INTO user_libraries (user_id, library_id) VALUES (?, ?)'
    ).run(req.userId, libraryId);
    
    scanLibraryAsync(libraryId, name, folderPath, req.userId);
    
    res.json({ id: libraryId, name, path: folderPath });
  } catch (err) {
    console.error('Create library error:', err);
    res.status(500).json({ error: 'Failed to create library' });
  }
});

app.delete('/api/libraries/:id', authMiddleware, async (req, res) => {
  const database = db.getDb();
  const libraryId = parseInt(req.params.id);
  
  const user = database.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId);
  if (!user?.is_admin) {
    return res.status(403).json({ error: 'Only admin can delete libraries' });
  }
  
  const library = database.prepare('SELECT * FROM libraries WHERE id = ?').get(libraryId);
  
  if (!library) {
    return res.status(404).json({ error: 'Library not found' });
  }
  
  const thumbnailDir = path.join(config.thumbnails.path, library.name);
  
  try {
    if (fs.existsSync(thumbnailDir)) {
      fs.rmSync(thumbnailDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error('Error deleting thumbnail folder:', err);
  }
  database.prepare('DELETE FROM user_libraries WHERE library_id = ?').run(libraryId);
  let deletedFiles = database.prepare('SELECT id, relative_path from media_files WHERE library_id = ?').all(libraryId)
  batchDeleteMediaFiles(database, library.name, deletedFiles)
  database.prepare('DELETE FROM tags WHERE library_id = ?').run(libraryId);
  database.prepare('DELETE FROM libraries WHERE id = ?').run(libraryId);
  
  res.json({ success: true });
});

app.get('/api/libraries/:id/media', authMiddleware, (req, res) => {
  const { page = 1, pageSize = config.pagination.defaultPageSize, type, tag, search, path: currentPath = '', recursive = 'false' } = req.query;
  const database = db.getDb();
  const libraryId = parseInt(req.params.id);
  const filters = { type, tag, search, userId: req.userId };
  const isRecursive = recursive === 'true';

  const library = checkLibraryAccess(database, req.userId, libraryId);
  if (!library) {
    return res.status(404).json({ error: 'Library not found' });
  }

  const { pathCondition, pathParams } = buildPathCondition(currentPath, 'm', isRecursive);
  const pageSizeNum = parseInt(pageSize);
  const offset = (parseInt(page) - 1) * pageSizeNum;

  // Count total
  const { conditions: countFilters, params: countParams } = buildMediaFilters(
    [libraryId, ...pathParams],
    filters
  );
  const countResult = database.prepare(
    'SELECT COUNT(*) as total FROM media_files m WHERE m.library_id = ?' + pathCondition + countFilters
  ).get(...countParams);
  const totalFiles = countResult?.total || 0;

  // Subdirectories (filtered by type and search) - skip in recursive mode
  const directories = isRecursive ? [] : database.prepare(buildDirSql(libraryId, currentPath, { type, search }).sql).all(...buildDirSql(libraryId, currentPath, { type, search }).params)
    .filter(r => r.dir_name !== null)
    .map(r => r.dir_name);

  // Main media list with JOINs (avoids N+1 for metadata, play_history, rating)
  const { conditions: mediaFilters, params: mediaBaseParams } = buildMediaFilters(
    [libraryId, ...pathParams],
    filters
  );
  const mediaSql = `
    SELECT m.id, m.library_id, m.relative_path, m.filename, m.extension, m.file_size,
           m.content_md5, m.file_type, m.has_thumbnail, m.is_corrupted, m.created_at,
           mm.width, mm.height, mm.duration, mm.fps, mm.bitrate, mm.codec,
           ph.position as play_position, ph.play_count, ph.last_played,
           COALESCE(mr.rating, 0) as rating
    FROM media_files m
    LEFT JOIN media_metadata mm ON m.id = mm.media_id
    LEFT JOIN play_history ph ON m.id = ph.media_id AND ph.user_id = ?
    LEFT JOIN media_ratings mr ON m.id = mr.media_id AND mr.user_id = ?
    WHERE m.library_id = ?${pathCondition}${mediaFilters}
    ORDER BY m.id DESC LIMIT ? OFFSET ?
  `;
  const mediaParams = [req.userId, req.userId, ...mediaBaseParams, pageSizeNum, offset];
  const media = database.prepare(mediaSql).all(...mediaParams) || [];

  // Batch fetch tags (1 query instead of N)
  const mediaIds = media.map(m => m.id);
  let tagsByMediaId = {};
  if (mediaIds.length > 0) {
    const placeholders = mediaIds.map(() => '?').join(',');
    const tagRows = database.prepare(`
      SELECT mt.media_id, t.name FROM media_tags mt
      INNER JOIN tags t ON t.id = mt.tag_id
      WHERE mt.media_id IN (${placeholders}) AND t.user_id = ?
    `).all(...mediaIds, req.userId) || [];
    for (const row of tagRows) {
      if (!tagsByMediaId[row.media_id]) tagsByMediaId[row.media_id] = [];
      tagsByMediaId[row.media_id].push(row.name);
    }
  }

  const mediaWithMeta = media.map(m => {
    const ext = m.extension?.toLowerCase();
    const isGif = ext === '.gif';
    let thumbnailUrl = null;
    
    if (m.has_thumbnail) {
      if (isGif) {
        thumbnailUrl = `/api/libraries/${libraryId}/files/${encodeURIComponent(m.relative_path)}?token=${req.token}`;
      } else {
        thumbnailUrl = `/api/libraries/${libraryId}/thumbnails/${encodeURIComponent(m.relative_path.replace(/\.[^.]+$/, '.jpg'))}?token=${req.token}`;
      }
    }
    
    return {
      ...m,
      tags: tagsByMediaId[m.id] || [],
      thumbnailUrl
    };
  });

  res.json({
    library,
    media: mediaWithMeta,
    directories: directories.map(dirName => ({
      name: dirName,
      path: currentPath ? `${currentPath}/${dirName}` : dirName
    })),
    currentPath: currentPath || '',
    pagination: {
      page: parseInt(page),
      pageSize: pageSizeNum,
      total: totalFiles,
      totalPages: Math.ceil(totalFiles / pageSizeNum)
    }
  });
});

app.get('/api/libraries/:id/directories', authMiddleware, (req, res) => {
  const database = db.getDb();
  const libraryId = parseInt(req.params.id);
  const parentPath = req.query.path || '';
  
  const library = checkLibraryAccess(database, req.userId, libraryId);
  
  if (!library) {
    return res.status(404).json({ error: 'Library not found' });
  }
  
  let sql = '';
  let params = [];
  
  if (parentPath) {
    const prefix = `${parentPath}/`;
    const prefixLen = prefix.length;
    sql = `
      SELECT DISTINCT 
        substr(substr(relative_path, ${prefixLen + 1}), 1, instr(substr(relative_path, ${prefixLen + 1}), '/') - 1) as name
      FROM media_files
      WHERE library_id = ? AND relative_path LIKE ?
    `;
    params = [libraryId, `${parentPath}/%`];
  } else {
    sql = `
      SELECT DISTINCT 
        substr(relative_path, 1, instr(relative_path, '/') - 1) as name
      FROM media_files
      WHERE library_id = ? AND relative_path LIKE '%/%'
    `;
    params = [libraryId];
  }
  
  const rows = database.prepare(sql).all(...params) || [];
  
  const directories = [];
  const seen = new Set();
  
  for (const row of rows) {
    if (row.name && !seen.has(row.name)) {
      seen.add(row.name);
      const fullPath = parentPath ? `${parentPath}/${row.name}` : row.name;
      const hasSubdirs = database.prepare(
        'SELECT 1 FROM media_files WHERE library_id = ? AND relative_path LIKE ? LIMIT 1'
      ).get(libraryId, `${fullPath}/%/%`) ? true : false;
      
      directories.push({
        name: row.name,
        path: fullPath,
        hasSubdirs
      });
    }
  }
  
  res.json(directories);
});

app.get('/api/libraries/:id/thumbnails/:path(*)', authMiddleware, (req, res) => {
  try {
    const database = db.getDb();
    const libraryId = parseInt(req.params.id);
    
    const library = checkLibraryAccess(database, req.userId, libraryId);
    
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    const decodedPath = decodeURIComponent(req.params.path);
    const thumbnailPath = path.join(config.thumbnails.path, library.name, decodedPath);
    const resolvedPath = path.resolve(thumbnailPath);
    const resolvedBase = path.resolve(config.thumbnails.path, library.name);
    
    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(403).json({ error: 'Invalid path' });
    }
    
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }
    
    res.sendFile(resolvedPath);
  } catch (err) {
    console.error('Thumbnail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/libraries/:id/files/:path(*)', authMiddleware, (req, res) => {
  try {
    const database = db.getDb();
    const libraryId = parseInt(req.params.id);
    
    const library = checkLibraryAccess(database, req.userId, libraryId);
    
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    const decodedPath = decodeURIComponent(req.params.path);
    const filePath = path.join(library.path, decodedPath);
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(library.path);
    
    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(403).json({ error: 'Invalid path' });
    }
    
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(resolvedPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': getMimeType(resolvedPath),
      };
      res.writeHead(206, head);
      const stream = fs.createReadStream(resolvedPath, { start, end });
      stream.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': getMimeType(resolvedPath),
      };
      res.writeHead(200, head);
      const stream = fs.createReadStream(resolvedPath);
      stream.pipe(res);
    }
  } catch (err) {
    console.error('File serving error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

async function scanLibraryAsync(libraryId, libraryName, libraryPath, userId) {
  const database = db.getDb();
  
  scanProgress.start(libraryId, libraryName, 'scanning', 0);
  
  try {
    const existingFilesRows = database.prepare(`
      SELECT relative_path, content_md5, file_size FROM media_files WHERE library_id = ?
    `).all(libraryId);
    
    const existingFiles = new Map(
      existingFilesRows.map(row => [row.relative_path, { content_md5: row.content_md5, file_size: row.file_size }])
    );
    
    const files = await scanner.scanLibrary(libraryPath, existingFiles);
    console.log(`Found ${files.length} files in library ${libraryName}`);
    
    scanProgress.setStage(libraryId, 'processing', files.length);
    
    const insertMedia = database.prepare(`
      INSERT OR IGNORE INTO media_files (library_id, relative_path, filename, extension, file_size, content_md5, file_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const getMedia = database.prepare(`
      SELECT id FROM media_files WHERE library_id = ? AND relative_path = ?
    `);
    
    const insertMetadata = database.prepare(`
      INSERT OR IGNORE INTO media_metadata (media_id, width, height, duration, fps, bitrate, codec)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const updateThumbnail = database.prepare(`
      UPDATE media_files SET has_thumbnail = 1 WHERE id = ?
    `);
    
    const markCorrupted = database.prepare(`
      UPDATE media_files SET is_corrupted = 1 WHERE id = ?
    `);
    
    const unmarkCorrupted = database.prepare(`
      UPDATE media_files SET is_corrupted = 0, has_thumbnail = 1 WHERE id = ?
    `);
    
    const thumbnailsToGenerate = [];
    let processedCount = 0;
    
    for (const file of files) {
      if (!file.isNew) continue;
      
      insertMedia.run(
        libraryId,
        file.relativePath,
        file.filename,
        file.extension,
        file.fileSize,
        file.contentMd5,
        file.fileType
      );
      
      const mediaRecord = getMedia.get(libraryId, file.relativePath);
      if (mediaRecord) {
        let meta = database.prepare('SELECT id, duration FROM media_metadata WHERE media_id = ?').get(mediaRecord.id);
        if (!meta && (file.fileType === 'video' || file.fileType === 'image' || file.fileType === 'audio')) {
          meta = await metadata.getMediaMetadata(file.fullPath);
          if (meta) {
            insertMetadata.run(
              mediaRecord.id,
              meta.width,
              meta.height,
              meta.duration,
              meta.fps,
              meta.bitrate,
              meta.codec
            );
          }
        }
        
        if (file.fileType === 'video' || file.fileType === 'image') {
          const ext = file.extension?.toLowerCase();
          const isGif = ext === '.gif';
          
          if (isGif) {
            updateThumbnail.run(mediaRecord.id);
          } else {
            const { thumbnailPath } = thumbnail.getThumbnailPath(libraryName, file.relativePath);
            if (!fs.existsSync(thumbnailPath)) {
              thumbnailsToGenerate.push({
                mediaId: mediaRecord.id,
                filePath: file.fullPath,
                libraryName,
                duration: meta?.duration,
                relativePath: file.relativePath,
                fileType: file.fileType
              });
            } else {
              updateThumbnail.run(mediaRecord.id);
            }
          }
        }
      }
      
      processedCount++;
      if (processedCount % 10 === 0) {
        scanProgress.update(libraryId, processedCount);
      }
    }
    
    database.prepare('UPDATE libraries SET last_scanned = datetime("now") WHERE id = ?').run(libraryId);
    
    const corruptedFiles = database.prepare(`
      SELECT m.id, m.relative_path, m.file_type, l.name as library_name,
             mm.duration, m.extension
      FROM media_files m
      LEFT JOIN media_metadata mm ON m.id = mm.media_id
      INNER JOIN libraries l ON m.library_id = l.id
      WHERE m.library_id = ? AND m.is_corrupted = 1
    `).all(libraryId);
    
    if (corruptedFiles.length > 0) {
      console.log(`Re-processing ${corruptedFiles.length} corrupted files...`);
      for (const file of corruptedFiles) {
        const fullPath = path.join(libraryPath, file.relative_path);
        const ext = file.extension?.toLowerCase();
        const isGif = ext === '.gif';
        
        if (isGif) {
          unmarkCorrupted.run(file.id);
          updateThumbnail.run(file.id);
        } else if (fs.existsSync(fullPath)) {
          const { thumbnailPath } = thumbnail.getThumbnailPath(file.library_name, file.relative_path);
          if (!fs.existsSync(thumbnailPath)) {
            thumbnailsToGenerate.push({
              mediaId: file.id,
              filePath: fullPath,
              libraryName: file.library_name,
              duration: file.duration,
              relativePath: file.relative_path,
              fileType: file.file_type
            });
          } else {
            unmarkCorrupted.run(file.id);
          }
        } else {
          console.log(`File no longer exists: ${fullPath}, removing corrupted flag`);
          database.prepare('UPDATE media_files SET is_corrupted = 0 WHERE id = ?').run(file.id);
        }
      }
    }
    
    if (thumbnailsToGenerate.length > 0) {
      scanProgress.setStage(libraryId, 'thumbnails', thumbnailsToGenerate.length);
      console.log(`Generating ${thumbnailsToGenerate.length} thumbnails...`);
      
      let completedThumbnails = 0;
      thumbnail.addToQueue(thumbnailsToGenerate, (mediaId, result) => {
        completedThumbnails++;
        scanProgress.update(libraryId, completedThumbnails);
        
        if (result.success) {
          unmarkCorrupted.run(mediaId);
          updateThumbnail.run(mediaId);
        } else if (result.reason === 'generation_failed') {
          markCorrupted.run(mediaId);
        }
      }, () => {
        scanProgress.complete(libraryId);
      });
    } else {
      scanProgress.complete(libraryId);
    }
    
    console.log(`Scanned library ${libraryName}: ${files.length} files found, ${files.filter(f => f.isNew).length} new`);
  } catch (err) {
    console.error(`Error scanning library ${libraryName}:`, err);
    scanProgress.complete(libraryId);
  }
}

app.post('/api/media/:id/play', authMiddleware, (req, res) => {
  const { position, completed } = req.body;
  const database = db.getDb();
  const mediaId = parseInt(req.params.id);
  
  const media = database.prepare(`
    SELECT m.id, m.library_id FROM media_files m
    WHERE m.id = ?
  `).get(mediaId);
  
  if (!media) {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  const hasAccess = checkLibraryAccess(database, req.userId, media.library_id);
  if (!hasAccess) {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  const existing = database.prepare(
    'SELECT id FROM play_history WHERE media_id = ? AND user_id = ?'
  ).get(mediaId, req.userId);
  
  if (existing) {
    database.prepare(`
      UPDATE play_history SET
        position = ?,
        completed = ?,
        last_played = datetime("now"),
        play_count = play_count + 1
      WHERE media_id = ? AND user_id = ?
    `).run(position || 0, completed ? 1 : 0, mediaId, req.userId);
  } else {
    database.prepare(`
      INSERT INTO play_history (media_id, user_id, position, completed, last_played, play_count)
      VALUES (?, ?, ?, ?, datetime("now"), 1)
    `).run(mediaId, req.userId, position || 0, completed ? 1 : 0);
  }
  
  res.json({ success: true });
});

app.get('/api/media/:id', authMiddleware, (req, res) => {
  const database = db.getDb();
  const mediaId = parseInt(req.params.id);
  
  const media = database.prepare(`
    SELECT m.*, l.path as library_path, l.name as library_name, l.id as library_id
    FROM media_files m
    INNER JOIN libraries l ON m.library_id = l.id
    WHERE m.id = ?
  `).get(mediaId);
  
  if (!media) {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  const hasAccess = checkLibraryAccess(database, req.userId, media.library_id);
  if (!hasAccess) {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  const meta = database.prepare(
    'SELECT width, height, duration, fps, bitrate, codec FROM media_metadata WHERE media_id = ?'
  ).get(mediaId);
  
  const playHistory = database.prepare(
    'SELECT position as play_position, play_count, last_played FROM play_history WHERE media_id = ? AND user_id = ?'
  ).get(mediaId, req.userId);
  
  const tags = database.prepare(`
    SELECT t.id, t.name FROM tags t
    INNER JOIN media_tags mt ON t.id = mt.tag_id
    WHERE mt.media_id = ? AND t.user_id = ?
  `).all(mediaId, req.userId) || [];
  
  res.json({
    ...media,
    ...meta,
    ...playHistory,
    tags: tags.map(t => t.name),
    fileUrl: `/api/libraries/${media.library_id}/files/${encodeURIComponent(media.relative_path)}`,
    thumbnailUrl: media.has_thumbnail ?
      `/api/libraries/${media.library_id}/thumbnails/${encodeURIComponent(media.relative_path.replace(/\.[^.]+$/, '.jpg'))}` :
      null
  });
});

app.delete('/api/media/:id', authMiddleware, async (req, res) => {
  const database = db.getDb();
  const mediaId = parseInt(req.params.id);
  
  const media = database.prepare(`
    SELECT m.*, l.path as library_path, l.name as library_name FROM media_files m
    INNER JOIN libraries l ON m.library_id = l.id
    WHERE m.id = ?
  `).get(mediaId);
  
  if (!media) {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  const hasAccess = checkLibraryAccess(database, req.userId, media.library_id);
  if (!hasAccess) {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  const filePath = path.join(media.library_path, media.relative_path);
  
  try {
    if (fs.existsSync(filePath)) {
      const trash = (await import('trash')).default;
      await trash(filePath);
    }
    
    const { thumbnailPath } = thumbnail.getThumbnailPath(media.library_name, media.relative_path);
    if (fs.existsSync(thumbnailPath)) {
      const trash = (await import('trash')).default;
      await trash(thumbnailPath);
    }
    database.prepare('DELETE FROM media_metadata WHERE media_id = ?').run(mediaId);
    database.prepare('DELETE FROM play_history WHERE media_id = ?').run(mediaId);
    database.prepare('DELETE FROM media_tags WHERE media_id = ?').run(mediaId);
    database.prepare('DELETE FROM media_ratings WHERE media_id = ?').run(mediaId);
    database.prepare('DELETE FROM media_files WHERE id = ?').run(mediaId);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

app.post('/api/media/:id/tags', authMiddleware, (req, res) => {
  const { tagName } = req.body;
  const database = db.getDb();
  const mediaId = parseInt(req.params.id);
  
  if (!tagName) {
    return res.status(400).json({ error: 'Tag name required' });
  }
  
  const media = database.prepare(`
    SELECT m.id, m.library_id FROM media_files m
    WHERE m.id = ?
  `).get(mediaId);
  
  if (!media) {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  const hasAccess = checkLibraryAccess(database, req.userId, media.library_id);
  if (!hasAccess) {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  let tag = database.prepare(
    'SELECT * FROM tags WHERE name = ? AND library_id = ? AND user_id = ?'
  ).get(tagName, media.library_id, req.userId);
  
  if (!tag) {
    const result = database.prepare(
      'INSERT INTO tags (name, library_id, user_id) VALUES (?, ?, ?)'
    ).run(tagName, media.library_id, req.userId);
    tag = { id: result.lastInsertRowid, name: tagName, library_id: media.library_id, user_id: req.userId };
  }
  
  const existing = database.prepare(
    'SELECT 1 FROM media_tags WHERE media_id = ? AND tag_id = ?'
  ).get(mediaId, tag.id);
  
  if (!existing) {
    database.prepare(
      'INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)'
    ).run(mediaId, tag.id);
  }
  
  res.json(tag);
});

app.delete('/api/media/:id/tags/:tagId', authMiddleware, (req, res) => {
  const database = db.getDb();
  
  const mediaId = parseInt(req.params.id);
  const tagId = parseInt(req.params.tagId);
  database.prepare(
    'DELETE FROM media_tags WHERE media_id = ? AND tag_id = ?'
  ).run(mediaId, tagId);
  // 如果该 tag 在 media_tags 里已经没有引用了，就把 tags 表里的 tag 也清理掉
  const row = database.prepare(
    'SELECT COUNT(*) as cnt FROM media_tags WHERE tag_id = ?'
  ).get(tagId);
  let remaining = row?.cnt ?? 0;

  if (remaining === 0) {
    // tags 现在是 user_id 归属（你希望的结构）
    database.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?').run(tagId, req.userId);
  }

  res.json({ success: true, removedTag: remaining === 0 });
});

app.get('/api/tags', authMiddleware, (req, res) => {
  const database = db.getDb();
  const libraryId = req.query.libraryId ? parseInt(req.query.libraryId) : null;
  
  let sql = `
    SELECT t.id, t.name, t.created_at,
           COUNT(DISTINCT mt.media_id) as media_count
    FROM tags t
    INNER JOIN media_tags mt ON t.id = mt.tag_id
    WHERE t.user_id = ?
  `;
  const params = [req.userId];
  
  if (libraryId) {
    sql += ' AND mt.media_id IN (SELECT id FROM media_files WHERE library_id = ?)';
    params.push(libraryId);
  }
  
  sql += ' GROUP BY t.id ORDER BY media_count DESC, t.name';
  
  const tags = database.prepare(sql).all(...params) || [];
  
  res.json(tags);
});

app.get('/api/media/:id/rating', authMiddleware, (req, res) => {
  const database = db.getDb();
  const mediaId = parseInt(req.params.id);
  
  const rating = database.prepare(
    'SELECT rating FROM media_ratings WHERE media_id = ? AND user_id = ?'
  ).get(mediaId, req.userId);
  
  res.json({ rating: rating?.rating || 0 });
});

app.post('/api/media/:id/rating', authMiddleware, (req, res) => {
  const { rating } = req.body;
  const database = db.getDb();
  const mediaId = parseInt(req.params.id);
  
  if (rating < 0 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 0 and 5' });
  }
  
  const media = database.prepare(`
    SELECT m.id, m.library_id FROM media_files m
    WHERE m.id = ?
  `).get(mediaId);
  
  if (!media) {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  const hasAccess = checkLibraryAccess(database, req.userId, media.library_id);
  if (!hasAccess) {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  const existing = database.prepare(
    'SELECT id FROM media_ratings WHERE media_id = ? AND user_id = ?'
  ).get(mediaId, req.userId);
  
  if (existing) {
    if (rating === 0) {
      database.prepare('DELETE FROM media_ratings WHERE media_id = ? AND user_id = ?')
        .run(mediaId, req.userId);
    } else {
      database.prepare('UPDATE media_ratings SET rating = ? WHERE media_id = ? AND user_id = ?')
        .run(rating, mediaId, req.userId);
    }
  } else if (rating > 0) {
    database.prepare('INSERT INTO media_ratings (media_id, user_id, rating) VALUES (?, ?, ?)')
      .run(mediaId, req.userId, rating);
  }
  
  res.json({ success: true, rating });
});

app.post('/api/libraries/:id/sync', authMiddleware, async (req, res) => {
  const database = db.getDb();
  const libraryId = parseInt(req.params.id);
  
  const library = checkLibraryAccess(database, req.userId, libraryId);
  
  if (!library) {
    return res.status(404).json({ error: 'Library not found' });
  }
  
  try {
    // Get all files from database
    const dbFiles = database.prepare(
      'SELECT id, relative_path FROM media_files WHERE library_id = ?'
    ).all(libraryId) || [];
    
    // Check which files no longer exist
    const deletedFiles = [];
    for (const file of dbFiles) {
      const filePath = path.join(library.path, file.relative_path);
      if (!fs.existsSync(filePath)) {
        deletedFiles.push(file);
      }
    }
    
    // Delete non-existent files and their thumbnails from database
    if (deletedFiles.length > 0) {
      batchDeleteMediaFiles(database, library.name, deletedFiles);
    }
    
    // Rescan for new files
    await scanLibraryAsync(libraryId, library.name, library.path, req.userId);
    
    // Fix missing thumbnails for video and non-GIF image files
    const missingThumbnailFiles = database.prepare(`
      SELECT m.id, m.relative_path, m.file_type, m.extension, mm.duration
      FROM media_files m
      LEFT JOIN media_metadata mm ON m.id = mm.media_id
      WHERE m.library_id = ? 
        AND m.has_thumbnail = 0 
        AND m.is_corrupted = 0 
        AND (m.file_type = 'video' OR m.file_type = 'image')
    `).all(libraryId) || [];
    
    let fixedThumbnails = 0;
    let generatedThumbnails = 0;
    const updateThumbnailStmt = database.prepare('UPDATE media_files SET has_thumbnail = 1 WHERE id = ?');
    
    for (const file of missingThumbnailFiles) {
      const ext = file.extension?.toLowerCase();
      if (ext === '.gif') continue;
      
      const { thumbnailPath } = thumbnail.getThumbnailPath(library.name, file.relative_path);
      
      if (fs.existsSync(thumbnailPath)) {
        updateThumbnailStmt.run(file.id);
        fixedThumbnails++;
      } else {
        const fullPath = path.join(library.path, file.relative_path);
        if (fs.existsSync(fullPath)) {
          try {
            const result = await thumbnail.generateThumbnail(
              fullPath,
              file.duration,
              library.name,
              file.relative_path,
              file.file_type
            );
            if (result.success) {
              updateThumbnailStmt.run(file.id);
              generatedThumbnails++;
            }
          } catch (err) {
            console.error(`Failed to generate thumbnail for ${file.relative_path}:`, err.message);
          }
        }
      }
    }
    
    res.json({ 
      success: true, 
      deleted: deletedFiles.length,
      fixedThumbnails,
      generatedThumbnails,
      message: `Sync completed. Removed ${deletedFiles.length} non-existent files, fixed ${fixedThumbnails} thumbnails, generated ${generatedThumbnails} new thumbnails.`
    });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Failed to sync library' });
  }
});

app.post('/api/libraries/:id/upload', authMiddleware, upload.single('file'), (req, res) => {
  const database = db.getDb();
  const libraryId = parseInt(req.params.id);
  
  const library = checkLibraryAccess(database, req.userId, libraryId);
  
  if (!library) {
    return res.status(404).json({ error: 'Library not found' });
  }
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const targetDir = req.body.targetDir || '';
  const targetPath = path.join(library.path, targetDir, req.file.originalname);
  const targetDirPath = path.dirname(targetPath);
  
  try {
    if (!fs.existsSync(targetDirPath)) {
      fs.mkdirSync(targetDirPath, { recursive: true });
    }
    
    fs.renameSync(req.file.path, targetPath);
    
    scanLibraryAsync(library.id, library.name, library.path, req.userId);
    
    res.json({ success: true, path: path.join(targetDir, req.file.originalname) });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

app.get('/api/media/:id/preview', authMiddleware, (req, res) => {
  const database = db.getDb();
  const mediaId = parseInt(req.params.id);
  const timeSeconds = parseFloat(req.query.time) || 0;
  
  const media = database.prepare(`
    SELECT m.*, l.path as library_path FROM media_files m
    INNER JOIN libraries l ON m.library_id = l.id
    WHERE m.id = ?
  `).get(mediaId);
  
  if (!media) {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  const hasAccess = checkLibraryAccess(database, req.userId, media.library_id);
  if (!hasAccess) {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  if (media.file_type !== 'video') {
    return res.status(400).json({ error: 'Not a video file' });
  }
  
  const filePath = path.join(media.library_path, media.relative_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const h = Math.floor(timeSeconds / 3600);
  const m = Math.floor((timeSeconds % 3600) / 60);
  const s = Math.floor(timeSeconds % 60);
  const ms = Math.floor((timeSeconds % 1) * 100);
  const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  
  const ffmpegArgs = [
    '-ss', timeStr,
    '-i', filePath,
    '-vframes', '1',
    '-vf', 'scale=160:-2',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-q:v', '5',
    '-'
  ];
  
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  
  const ffmpeg = spawn('ffmpeg', ffmpegArgs);
  
  ffmpeg.stdout.pipe(res);
  
  ffmpeg.stderr.on('data', () => {});
  
  ffmpeg.on('error', (err) => {
    console.error('FFmpeg error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to extract frame' });
    }
  });
  
  ffmpeg.on('close', (code) => {
    if (code !== 0 && !res.headersSent) {
      res.status(500).json({ error: 'Failed to extract frame' });
    }
  });
  
  req.on('close', () => {
    ffmpeg.kill();
  });
});

app.get('/api/thumbnail-status', authMiddleware, (req, res) => {
  res.json({
    queueLength: thumbnail.getQueueLength(),
    isProcessing: thumbnail.isCurrentlyProcessing()
  });
});

app.get('/api/scan-progress', authMiddleware, (req, res) => {
  res.json({
    active: scanProgress.getAll()
  });
});

// Change password
app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Old password and new password required' });
  }
  
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }
  
  const database = db.getDb();
  const user = database.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const valid = await bcrypt.compare(oldPassword, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid old password' });
  }
  
  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, req.userId);
  
  res.json({ success: true, message: 'Password changed successfully' });
});

// Admin: Get all users
app.get('/api/admin/users', authMiddleware, (req, res) => {
  const database = db.getDb();
  
  // Check if user is admin
  const user = database.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId);
  if (!user?.is_admin) {
    return res.status(403).json({ error: 'Only admin can access user management' });
  }
  
  const users = database.prepare(`
    SELECT u.id, u.username, u.is_admin, u.created_at, u.last_login,
           GROUP_CONCAT(DISTINCT ul.library_id) as library_ids
    FROM users u
    LEFT JOIN user_libraries ul ON u.id = ul.user_id
    GROUP BY u.id
    ORDER BY u.id
  `).all();
  
  res.json(users.map(u => ({
    ...u,
    library_ids: u.library_ids ? u.library_ids.split(',').map(id => parseInt(id)) : []
  })));
});

// Admin: Update user library assignments
app.post('/api/admin/users/:userId/libraries', authMiddleware, (req, res) => {
  const database = db.getDb();
  const targetUserId = parseInt(req.params.userId);
  const { libraryIds } = req.body;
  
  // Check if user is admin
  const user = database.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId);
  if (!user?.is_admin) {
    return res.status(403).json({ error: 'Only admin can assign libraries' });
  }
  
  // Remove existing assignments
  database.prepare('DELETE FROM user_libraries WHERE user_id = ?').run(targetUserId);
  
  // Add new assignments
  if (libraryIds && libraryIds.length > 0) {
    const insertStmt = database.prepare('INSERT INTO user_libraries (user_id, library_id) VALUES (?, ?)');
    for (const libraryId of libraryIds) {
      insertStmt.run(targetUserId, libraryId);
    }
  }
  
  res.json({ success: true });
});

// Get current user info (including admin status)
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const database = db.getDb();
  const user = database.prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(req.userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json(user);
});

app.delete('/api/admin/users/:userId', authMiddleware, (req, res) => {
  const database = db.getDb();
  const targetUserId = parseInt(req.params.userId);
  
  const user = database.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId);
  if (!user?.is_admin) {
    return res.status(403).json({ error: 'Only admin can delete users' });
  }
  
  const targetUser = database.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(targetUserId);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (targetUser.is_admin) {
    return res.status(400).json({ error: 'Cannot delete admin user' });
  }
  
  if (targetUserId === req.userId) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  database.prepare('DELETE FROM user_libraries WHERE user_id = ?').run(targetUserId);
  database.prepare('DELETE FROM play_history WHERE user_id = ?').run(targetUserId);
  database.prepare('DELETE FROM tags WHERE user_id = ?').run(targetUserId);
  database.prepare('DELETE FROM media_ratings WHERE user_id = ?').run(targetUserId);
  database.prepare('DELETE FROM users WHERE id = ?').run(targetUserId);
  
  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

const PORT = config.server.port;
const HOST = config.server.host;

async function startServer() {
  await db.init(config);
  
  app.listen(PORT, HOST, () => {
    console.log(`PeachBrowser server running at http://${HOST}:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  db.close();
  process.exit();
});
