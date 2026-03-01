const mediaRepo = require('../repositories/media.repo');
const libraryRepo = require('../repositories/library.repo');

function getTags(userId, libraryId = null) {
  const database = require('../database').getDb();
  
  let sql = `
    SELECT t.id, t.name, t.created_at,
           COUNT(DISTINCT mt.media_id) as media_count
    FROM tags t
    INNER JOIN media_tags mt ON t.id = mt.tag_id
    WHERE t.user_id = ?
  `;
  const params = [userId];
  
  if (libraryId) {
    sql += ' AND mt.media_id IN (SELECT id FROM media_files WHERE library_id = ?)';
    params.push(libraryId);
  }
  
  sql += ' GROUP BY t.id ORDER BY media_count DESC, t.name';
  
  return database.prepare(sql).all(...params) || [];
}

function addTag(mediaId, userId, tagName) {
  if (!tagName) {
    throw new Error('Tag name required');
  }
  
  const media = mediaRepo.findById(mediaId);
  if (!media) {
    throw new Error('Media not found');
  }
  
  const hasAccess = libraryRepo.checkUserAccess(userId, media.library_id);
  if (!hasAccess) {
    throw new Error('Media not found');
  }
  
  const database = require('../database').getDb();
  
  let tag = database.prepare(
    'SELECT * FROM tags WHERE name = ? AND library_id = ? AND user_id = ?'
  ).get(tagName, media.library_id, userId);
  
  if (!tag) {
    const result = database.prepare(
      'INSERT INTO tags (name, library_id, user_id) VALUES (?, ?, ?)'
    ).run(tagName, media.library_id, userId);
    tag = { id: result.lastInsertRowid, name: tagName, library_id: media.library_id, user_id: userId };
  }
  
  const existing = database.prepare(
    'SELECT 1 FROM media_tags WHERE media_id = ? AND tag_id = ?'
  ).get(mediaId, tag.id);
  
  if (!existing) {
    database.prepare(
      'INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)'
    ).run(mediaId, tag.id);
  }
  
  return tag;
}

function removeTag(mediaId, userId, tagId) {
  const database = require('../database').getDb();
  
  database.prepare(
    'DELETE FROM media_tags WHERE media_id = ? AND tag_id = ?'
  ).run(mediaId, tagId);
  
  const row = database.prepare(
    'SELECT COUNT(*) as cnt FROM media_tags WHERE tag_id = ?'
  ).get(tagId);
  const remaining = row?.cnt ?? 0;
  
  if (remaining === 0) {
    database.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?').run(tagId, userId);
  }
  
  return { success: true, removedTag: remaining === 0 };
}

module.exports = {
  getTags,
  addTag,
  removeTag
};