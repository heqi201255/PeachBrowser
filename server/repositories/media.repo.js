const db = require('../database');

function findById(mediaId) {
  return db.getDb().prepare(`
    SELECT m.*, l.path as library_path, l.name as library_name, l.id as library_id
    FROM media_files m
    INNER JOIN libraries l ON m.library_id = l.id
    WHERE m.id = ?
  `).get(mediaId);
}

function findByLibrary(libraryId, options = {}) {
  const { page = 1, pageSize = 50, type, tag, search, path: currentPath, recursive, userId } = options;
  const offset = (page - 1) * pageSize;
  
  let sql = `
    SELECT m.id, m.library_id, m.relative_path, m.filename, m.extension, m.file_size,
           m.content_md5, m.file_type, m.has_thumbnail, m.is_corrupted, m.created_at,
           mm.width, mm.height, mm.duration, mm.fps, mm.bitrate, mm.codec,
           ph.position as play_position, ph.play_count, ph.last_played,
           COALESCE(mr.rating, 0) as rating,
           CASE WHEN ml.id IS NOT NULL THEN 1 ELSE 0 END as is_liked
    FROM media_files m
    LEFT JOIN media_metadata mm ON m.id = mm.media_id
    LEFT JOIN play_history ph ON m.id = ph.media_id AND ph.user_id = ?
    LEFT JOIN media_ratings mr ON m.id = mr.media_id AND mr.user_id = ?
    LEFT JOIN media_likes ml ON m.id = ml.media_id AND ml.user_id = ?
    WHERE m.library_id = ?
  `;
  
  const params = [userId, userId, userId, libraryId];
  
  if (recursive) {
    if (currentPath) {
      sql += ' AND m.relative_path LIKE ?';
      params.push(`${currentPath}/%`);
    }
  } else {
    if (currentPath) {
      sql += ' AND m.relative_path LIKE ? AND m.relative_path NOT LIKE ?';
      params.push(`${currentPath}/%`, `${currentPath}/%/%`);
    } else {
      sql += ' AND m.relative_path NOT LIKE ?';
      params.push('%/%');
    }
  }
  
  if (type && type !== 'all') {
    sql += ' AND m.file_type = ?';
    params.push(type);
  }
  
  if (tag) {
    sql += ' AND m.id IN (SELECT mt.media_id FROM media_tags mt INNER JOIN tags t ON mt.tag_id = t.id WHERE t.user_id = ? AND t.name = ?)';
    params.push(userId, tag);
  }
  
  if (search) {
    sql += ' AND (m.filename LIKE ? OR m.relative_path LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  
  const countSql = sql.replace(/SELECT.*FROM/, 'SELECT COUNT(*) as total FROM');
  const countResult = db.getDb().prepare(countSql).get(...params);
  const total = countResult?.total || 0;
  
  sql += ' ORDER BY m.id DESC LIMIT ? OFFSET ?';
  params.push(pageSize, offset);
  
  const media = db.getDb().prepare(sql).all(...params) || [];
  
  return { media, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

function findDirectories(libraryId, currentPath) {
  let sql, params;
  
  if (currentPath) {
    const prefixLen = currentPath.length + 1;
    sql = `
      SELECT DISTINCT 
        substr(substr(relative_path, ${prefixLen + 1}), 1, instr(substr(relative_path, ${prefixLen + 1}), '/') - 1) as name
      FROM media_files
      WHERE library_id = ? AND relative_path LIKE ?
    `;
    params = [libraryId, `${currentPath}/%`];
  } else {
    sql = `
      SELECT DISTINCT 
        substr(relative_path, 1, instr(relative_path, '/') - 1) as name
      FROM media_files
      WHERE library_id = ? AND relative_path LIKE '%/%'
    `;
    params = [libraryId];
  }
  
  const rows = db.getDb().prepare(sql).all(...params) || [];
  const directories = [];
  const seen = new Set();
  
  for (const row of rows) {
    if (row.name && !seen.has(row.name)) {
      seen.add(row.name);
      const fullPath = currentPath ? `${currentPath}/${row.name}` : row.name;
      const hasSubdirs = db.getDb().prepare(
        'SELECT 1 FROM media_files WHERE library_id = ? AND relative_path LIKE ? LIMIT 1'
      ).get(libraryId, `${fullPath}/%/%`) ? true : false;
      
      directories.push({
        name: row.name,
        path: fullPath,
        hasSubdirs
      });
    }
  }
  
  return directories;
}

function findForDeletion(libraryId) {
  return db.getDb().prepare('SELECT id, relative_path FROM media_files WHERE library_id = ?').all(libraryId);
}

function deleteById(mediaId) {
  db.getDb().prepare('DELETE FROM media_metadata WHERE media_id = ?').run(mediaId);
  db.getDb().prepare('DELETE FROM play_history WHERE media_id = ?').run(mediaId);
  db.getDb().prepare('DELETE FROM media_tags WHERE media_id = ?').run(mediaId);
  db.getDb().prepare('DELETE FROM media_ratings WHERE media_id = ?').run(mediaId);
  db.getDb().prepare('DELETE FROM media_likes WHERE media_id = ?').run(mediaId);
  db.getDb().prepare('DELETE FROM media_files WHERE id = ?').run(mediaId);
}

function batchDelete(mediaIds) {
  if (!mediaIds || mediaIds.length === 0) return;
  
  const placeholders = mediaIds.map(() => '?').join(',');
  db.getDb().prepare(`DELETE FROM media_metadata WHERE media_id IN (${placeholders})`).run(...mediaIds);
  db.getDb().prepare(`DELETE FROM play_history WHERE media_id IN (${placeholders})`).run(...mediaIds);
  db.getDb().prepare(`DELETE FROM media_tags WHERE media_id IN (${placeholders})`).run(...mediaIds);
  db.getDb().prepare(`DELETE FROM media_ratings WHERE media_id IN (${placeholders})`).run(...mediaIds);
  db.getDb().prepare(`DELETE FROM media_likes WHERE media_id IN (${placeholders})`).run(...mediaIds);
  db.getDb().prepare(`DELETE FROM media_files WHERE id IN (${placeholders})`).run(...mediaIds);
}

function batchGetTags(mediaIds, userId) {
  if (!mediaIds || mediaIds.length === 0) return {};
  
  const placeholders = mediaIds.map(() => '?').join(',');
  const tagRows = db.getDb().prepare(`
    SELECT mt.media_id, t.name FROM media_tags mt
    INNER JOIN tags t ON t.id = mt.tag_id
    WHERE mt.media_id IN (${placeholders}) AND t.user_id = ?
  `).all(...mediaIds, userId) || [];
  
  const tagsByMediaId = {};
  for (const row of tagRows) {
    if (!tagsByMediaId[row.media_id]) tagsByMediaId[row.media_id] = [];
    tagsByMediaId[row.media_id].push(row.name);
  }
  
  return tagsByMediaId;
}

function findMissingThumbnails(libraryId) {
  return db.getDb().prepare(`
    SELECT m.id, m.relative_path, m.file_type, m.extension, mm.duration
    FROM media_files m
    LEFT JOIN media_metadata mm ON m.id = mm.media_id
    WHERE m.library_id = ? 
      AND m.has_thumbnail = 0 
      AND m.is_corrupted = 0 
      AND (m.file_type = 'video' OR m.file_type = 'image')
  `).all(libraryId) || [];
}

function findCorrupted(libraryId) {
  return db.getDb().prepare(`
    SELECT m.id, m.relative_path, m.file_type, l.name as library_name,
           mm.duration, m.extension
    FROM media_files m
    LEFT JOIN media_metadata mm ON m.id = mm.media_id
    INNER JOIN libraries l ON m.library_id = l.id
    WHERE m.library_id = ? AND m.is_corrupted = 1
  `).all(libraryId);
}

function updateThumbnail(mediaId, hasThumbnail = true) {
  db.getDb().prepare('UPDATE media_files SET has_thumbnail = ? WHERE id = ?').run(hasThumbnail ? 1 : 0, mediaId);
}

function updateCorrupted(mediaId, isCorrupted) {
  db.getDb().prepare('UPDATE media_files SET is_corrupted = ? WHERE id = ?').run(isCorrupted ? 1 : 0, mediaId);
}

function getExistingFiles(libraryId) {
  const rows = db.getDb().prepare(`
    SELECT relative_path, content_md5, file_size FROM media_files WHERE library_id = ?
  `).all(libraryId);
  
  return new Map(rows.map(row => [row.relative_path, { content_md5: row.content_md5, file_size: row.file_size }]));
}

module.exports = {
  findById,
  findByLibrary,
  findDirectories,
  findForDeletion,
  deleteById,
  batchDelete,
  batchGetTags,
  findMissingThumbnails,
  findCorrupted,
  updateThumbnail,
  updateCorrupted,
  getExistingFiles
};