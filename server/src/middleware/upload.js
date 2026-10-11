const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { AppError } = require('../lib/errors');

const uploadRoot = path.join(__dirname, '../../uploads/vehicles');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ownerId = req.user?.id || 'unknown';
    const targetDir = path.join(uploadRoot, String(ownerId));
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`;
    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    return cb(new AppError('VALIDATION_ERROR', 'Only JPG, PNG, or WEBP uploads are allowed.', 400));
  }
  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    files: 5,
    fileSize: 5 * 1024 * 1024,
  },
});

module.exports = upload;
