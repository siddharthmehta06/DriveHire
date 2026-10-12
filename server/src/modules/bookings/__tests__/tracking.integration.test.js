const { createServer } = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { io: createSocketClient } = require('socket.io-client');
const prisma = require('../../../lib/prisma');
const app = require('../../../app');
const { initializeRealtime, closeRealtime } = require('../../../lib/realtime');

const JWT_SECRET = process.env.JWT_SECRET || 'test-only';

const DRIVER_ID = 'e1e1ff70-21ce-4e65-a104-a5f31c7f4151';
const ACCEPTED_PASSENGER_ID = 'e2e2ff70-21ce-4e65-a104-a5f31c7f4152';
const PENDING_PASSENGER_ID = 'e3e3ff70-21ce-4e65-a104-a5f31c7f4153';
const UNAUTHORIZED_USER_ID = 'e4e4ff70-21ce-4e65-a104-a5f31c7f4154';

let driverToken;
let acceptedPassengerToken;
let pendingPassengerToken;
let unauthorizedUserToken;

let vehicleId;
let rideId;
let acceptedBookingId;
let pendingBookingId;

let server;
let serverUrl;

function makeToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function connectSocket(token) {
  return createSocketClient(serverUrl, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
}

function waitForEvent(socket, event, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    function onEvent(payload) {
      clearTimeout(timer);
      resolve(payload);
    }
    socket.once(event, onEvent);
  });
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash('Secret123!', 4);

  const [driver, acceptedPassenger, pendingPassenger, unauthorizedUser] = await Promise.all([
    prisma.user.upsert({
      where: { id: DRIVER_ID },
      update: {},
      create: {
        id: DRIVER_ID,
        name: 'Tracking Driver',
        email: 'tracking-driver@example.com',
        passwordHash,
        role: 'DRIVER',
      },
    }),
    prisma.user.upsert({
      where: { id: ACCEPTED_PASSENGER_ID },
      update: {},
      create: {
        id: ACCEPTED_PASSENGER_ID,
        name: 'Accepted Passenger',
        email: 'accepted-passenger@example.com',
        passwordHash,
        role: 'USER',
      },
    }),
    prisma.user.upsert({
      where: { id: PENDING_PASSENGER_ID },
      update: {},
      create: {
        id: PENDING_PASSENGER_ID,
        name: 'Pending Passenger',
        email: 'pending-passenger@example.com',
        passwordHash,
        role: 'USER',
      },
    }),
    prisma.user.upsert({
      where: { id: UNAUTHORIZED_USER_ID },
      update: {},
      create: {
        id: UNAUTHORIZED_USER_ID,
        name: 'Unauthorized User',
        email: 'unauth-user@example.com',
        passwordHash,
        role: 'USER',
      },
    }),
  ]);

  driverToken = makeToken(driver);
  acceptedPassengerToken = makeToken(acceptedPassenger);
  pendingPassengerToken = makeToken(pendingPassenger);
  unauthorizedUserToken = makeToken(unauthorizedUser);

  const vehicle = await prisma.vehicle.create({
    data: {
      ownerId: DRIVER_ID,
      make: 'Tata',
      model: 'Nexon',
      year: 2024,
      registrationNumber: `MH12TK${Math.floor(1000 + Math.random() * 9000)}`,
      vehicleType: 'SUV',
      seatCapacity: 4,
      photoUrls: [],
      verificationStatus: 'VERIFIED',
      isAvailable: true,
    },
  });
  vehicleId = vehicle.id;

  const ride = await prisma.carpoolRide.create({
    data: {
      driverId: DRIVER_ID,
      vehicleId,
      originText: 'Pune Station',
      originLat: 18.5284,
      originLng: 73.8743,
      destText: 'Mumbai Airport',
      destLat: 19.0902,
      destLng: 72.8628,
      departureTime: new Date(Date.now() + 6 * 60 * 60 * 1000),
      totalSeats: 3,
      availableSeats: 2,
      costPerSeat: '600.00',
      status: 'OPEN',
    },
  });
  rideId = ride.id;

  const acceptedBooking = await prisma.booking.create({
    data: {
      userId: ACCEPTED_PASSENGER_ID,
      type: 'RIDE',
      status: 'ACCEPTED',
      rideBooking: {
        create: {
          rideId,
          passengerId: ACCEPTED_PASSENGER_ID,
          seatsBooked: 1,
          active: true,
        },
      },
    },
  });
  acceptedBookingId = acceptedBooking.id;

  const pendingBooking = await prisma.booking.create({
    data: {
      userId: PENDING_PASSENGER_ID,
      type: 'RIDE',
      status: 'PENDING',
      rideBooking: {
        create: {
          rideId,
          passengerId: PENDING_PASSENGER_ID,
          seatsBooked: 1,
          active: true,
        },
      },
    },
  });
  pendingBookingId = pendingBooking.id;

  server = createServer(app);
  initializeRealtime(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await closeRealtime();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await prisma.rideLocation.deleteMany({ where: { rideId } });
  await prisma.rideBooking.deleteMany({
    where: { bookingId: { in: [acceptedBookingId, pendingBookingId].filter(Boolean) } },
  });
  await prisma.booking.deleteMany({
    where: { id: { in: [acceptedBookingId, pendingBookingId].filter(Boolean) } },
  });
  if (rideId) {
    await prisma.carpoolRide.deleteMany({ where: { id: rideId } });
  }
  if (vehicleId) {
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  }
  await prisma.user.deleteMany({
    where: {
      id: { in: [DRIVER_ID, ACCEPTED_PASSENGER_ID, PENDING_PASSENGER_ID, UNAUTHORIZED_USER_ID] },
    },
  });
});

