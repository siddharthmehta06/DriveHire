const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../../../lib/prisma');
const { recomputeVehicleStatus } = require('../status');
const { assertDriverApproved, assertVehicleVerified } = require('../guards');
const { handleDocumentUploaded, handleExpiredDocument } = require('../expiryListener');

const OWNER_ID = 'f3f3ff70-21ce-4e65-a104-a5f31c7f4174';
const ADMIN_ID = 'f4f4ff70-21ce-4e65-a104-a5f31c7f4175';
const DRIVER_ID = 'f5f5ff70-21ce-4e65-a104-a5f31c7f4176';

let vehicleId;

async function createVehicle(status = 'UNDER_REVIEW') {
  const vehicle = await prisma.vehicle.create({
    data: {
      ownerId: OWNER_ID,
      make: 'Test',
      model: 'Verification Vehicle',
      year: new Date().getFullYear(),
      registrationNumber: `VF${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      vehicleType: 'SEDAN',
      seatCapacity: 4,
      verificationStatus: status,
    },
  });
  vehicleId = vehicle.id;
  return vehicle;
}

async function createDocument(type, { status = 'PENDING', insuranceType = null, expiryDate = new Date(Date.now() + 86400000) } = {}) {
  return prisma.vehicleDocument.create({
    data: {
      ownerId: OWNER_ID,
      vehicleId,
      type,
      insuranceType,
      documentNumber: `${type}-${randomUUID().slice(0, 8)}`,
      expiryDate,
      fileUrl: `${OWNER_ID}/${randomUUID()}`,
      originalName: 'verification.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 8,
      status,
    },
  });
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash('VerificationPassword12!', 4);
  await Promise.all([
    prisma.user.upsert({
      where: { email: 'verification-owner@example.com' },
      update: {},
      create: { id: OWNER_ID, name: 'Verification Owner', email: 'verification-owner@example.com', passwordHash, role: 'USER' },
    }),
    prisma.user.upsert({
      where: { email: 'verification-admin@example.com' },
      update: {},
      create: { id: ADMIN_ID, name: 'Verification Admin', email: 'verification-admin@example.com', passwordHash, role: 'ADMIN' },
    }),
    prisma.user.upsert({
      where: { email: 'verification-driver@example.com' },
      update: {},
      create: { id: DRIVER_ID, name: 'Verification Driver', email: 'verification-driver@example.com', passwordHash, role: 'DRIVER' },
    }),
  ]);
  await prisma.driverProfile.upsert({
    where: { userId: DRIVER_ID },
    update: { backgroundCheckStatus: 'PENDING' },
    create: { userId: DRIVER_ID },
  });
});

beforeEach(async () => {
  await prisma.verificationAudit.deleteMany({ where: { adminId: { in: [OWNER_ID, ADMIN_ID, 'SYSTEM'] } } });
  await prisma.vehicleDocument.deleteMany({ where: { ownerId: OWNER_ID } });
  await prisma.vehicle.deleteMany({ where: { ownerId: OWNER_ID } });
});

afterAll(async () => {
  await prisma.verificationAudit.deleteMany({ where: { adminId: { in: [OWNER_ID, ADMIN_ID, 'SYSTEM'] } } });
  await prisma.vehicleDocument.deleteMany({ where: { ownerId: { in: [OWNER_ID, DRIVER_ID] } } });
  await prisma.vehicle.deleteMany({ where: { ownerId: OWNER_ID } });
  await prisma.driverProfile.deleteMany({ where: { userId: DRIVER_ID } });
  await prisma.user.deleteMany({ where: { id: { in: [OWNER_ID, ADMIN_ID, DRIVER_ID] } } });
});

it('recomputes vehicle status from both current, approved, unexpired required documents', async () => {
  await createVehicle();
  await createDocument('RC', { status: 'APPROVED' });
  await createDocument('INSURANCE', { status: 'APPROVED', insuranceType: 'COMMERCIAL' });

  const result = await recomputeVehicleStatus(vehicleId);
  expect(result.verificationStatus).toBe('VERIFIED');
  expect((await prisma.vehicle.findUnique({ where: { id: vehicleId } })).verificationStatus).toBe('VERIFIED');
});

it('rejects a vehicle when a required current document is rejected', async () => {
  await createVehicle();
  await createDocument('RC', { status: 'REJECTED' });
  await createDocument('INSURANCE', { status: 'PENDING', insuranceType: 'COMMERCIAL' });

  expect((await recomputeVehicleStatus(vehicleId)).verificationStatus).toBe('REJECTED');
});

it('downgrades a verified vehicle when a required document expires', async () => {
  await createVehicle('VERIFIED');
  await createDocument('RC', { status: 'EXPIRED', expiryDate: new Date(Date.now() - 86400000) });
  await createDocument('INSURANCE', { status: 'APPROVED', insuranceType: 'COMMERCIAL' });

  expect((await recomputeVehicleStatus(vehicleId)).verificationStatus).toBe('EXPIRED');
});

it('does not approve a vehicle with private insurance or superseded documents', async () => {
  await createVehicle();
  await createDocument('RC', { status: 'APPROVED' });
  await createDocument('INSURANCE', { status: 'APPROVED', insuranceType: 'PRIVATE' });

  expect((await recomputeVehicleStatus(vehicleId)).verificationStatus).toBe('UNDER_REVIEW');
});

it('downgrades verification when replacement documents supersede the approved record', async () => {
  await createVehicle('VERIFIED');
  const oldRc = await createDocument('RC', { status: 'APPROVED' });
  await createDocument('INSURANCE', { status: 'APPROVED', insuranceType: 'COMMERCIAL' });
  await prisma.vehicleDocument.update({ where: { id: oldRc.id }, data: { supersededAt: new Date() } });
  const replacement = await createDocument('RC');

  await handleDocumentUploaded({ id: replacement.id, vehicleId });
  expect((await prisma.vehicle.findUnique({ where: { id: vehicleId } })).verificationStatus).toBe('EXPIRED');
});

it('records automatic expiry and recomputes the affected vehicle status', async () => {
  await createVehicle('VERIFIED');
  const rc = await createDocument('RC', { status: 'EXPIRED', expiryDate: new Date(Date.now() - 86400000) });
  await createDocument('INSURANCE', { status: 'APPROVED', insuranceType: 'COMMERCIAL' });

  await handleExpiredDocument({ id: rc.id, vehicleId });
  expect((await prisma.vehicle.findUnique({ where: { id: vehicleId } })).verificationStatus).toBe('EXPIRED');
  expect(await prisma.verificationAudit.findFirst({
    where: { targetType: 'DOCUMENT', targetId: rc.id, action: 'AUTO_EXPIRED' },
  })).toBeTruthy();
});

it('guards downstream features against unverified vehicles and unapproved drivers', async () => {
  await createVehicle();
  await expect(assertVehicleVerified(vehicleId)).rejects.toMatchObject({
    code: 'UNPROCESSABLE',
    details: { code: 'VEHICLE_NOT_VERIFIED' },
  });
  await expect(assertDriverApproved(DRIVER_ID)).rejects.toMatchObject({
    code: 'UNPROCESSABLE',
    details: { code: 'DRIVER_NOT_APPROVED' },
  });

  await prisma.vehicle.update({ where: { id: vehicleId }, data: { verificationStatus: 'VERIFIED' } });
  await prisma.driverProfile.update({ where: { userId: DRIVER_ID }, data: { backgroundCheckStatus: 'APPROVED' } });
  await prisma.vehicleDocument.create({
    data: {
      ownerId: DRIVER_ID,
      type: 'LICENSE',
      documentNumber: 'DRIVER-LICENSE',
      expiryDate: new Date(Date.now() + 86400000),
      fileUrl: `${DRIVER_ID}/${randomUUID()}`,
      originalName: 'license.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 8,
      status: 'APPROVED',
    },
  });
  await expect(assertVehicleVerified(vehicleId)).resolves.toBeDefined();
  await expect(assertDriverApproved(DRIVER_ID)).resolves.toBeDefined();
});
