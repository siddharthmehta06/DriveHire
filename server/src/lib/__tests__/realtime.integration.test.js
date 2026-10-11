const { createServer } = require('http');
const jwt = require('jsonwebtoken');
const { io: createSocketClient } = require('socket.io-client');
const prisma = require('../prisma');
const app = require('../../app');
const {
  closeRealtime,
  emitToRide,
  emitToUser,
  initializeRealtime,
} = require('../realtime');

const DRIVER_ID = 'f9f9ff70-21ce-4e65-a104-a5f31c7f4180';
const PASSENGER_ID = 'fafaff70-21ce-4e65-a104-a5f31c7f4181';
const OTHER_ID = 'fbfbff70-21ce-4e65-a104-a5f31c7f4182';
const RIDE_ID = 'fcfcff70-21ce-4e65-a104-a5f31c7f4183';

let server;
let serverUrl;

function tokenFor(userId, role) {
  return jwt.sign({ sub: userId, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function connect(token) {
  return createSocketClient(serverUrl, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
}

function waitFor(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 2000);
    function onEvent(payload) {
      clearTimeout(timer);
      resolve(payload);
    }
    socket.once(event, onEvent);
  });
}

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: DRIVER_ID, name: 'Realtime Driver', email: 'realtime-driver@example.com', passwordHash: 'not-used', role: 'DRIVER' },
      { id: PASSENGER_ID, name: 'Realtime Passenger', email: 'realtime-passenger@example.com', passwordHash: 'not-used', role: 'USER' },
      { id: OTHER_ID, name: 'Other Realtime User', email: 'realtime-other@example.com', passwordHash: 'not-used', role: 'USER' },
    ],
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      ownerId: DRIVER_ID,
      make: 'Realtime',
      model: 'Test',
      year: new Date().getFullYear(),
      registrationNumber: 'REALTIME-TEST-VEHICLE',
      vehicleType: 'SEDAN',
      seatCapacity: 4,
      photoUrls: [],
      verificationStatus: 'VERIFIED',
      isAvailable: true,
    },
  });
  await prisma.carpoolRide.create({
    data: {
      id: RIDE_ID,
      driverId: DRIVER_ID,
      vehicleId: vehicle.id,
      originText: 'Pune',
      originLat: 18.5204,
      originLng: 73.8567,
      destText: 'Mumbai',
      destLat: 19.076,
      destLng: 72.8777,
      departureTime: new Date(Date.now() + 8 * 60 * 60 * 1000),
      totalSeats: 3,
      availableSeats: 3,
      costPerSeat: '500.00',
    },
  });
  server = createServer(app);
  initializeRealtime(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await closeRealtime();
  await prisma.carpoolRide.deleteMany({ where: { id: RIDE_ID } });
  await prisma.vehicle.deleteMany({ where: { registrationNumber: 'REALTIME-TEST-VEHICLE' } });
  await prisma.user.deleteMany({ where: { id: { in: [DRIVER_ID, PASSENGER_ID, OTHER_ID] } } });
});

it('rejects socket connections without a valid JWT', async () => {
  const socket = connect('invalid-token');
  const error = await new Promise((resolve) => socket.once('connect_error', resolve));
  expect(error.message).toMatch(/Invalid session/);
  socket.close();
});

it('authenticates users, authorizes ride rooms, and publishes ride updates', async () => {
  const socket = connect(tokenFor(PASSENGER_ID, 'USER'));
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });

  const joined = await new Promise((resolve) => {
    socket.timeout(1000).emit('join:ride', RIDE_ID, (error, response) => resolve({ error, response }));
  });
  expect(joined.error).toBeNull();
  expect(joined.response).toEqual({ success: true, data: { rideId: RIDE_ID } });

  const update = waitFor(socket, 'ride:seats-updated');
  const payload = { rideId: RIDE_ID, availableSeats: 2, status: 'OPEN' };
  expect(emitToRide(RIDE_ID, 'ride:seats-updated', payload)).toBe(true);
  await expect(update).resolves.toEqual(payload);

  const userUpdate = waitFor(socket, 'notification:new');
  expect(emitToUser(PASSENGER_ID, 'notification:new', { id: 'notice-1' })).toBe(true);
  await expect(userUpdate).resolves.toEqual({ id: 'notice-1' });
  socket.close();
});

it('does not allow sockets to join arbitrary user rooms or cancelled ride rooms', async () => {
  const socket = connect(tokenFor(PASSENGER_ID, 'USER'));
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });

  socket.emit('join:user', OTHER_ID);
  const privateEvent = waitFor(socket, 'private:user:event').catch(() => null);
  emitToUser(OTHER_ID, 'private:user:event', { secret: true });
  await expect(privateEvent).resolves.toBeNull();

  await prisma.carpoolRide.update({ where: { id: RIDE_ID }, data: { status: 'CANCELLED' } });
  const denied = await new Promise((resolve) => {
    socket.timeout(1000).emit('join:ride', RIDE_ID, (error, response) => resolve({ error, response }));
  });
  expect(denied.error).toBeNull();
  expect(denied.response).toEqual({ success: false, error: 'Ride not found.' });
  socket.close();
});
