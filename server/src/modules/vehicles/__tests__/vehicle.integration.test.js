const request = require('supertest');
const app = require('../../../app');
const prisma = require('../../../lib/prisma');
const bcrypt = require('bcryptjs');
const vehicleService = require('../service');

const USER_ID = 'a7a0ff70-21ce-4e65-a104-a5f31c7f4176';
const OTHER_USER_ID = 'b8b0ff70-21ce-4e65-a104-a5f31c7f4177';
const TEST_REGISTRATIONS = ['MH12AB1234', 'MH02EF1234', 'KA01CD5678', 'DL05FG1001', 'MH03GH2468', 'MH04JK1357'];
let authToken;
let otherAuthToken;
const committedVehicleIds = new Set();

vehicleService.registerCommitmentCheck((vehicleId) => committedVehicleIds.has(vehicleId));

beforeAll(async () => {
  const passwordHash = await bcrypt.hash('TestPassword12!', 4);
  await prisma.user.upsert({
    where: { email: 'vehicle-owner@example.com' },
    update: { passwordHash },
    create: {
      id: USER_ID,
      name: 'Vehicle Owner',
      email: 'vehicle-owner@example.com',
      phone: '9876543210',
      passwordHash,
      role: 'USER',
    },
  });
  const otherPasswordHash = await bcrypt.hash('OtherPassword12!', 4);
  await prisma.user.upsert({
    where: { email: 'other-owner@example.com' },
    update: { passwordHash: otherPasswordHash },
    create: {
      id: OTHER_USER_ID,
      name: 'Other Owner',
      email: 'other-owner@example.com',
      phone: '9876543211',
      passwordHash: otherPasswordHash,
      role: 'USER',
    },
  });
  await prisma.vehicle.deleteMany({
    where: { registrationNumber: { in: TEST_REGISTRATIONS } },
  });

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'vehicle-owner@example.com', password: 'TestPassword12!', role: 'USER' });
  authToken = login.body.data.token;
  const otherLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'other-owner@example.com', password: 'OtherPassword12!', role: 'USER' });
  otherAuthToken = otherLogin.body.data.token;
});

afterEach(async () => {
  await prisma.vehicle.deleteMany({
    where: {
      OR: [
        { ownerId: USER_ID },
        { ownerId: OTHER_USER_ID },
        { registrationNumber: { in: TEST_REGISTRATIONS } },
      ],
    },
  });
  committedVehicleIds.clear();
});

it('returns api health', async () => {
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
});

it('requires an authenticated session before exposing vehicle records', async () => {
  const res = await request(app).get('/api/vehicles');
  expect(res.status).toBe(401);
  expect(res.body.error.code).toBe('UNAUTHENTICATED');
});

it('authenticates credentials only for the selected role', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'vehicle-owner@example.com', password: 'TestPassword12!', role: 'ADMIN' });

  expect(res.status).toBe(401);
  expect(res.body.success).toBe(false);
});

it('creates a vehicle for the owner', async () => {
  const res = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${authToken}`)
    .field('make', 'Toyota')
    .field('model', 'Innova')
    .field('year', 2023)
    .field('registrationNumber', 'mh-12-ab-1234')
    .field('vehicleType', 'MPV')
    .field('seatCapacity', 7)
    .field('isAvailable', true);

  expect(res.status).toBe(201);
  expect(res.body.data.registrationNumber).toBe('MH12AB1234');

  const update = await request(app)
    .patch(`/api/vehicles/${res.body.data.id}`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({ model: 'Innova Touring' });
  expect(update.status).toBe(200);
  expect(update.body.data.model).toBe('Innova Touring');
});

it('does not permit registration details to be changed after creation', async () => {
  const res = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${authToken}`)
    .field('make', 'Honda')
    .field('model', 'City')
    .field('year', 2022)
    .field('registrationNumber', 'MH02EF1234')
    .field('vehicleType', 'SEDAN')
    .field('seatCapacity', 4);

  const update = await request(app)
    .patch(`/api/vehicles/${res.body.data.id}`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({ registrationNumber: 'MH02EF9999' });

  expect(update.status).toBe(400);
  expect(update.body.error.code).toBe('VALIDATION_ERROR');
});

