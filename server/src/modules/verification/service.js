const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const vehicleService = require('../vehicles/service');
const { notify } = require('../../lib/notifications');
const { recomputeVehicleStatus } = require('./status');

const REQUIRED_DOCUMENTS = ['RC', 'INSURANCE'];

function reviewDocument(document) {
  const { fileUrl, ...metadata } = document;
  return metadata;
}

async function submitVehicle(userId, vehicleId) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ownerId: userId, deletedAt: null },
    select: { id: true, verificationStatus: true },
  });
  if (!vehicle) throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);

  const documents = await prisma.vehicleDocument.findMany({
    where: {
      vehicleId,
      ownerId: userId,
      type: { in: REQUIRED_DOCUMENTS },
      supersededAt: null,
      status: { in: ['PENDING', 'APPROVED'] },
      expiryDate: { gt: new Date() },
    },
    select: { type: true },
  });
  const present = new Set(documents.map((document) => document.type));
  if (REQUIRED_DOCUMENTS.some((type) => !present.has(type))) {
    throw new AppError('UNPROCESSABLE', 'Current registration and insurance documents are required.', 422, {
      code: 'MISSING_REQUIRED_DOCUMENTS',
    });
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const claimed = await transaction.vehicle.updateMany({
      where: { id: vehicleId, ownerId: userId, deletedAt: null },
      data: { verificationStatus: 'UNDER_REVIEW' },
    });
    if (!claimed.count) throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);
    await transaction.verificationAudit.create({
      data: {
        adminId: userId,
        targetType: 'VEHICLE',
        targetId: vehicleId,
        action: 'SUBMITTED',
      },
    });
    return transaction.vehicle.findUnique({ where: { id: vehicleId } });
  });
  if (vehicle.verificationStatus !== 'UNDER_REVIEW') {
    await vehicleService.setVerificationStatus(vehicleId, 'UNDER_REVIEW');
  }
  return updated;
}

async function listQueue(page, limit) {
  const where = { deletedAt: null, verificationStatus: 'UNDER_REVIEW' };
  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, email: true, phone: true } },
        documents: {
          where: { supersededAt: null },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.vehicle.count({ where }),
  ]);
  return { items: items.map((vehicle) => ({
    ...vehicle,
    documents: vehicle.documents.map(reviewDocument),
  })), total };
}

async function getVehicleReview(vehicleId) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, deletedAt: null, verificationStatus: 'UNDER_REVIEW' },
    include: {
      owner: { select: { id: true, name: true, email: true, phone: true } },
      documents: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!vehicle) throw new AppError('NOT_FOUND', 'Verification record not found.', 404);
  return { ...vehicle, documents: vehicle.documents.map(reviewDocument) };
}

