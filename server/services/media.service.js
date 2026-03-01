const fs = require('fs');
const path = require('path');
const mediaRepo = require('../repositories/media.repo');
const libraryRepo = require('../repositories/library.repo');
const thumbnail = require('../thumbnail');
const config = require('../config');

function getMediaList(libraryId, userId, options = {}) {
  const library = libraryRepo.checkUserAccess(userId, libraryId);
  if (!library) {
    throw new Error('Library not found');
  }
  
  const { media, ...pagination } = mediaRepo.findByLibrary(libraryId, {
    ...options,
    userId
  });
  
  const directories = options.recursive ? [] : mediaRepo.findDirectories(libraryId, options.path || '');
  
  const mediaIds = media.map(m => m.id);
  const tagsByMediaId = mediaRepo.batchGetTags(mediaIds, userId);
  
  const mediaWithMeta = media.map(m => {
    const ext = m.extension?.toLowerCase();
    const isGif = ext === '.gif';
    let thumbnailUrl = null;
    
    if (m.has_thumbnail) {
      if (isGif) {
        thumbnailUrl = `/api/libraries/${libraryId}/files/${encodeURIComponent(m.relative_path)}?token=${options.token}`;
      } else {
        thumbnailUrl = `/api/libraries/${libraryId}/thumbnails/${encodeURIComponent(m.relative_path.replace(/\.[^.]+$/, '.jpg'))}?token=${options.token}`;
      }
    }
    
    return {
      ...m,
      tags: tagsByMediaId[m.id] || [],
      thumbnailUrl,
      is_liked: !!m.is_liked
    };
  });
  
  return {
    library,
    media: mediaWithMeta,
    directories: directories.map(dirName => ({
      name: dirName.name,
      path: dirName.path
    })),
    currentPath: options.path || '',
    pagination
  };
}

function getMediaDetail(mediaId, userId) {
  const media = mediaRepo.findById(mediaId);
  if (!media) {
    throw new Error('Media not found');
  }
  
  const hasAccess = libraryRepo.checkUserAccess(userId, media.library_id);
  if (!hasAccess) {
    throw new Error('Media not found');
  }
  
  const database = require('../database').getDb();
  
  const meta = database.prepare(
    'SELECT width, height, duration, fps, bitrate, codec FROM media_metadata WHERE media_id = ?'
  ).get(mediaId);
  
  const playHistory = database.prepare(
    'SELECT position as play_position, play_count, last_played FROM play_history WHERE media_id = ? AND user_id = ?'
  ).get(mediaId, userId);
  
  const tags = database.prepare(`
    SELECT t.id, t.name FROM tags t
    INNER JOIN media_tags mt ON t.id = mt.tag_id
    WHERE mt.media_id = ? AND t.user_id = ?
  `).all(mediaId, userId) || [];
  
  const like = database.prepare(
    'SELECT 1 FROM media_likes WHERE media_id = ? AND user_id = ?'
  ).get(mediaId, userId);
  
  return {
    ...media,
    ...meta,
    ...playHistory,
    tags: tags.map(t => t.name),
    is_liked: !!like,
    fileUrl: `/api/libraries/${media.library_id}/files/${encodeURIComponent(media.relative_path)}`,
    thumbnailUrl: media.has_thumbnail ?
      `/api/libraries/${media.library_id}/thumbnails/${encodeURIComponent(media.relative_path.replace(/\.[^.]+$/, '.jpg'))}` :
      null
  };
}

async function deleteMedia(mediaId, userId) {
  const media = mediaRepo.findById(mediaId);
  if (!media) {
    throw new Error('Media not found');
  }
  
  const hasAccess = libraryRepo.checkUserAccess(userId, media.library_id);
  if (!hasAccess) {
    throw new Error('Media not found');
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
    
    mediaRepo.deleteById(mediaId);
    
    return { success: true };
  } catch (err) {
    console.error('Error deleting file:', err);
    throw new Error('Failed to delete file');
  }
}

