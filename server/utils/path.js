const path = require('path');

function isPathSafe(requestPath, basePath) {
  const resolvedPath = path.resolve(basePath, requestPath);
  const resolvedBase = path.resolve(basePath);
  return resolvedPath.startsWith(resolvedBase);
}

function sanitizePath(inputPath) {
  return inputPath
    .replace(/\.\./g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '');
}

function joinPaths(...parts) {
  return path.join(...parts);
}

module.exports = {
  isPathSafe,
  sanitizePath,
  joinPaths
};