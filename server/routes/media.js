const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errors');
const { validatePositiveInteger } = require('../middleware/validation');
const mediaService = require('../services/media.service');
const tagService = require('../services/tag.service');
const mediaRepo = require('../repositories/media.repo');
const libraryRepo = require('../repositories/library.repo');

router.get('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const mediaId = validatePositiveInteger(req.params.id, 'media ID');
  const media = mediaService.getMediaDetail(mediaId, req.userId);
  res.json(media);
}));

router.delete('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const mediaId = validatePositiveInteger(req.params.id, 'media ID');
  const result = await mediaService.deleteMedia(mediaId, req.userId);
  res.json(result);
}));

router.post('/:id/play', authMiddleware, asyncHandler(async (req, res) => {
  const mediaId = validatePositiveInteger(req.params.id, 'media ID');
  const { position, completed } = req.body;
  const result = mediaService.updatePlayProgress(mediaId, req.userId, position, completed);
  res.json(result);
}));

router.get('/:id/like', authMiddleware, asyncHandler(async (req, res) => {
  const mediaId = validatePositiveInteger(req.params.id, 'media ID');
  const result = mediaService.getLikeStatus(mediaId, req.userId);
  res.json(result);
}));

router.post('/:id/like', authMiddleware, asyncHandler(async (req, res) => {
  const mediaId = validatePositiveInteger(req.params.id, 'media ID');
  const result = mediaService.toggleLike(mediaId, req.userId);
  res.json(result);
}));

router.get('/:id/rating', authMiddleware, asyncHandler(async (req, res) => {
  const mediaId = validatePositiveInteger(req.params.id, 'media ID');
  const result = mediaService.getRating(mediaId, req.userId);
  res.json(result);
}));

router.post('/:id/rating', authMiddleware, asyncHandler(async (req, res) => {
  const mediaId = validatePositiveInteger(req.params.id, 'media ID');
  const result = mediaService.setRating(mediaId, req.userId, req.body.rating);
  res.json(result);
}));

router.post('/:id/tags', authMiddleware, asyncHandler(async (req, res) => {
  const mediaId = validatePositiveInteger(req.params.id, 'media ID');
  const tag = tagService.addTag(mediaId, req.userId, req.body.tagName);
  res.json(tag);
}));

router.delete('/:id/tags/:tagId', authMiddleware, asyncHandler(async (req, res) => {
  const mediaId = validatePositiveInteger(req.params.id, 'media ID');
  const tagId = validatePositiveInteger(req.params.tagId, 'tag ID');
  const result = tagService.removeTag(mediaId, req.userId, tagId);
  res.json(result);
}));

router.get('/:id/preview', authMiddleware, asyncHandler(async (req, res) => {
  const mediaId = validatePositiveInteger(req.params.id, 'media ID');
  const timeSeconds = parseFloat(req.query.time) || 0;
  
  const media = mediaRepo.findById(mediaId);
  if (!media) {
    throw new AppError('Media not found', 404, 'NOT_FOUND');
  }
  
  const hasAccess = libraryRepo.checkUserAccess(req.userId, media.library_id);
  if (!hasAccess) {
    throw new AppError('Media not found', 404, 'NOT_FOUND');
  }
  
  if (media.file_type !== 'video') {
    throw new AppError('Not a video file', 400, 'VALIDATION_ERROR');
  }
  
  const filePath = path.join(media.library_path, media.relative_path);
  if (!fs.existsSync(filePath)) {
    throw new AppError('File not found', 404, 'NOT_FOUND');
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
}));

module.exports = router;