const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../../app');
const prisma = require('../../../lib/prisma');
const { documentRoot } = require('../../../middleware/documentUpload');

const OWNER_ID = 'd0d0ff70-21ce-4e65-a104-a5f31c7f4170';
const OTHER_ID = 'd1d1ff70-21ce-4e65-a104-a5f31c7f4171';
const ADMIN_ID = 'd2d2ff70-21ce-4e65-a104-a5f31c7f4172';
const REGISTRATION = 'ZZ99DOC001';
const pdfBytes = Buffer.from('%PDF-1.7\nDriveHire document fixture\n');
let ownerToken;
let otherToken;
let adminToken;
let vehicleId;

function futureDate(days = 90) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function uploadDocument(token, metadata = {}, bytes = pdfBytes, name = 'document.pdf', mimeType = 'application/pdf') {
  const payload = {
    type: 'RC',
    vehicleId,
    documentNumber: 'DOC-1001',
    expiryDate: futureDate(),
    ...metadata,
  };
  const requestBuilder = request(app)
    .post('/api/documents')
    .set('Authorization', `Bearer ${token}`);
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) requestBuilder.field(key, String(value));
  });
  return requestBuilder.attach('file', bytes, { filename: name, contentType: mimeType });
}

beforeAll(async () => {
  const ownerHash = await bcrypt.hash('DocumentOwner12!', 4);
  const otherHash = await bcrypt.hash('DocumentOther12!', 4);
  const adminHash = await bcrypt.hash('DocumentAdmin12!', 4);
  await prisma.user.upsert({
    where: { email: 'document-owner@example.com' },
    update: { passwordHash: ownerHash },
    create: { id: OWNER_ID, name: 'Document Owner', email: 'document-owner@example.com', passwordHash: ownerHash, role: 'USER' },
  });
  await prisma.user.upsert({
    where: { email: 'document-other@example.com' },
    update: { passwordHash: otherHash },
    create: { id: OTHER_ID, name: 'Another Owner', email: 'document-other@example.com', passwordHash: otherHash, role: 'USER' },
  });
  await prisma.user.upsert({
    where: { email: 'document-admin@example.com' },
    update: { passwordHash: adminHash },
    create: { id: ADMIN_ID, name: 'Document Administrator', email: 'document-admin@example.com', passwordHash: adminHash, role: 'ADMIN' },
  });
  await prisma.vehicleDocument.deleteMany({ where: { ownerId: { in: [OWNER_ID, OTHER_ID] } } });
  const vehicle = await prisma.vehicle.upsert({
    where: { registrationNumber: REGISTRATION },
    update: { ownerId: OWNER_ID, deletedAt: null },
    create: {
      ownerId: OWNER_ID,
      make: 'Test',
      model: 'Document Vehicle',
      year: new Date().getFullYear(),
      registrationNumber: REGISTRATION,
      vehicleType: 'SEDAN',
      seatCapacity: 4,
    },
  });
  vehicleId = vehicle.id;
  const [ownerLogin, otherLogin, adminLogin] = await Promise.all([
    request(app).post('/api/auth/login').send({ email: 'document-owner@example.com', password: 'DocumentOwner12!', role: 'USER' }),
    request(app).post('/api/auth/login').send({ email: 'document-other@example.com', password: 'DocumentOther12!', role: 'USER' }),
    request(app).post('/api/auth/login').send({ email: 'document-admin@example.com', password: 'DocumentAdmin12!', role: 'ADMIN' }),
  ]);
  ownerToken = ownerLogin.body.data.token;
  otherToken = otherLogin.body.data.token;
  adminToken = adminLogin.body.data.token;
});

afterEach(async () => {
  await prisma.vehicleDocument.deleteMany({ where: { ownerId: { in: [OWNER_ID, OTHER_ID] } } });
  for (const id of [OWNER_ID, OTHER_ID]) {
    await fs.promises.rm(path.join(documentRoot, id), { recursive: true, force: true });
  }
});

afterAll(async () => {
  await prisma.vehicleDocument.deleteMany({ where: { ownerId: { in: [OWNER_ID, OTHER_ID] } } });
  await prisma.vehicle.deleteMany({ where: { registrationNumber: REGISTRATION } });
  await prisma.user.deleteMany({ where: { id: { in: [OWNER_ID, OTHER_ID, ADMIN_ID] } } });
});

it('uploads supported file content and hides its internal path from metadata', async () => {
  const response = await uploadDocument(ownerToken);
  expect(response.status).toBe(201);
  expect(response.body.data.mimeType).toBe('application/pdf');
  expect(response.body.data.fileUrl).toBeUndefined();

  const metadata = await request(app)
    .get(`/api/documents/${response.body.data.id}`)
    .set('Authorization', `Bearer ${ownerToken}`);
  expect(metadata.status).toBe(200);
  expect(metadata.body.data.fileUrl).toBeUndefined();
});