function updatePlayProgress(mediaId, userId, position, completed = false) {
  const media = mediaRepo.findById(mediaId);
  if (!media) {
    throw new Error('Media not found');
  }
  
  const hasAccess = libraryRepo.checkUserAccess(userId, media.library_id);
  if (!hasAccess) {
    throw new Error('Media not found');
  }
  
  const database = require('../database').getDb();
  
  const existing = database.prepare(
    'SELECT id FROM play_history WHERE media_id = ? AND user_id = ?'
  ).get(mediaId, userId);
  
  if (existing) {
    database.prepare(`
      UPDATE play_history SET
        position = ?,
        completed = ?,
        last_played = datetime("now"),
        play_count = play_count + 1
      WHERE media_id = ? AND user_id = ?
    `).run(position || 0, completed ? 1 : 0, mediaId, userId);
  } else {
    database.prepare(`
      INSERT INTO play_history (media_id, user_id, position, completed, last_played, play_count)
      VALUES (?, ?, ?, ?, datetime("now"), 1)
    `).run(mediaId, userId, position || 0, completed ? 1 : 0);
  }
  
  return { success: true };
}

function getLikeStatus(mediaId, userId) {
  const media = mediaRepo.findById(mediaId);
  if (!media) {
    throw new Error('Media not found');
  }
  
  const hasAccess = libraryRepo.checkUserAccess(userId, media.library_id);
  if (!hasAccess) {
    throw new Error('Media not found');
  }
  
  const database = require('../database').getDb();
  const like = database.prepare(
    'SELECT 1 FROM media_likes WHERE media_id = ? AND user_id = ?'
  ).get(mediaId, userId);
  
  return { liked: !!like };
}

function toggleLike(mediaId, userId) {
  const media = mediaRepo.findById(mediaId);
  if (!media) {
    throw new Error('Media not found');
  }
  
  const hasAccess = libraryRepo.checkUserAccess(userId, media.library_id);
  if (!hasAccess) {
    throw new Error('Media not found');
  }
  
  const database = require('../database').getDb();
  const existing = database.prepare(
    'SELECT 1 FROM media_likes WHERE media_id = ? AND user_id = ?'
  ).get(mediaId, userId);
  
  if (existing) {
    database.prepare(
      'DELETE FROM media_likes WHERE media_id = ? AND user_id = ?'
    ).run(mediaId, userId);
    return { liked: false };
  } else {
    database.prepare(
      'INSERT INTO media_likes (media_id, user_id) VALUES (?, ?)'
    ).run(mediaId, userId);
    return { liked: true };
  }
}

function getRating(mediaId, userId) {
  const database = require('../database').getDb();
  const rating = database.prepare(
    'SELECT rating FROM media_ratings WHERE media_id = ? AND user_id = ?'
  ).get(mediaId, userId);
  
  return { rating: rating?.rating || 0 };
}

function setRating(mediaId, userId, rating) {
  if (rating < 0 || rating > 5) {
    throw new Error('Rating must be between 0 and 5');
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
  const existing = database.prepare(
    'SELECT id FROM media_ratings WHERE media_id = ? AND user_id = ?'
  ).get(mediaId, userId);
  
  if (existing) {
    if (rating === 0) {
      database.prepare('DELETE FROM media_ratings WHERE media_id = ? AND user_id = ?')
        .run(mediaId, userId);
    } else {
      database.prepare('UPDATE media_ratings SET rating = ? WHERE media_id = ? AND user_id = ?')
        .run(rating, mediaId, userId);
    }
  } else if (rating > 0) {
    database.prepare('INSERT INTO media_ratings (media_id, user_id, rating) VALUES (?, ?, ?)')
      .run(mediaId, userId, rating);
  }
  
  return { success: true, rating };
}

module.exports = {
  getMediaList,
  getMediaDetail,
  deleteMedia,
  updatePlayProgress,
  getLikeStatus,
  toggleLike,
  getRating,
  setRating
};