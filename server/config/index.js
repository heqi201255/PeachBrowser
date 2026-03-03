const fs = require('fs');
const path = require('path');

let config = null;

function loadConfig() {
  const configPath = path.join(__dirname, '../../config.json');
  const rawConfig = fs.existsSync(configPath) 
    ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
    : {};
  
  const jwtSecret = process.env.JWT_SECRET || rawConfig.jwt?.secret;
  
  // Security check for JWT secret in production
  const isProduction = process.env.NODE_ENV === 'production';
  const isDefaultSecret = !jwtSecret || jwtSecret === 'peach-browser-secret-key-change-in-production';
  
  if (isProduction && isDefaultSecret) {
    throw new Error(
      'CRITICAL: JWT_SECRET must be set to a secure random value in production. ' +
      'Set the JWT_SECRET environment variable before starting the server.'
    );
  }
  
  if (isDefaultSecret) {
    console.warn('\n[SECURITY WARNING] Using default JWT secret!');
    console.warn('[SECURITY WARNING] Set JWT_SECRET environment variable in production!\n');
  }
  
  config = {
    server: {
      port: parseInt(process.env.PORT) || rawConfig.server?.port || 3000,
      host: process.env.HOST || rawConfig.server?.host || '0.0.0.0'
    },
    database: {
      path: process.env.DB_PATH || rawConfig.database?.path || './data/peach.db'
    },
    thumbnails: {
      path: process.env.THUMBNAIL_PATH || rawConfig.thumbnails?.path || './data/thumbnails',
      videoTime: rawConfig.thumbnails?.videoTime || '00:00:03',
      width: rawConfig.thumbnails?.width || 320,
      quality: rawConfig.thumbnails?.quality || 2
    },
    scanner: {
      skipFiles: rawConfig.scanner?.skipFiles || ['.DS_Store', 'Thumbs.db', 'desktop.ini'],
      skipExtensions: rawConfig.scanner?.skipExtensions || ['.tmp', '.temp'],
      videoExtensions: rawConfig.scanner?.videoExtensions || ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpeg', '.mpg', '.3gp', '.ts'],
      imageExtensions: rawConfig.scanner?.imageExtensions || ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.svg', '.ico'],
      audioExtensions: rawConfig.scanner?.audioExtensions || ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.ape']
    },
    pagination: {
      defaultPageSize: rawConfig.pagination?.defaultPageSize || 72,
      maxPageSize: rawConfig.pagination?.maxPageSize || 200
    },
    jwt: {
      secret: jwtSecret || 'peach-browser-secret-key-change-in-production',
      expiresIn: rawConfig.jwt?.expiresIn || '7d'
    },
    security: {
      forcePasswordChange: process.env.FORCE_PASSWORD_CHANGE !== 'false',
      maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
      lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 15 * 60 * 1000
    }
  };
  
  return config;
}

function getConfig() {
  if (!config) {
    loadConfig();
  }
  return config;
}

module.exports = { getConfig, loadConfig };