const express = require('express');
const path = require('path');
const config = require('./config');
const db = require('./database');
const authService = require('./services/auth.service');
const { errorHandler, notFoundHandler } = require('./middleware/errors');

const authRoutes = require('./routes/auth');
const libraryRoutes = require('./routes/libraries');
const mediaRoutes = require('./routes/media');
const adminRoutes = require('./routes/admin');

async function createApp() {
  const app = express();
  
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../client')));
  
  app.use('/api/auth', authRoutes);
  app.use('/api/libraries', libraryRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api', adminRoutes);
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
  });
  
  app.use(notFoundHandler);
  app.use(errorHandler);
  
  return app;
}

async function startServer() {
  await db.init(config.getConfig());
  await authService.ensureAdminUser();
  
  const app = await createApp();
  const { port, host } = config.getConfig().server;
  
  app.listen(port, host, () => {
    console.log(`PeachBrowser server running at http://${host}:${port}`);
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