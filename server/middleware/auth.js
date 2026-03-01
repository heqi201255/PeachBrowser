const jwt = require('jsonwebtoken');
const config = require('../config');

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, config.getConfig().jwt.secret);
    req.userId = decoded.userId;
    req.username = decoded.username;
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  
  if (token) {
    try {
      const decoded = jwt.verify(token, config.getConfig().jwt.secret);
      req.userId = decoded.userId;
      req.username = decoded.username;
      req.token = token;
    } catch (err) {
      // Token invalid, but continue without auth
    }
  }
  next();
}

module.exports = {
  authMiddleware,
  optionalAuth
};