const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../../../lib/prisma');
const { on } = require('../../../lib/events');
const request = require('supertest');
const app = require('../../../app');
const { hasVehicleCommitments } = require('../service');

const DRIVER_ID = 'f6f6ff70-21ce-4e65-a104-a5f31c7f4177';
const OTHER_DRIVER_ID = 'f7f7ff70-21ce-4e65-a104-a5f31c7f4178';
const USER_ID = 'f8f8ff70-21ce-4e65-a104-a5f31c7f4179';
let vehicleId;
let driverToken;
let otherDriverToken;
let userToken;

function rideInput(overrides = {}) {
  return {
    vehicleId,
    originText: 'Pune, Maharashtra',
    originLat: 18.5204,
    originLng: 73.8567,
    destText: 'Mumbai, Maharashtra',
    destLat: 19.076,
    destLng: 72.8777,
    distanceKm: 148,
    departureTime: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
    totalSeats: 3,
    costPerSeat: 650,
    notes: 'Short rest stop planned.',
    ...overrides,
  };
}

async function createRide(overrides = {}) {
  return prisma.carpoolRide.create({
    data: {
      driverId: DRIVER_ID,
      vehicleId,
      originText: 'Pune, Maharashtra',
      originLat: 18.5204,
      originLng: 73.8567,
      destText: 'Mumbai, Maharashtra',
      destLat: 19.076,
      destLng: 72.8777,
      departureTime: new Date(Date.now() + 8 * 60 * 60 * 1000),
      totalSeats: 3,
      availableSeats: 3,
      costPerSeat: '650.00',
      ...overrides,
    },
  });
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash('RidePassword123!', 4);
  await Promise.all([
    prisma.user.upsert({
      where: { email: 'ride-driver@example.com' },
      update: {},
      create: { id: DRIVER_ID, name: 'Ride Driver Example', email: 'ride-driver@example.com', passwordHash, role: 'DRIVER' },
    }),
    prisma.user.upsert({
      where: { email: 'ride-other-driver@example.com' },
      update: {},
      create: { id: OTHER_DRIVER_ID, name: 'Other Ride Driver', email: 'ride-other-driver@example.com', passwordHash, role: 'DRIVER' },
    }),
    prisma.user.upsert({
      where: { email: 'ride-user@example.com' },
      update: {},
      create: { id: USER_ID, name: 'Ride Passenger', email: 'ride-user@example.com', passwordHash, role: 'USER' },
    }),
  ]);
  await Promise.all([
    prisma.driverProfile.upsert({
      where: { userId: DRIVER_ID },
      update: { backgroundCheckStatus: 'APPROVED' },
      create: { userId: DRIVER_ID, backgroundCheckStatus: 'APPROVED' },
    }),
    prisma.driverProfile.upsert({
      where: { userId: OTHER_DRIVER_ID },
      update: { backgroundCheckStatus: 'APPROVED' },
      create: { userId: OTHER_DRIVER_ID, backgroundCheckStatus: 'APPROVED' },
    }),
  ]);
  const [driverLogin, otherDriverLogin, userLogin] = await Promise.all([
    request(app).post('/api/auth/login').send({ email: 'ride-driver@example.com', password: 'RidePassword123!', role: 'DRIVER' }),
    request(app).post('/api/auth/login').send({ email: 'ride-other-driver@example.com', password: 'RidePassword123!', role: 'DRIVER' }),
    request(app).post('/api/auth/login').send({ email: 'ride-user@example.com', password: 'RidePassword123!', role: 'USER' }),
  ]);
  driverToken = driverLogin.body.data.token;
  otherDriverToken = otherDriverLogin.body.data.token;
  userToken = userLogin.body.data.token;
});

