const fs = require('fs');
const path = require('path');
const config = require('../config');
const libraryRepo = require('../repositories/library.repo');
const mediaRepo = require('../repositories/media.repo');
const scanner = require('../scanner');
const thumbnail = require('../thumbnail');
const metadata = require('../metadata');

const scanProgress = {
  active: new Map(),
  start(libraryId, libraryName, stage, total) {
    this.active.set(libraryId, {
      libraryId,
      libraryName,
      stage,
      current: 0,
      total,
      startTime: Date.now()
    });
  },
  update(libraryId, current) {
    const progress = this.active.get(libraryId);
    if (progress) {
      progress.current = current;
    }
  },
  setStage(libraryId, stage, total) {
    const progress = this.active.get(libraryId);
    if (progress) {
      progress.stage = stage;
      progress.current = 0;
      progress.total = total;
    }
  },
  complete(libraryId) {
    this.active.delete(libraryId);
  },
  get(libraryId) {
    return this.active.get(libraryId);
  },
  getAll() {
    return Array.from(this.active.values());
  }
};

function getUserLibraries(userId, isAdmin) {
  return libraryRepo.findUserLibraries(userId, isAdmin);
}

function createLibrary(userId, name, folderPath) {
  if (!name || !folderPath) {
    throw new Error('Name and folder path required');
  }
  
  if (!fs.existsSync(folderPath)) {
    throw new Error('Folder does not exist');
  }
  
  const existing = libraryRepo.findAll().find(lib => lib.path === folderPath);
  if (existing) {
    throw new Error('Library already exists at this path');
  }
  
  const library = libraryRepo.create(name, folderPath);
  libraryRepo.associateUser(userId, library.id);
  
  scanLibraryAsync(library.id, name, folderPath, userId);
  
  return library;
}

