const request = require('supertest');
const app = require('../../../app');
const prisma = require('../../../lib/prisma');
const bcrypt = require('bcryptjs');

const USER_ID = 'a7a0ff70-21ce-4e65-a104-a5f31c7f4176';
const TEST_REGISTRATIONS = ['MH12AB1234', 'MH02EF1234', 'KA01CD5678', 'DL05FG1001'];
let authToken;

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
  await prisma.vehicle.deleteMany({
    where: { registrationNumber: { in: TEST_REGISTRATIONS } },
  });

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'vehicle-owner@example.com', password: 'TestPassword12!', role: 'USER' });
  authToken = login.body.data.token;
});

afterEach(async () => {
  await prisma.vehicle.deleteMany({
    where: {
      OR: [
        { ownerId: USER_ID },
        { registrationNumber: { in: TEST_REGISTRATIONS } },
      ],
    },
  });
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
