const path = require('path');

/**
 * Check if the resolved request path is safely within the base path
 * @param {string} requestPath - The user-provided path (decoded)
 * @param {string} basePath - The base directory path
 * @returns {boolean} - True if safe, false if path traversal detected
 */
function isPathSafe(requestPath, basePath) {
  // Normalize and resolve both paths
  const resolvedBase = path.resolve(basePath);
  const resolvedRequest = path.resolve(basePath, requestPath);
  
  // On Windows, also check for UNC paths and drive letters
  const normalizedBase = resolvedBase.replace(/\\/g, '/').toLowerCase();
  const normalizedRequest = resolvedRequest.replace(/\\/g, '/').toLowerCase();
  
  // Ensure the request path starts with the base path
  // Add trailing slash to base to prevent matching partial directory names
  const baseWithSlash = normalizedBase.endsWith('/') ? normalizedBase : normalizedBase + '/';
  
  return normalizedRequest === normalizedBase || normalizedRequest.startsWith(baseWithSlash);
}

/**
 * Sanitize user input path by removing dangerous characters
 * @param {string} inputPath - User-provided path
 * @returns {string} - Sanitized path
 */
function sanitizePath(inputPath) {
  return inputPath
    .replace(/\.\./g, '')  // Remove ..
    .replace(/\/+/g, '/')  // Collapse multiple slashes
    .replace(/^\/+/, '')   // Remove leading slashes
    .replace(/[\0\n\r]/g, ''); // Remove null and control characters
}

/**
 * Join path parts safely
 * @param {...string} parts - Path parts to join
 * @returns {string} - Joined path
 */
function joinPaths(...parts) {
  return path.join(...parts);
}

module.exports = {
  isPathSafe,
  sanitizePath,
  joinPaths
};