const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');

async function assertVehicleVerified(vehicleId) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, deletedAt: null },
    select: { verificationStatus: true },
  });
  if (!vehicle || vehicle.verificationStatus !== 'VERIFIED') {
    throw new AppError('UNPROCESSABLE', 'Vehicle is not verified.', 422, { code: 'VEHICLE_NOT_VERIFIED' });
  }
  return vehicle;
}

async function assertDriverApproved(userId) {
  const profile = await prisma.driverProfile.findUnique({
    where: { userId },
    select: { backgroundCheckStatus: true },
  });
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
  if (!profile || profile.backgroundCheckStatus !== 'APPROVED' || !license) {
    throw new AppError('UNPROCESSABLE', 'Driver is not approved.', 422, { code: 'DRIVER_NOT_APPROVED' });
  }
  return profile;
}

module.exports = { assertVehicleVerified, assertDriverApproved };
