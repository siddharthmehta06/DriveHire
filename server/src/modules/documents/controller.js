const path = require('path');
const fs = require('fs');
const { successResponse } = require('../../lib/response');
const { parseBody } = require('../../lib/validate');
const { AppError } = require('../../lib/errors');
const service = require('./service');
const { uploadSchema, listSchema, idSchema } = require('./schema');

function removeUpload(file) {
  if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
}

async function upload(req, res, next) {
  try {
    if (!req.file) throw new AppError('VALIDATION_ERROR', 'A document file is required.', 400);
    const payload = parseBody(uploadSchema, {
      ...req.body,
      issueDate: req.body.issueDate || undefined,
      expiryDate: req.body.expiryDate,
    });
    if (['LICENSE', 'PERMIT'].includes(payload.type) && req.user.role !== 'DRIVER') {
      throw new AppError('FORBIDDEN', 'Only driver accounts can upload driver-level documents.', 403);
    }
    const document = await service.upload(req.user.id, payload, req.file, req.user.role);
    return res.status(201).json(successResponse(document));
  } catch (error) {
    try {
      removeUpload(req.file);
    } catch (cleanupError) {
      return next(cleanupError);
    }
    return next(error);
  }
}

async function list(req, res, next) {
  try {
    const query = parseBody(listSchema, req.query);
    const result = await service.list(req.user.id, req.user.role === 'ADMIN', query);
    return res.json(successResponse(result.items, {
      page: query.page,
      limit: query.limit,
      total: result.total,
    }));
  } catch (error) {
    return next(error);
  }
}

async function get(req, res, next) {
  try {
    const { id } = parseBody(idSchema, req.params);
    const document = await service.getDocument(id, req.user.id, req.user.role === 'ADMIN');
    const { fileUrl, ...metadata } = document;
    return res.json(successResponse(metadata));
  } catch (error) {
    return next(error);
  }
}

async function download(req, res, next) {
  try {
    const { id } = parseBody(idSchema, req.params);
    const { document, filePath } = await service.getFile(id, req.user.id, req.user.role === 'ADMIN');
    const downloadName = path.basename(document.originalName.replace(/[\\/]/g, '_'));
    res.type(document.mimeType);
    return res.download(filePath, downloadName);
  } catch (error) {
    return next(error);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = parseBody(idSchema, req.params);
    return res.json(successResponse(await service.deleteDocument(id, req.user.id)));
  } catch (error) {
    return next(error);
  }
}

module.exports = { upload, list, get, download, remove };