function deleteLibrary(libraryId) {
  const library = libraryRepo.findById(libraryId);
  if (!library) {
    throw new Error('Library not found');
  }
  
  const thumbnailDir = path.join(config.getConfig().thumbnails.path, library.name);
  try {
    if (fs.existsSync(thumbnailDir)) {
      fs.rmSync(thumbnailDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error('Error deleting thumbnail folder:', err);
  }
  
  const deletedFiles = mediaRepo.findForDeletion(libraryId);
  batchDeleteMediaFiles(library.name, deletedFiles);
  libraryRepo.deleteById(libraryId);
  
  return { success: true };
}

function batchDeleteMediaFiles(libraryName, deletedFiles) {
  for (const file of deletedFiles) {
    const { thumbnailPath } = thumbnail.getThumbnailPath(libraryName, file.relative_path);
    if (fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath);
    }
  }
  mediaRepo.batchDelete(deletedFiles.map(f => f.id));
}

function checkAccess(userId, libraryId) {
  return libraryRepo.checkUserAccess(userId, libraryId);
}

async function scanLibraryAsync(libraryId, libraryName, libraryPath, userId) {
  scanProgress.start(libraryId, libraryName, 'scanning', 0);
  
  try {
    const existingFiles = mediaRepo.getExistingFiles(libraryId);
    const files = await scanner.scanLibrary(libraryPath, existingFiles);
    
    console.log(`Found ${files.length} files in library ${libraryName}`);
    scanProgress.setStage(libraryId, 'processing', files.length);
    
    const database = require('../database').getDb();
    
    const insertMedia = database.prepare(`
      INSERT OR IGNORE INTO media_files (library_id, relative_path, filename, extension, file_size, content_md5, file_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const getMedia = database.prepare(`
      SELECT id FROM media_files WHERE library_id = ? AND relative_path = ?
    `);
    
    const insertMetadata = database.prepare(`
      INSERT OR IGNORE INTO media_metadata (media_id, width, height, duration, fps, bitrate, codec)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const thumbnailsToGenerate = [];
    let processedCount = 0;
    
    for (const file of files) {
      if (!file.isNew) continue;
      
      insertMedia.run(
        libraryId,
        file.relativePath,
        file.filename,
        file.extension,
        file.fileSize,
        file.contentMd5,
        file.fileType
      );
      
      const mediaRecord = getMedia.get(libraryId, file.relativePath);
      if (mediaRecord) {
        let meta = database.prepare('SELECT id, duration FROM media_metadata WHERE media_id = ?').get(mediaRecord.id);
        if (!meta && (file.fileType === 'video' || file.fileType === 'image' || file.fileType === 'audio')) {
          meta = await metadata.getMediaMetadata(file.fullPath);
          if (meta) {
            insertMetadata.run(
              mediaRecord.id,
              meta.width,
              meta.height,
              meta.duration,
              meta.fps,
              meta.bitrate,
              meta.codec
            );
          }
        }
        
        if (file.fileType === 'video' || file.fileType === 'image') {
          const ext = file.extension?.toLowerCase();
          const isGif = ext === '.gif';
          
          if (isGif) {
            mediaRepo.updateThumbnail(mediaRecord.id, true);
          } else {
            const { thumbnailPath } = thumbnail.getThumbnailPath(libraryName, file.relativePath);
            if (!fs.existsSync(thumbnailPath)) {
              thumbnailsToGenerate.push({
                mediaId: mediaRecord.id,
                filePath: file.fullPath,
                libraryName,
                duration: meta?.duration,
                relativePath: file.relativePath,
                fileType: file.fileType
              });
            } else {
              mediaRepo.updateThumbnail(mediaRecord.id, true);
            }
          }
        }
      }
      
      processedCount++;
      if (processedCount % 10 === 0) {
        scanProgress.update(libraryId, processedCount);
      }
    }
    
    libraryRepo.updateLastScanned(libraryId);
    
    const corruptedFiles = mediaRepo.findCorrupted(libraryId);
    
    if (corruptedFiles.length > 0) {
      console.log(`Re-processing ${corruptedFiles.length} corrupted files...`);
      for (const file of corruptedFiles) {
        const fullPath = path.join(libraryPath, file.relative_path);
        const ext = file.extension?.toLowerCase();
        const isGif = ext === '.gif';
        
        if (isGif) {
          mediaRepo.updateCorrupted(file.id, false);
          mediaRepo.updateThumbnail(file.id, true);
        } else if (fs.existsSync(fullPath)) {
          const { thumbnailPath } = thumbnail.getThumbnailPath(file.library_name, file.relative_path);
          if (!fs.existsSync(thumbnailPath)) {
            thumbnailsToGenerate.push({
              mediaId: file.id,
              filePath: fullPath,
              libraryName: file.library_name,
              duration: file.duration,
              relativePath: file.relative_path,
              fileType: file.file_type
            });
          } else {
            mediaRepo.updateCorrupted(file.id, false);
          }
        } else {
          console.log(`File no longer exists: ${fullPath}, removing corrupted flag`);
          mediaRepo.updateCorrupted(file.id, false);
        }
      }
    }
    
    if (thumbnailsToGenerate.length > 0) {
      scanProgress.setStage(libraryId, 'thumbnails', thumbnailsToGenerate.length);
      console.log(`Generating ${thumbnailsToGenerate.length} thumbnails...`);
      
      let completedThumbnails = 0;
      thumbnail.addToQueue(thumbnailsToGenerate, (mediaId, result) => {
        completedThumbnails++;
        scanProgress.update(libraryId, completedThumbnails);
        
        if (result.success) {
          mediaRepo.updateCorrupted(mediaId, false);
          mediaRepo.updateThumbnail(mediaId, true);
        } else if (result.reason === 'generation_failed') {
          mediaRepo.updateCorrupted(mediaId, true);
        }
      }, () => {
        scanProgress.complete(libraryId);
      });
    } else {
      scanProgress.complete(libraryId);
    }
    
    console.log(`Scanned library ${libraryName}: ${files.length} files found, ${files.filter(f => f.isNew).length} new`);
  } catch (err) {
    console.error(`Error scanning library ${libraryName}:`, err);
    scanProgress.complete(libraryId);
  }
}

async function syncLibrary(libraryId, userId) {
  const library = libraryRepo.checkUserAccess(userId, libraryId);
  if (!library) {
    throw new Error('Library not found');
  }
  
  const deletedFiles = [];
  const dbFiles = mediaRepo.findForDeletion(libraryId);
  
  for (const file of dbFiles) {
    const filePath = path.join(library.path, file.relative_path);
    if (!fs.existsSync(filePath)) {
      deletedFiles.push(file);
    }
  }
  
  if (deletedFiles.length > 0) {
    batchDeleteMediaFiles(library.name, deletedFiles);
  }
  
  await scanLibraryAsync(libraryId, library.name, library.path, userId);
  
  const missingThumbnailFiles = mediaRepo.findMissingThumbnails(libraryId);
  
  let fixedThumbnails = 0;
  let generatedThumbnails = 0;
  
  for (const file of missingThumbnailFiles) {
    const ext = file.extension?.toLowerCase();
    if (ext === '.gif') continue;
    
    const { thumbnailPath } = thumbnail.getThumbnailPath(library.name, file.relative_path);
    
    if (fs.existsSync(thumbnailPath)) {
      mediaRepo.updateThumbnail(file.id, true);
      fixedThumbnails++;
    } else {
      const fullPath = path.join(library.path, file.relative_path);
      if (fs.existsSync(fullPath)) {
        try {
          const result = await thumbnail.generateThumbnail(
            fullPath,
            file.duration,
            library.name,
            file.relative_path,
            file.file_type
          );
          if (result.success) {
            mediaRepo.updateThumbnail(file.id, true);
            generatedThumbnails++;
          }
        } catch (err) {
          console.error(`Failed to generate thumbnail for ${file.relative_path}:`, err.message);
        }
      }
    }
  }
  
  return {
    success: true,
    deleted: deletedFiles.length,
    fixedThumbnails,
    generatedThumbnails,
    message: `Sync completed. Removed ${deletedFiles.length} non-existent files, fixed ${fixedThumbnails} thumbnails, generated ${generatedThumbnails} new thumbnails.`
  };
}

function getScanProgress() {
  return scanProgress.getAll();
}

function updateUserLibraries(userId, libraryIds) {
  libraryRepo.updateUserLibraries(userId, libraryIds);
  return { success: true };
}

module.exports = {
  getUserLibraries,
  createLibrary,
  deleteLibrary,
  checkAccess,
  syncLibrary,
  getScanProgress,
  updateUserLibraries,
  scanLibraryAsync
};