it('rejects mass assignment of owner and verification fields', async () => {
  const res = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${authToken}`)
    .field('make', 'Honda')
    .field('model', 'City')
    .field('year', 2022)
    .field('registrationNumber', 'MH03GH2468')
    .field('vehicleType', 'SEDAN')
    .field('seatCapacity', 4)
    .field('ownerId', OTHER_USER_ID)
    .field('verificationStatus', 'VERIFIED');

  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
});

it('rejects uploads whose declared media type is not an allowed image', async () => {
  const res = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${authToken}`)
    .field('make', 'Honda')
    .field('model', 'City')
    .field('year', 2022)
    .field('registrationNumber', 'MH03GH2468')
    .field('vehicleType', 'SEDAN')
    .field('seatCapacity', 4)
    .attach('photos', Buffer.from('not an image'), {
      filename: 'vehicle.txt',
      contentType: 'text/plain',
    });

  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
});

it('masks vehicle access from a different owner', async () => {
  const created = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${authToken}`)
    .field('make', 'Honda')
    .field('model', 'City')
    .field('year', 2022)
    .field('registrationNumber', 'MH04JK1357')
    .field('vehicleType', 'SEDAN')
    .field('seatCapacity', 4);

  expect(created.status).toBe(201);
  const id = created.body.data.id;
  const [read, update, remove] = await Promise.all([
    request(app).get(`/api/vehicles/${id}`).set('Authorization', `Bearer ${otherAuthToken}`),
    request(app).patch(`/api/vehicles/${id}`).set('Authorization', `Bearer ${otherAuthToken}`).send({ model: 'City ZX' }),
    request(app).delete(`/api/vehicles/${id}`).set('Authorization', `Bearer ${otherAuthToken}`),
  ]);

  expect(read.status).toBe(404);
  expect(update.status).toBe(404);
  expect(remove.status).toBe(404);
});

it('blocks deletion with commitments and soft-deletes otherwise', async () => {
  const createVehicle = (registrationNumber) => request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${authToken}`)
    .field('make', 'Honda')
    .field('model', 'City')
    .field('year', 2022)
    .field('registrationNumber', registrationNumber)
    .field('vehicleType', 'SEDAN')
    .field('seatCapacity', 4);
  const committed = await createVehicle('MH03GH2468');
  const removable = await createVehicle('MH04JK1357');
  committedVehicleIds.add(committed.body.data.id);

  const blocked = await request(app)
    .delete(`/api/vehicles/${committed.body.data.id}`)
    .set('Authorization', `Bearer ${authToken}`);
  expect(blocked.status).toBe(409);
  expect(blocked.body.error.details.code).toBe('VEHICLE_HAS_COMMITMENTS');

  const deleted = await request(app)
    .delete(`/api/vehicles/${removable.body.data.id}`)
    .set('Authorization', `Bearer ${authToken}`);
  expect(deleted.status).toBe(200);
  const lookup = await request(app)
    .get(`/api/vehicles/${removable.body.data.id}`)
    .set('Authorization', `Bearer ${authToken}`);
  expect(lookup.status).toBe(404);
});

it('blocks duplicate registration numbers case-insensitively', async () => {
  await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${authToken}`)
    .field('make', 'Hyundai')
    .field('model', 'Creta')
    .field('year', 2022)
    .field('registrationNumber', 'ka-01-cd-5678')
    .field('vehicleType', 'SUV')
    .field('seatCapacity', 5)
    .field('isAvailable', true);

  const res = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${authToken}`)
    .field('make', 'Another')
    .field('model', 'Car')
    .field('year', 2024)
    .field('registrationNumber', 'ka01cd5678')
    .field('vehicleType', 'SEDAN')
    .field('seatCapacity', 5)
    .field('isAvailable', true);

  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('CONFLICT');
});

it('lists vehicles for the owner only', async () => {
  await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${authToken}`)
    .field('make', 'Maruti')
    .field('model', 'Brezza')
    .field('year', 2021)
    .field('registrationNumber', 'dl-05-fg-1001')
    .field('vehicleType', 'SUV')
    .field('seatCapacity', 5)
    .field('isAvailable', true);

  const res = await request(app)
    .get('/api/vehicles')
    .set('Authorization', `Bearer ${authToken}`);

  expect(res.status).toBe(200);
  expect(res.body.data.length).toBeGreaterThan(0);
});
