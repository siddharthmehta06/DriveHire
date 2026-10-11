const multer = require('multer');
const { errorResponse } = require('../lib/response');
const logger = require('../lib/logger');

function errorHandler(err, req, res, next) {
  let normalizedError = err;

  if (err instanceof multer.MulterError) {
    normalizedError = { code: 'VALIDATION_ERROR', message: err.message, httpStatus: 400 };
  }

  const status = normalizedError.httpStatus || 500;
  logger.error({ err: normalizedError, path: req.originalUrl }, 'Request failed');

  if (res.headersSent) {
    return next(normalizedError);
  }

  return res.status(status).json(errorResponse(normalizedError));
}

module.exports = errorHandler;