it('sniffs file bytes instead of trusting a declared MIME type', async () => {
  const response = await uploadDocument(
    ownerToken,
    { documentNumber: 'DOC-SPOOF' },
    Buffer.from('not a PDF or image'),
  );
  expect(response.status).toBe(400);
  expect(response.body.error.code).toBe('VALIDATION_ERROR');
});

it('authorizes private downloads and returns the file only to its owner or an admin', async () => {
  const created = await uploadDocument(ownerToken);
  expect(created.status).toBe(201);

  const [ownerDownload, otherDownload] = await Promise.all([
    request(app).get(`/api/documents/${created.body.data.id}/file`).set('Authorization', `Bearer ${ownerToken}`),
    request(app).get(`/api/documents/${created.body.data.id}/file`).set('Authorization', `Bearer ${otherToken}`),
  ]);
  expect(ownerDownload.status).toBe(200);
  expect(Buffer.isBuffer(ownerDownload.body)).toBe(true);
  expect(ownerDownload.body.toString()).toContain('%PDF-1.7');
  expect(otherDownload.status).toBe(404);
  const adminDownload = await request(app)
    .get(`/api/documents/${created.body.data.id}/file`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(adminDownload.status).toBe(200);
  expect(adminDownload.body.toString()).toContain('%PDF-1.7');

  const stored = await prisma.vehicleDocument.findUnique({ where: { id: created.body.data.id } });
  const publicPath = await request(app).get(`/uploads/documents/${stored.fileUrl}`);
  expect(publicPath.status).toBe(404);

  await prisma.vehicleDocument.update({
    where: { id: created.body.data.id },
    data: { fileUrl: '../../etc/passwd' },
  });
  const traversalAttempt = await request(app)
    .get(`/api/documents/${created.body.data.id}/file`)
    .set('Authorization', `Bearer ${ownerToken}`);
  expect(traversalAttempt.status).toBe(500);
  expect(traversalAttempt.body.error.code).toBe('INTERNAL');
});

it('supersedes the previous owner, vehicle and type document', async () => {
  const first = await uploadDocument(ownerToken, { documentNumber: 'DOC-OLD' });
  const second = await uploadDocument(ownerToken, { documentNumber: 'DOC-NEW' });
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);

  const current = await request(app)
    .get('/api/documents?type=RC')
    .set('Authorization', `Bearer ${ownerToken}`);
  expect(current.body.data).toHaveLength(1);
  expect(current.body.data[0].id).toBe(second.body.data.id);

  const history = await request(app)
    .get('/api/documents?type=RC&includeHistory=true')
    .set('Authorization', `Bearer ${ownerToken}`);
  expect(history.body.data).toHaveLength(2);
  expect(history.body.data.find((item) => item.id === first.body.data.id).supersededAt).toBeTruthy();
});

it('validates dates, vehicle ownership, insurance metadata and delete eligibility', async () => {
  const expired = await uploadDocument(ownerToken, { documentNumber: 'DOC-EXPIRED', expiryDate: new Date(Date.now() - 86400000).toISOString() });
  expect(expired.status).toBe(400);

  const privateInsurance = await uploadDocument(ownerToken, {
    type: 'INSURANCE',
    documentNumber: 'POL-PRIVATE',
    insuranceType: 'PRIVATE',
  });
  expect(privateInsurance.status).toBe(201);

  const missingInsuranceType = await uploadDocument(ownerToken, {
    type: 'INSURANCE',
    documentNumber: 'POL-MISSING',
    insuranceType: undefined,
  });
  expect(missingInsuranceType.status).toBe(400);

  const wrongVehicle = await uploadDocument(otherToken, { documentNumber: 'DOC-OTHER' });
  expect(wrongVehicle.status).toBe(404);

  const pending = await uploadDocument(ownerToken, { documentNumber: 'DOC-DELETE' });
  const deleted = await request(app)
    .delete(`/api/documents/${pending.body.data.id}`)
    .set('Authorization', `Bearer ${ownerToken}`);
  expect(deleted.status).toBe(200);

  const approved = await uploadDocument(ownerToken, { documentNumber: 'DOC-APPROVED' });
  await prisma.vehicleDocument.update({ where: { id: approved.body.data.id }, data: { status: 'APPROVED' } });
  const blocked = await request(app)
    .delete(`/api/documents/${approved.body.data.id}`)
    .set('Authorization', `Bearer ${ownerToken}`);
  expect(blocked.status).toBe(409);
});

it('allows driver-level documents only for driver accounts', async () => {
  const response = await uploadDocument(ownerToken, {
    type: 'LICENSE',
    vehicleId: undefined,
    documentNumber: 'LICENSE-USER',
  });
  expect(response.status).toBe(403);
  expect(response.body.error.code).toBe('FORBIDDEN');
});
