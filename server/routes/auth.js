const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const authService = require('../services/auth.service');

router.post('/register', asyncHandler(async (req, res) => {
  const result = await authService.register(req.body.username, req.body.password);
  res.json(result);
}));

router.post('/login', asyncHandler(async (req, res) => {
  const result = await authService.login(req.body.username, req.body.password);
  res.json(result);
}));

router.get('/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, userId: req.userId, username: req.username });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = authService.getUser(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ id: user.id, username: user.username, is_admin: user.is_admin });
});

router.post('/change-password', authMiddleware, asyncHandler(async (req, res) => {
  const result = await authService.changePassword(
    req.userId,
    req.body.oldPassword,
    req.body.newPassword
  );
  res.json(result);
}));

module.exports = router;