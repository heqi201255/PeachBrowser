const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getConfig } = require('../config');

const config = getConfig();

function getFileType(extension) {
  const ext = extension.toLowerCase();
  if (config.scanner.videoExtensions.includes(ext)) return 'video';
  if (config.scanner.imageExtensions.includes(ext)) return 'image';
  if (config.scanner.audioExtensions.includes(ext)) return 'audio';
  return 'other';
}

function shouldSkip(filename) {
  if (config.scanner.skipFiles.includes(filename)) return true;
  const ext = path.extname(filename).toLowerCase();
  if (config.scanner.skipExtensions.includes(ext)) return true;
  return false;
}

function calculateContentMd5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const chunkSize = Math.min(1024 * 1024, fileSize);
    
    if (fileSize === 0) {
      resolve(hash.digest('hex'));
      return;
    }
    
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(chunkSize);
    
    fs.read(fd, buffer, 0, chunkSize, 0, (err, bytesRead) => {
      fs.closeSync(fd);
      if (err) {
        reject(err);
        return;
      }
      hash.update(buffer.slice(0, bytesRead));
      resolve(hash.digest('hex'));
    });
  });
}

async function* scanDirectory(libraryPath, basePath = libraryPath, existingFiles = null) {
  const entries = fs.readdirSync(libraryPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(libraryPath, entry.name);
    
    if (entry.isDirectory()) {
      yield* scanDirectory(fullPath, basePath, existingFiles);
    } else if (entry.isFile()) {
      if (shouldSkip(entry.name)) continue;
      
      const ext = path.extname(entry.name);
      const fileType = getFileType(ext);
      
      if (fileType === 'other') continue;
      
      const relativePath = path.relative(basePath, fullPath);
      const stat = fs.statSync(fullPath);
      
      let contentMd5 = null;
      const existing = existingFiles?.get(relativePath);
      
      if (existing && existing.file_size === stat.size) {
        contentMd5 = existing.content_md5;
      } else {
        try {
          contentMd5 = await calculateContentMd5(fullPath);
        } catch (err) {
          console.error(`Failed to calculate MD5 for ${fullPath}:`, err);
          continue;
        }
      }
      
      yield {
        fullPath,
        relativePath,
        filename: entry.name,
        extension: ext.toLowerCase(),
        fileSize: stat.size,
        contentMd5,
        fileType,
        isNew: !existing
      };
    }
  }
}

async function scanLibrary(libraryPath, existingFiles = null) {
  const files = [];
  
  for await (const file of scanDirectory(libraryPath, libraryPath, existingFiles)) {
    files.push(file);
  }
  
  return files;
}

module.exports = { scanLibrary, scanDirectory, getFileType, shouldSkip, calculateContentMd5 };
