const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const multer = require('multer');
const { AppError } = require('../lib/errors');

const documentRoot = path.resolve(__dirname, '../../uploads/documents');
const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    const destination = path.join(documentRoot, req.user.id);
    fs.mkdirSync(destination, { recursive: true });
    callback(null, destination);
  },
  filename: (req, file, callback) => callback(null, randomUUID()),
});

const documentUpload = multer({
  storage,
  limits: { files: 1, fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(new AppError('VALIDATION_ERROR', 'Upload a PDF, JPG, or PNG document.', 400));
    }
    return callback(null, true);
  },
});

module.exports = { documentUpload, documentRoot };
