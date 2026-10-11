const fs = require('fs');
const path = require('path');
const prisma = require('../../lib/prisma');
const { emit } = require('../../lib/events');
const { AppError } = require('../../lib/errors');

const commitmentChecks = [];

function parsePhotoUrls(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function normalizeRegistrationNumber(value) {
  return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function removeUploadedFiles(files) {
  for (const file of files) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  }
}

function registerCommitmentCheck(fn) {
  if (typeof fn === 'function') {
    commitmentChecks.push(fn);
  }
}

async function getVehicleForOwner(id, userId) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, ownerId: userId, deletedAt: null },
  });
  if (!vehicle) return null;
  return { ...vehicle, photoUrls: parsePhotoUrls(vehicle.photoUrls) };
}

async function setVerificationStatus(id, status) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, deletedAt: null },
  });

  if (!vehicle) {
    throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);
  }

  const updated = await prisma.vehicle.update({
    where: { id },
    data: { verificationStatus: status },
  });

  emit('vehicle.verification-changed', { id, status, vehicle: { ...updated, photoUrls: parsePhotoUrls(updated.photoUrls) } });
  return { ...updated, photoUrls: parsePhotoUrls(updated.photoUrls) };
}

async function updateAvailability(id, userId, isAvailable) {
  const vehicle = await getVehicleForOwner(id, userId);
  if (!vehicle) throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);

  const updated = await prisma.vehicle.update({
    where: { id },
    data: { isAvailable },
  });

  return { ...updated, photoUrls: parsePhotoUrls(updated.photoUrls) };
}

async function checkAvailability(id) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, deletedAt: null },
  });

  if (!vehicle) return false;
  return Boolean(vehicle.isAvailable) && vehicle.verificationStatus === 'VERIFIED';
}

async function listVehiclesForOwner(userId, filters = {}, page = 1, limit = 20, isAdmin = false) {
  const where = {
    ...(isAdmin ? {} : { ownerId: userId }),
    deletedAt: null,
    ...(filters.verificationStatus ? { verificationStatus: filters.verificationStatus } : {}),
    ...(typeof filters.isAvailable !== 'undefined' ? { isAvailable: Boolean(filters.isAvailable) } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      ...(isAdmin ? { include: { owner: { select: { id: true, name: true, email: true } } } } : {}),
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.vehicle.count({ where }),
  ]);

  return {
    items: items.map((vehicle) => ({ ...vehicle, photoUrls: parsePhotoUrls(vehicle.photoUrls) })),
    total,
    page,
    limit,
  };
}

async function getVehicleById(id, userId, isAdmin = false) {
  const vehicle = await prisma.vehicle.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(isAdmin ? {} : { ownerId: userId }),
    },
    ...(isAdmin ? { include: { owner: { select: { id: true, name: true, email: true } } } } : {}),
  });

  if (!vehicle) {
    throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);
  }

  return { ...vehicle, photoUrls: parsePhotoUrls(vehicle.photoUrls) };
}

async function createVehicle(userId, payload, files = []) {
  const registrationNumber = normalizeRegistrationNumber(payload.registrationNumber);

  const exists = await prisma.vehicle.findUnique({
    where: { registrationNumber },
  });

  if (exists && !exists.deletedAt) {
    removeUploadedFiles(files);
    throw new AppError('CONFLICT', 'Vehicle registration already exists.', 409, { code: 'REGISTRATION_EXISTS' });
  }

  const savedPhotoUrls = files.map((file) => `/uploads/vehicles/${userId}/${path.basename(file.path)}`);
  let record;
  try {
    record = await prisma.vehicle.create({
      data: {
        ownerId: userId,
        make: payload.make,
        model: payload.model,
        year: Number(payload.year),
        registrationNumber,
        vehicleType: payload.vehicleType,
        seatCapacity: Number(payload.seatCapacity),
        photoUrls: savedPhotoUrls,
        verificationStatus: 'UNVERIFIED',
        isAvailable: payload.isAvailable !== false,
      },
    });
  } catch (error) {
    removeUploadedFiles(files);
    throw error;
  }

  return { ...record, photoUrls: parsePhotoUrls(record.photoUrls) };
}

async function updateVehicle(id, userId, payload) {
  const vehicle = await getVehicleForOwner(id, userId);
  if (!vehicle) throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);

  const nextPhotoUrls = [...(vehicle.photoUrls || [])];
  const removedPhotoUrls = [];
  if (Array.isArray(payload.removePhotoUrls)) {
    for (const remove of payload.removePhotoUrls) {
      const index = nextPhotoUrls.indexOf(remove);
      if (index >= 0) {
        nextPhotoUrls.splice(index, 1);
        removedPhotoUrls.push(remove);
      }
    }
  }

  const addedPhotoUrls = payload.addPhotoUrls || [];
  if (nextPhotoUrls.length + addedPhotoUrls.length > 5) {
    throw new AppError('VALIDATION_ERROR', 'A vehicle can have no more than five photos.', 400);
  }

  const merged = {
    ...(payload.make ? { make: payload.make } : {}),
    ...(payload.model ? { model: payload.model } : {}),
    ...(typeof payload.year !== 'undefined' ? { year: Number(payload.year) } : {}),
    ...(payload.vehicleType ? { vehicleType: payload.vehicleType } : {}),
    ...(typeof payload.seatCapacity !== 'undefined' ? { seatCapacity: Number(payload.seatCapacity) } : {}),
    ...(
      addedPhotoUrls.length || removedPhotoUrls.length
        ? { photoUrls: nextPhotoUrls.concat(addedPhotoUrls) }
        : {}
    ),
  };

  const updated = await prisma.vehicle.update({
    where: { id },
    data: merged,
  });

  const ownerUploadDirectory = path.resolve(__dirname, '../../../uploads/vehicles', userId);
  for (const removedUrl of removedPhotoUrls) {
    const filePath = path.resolve(ownerUploadDirectory, path.basename(removedUrl));
    if (filePath.startsWith(`${ownerUploadDirectory}${path.sep}`) && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  return { ...updated, photoUrls: parsePhotoUrls(updated.photoUrls) };
}

async function deleteVehicle(id, userId) {
  const vehicle = await getVehicleForOwner(id, userId);
  if (!vehicle) throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);

  const hasCommitments = await Promise.all(commitmentChecks.map((check) => check(id))).then((results) => results.some(Boolean));
  if (hasCommitments) {
    throw new AppError('CONFLICT', 'Vehicle has active commitments.', 409, { code: 'VEHICLE_HAS_COMMITMENTS' });
  }

  const updated = await prisma.vehicle.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return { ...updated, photoUrls: parsePhotoUrls(updated.photoUrls) };
}

async function requireVehicleOwner(req, res, next) {
  try {
    const vehicle = await getVehicleForOwner(req.params.id, req.user.id);
    if (!vehicle) throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getVehicleForOwner,
  setVerificationStatus,
  updateAvailability,
  checkAvailability,
  registerCommitmentCheck,
  listVehiclesForOwner,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  normalizeRegistrationNumber,
  requireVehicleOwner,
};
