const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errors');
const authService = require('../services/auth.service');
const libraryService = require('../services/library.service');
const tagService = require('../services/tag.service');
const libraryRepo = require('../repositories/library.repo');
const thumbnail = require('../thumbnail');

function requireAdmin(req, res, next) {
  const user = libraryRepo.checkUserAccess(req.userId, null);
  if (!user?.is_admin) {
    throw new AppError('Only admin can access this resource', 403, 'FORBIDDEN');
  }
  next();
}

router.get('/users', authMiddleware, requireAdmin, asyncHandler(async (req, res) => {
  const users = authService.getAllUsers();
  res.json(users);
}));

router.post('/users/:userId/libraries', authMiddleware, requireAdmin, asyncHandler(async (req, res) => {
  const targetUserId = parseInt(req.params.userId);
  const { libraryIds } = req.body;
  
  libraryService.updateUserLibraries(targetUserId, libraryIds);
  res.json({ success: true });
}));

router.delete('/users/:userId', authMiddleware, requireAdmin, asyncHandler(async (req, res) => {
  const targetUserId = parseInt(req.params.userId);
  const result = authService.deleteUser(targetUserId, req.userId);
  res.json(result);
}));

router.get('/tags', authMiddleware, asyncHandler(async (req, res) => {
  const libraryId = req.query.libraryId ? parseInt(req.query.libraryId) : null;
  const tags = tagService.getTags(req.userId, libraryId);
  res.json(tags);
}));

router.get('/thumbnail-status', authMiddleware, (req, res) => {
  res.json({
    queueLength: thumbnail.getQueueLength(),
    isProcessing: thumbnail.isCurrentlyProcessing()
  });
});

router.get('/scan-progress', authMiddleware, (req, res) => {
  const progress = libraryService.getScanProgress();
  res.json({ active: progress });
});

module.exports = router;