const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { AppError } = require('../lib/errors');

const EXTENSIONS_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const uploadRoot = path.join(__dirname, '../../uploads/vehicles');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ownerId = req.user?.id || 'unknown';
    const targetDir = path.join(uploadRoot, String(ownerId));
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${EXTENSIONS_BY_MIME[file.mimetype] || '.bin'}`;
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

const multipart = multer({
  storage,
  fileFilter,
  limits: {
    files: 5,
    fileSize: 5 * 1024 * 1024,
  },
});

function hasValidImageSignature(file) {
  const descriptor = fs.openSync(file.path, 'r');
  const header = Buffer.alloc(12);
  try {
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    if (file.mimetype === 'image/jpeg') {
      return bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    }
    if (file.mimetype === 'image/png') {
      return bytesRead >= 8 && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
    if (file.mimetype === 'image/webp') {
      return bytesRead >= 12
        && header.toString('ascii', 0, 4) === 'RIFF'
        && header.toString('ascii', 8, 12) === 'WEBP';
    }
    return false;
  } finally {
    fs.closeSync(descriptor);
  }
}

function validateVehicleImages(req, res, next) {
  const files = Object.values(req.files || {}).flat();
  const invalidFiles = files.filter((file) => !hasValidImageSignature(file));
  if (invalidFiles.length) {
    for (const file of files) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }
    return next(new AppError('VALIDATION_ERROR', 'Uploaded file contents must match a supported image type.', 400));
  }
  return next();
}

function uploadFields(fields) {
  const parseMultipart = multipart.fields(fields);
  return (req, res, next) => parseMultipart(req, res, (error) => {
    if (error) return next(error);
    return validateVehicleImages(req, res, next);
  });
}

module.exports = { fields: uploadFields };