async function decideDocument(adminId, documentId, action, reason = null) {
  const document = await prisma.vehicleDocument.findUnique({
    where: { id: documentId },
    select: { id: true, ownerId: true, vehicleId: true, type: true, insuranceType: true, status: true, expiryDate: true, supersededAt: true },
  });
  if (!document || document.supersededAt) throw new AppError('NOT_FOUND', 'Document not found.', 404);
  if (document.status !== 'PENDING') {
    throw new AppError('CONFLICT', 'This document has already been reviewed.', 409);
  }
  if (action === 'APPROVED') {
    if (document.type === 'INSURANCE' && document.insuranceType !== 'COMMERCIAL') {
      throw new AppError('UNPROCESSABLE', 'Only commercial insurance can be approved.', 422, {
        code: 'INSURANCE_NOT_COMMERCIAL',
      });
    }
    if (document.expiryDate <= new Date()) {
      throw new AppError('UNPROCESSABLE', 'Expired documents cannot be approved.', 422);
    }
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const changed = await transaction.vehicleDocument.updateMany({
      where: { id: documentId, status: 'PENDING', supersededAt: null },
      data: {
        status: action,
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
    if (!changed.count) throw new AppError('CONFLICT', 'This document has already been reviewed.', 409);
    await transaction.verificationAudit.create({
      data: {
        adminId,
        targetType: 'DOCUMENT',
        targetId: documentId,
        action,
        reason,
      },
    });
    return transaction.vehicleDocument.findUnique({ where: { id: documentId } });
  });

  await notify(
    document.ownerId,
    action === 'APPROVED' ? 'DOC_APPROVED' : 'DOC_REJECTED',
    action === 'APPROVED' ? 'Document approved' : 'Document rejected',
    action === 'APPROVED' ? 'Your document has been approved.' : `Your document was rejected: ${reason}`,
    { documentId },
  );

  let vehicleStatus;
  if (document.vehicleId) {
    const before = await prisma.vehicle.findUnique({
      where: { id: document.vehicleId },
      select: { verificationStatus: true },
    });
    const recomputed = await recomputeVehicleStatus(document.vehicleId);
    vehicleStatus = recomputed?.verificationStatus;
    if (vehicleStatus === 'VERIFIED' && before?.verificationStatus !== 'VERIFIED') {
      await notify(document.ownerId, 'VEHICLE_VERIFIED', 'Vehicle verified', 'Your vehicle verification is complete.', {
        vehicleId: document.vehicleId,
      });
    } else if (vehicleStatus === 'REJECTED' && before?.verificationStatus !== 'REJECTED') {
      await notify(document.ownerId, 'VEHICLE_REJECTED', 'Vehicle verification needs attention', 'A required vehicle document was rejected.', {
        vehicleId: document.vehicleId,
      });
    }
  }
  return { ...updated, vehicleStatus };
}

async function listDrivers(query) {
  const where = { backgroundCheckStatus: query.backgroundCheckStatus };
  const [items, total] = await Promise.all([
    prisma.driverProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            vehicleDocuments: {
              where: { type: 'LICENSE', vehicleId: null, supersededAt: null },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.driverProfile.count({ where }),
  ]);
  return { items: items.map((profile) => ({
    ...profile,
    user: {
      ...profile.user,
      vehicleDocuments: profile.user.vehicleDocuments.map(reviewDocument),
    },
  })), total };
}

async function decideDriver(adminId, userId, action, reason = null) {
  const profile = await prisma.driverProfile.findUnique({
    where: { userId },
    include: { user: { select: { role: true, name: true } } },
  });
  if (!profile || profile.user.role !== 'DRIVER') throw new AppError('NOT_FOUND', 'Driver not found.', 404);
  if (profile.backgroundCheckStatus !== 'PENDING') {
    throw new AppError('CONFLICT', 'This driver has already been reviewed.', 409);
  }
  if (action === 'APPROVED') {
    const license = await prisma.vehicleDocument.findFirst({
      where: {
        ownerId: userId,
        vehicleId: null,
        type: 'LICENSE',
        status: 'APPROVED',
        supersededAt: null,
        expiryDate: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!license) {
      throw new AppError('UNPROCESSABLE', 'An approved, unexpired driving licence is required.', 422, {
        code: 'APPROVED_LICENSE_REQUIRED',
      });
    }
  }

  await prisma.$transaction(async (transaction) => {
    const changed = await transaction.driverProfile.updateMany({
      where: { userId, backgroundCheckStatus: 'PENDING' },
      data: { backgroundCheckStatus: action },
    });
    if (!changed.count) throw new AppError('CONFLICT', 'This driver has already been reviewed.', 409);
    await transaction.verificationAudit.create({
      data: {
        adminId,
        targetType: 'DRIVER',
        targetId: userId,
        action,
        reason,
      },
    });
  });
  await notify(
    userId,
    'GENERAL',
    action === 'APPROVED' ? 'Driver approval complete' : 'Driver application rejected',
    action === 'APPROVED' ? 'Your driver account is approved.' : `Your driver application was rejected: ${reason}`,
    { userId },
  );
  return prisma.driverProfile.findUnique({ where: { userId } });
}

async function getAudit(targetType, targetId) {
  return prisma.verificationAudit.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = {
  submitVehicle,
  listQueue,
  getVehicleReview,
  decideDocument,
  listDrivers,
  decideDriver,
  getAudit,
};
