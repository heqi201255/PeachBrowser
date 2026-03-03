const path = require('path');
const fs = require('fs');

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const CURRENT_LEVEL = process.env.LOG_LEVEL 
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] 
  : LOG_LEVELS.INFO;

const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, '../../data/peach.log');

function ensureLogDirectory() {
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

function writeToFile(message) {
  try {
    ensureLogDirectory();
    fs.appendFileSync(LOG_FILE, message + '\n');
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

function log(level, message, meta = {}) {
  const levelNum = LOG_LEVELS[level];
  if (levelNum <= CURRENT_LEVEL) {
    const formattedMessage = formatMessage(level, message, meta);
    
    // Always write errors and warnings to console
    if (levelNum <= LOG_LEVELS.WARN) {
      console.error(formattedMessage);
    } else {
      console.log(formattedMessage);
    }
    
    // Write all logs to file
    writeToFile(formattedMessage);
  }
}

module.exports = {
  error: (message, meta) => log('ERROR', message, meta),
  warn: (message, meta) => log('WARN', message, meta),
  info: (message, meta) => log('INFO', message, meta),
  debug: (message, meta) => log('DEBUG', message, meta),
  
  // Convenience method for logging HTTP requests
  http: (method, url, statusCode, duration, meta = {}) => {
    const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';
    log(level, `${method} ${url} ${statusCode} ${duration}ms`, meta);
  },
  
  // Convenience method for logging errors with stack trace
  errorWithStack: (error, message = 'An error occurred') => {
    log('ERROR', message, {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
  }
};
