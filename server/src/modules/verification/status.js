const prisma = require('../../lib/prisma');
const vehicleService = require('../vehicles/service');

async function recomputeVehicleStatus(vehicleId) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, deletedAt: null },
    select: { id: true, ownerId: true, verificationStatus: true },
  });
  if (!vehicle) return null;

  const documents = await prisma.vehicleDocument.findMany({
    where: {
      vehicleId,
      ownerId: vehicle.ownerId,
      supersededAt: null,
      type: { in: ['RC', 'INSURANCE'] },
    },
    select: { type: true, status: true, insuranceType: true, expiryDate: true },
  });
  const now = new Date();
  const current = (type) => documents.find((document) => document.type === type);
  const rc = current('RC');
  const insurance = current('INSURANCE');
  const approvedAndValid = (document) => document
    && document.status === 'APPROVED'
    && document.expiryDate > now;

  let nextStatus = vehicle.verificationStatus;
  if (approvedAndValid(rc) && approvedAndValid(insurance) && insurance.insuranceType === 'COMMERCIAL') {
    nextStatus = 'VERIFIED';
  } else if ([rc, insurance].some((document) => document?.status === 'REJECTED')) {
    nextStatus = 'REJECTED';
  } else if (vehicle.verificationStatus === 'VERIFIED'
    || [rc, insurance].some((document) => document?.status === 'EXPIRED')) {
    nextStatus = 'EXPIRED';
  }

  if (nextStatus !== vehicle.verificationStatus) {
    return vehicleService.setVerificationStatus(vehicleId, nextStatus);
  }
  return { ...vehicle, verificationStatus: nextStatus };
}

module.exports = { recomputeVehicleStatus };