beforeEach(async () => {
  await prisma.carpoolRide.deleteMany({ where: { driverId: { in: [DRIVER_ID, OTHER_DRIVER_ID] } } });
  await prisma.vehicleDocument.deleteMany({ where: { ownerId: DRIVER_ID } });
  await prisma.vehicle.deleteMany({ where: { ownerId: { in: [DRIVER_ID, OTHER_DRIVER_ID] } } });
  const vehicle = await prisma.vehicle.create({
    data: {
      ownerId: DRIVER_ID,
      make: 'Honda',
      model: 'City',
      year: new Date().getFullYear(),
      registrationNumber: `RIDE${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      vehicleType: 'SEDAN',
      seatCapacity: 4,
      photoUrls: [],
      verificationStatus: 'VERIFIED',
      isAvailable: true,
    },
  });
  vehicleId = vehicle.id;
  await prisma.vehicleDocument.create({
    data: {
      ownerId: DRIVER_ID,
      type: 'LICENSE',
      documentNumber: `LIC-${randomUUID().slice(0, 8)}`,
      expiryDate: new Date(Date.now() + 365 * 86400000),
      fileUrl: `${DRIVER_ID}/license.pdf`,
      originalName: 'license.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      status: 'APPROVED',
    },
  });
});

afterAll(async () => {
  await prisma.carpoolRide.deleteMany({ where: { driverId: { in: [DRIVER_ID, OTHER_DRIVER_ID] } } });
  await prisma.vehicleDocument.deleteMany({ where: { ownerId: { in: [DRIVER_ID, OTHER_DRIVER_ID] } } });
  await prisma.vehicle.deleteMany({ where: { ownerId: { in: [DRIVER_ID, OTHER_DRIVER_ID] } } });
  await prisma.driverProfile.deleteMany({ where: { userId: { in: [DRIVER_ID, OTHER_DRIVER_ID] } } });
  await prisma.user.deleteMany({ where: { id: { in: [DRIVER_ID, OTHER_DRIVER_ID, USER_ID] } } });
});

it('posts rides with server-controlled seats and returns a private-data-safe detail', async () => {
  const response = await request(app)
    .post('/api/rides')
    .set('Authorization', `Bearer ${driverToken}`)
    .send(rideInput());

  expect(response.status).toBe(201);
  expect(response.body.data.totalSeats).toBe(3);
  expect(response.body.data.availableSeats).toBe(3);

  const detail = await request(app)
    .get(`/api/rides/${response.body.data.id}`)
    .set('Authorization', `Bearer ${userToken}`);
  expect(detail.status).toBe(200);
  expect(detail.body.data.driver).toEqual({ firstName: 'Ride' });
  expect(detail.body.data.vehicle).toEqual({ make: 'Honda', model: 'City', vehicleType: 'SEDAN' });
  expect(JSON.stringify(detail.body.data)).not.toContain('ride-driver@example.com');
  expect(JSON.stringify(detail.body.data)).not.toContain('phone');
});

it('requires approved driver and verified, available, owned vehicle to post', async () => {
  await prisma.vehicle.update({ where: { id: vehicleId }, data: { verificationStatus: 'UNVERIFIED' } });
  const unverified = await request(app)
    .post('/api/rides')
    .set('Authorization', `Bearer ${driverToken}`)
    .send(rideInput());
  expect(unverified.status).toBe(422);
  expect(unverified.body.error.details.code).toBe('VEHICLE_NOT_VERIFIED');

  await prisma.vehicle.update({ where: { id: vehicleId }, data: { verificationStatus: 'VERIFIED', isAvailable: false } });
  const unavailable = await request(app)
    .post('/api/rides')
    .set('Authorization', `Bearer ${driverToken}`)
    .send(rideInput());
  expect(unavailable.status).toBe(422);
  expect(unavailable.body.error.details.code).toBe('VEHICLE_UNAVAILABLE');

  await prisma.vehicle.update({ where: { id: vehicleId }, data: { isAvailable: true } });
  await prisma.driverProfile.update({ where: { userId: DRIVER_ID }, data: { backgroundCheckStatus: 'PENDING' } });
  const unapproved = await request(app)
    .post('/api/rides')
    .set('Authorization', `Bearer ${driverToken}`)
    .send(rideInput());
  expect(unapproved.status).toBe(422);
  expect(unapproved.body.error.details.code).toBe('DRIVER_NOT_APPROVED');
  await prisma.driverProfile.update({ where: { userId: DRIVER_ID }, data: { backgroundCheckStatus: 'APPROVED' } });
});

it('masks other drivers vehicles before checking their verification state', async () => {
  const otherVehicle = await prisma.vehicle.create({
    data: {
      ownerId: OTHER_DRIVER_ID,
      make: 'Toyota',
      model: 'Corolla',
      year: new Date().getFullYear(),
      registrationNumber: `OTHER${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      vehicleType: 'SEDAN',
      seatCapacity: 4,
      photoUrls: [],
      verificationStatus: 'UNVERIFIED',
      isAvailable: true,
    },
  });
  const response = await request(app)
    .post('/api/rides')
    .set('Authorization', `Bearer ${driverToken}`)
    .send(rideInput({ vehicleId: otherVehicle.id }));
  expect(response.status).toBe(404);
  await prisma.vehicle.delete({ where: { id: otherVehicle.id } });
});

it('rejects invalid departures, excess seats, client-controlled seat counts, and nearby rides', async () => {
  const tooSoon = await request(app)
    .post('/api/rides')
    .set('Authorization', `Bearer ${driverToken}`)
    .send(rideInput({ departureTime: new Date(Date.now() + 10 * 60 * 1000).toISOString() }));
  expect(tooSoon.status).toBe(422);
  expect(tooSoon.body.error.details.code).toBe('DEPARTURE_TOO_SOON');

  const excessSeats = await request(app)
    .post('/api/rides')
    .set('Authorization', `Bearer ${driverToken}`)
    .send(rideInput({ totalSeats: 5 }));
  expect(excessSeats.status).toBe(422);
  expect(excessSeats.body.error.details.code).toBe('SEAT_CAPACITY_EXCEEDED');

  const massAssignment = await request(app)
    .post('/api/rides')
    .set('Authorization', `Bearer ${driverToken}`)
    .send(rideInput({ availableSeats: 0 }));
  expect(massAssignment.status).toBe(400);

  const departureTime = new Date(Date.now() + 5 * 60 * 60 * 1000);
  await createRide({ departureTime });
  const overlapping = await request(app)
    .post('/api/rides')
    .set('Authorization', `Bearer ${driverToken}`)
    .send(rideInput({ departureTime: new Date(departureTime.getTime() + 2 * 60 * 60 * 1000).toISOString() }));
  expect(overlapping.status).toBe(409);
  expect(overlapping.body.error.details.code).toBe('VEHICLE_RIDE_GAP');
});

it('limits own rides to the authenticated driver and paginates them', async () => {
  const first = await createRide();
  const second = await createRide({
    departureTime: new Date(Date.now() + 12 * 60 * 60 * 1000),
    status: 'CANCELLED',
  });

  const response = await request(app)
    .get('/api/rides/mine?page=1&limit=1&status=OPEN')
    .set('Authorization', `Bearer ${driverToken}`);
  expect(response.status).toBe(200);
  expect(response.body.data).toHaveLength(1);
  expect(response.body.data[0].id).toBe(first.id);
  expect(response.body.meta).toEqual({ page: 1, limit: 1, total: 1 });
  expect(response.body.data.some((ride) => ride.id === second.id)).toBe(false);

  const passengerAccess = await request(app)
    .get('/api/rides/mine')
    .set('Authorization', `Bearer ${userToken}`);
  expect(passengerAccess.status).toBe(403);
});

it('allows only the ride owner to cancel open/full rides and emits ride.cancelled', async () => {
  const ride = await createRide();
  const otherDriverResponse = await request(app)
    .patch(`/api/rides/${ride.id}/cancel`)
    .set('Authorization', `Bearer ${otherDriverToken}`);
  expect(otherDriverResponse.status).toBe(404);

  let eventPayload;
  const unsubscribe = on('ride.cancelled', (payload) => { eventPayload = payload; });
  const cancelled = await request(app)
    .patch(`/api/rides/${ride.id}/cancel`)
    .set('Authorization', `Bearer ${driverToken}`);
  unsubscribe();

  expect(cancelled.status).toBe(200);
  expect(cancelled.body.data.status).toBe('CANCELLED');
  expect(eventPayload).toMatchObject({ rideId: ride.id, driverId: DRIVER_ID });
});

it('registers active future rides as vehicle commitments', async () => {
  expect(await hasVehicleCommitments(vehicleId)).toBe(false);
  const ride = await createRide();
  expect(await hasVehicleCommitments(vehicleId)).toBe(true);
  await prisma.carpoolRide.update({ where: { id: ride.id }, data: { status: 'CANCELLED' } });
  expect(await hasVehicleCommitments(vehicleId)).toBe(false);
});

it('searches open future rides by text, date/time, seats, price, radius, sort, and pagination', async () => {
  const baseDeparture = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const cheaper = await createRide({
    originText: 'Pune Central',
    destText: 'Mumbai South',
    departureTime: baseDeparture,
    availableSeats: 2,
    costPerSeat: '400.00',
    destLat: 19.08,
    destLng: 72.88,
  });
  const later = await createRide({
    originText: 'Pune East',
    destText: 'Mumbai North',
    departureTime: new Date(baseDeparture.getTime() + 60 * 60 * 1000),
    availableSeats: 4,
    costPerSeat: '900.00',
    destLat: 19.14,
    destLng: 72.94,
  });
  await createRide({
    originText: 'Pune Central',
    destText: 'Mumbai South',
    departureTime: new Date(baseDeparture.getTime() + 2 * 60 * 60 * 1000),
    availableSeats: 4,
    costPerSeat: '100.00',
    status: 'CANCELLED',
  });

  const indiaFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = indiaFormatter.formatToParts(baseDeparture);
  const getPart = (t) => parts.find((p) => p.type === t).value;
  const date = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  const time = `${getPart('hour')}:${getPart('minute')}`;
  const text = await request(app)
    .get('/api/rides')
    .query({ origin: 'Pune Central', destination: 'Mumbai South', date, timeFrom: time, seats: 2, maxPrice: 500 })
    .set('Authorization', `Bearer ${userToken}`);
  expect(text.status).toBe(200);
  expect(text.body.data.map((ride) => ride.id)).toEqual([cheaper.id]);
  expect(text.body.meta.total).toBe(1);

  const price = await request(app)
    .get('/api/rides')
    .query({ destination: 'Mumbai', date, timeFrom: time, sort: 'price', limit: 1 })
    .set('Authorization', `Bearer ${userToken}`);
  expect(price.status).toBe(200);
  expect(price.body.data[0].id).toBe(cheaper.id);

  const radius = await request(app)
    .get('/api/rides')
    .query({ lat: 19.08, lng: 72.88, radiusKm: 2, date })
    .set('Authorization', `Bearer ${userToken}`);
  expect(radius.status).toBe(200);
  expect(radius.body.data.map((ride) => ride.id)).toContain(cheaper.id);
  expect(radius.body.data.map((ride) => ride.id)).not.toContain(later.id);
});

it('escapes search wildcards, enforces future/open/seat filters, and validates query combinations', async () => {
  const literalWildcard = await createRide({
    originText: 'Pune% Junction',
    departureTime: new Date(Date.now() + 5 * 60 * 60 * 1000),
    availableSeats: 1,
  });
  await createRide({
    originText: 'Pune Central',
    departureTime: new Date(Date.now() + 7 * 60 * 60 * 1000),
    availableSeats: 1,
  });

  const literal = await request(app)
    .get('/api/rides')
    .query({ origin: 'Pune%', seats: 2 })
    .set('Authorization', `Bearer ${userToken}`);
  expect(literal.status).toBe(200);
  expect(literal.body.data).toHaveLength(0);

  const wildcard = await request(app)
    .get('/api/rides')
    .query({ origin: 'Pune%', seats: 1 })
    .set('Authorization', `Bearer ${userToken}`);
  expect(wildcard.status).toBe(200);
  expect(wildcard.body.data.map((ride) => ride.id)).toEqual([literalWildcard.id]);

  const invalidCoordinates = await request(app)
    .get('/api/rides')
    .query({ lat: 19.08 })
    .set('Authorization', `Bearer ${userToken}`);
  expect(invalidCoordinates.status).toBe(400);

  const invalidTimes = await request(app)
    .get('/api/rides')
    .query({ timeFrom: '18:00', timeTo: '17:00' })
    .set('Authorization', `Bearer ${userToken}`);
  expect(invalidTimes.status).toBe(400);
});
