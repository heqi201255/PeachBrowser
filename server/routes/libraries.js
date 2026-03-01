const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errors');
const libraryService = require('../services/library.service');
const libraryRepo = require('../repositories/library.repo');
const config = require('../config');

const upload = multer({ dest: 'data/uploads/' });

router.get('/', authMiddleware, (req, res) => {
  const user = libraryRepo.checkUserAccess(req.userId, null);
  const isAdmin = user?.is_admin || false;
  const libraries = libraryService.getUserLibraries(req.userId, isAdmin);
  res.json(libraries || []);
});

router.post('/', authMiddleware, asyncHandler(async (req, res) => {
  const user = libraryRepo.checkUserAccess(req.userId, null);
  if (!user?.is_admin) {
    throw new AppError('Only admin can create libraries', 403, 'FORBIDDEN');
  }
  
  const library = libraryService.createLibrary(
    req.userId,
    req.body.name,
    req.body.folderPath
  );
  
  res.json(library);
}));

router.delete('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const libraryId = parseInt(req.params.id);
  
  const user = libraryRepo.checkUserAccess(req.userId, null);
  if (!user?.is_admin) {
    throw new AppError('Only admin can delete libraries', 403, 'FORBIDDEN');
  }
  
  const result = libraryService.deleteLibrary(libraryId);
  res.json(result);
}));

router.get('/:id/media', authMiddleware, asyncHandler(async (req, res) => {
  const libraryId = parseInt(req.params.id);
  const { page = 1, pageSize, type, tag, search, path: currentPath = '', recursive = 'false', liked } = req.query;
  
  const result = libraryService.getMediaList(libraryId, req.userId, {
    page: parseInt(page),
    pageSize: pageSize ? parseInt(pageSize) : config.getConfig().pagination.defaultPageSize,
    type,
    tag,
    search,
    path: currentPath,
    recursive: recursive === 'true',
    liked: liked === 'true',
    token: req.token
  });
  
  res.json(result);
}));

router.get('/:id/directories', authMiddleware, asyncHandler(async (req, res) => {
  const libraryId = parseInt(req.params.id);
  const parentPath = req.query.path || '';
  
  const library = libraryService.checkAccess(req.userId, libraryId);
  if (!library) {
    throw new AppError('Library not found', 404, 'NOT_FOUND');
  }
  
  const database = require('../database').getDb();
  
  let sql, params;
  
  if (parentPath) {
    const prefix = `${parentPath}/`;
    const prefixLen = prefix.length;
    sql = `
      SELECT DISTINCT 
        substr(substr(relative_path, ${prefixLen + 1}), 1, instr(substr(relative_path, ${prefixLen + 1}), '/') - 1) as name
      FROM media_files
      WHERE library_id = ? AND relative_path LIKE ?
    `;
    params = [libraryId, `${parentPath}/%`];
  } else {
    sql = `
      SELECT DISTINCT 
        substr(relative_path, 1, instr(relative_path, '/') - 1) as name
      FROM media_files
      WHERE library_id = ? AND relative_path LIKE '%/%'
    `;
    params = [libraryId];
  }
  
  const rows = database.prepare(sql).all(...params) || [];
  
  const directories = [];
  const seen = new Set();
  
  for (const row of rows) {
    if (row.name && !seen.has(row.name)) {
      seen.add(row.name);
      const fullPath = parentPath ? `${parentPath}/${row.name}` : row.name;
      const hasSubdirs = database.prepare(
        'SELECT 1 FROM media_files WHERE library_id = ? AND relative_path LIKE ? LIMIT 1'
      ).get(libraryId, `${fullPath}/%/%`) ? true : false;
      
      directories.push({
        name: row.name,
        path: fullPath,
        hasSubdirs
      });
    }
  }
  
  res.json(directories);
}));

router.get('/:id/thumbnails/:path(*)', authMiddleware, asyncHandler(async (req, res) => {
  const libraryId = parseInt(req.params.id);
  
  const library = libraryService.checkAccess(req.userId, libraryId);
  if (!library) {
    throw new AppError('Library not found', 404, 'NOT_FOUND');
  }
  
  const decodedPath = decodeURIComponent(req.params.path);
  const thumbnailPath = path.join(config.getConfig().thumbnails.path, library.name, decodedPath);
  const resolvedPath = path.resolve(thumbnailPath);
  const resolvedBase = path.resolve(config.getConfig().thumbnails.path, library.name);
  
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new AppError('Invalid path', 403, 'FORBIDDEN');
  }
  
  if (!fs.existsSync(resolvedPath)) {
    throw new AppError('Thumbnail not found', 404, 'NOT_FOUND');
  }
  
  res.sendFile(resolvedPath);
}));

router.get('/:id/files/:path(*)', authMiddleware, asyncHandler(async (req, res) => {
  const libraryId = parseInt(req.params.id);
  
  const library = libraryService.checkAccess(req.userId, libraryId);
  if (!library) {
    throw new AppError('Library not found', 404, 'NOT_FOUND');
  }
  
  const decodedPath = decodeURIComponent(req.params.path);
  const filePath = path.join(library.path, decodedPath);
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(library.path);
  
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new AppError('Invalid path', 403, 'FORBIDDEN');
  }
  
  if (!fs.existsSync(resolvedPath)) {
    throw new AppError('File not found', 404, 'NOT_FOUND');
  }
  
  const stat = fs.statSync(resolvedPath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const { getMimeType } = require('../utils/format');
  
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': getMimeType(resolvedPath),
    };
    res.writeHead(206, head);
    const stream = fs.createReadStream(resolvedPath, { start, end });
    stream.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': getMimeType(resolvedPath),
    };
    res.writeHead(200, head);
    const stream = fs.createReadStream(resolvedPath);
    stream.pipe(res);
  }
}));

router.post('/:id/sync', authMiddleware, asyncHandler(async (req, res) => {
  const libraryId = parseInt(req.params.id);
  const result = await libraryService.syncLibrary(libraryId, req.userId);
  res.json(result);
}));

router.post('/:id/upload', authMiddleware, upload.single('file'), asyncHandler(async (req, res) => {
  const libraryId = parseInt(req.params.id);
  
  const library = libraryService.checkAccess(req.userId, libraryId);
  if (!library) {
    throw new AppError('Library not found', 404, 'NOT_FOUND');
  }
  
  if (!req.file) {
    throw new AppError('No file uploaded', 400, 'VALIDATION_ERROR');
  }
  
  const targetDir = req.body.targetDir || '';
  const targetPath = path.join(library.path, targetDir, req.file.originalname);
  const targetDirPath = path.dirname(targetPath);
  
  try {
    if (!fs.existsSync(targetDirPath)) {
      fs.mkdirSync(targetDirPath, { recursive: true });
    }
    
    fs.renameSync(req.file.path, targetPath);
    
    libraryService.scanLibraryAsync(library.id, library.name, library.path, req.userId);
    
    res.json({ success: true, path: path.join(targetDir, req.file.originalname) });
  } catch (err) {
    console.error('Error uploading file:', err);
    throw new AppError('Failed to upload file', 500, 'UPLOAD_ERROR');
  }
}));

module.exports = router;