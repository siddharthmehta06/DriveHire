const fs = require('fs');
const path = require('path');
const prisma = require('../../lib/prisma');
const { emit } = require('../../lib/events');
const { AppError } = require('../../lib/errors');
const { documentRoot } = require('../../middleware/documentUpload');

const MIME_SIGNATURES = [
  { mimeType: 'application/pdf', matches: (bytes) => bytes.subarray(0, 5).toString() === '%PDF-' },
  { mimeType: 'image/png', matches: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  { mimeType: 'image/jpeg', matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
];

function publicDocument(document) {
  const { fileUrl, ...metadata } = document;
  return metadata;
}

async function sniffMimeType(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(8);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    const matched = MIME_SIGNATURES.find((signature) => signature.matches(bytes));
    if (!matched) throw new AppError('VALIDATION_ERROR', 'The uploaded file content is not a supported PDF, JPG, or PNG.', 400);
    return matched.mimeType;
  } finally {
    await handle.close();
  }
}

function resolveStoredFile(fileUrl) {
  const absolutePath = path.resolve(documentRoot, fileUrl);
  if (!absolutePath.startsWith(`${documentRoot}${path.sep}`)) {
    throw new AppError('INTERNAL', 'Stored document path is invalid.', 500);
  }
  return absolutePath;
}

async function upload(ownerId, input, file, ownerRole) {
  if (input.expiryDate <= new Date()) {
    throw new AppError('VALIDATION_ERROR', 'Expiry date must be in the future.', 400);
  }
  if (input.vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: input.vehicleId, ownerId, deletedAt: null },
      select: { id: true },
    });
    if (!vehicle) throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);
  }

  const mimeType = await sniffMimeType(file.path);
  const now = new Date();
  const fileUrl = path.relative(documentRoot, file.path);

  let document;
  try {
    document = await prisma.$transaction(async (transaction) => {
      if (ownerRole === 'DRIVER' && input.type === 'LICENSE') {
        await transaction.driverProfile.upsert({
          where: { userId: ownerId },
          update: {},
          create: { userId: ownerId },
        });
      }
      await transaction.vehicleDocument.updateMany({
        where: {
          ownerId,
          vehicleId: input.vehicleId || null,
          type: input.type,
          supersededAt: null,
        },
        data: { supersededAt: now },
      });
      return transaction.vehicleDocument.create({
        data: {
          ownerId,
          vehicleId: input.vehicleId || null,
          type: input.type,
          insuranceType: input.insuranceType || null,
          documentNumber: input.documentNumber,
          issueDate: input.issueDate || null,
          expiryDate: input.expiryDate,
          fileUrl,
          originalName: file.originalname,
          mimeType,
          sizeBytes: file.size,
        },
      });
    });
  } catch (error) {
    await fs.promises.unlink(file.path).catch((unlinkError) => {
      if (unlinkError.code !== 'ENOENT') throw unlinkError;
    });
    throw error;
  }

  await emit('document.uploaded', { id: document.id, ownerId, vehicleId: document.vehicleId, type: document.type });
  return publicDocument(document);
}

async function list(userId, isAdmin, filters) {
  const where = {
    ...(isAdmin ? {} : { ownerId: userId }),
    ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.includeHistory ? {} : { supersededAt: null }),
  };
  const [documents, total] = await Promise.all([
    prisma.vehicleDocument.findMany({
      where,
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.vehicleDocument.count({ where }),
  ]);
  return { items: documents.map(publicDocument), total };
}

async function getDocument(id, userId, isAdmin) {
  const document = await prisma.vehicleDocument.findFirst({
    where: { id, ...(isAdmin ? {} : { ownerId: userId }) },
  });
  if (!document) throw new AppError('NOT_FOUND', 'Document not found.', 404);
  return document;
}

async function getFile(id, userId, isAdmin) {
  const document = await getDocument(id, userId, isAdmin);
  const filePath = resolveStoredFile(document.fileUrl);
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch (error) {
    if (error.code === 'ENOENT') throw new AppError('NOT_FOUND', 'Document file not found.', 404);
    throw error;
  }
  return { document, filePath };
}

async function deleteDocument(id, userId) {
  const document = await getDocument(id, userId, false);
  if (!['PENDING', 'REJECTED'].includes(document.status)) {
    throw new AppError('CONFLICT', 'Only pending or rejected documents can be deleted.', 409);
  }
  await prisma.vehicleDocument.delete({ where: { id } });
  const filePath = resolveStoredFile(document.fileUrl);
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return publicDocument(document);
}

module.exports = { upload, list, getDocument, getFile, deleteDocument, sniffMimeType };
