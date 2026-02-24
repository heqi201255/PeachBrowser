const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../config.json');

let thumbnailQueue = [];
let isProcessing = false;
let currentProcess = null;
let onStopRequested = false;

function getThumbnailPath(libraryName, relativePath) {
  const ext = path.extname(relativePath);
  const baseName = path.basename(relativePath, ext);
  const dir = path.dirname(relativePath);
  const thumbnailDir = path.join(config.thumbnails.path, libraryName, dir);
  const thumbnailPath = path.join(thumbnailDir, `${baseName}.jpg`);
  return { thumbnailDir, thumbnailPath };
}

async function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function generateVideoThumbnail(videoPath, outputPath, duration) {
  return new Promise((resolve, reject) => {
    let videoTime = '00:00:00';
    if (duration != null && duration > 5) {
      videoTime = '00:00:03'
    }
    const args = [
      '-y',
      '-ss', videoTime,
      '-i', videoPath,
      '-vframes', '1',
      '-vf', `scale=${config.thumbnails.width}:-2`,
      '-q:v', config.thumbnails.quality,
      outputPath
    ];
    
    currentProcess = spawn('ffmpeg', args);
    let stderr = '';
    
    currentProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    currentProcess.on('close', (code) => {
      currentProcess = null;
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });
    
    currentProcess.on('error', (err) => {
      currentProcess = null;
      reject(err);
    });
  });
}

function generateImageThumbnail(imagePath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', imagePath,
      '-vf', `scale=${config.thumbnails.width}:-2`,
      '-q:v', config.thumbnails.quality,
      outputPath
    ];
    
    currentProcess = spawn('ffmpeg', args);
    let stderr = '';
    
    currentProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    currentProcess.on('close', (code) => {
      currentProcess = null;
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });
    
    currentProcess.on('error', (err) => {
      currentProcess = null;
      reject(err);
    });
  });
}

async function generateThumbnail(filePath, duration, libraryName, relativePath, fileType) {
  const { thumbnailDir, thumbnailPath } = getThumbnailPath(libraryName, relativePath);
  
  if (fs.existsSync(thumbnailPath)) {
    return { success: true, thumbnailPath };
  }
  
  await ensureDir(thumbnailDir);
  
  try {
    if (fileType === 'video') {
      await generateVideoThumbnail(filePath, thumbnailPath, duration);
    } else if (fileType === 'image') {
      await generateImageThumbnail(filePath, thumbnailPath);
    } else {
      return { success: false, reason: 'unsupported_type' };
    }
    
    return { success: true, thumbnailPath };
  } catch (err) {
    console.error(`Failed to generate thumbnail for ${filePath}:`, err.message);
    return { success: false, reason: 'generation_failed', error: err.message };
  }
}

function addToQueue(items, onProgress, onComplete) {
  thumbnailQueue = [...thumbnailQueue, ...items.map(item => ({ ...item, onProgress, onComplete }))];
  
  if (!isProcessing) {
    processQueue();
  }
}

async function processQueue() {
  if (thumbnailQueue.length === 0 || onStopRequested) {
    isProcessing = false;
    onStopRequested = false;
    return;
  }
  
  isProcessing = true;
  const item = thumbnailQueue.shift();
  
  try {
    const result = await generateThumbnail(
      item.filePath,
      item.duration,
      item.libraryName,
      item.relativePath,
      item.fileType
    );
    
    if (item.onProgress) {
      item.onProgress(item.mediaId, result);
    }
  } catch (err) {
    console.error('Error processing thumbnail:', err);
    if (item.onProgress) {
      item.onProgress(item.mediaId, { success: false, reason: 'error', error: err.message });
    }
  }
  
  setImmediate(processQueue);
}

function stopProcessing() {
  onStopRequested = true;
  if (currentProcess) {
    currentProcess.kill('SIGTERM');
  }
}

function getQueueLength() {
  return thumbnailQueue.length;
}

function isCurrentlyProcessing() {
  return isProcessing;
}

module.exports = {
  generateThumbnail,
  addToQueue,
  stopProcessing,
  getQueueLength,
  isCurrentlyProcessing,
  getThumbnailPath
};