describe('Phase 4: Live tracking endpoints and room authorization', () => {
  it('returns 404 when querying location before any driver update', async () => {
    const res = await request(app)
      .get(`/api/rides/${rideId}/location`)
      .set('Authorization', `Bearer ${driverToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.details.code).toBe('LOCATION_NOT_FOUND');
  });

  it('rejects invalid coordinates on POST /api/rides/:id/location', async () => {
    const res = await request(app)
      .post(`/api/rides/${rideId}/location`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 95.5, lng: 73.85 });

    expect(res.status).toBe(400);
  });

  it('rejects non-driver users from updating location', async () => {
    const res = await request(app)
      .post(`/api/rides/${rideId}/location`)
      .set('Authorization', `Bearer ${acceptedPassengerToken}`)
      .send({ lat: 18.5204, lng: 73.8567 });

    // requireRole('DRIVER') fails with 403 FORBIDDEN for USER role
    expect(res.status).toBe(403);
  });

  it('allows driver to update and upsert location', async () => {
    const postRes1 = await request(app)
      .post(`/api/rides/${rideId}/location`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 18.52043, lng: 73.85674 });

    expect(postRes1.status).toBe(200);
    expect(postRes1.body.success).toBe(true);
    expect(postRes1.body.data.rideId).toBe(rideId);
    expect(postRes1.body.data.lat).toBeCloseTo(18.52043, 4);
    expect(postRes1.body.data.lng).toBeCloseTo(73.85674, 4);
    expect(postRes1.body.data.updatedAt).toBeDefined();

    // Upsert subsequent coordinate
    const postRes2 = await request(app)
      .post(`/api/rides/${rideId}/location`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 18.53001, lng: 73.86002 });

    expect(postRes2.status).toBe(200);
    expect(postRes2.body.data.lat).toBeCloseTo(18.53001, 4);
  });

  it('allows driver and accepted passenger to query latest location', async () => {
    const driverRes = await request(app)
      .get(`/api/rides/${rideId}/location`)
      .set('Authorization', `Bearer ${driverToken}`);

    expect(driverRes.status).toBe(200);
    expect(driverRes.body.data.rideId).toBe(rideId);
    expect(driverRes.body.data.lat).toBeCloseTo(18.53001, 4);

    const passengerRes = await request(app)
      .get(`/api/rides/${rideId}/location`)
      .set('Authorization', `Bearer ${acceptedPassengerToken}`);

    expect(passengerRes.status).toBe(200);
    expect(passengerRes.body.data.rideId).toBe(rideId);
    expect(passengerRes.body.data.lat).toBeCloseTo(18.53001, 4);
  });

  it('hides ride location from pending passengers and unauthorized users (404)', async () => {
    const pendingRes = await request(app)
      .get(`/api/rides/${rideId}/location`)
      .set('Authorization', `Bearer ${pendingPassengerToken}`);

    expect(pendingRes.status).toBe(404);

    const unauthRes = await request(app)
      .get(`/api/rides/${rideId}/location`)
      .set('Authorization', `Bearer ${unauthorizedUserToken}`);

    expect(unauthRes.status).toBe(404);
  });

  it('authorizes socket room join only for driver and accepted/active passenger', async () => {
    const driverSocket = connectSocket(driverToken);
    const acceptedSocket = connectSocket(acceptedPassengerToken);
    const pendingSocket = connectSocket(pendingPassengerToken);
    const unauthSocket = connectSocket(unauthorizedUserToken);

    await Promise.all([
      new Promise((resolve) => driverSocket.once('connect', resolve)),
      new Promise((resolve) => acceptedSocket.once('connect', resolve)),
      new Promise((resolve) => pendingSocket.once('connect', resolve)),
      new Promise((resolve) => unauthSocket.once('connect', resolve)),
    ]);

    // Driver join
    const driverJoin = await new Promise((resolve) => {
      driverSocket.timeout(1500).emit('join:ride', rideId, (error, response) => resolve({ error, response }));
    });
    expect(driverJoin.error).toBeNull();
    expect(driverJoin.response).toEqual({ success: true, data: { rideId } });

    // Accepted passenger join
    const acceptedJoin = await new Promise((resolve) => {
      acceptedSocket.timeout(1500).emit('join:ride', rideId, (error, response) => resolve({ error, response }));
    });
    expect(acceptedJoin.error).toBeNull();
    expect(acceptedJoin.response).toEqual({ success: true, data: { rideId } });

    // Pending passenger join - rejected
    const pendingJoin = await new Promise((resolve) => {
      pendingSocket.timeout(1500).emit('join:ride', rideId, (error, response) => resolve({ error, response }));
    });
    expect(pendingJoin.error).toBeNull();
    expect(pendingJoin.response).toEqual({ success: false, error: 'Unauthorized.' });

    // Unauthorized user join - rejected
    const unauthJoin = await new Promise((resolve) => {
      unauthSocket.timeout(1500).emit('join:ride', rideId, (error, response) => resolve({ error, response }));
    });
    expect(unauthJoin.error).toBeNull();
    expect(unauthJoin.response).toEqual({ success: false, error: 'Unauthorized.' });

    // Now test that driver location update emits ride:location to joined accepted passenger
    const locationPromise = waitForEvent(acceptedSocket, 'ride:location');
    const unauthLocationPromise = waitForEvent(unauthSocket, 'ride:location', 1000).catch(() => null);

    const updateRes = await request(app)
      .post(`/api/rides/${rideId}/location`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 18.54567, lng: 73.87654 });

    expect(updateRes.status).toBe(200);

    const receivedEvent = await locationPromise;
    expect(receivedEvent.rideId).toBe(rideId);
    expect(receivedEvent.lat).toBeCloseTo(18.54567, 4);
    expect(receivedEvent.lng).toBeCloseTo(73.87654, 4);

    // Verify unauth socket never received the event
    await expect(unauthLocationPromise).resolves.toBeNull();

    driverSocket.close();
    acceptedSocket.close();
    pendingSocket.close();
    unauthSocket.close();
  });
});
