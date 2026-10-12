const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const prisma = require('../../../lib/prisma');
const app = require('../../../app');
const { on } = require('../../../lib/events');

const JWT_SECRET = process.env.JWT_SECRET || 'test-only';

const DRIVER_ID = 'd1d1ff70-21ce-4e65-a104-a5f31c7f4121';
const OTHER_DRIVER_ID = 'd2d2ff70-21ce-4e65-a104-a5f31c7f4122';
const PASSENGER_ID = 'd3d3ff70-21ce-4e65-a104-a5f31c7f4123';

let driverToken;
let otherDriverToken;
let passengerToken;
let vehicleId;
let rideId;

function makeToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash('Secret123!', 4);

  const [driver, otherDriver, passenger] = await Promise.all([
    prisma.user.upsert({
      where: { id: DRIVER_ID },
      update: {},
      create: {
        id: DRIVER_ID,
        name: 'Lifecycle Driver',
        email: 'lifecycle-driver@example.com',
        passwordHash,
        role: 'DRIVER',
      },
    }),
    prisma.user.upsert({
      where: { id: OTHER_DRIVER_ID },
      update: {},
      create: {
        id: OTHER_DRIVER_ID,
        name: 'Other Lifecycle Driver',
        email: 'other-lifecycle-driver@example.com',
        passwordHash,
        role: 'DRIVER',
      },
    }),
    prisma.user.upsert({
      where: { id: PASSENGER_ID },
      update: {},
      create: {
        id: PASSENGER_ID,
        name: 'Lifecycle Passenger',
        email: 'lifecycle-passenger@example.com',
        passwordHash,
        role: 'USER',
      },
    }),
  ]);

  driverToken = makeToken(driver);
  otherDriverToken = makeToken(otherDriver);
  passengerToken = makeToken(passenger);

  const vehicle = await prisma.vehicle.create({
    data: {
      ownerId: DRIVER_ID,
      make: 'Hyundai',
      model: 'Creta',
      year: 2023,
      registrationNumber: `MH12LC${randomUUID().slice(0, 4).toUpperCase()}`,
      vehicleType: 'SUV',
      seatCapacity: 4,
      verificationStatus: 'VERIFIED',
      isAvailable: true,
      photoUrls: ['https://example.com/creta.jpg'],
    },
  });
  vehicleId = vehicle.id;

  const ride = await prisma.carpoolRide.create({
    data: {
      driverId: DRIVER_ID,
      vehicleId,
      originText: 'Pune',
      originLat: 18.5204,
      originLng: 73.8567,
      destText: 'Thane',
      destLat: 19.2183,
      destLng: 72.9781,
      departureTime: new Date(Date.now() + 10 * 60 * 60 * 1000),
      totalSeats: 3,
      availableSeats: 3,
      costPerSeat: '550.00',
      status: 'OPEN',
    },
  });
  rideId = ride.id;
});

afterAll(async () => {
  await prisma.rideLocation.deleteMany({ where: { rideId } });
  await prisma.rideBooking.deleteMany({ where: { rideId } });
  await prisma.booking.deleteMany({ where: { userId: PASSENGER_ID } });
  await prisma.carpoolRide.deleteMany({ where: { id: rideId } });
  if (vehicleId) await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.user.deleteMany({ where: { id: { in: [DRIVER_ID, OTHER_DRIVER_ID, PASSENGER_ID] } } });
});

describe('F05 Phase 3: Ride Lifecycle and Booking Lists', () => {
  it('starts ride, transitions ACCEPTED bookings to ACTIVE, and completes ride emitting booking.completed', async () => {
    // 1. Passenger requests booking
    const bookRes = await request(app)
      .post(`/api/rides/${rideId}/bookings`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ seatsBooked: 1 });
    expect(bookRes.status).toBe(201);
    const bookingId = bookRes.body.data.id;

    // 2. Driver accepts booking
    await request(app)
      .post(`/api/bookings/${bookingId}/accept`)
      .set('Authorization', `Bearer ${driverToken}`);

    // Check ride list for driver
    const listRes = await request(app)
      .get(`/api/rides/${rideId}/bookings`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
    expect(listRes.body.data[0].id).toBe(bookingId);

    // Other driver gets 404
    const otherRes = await request(app)
      .get(`/api/rides/${rideId}/bookings`)
      .set('Authorization', `Bearer ${otherDriverToken}`);
    expect(otherRes.status).toBe(404);

    // 3. Driver starts ride -> ride becomes IN_PROGRESS, booking becomes ACTIVE
    const startRes = await request(app)
      .post(`/api/rides/${rideId}/start`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(startRes.status).toBe(200);
    expect(startRes.body.data.status).toBe('IN_PROGRESS');

    const activeBooking = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(activeBooking.status).toBe('ACTIVE');

    // Attempting to start already IN_PROGRESS ride returns 409
    const restartRes = await request(app)
      .post(`/api/rides/${rideId}/start`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(restartRes.status).toBe(409);

    // 4. Set up listener for booking.completed event
    let completedEventFired = false;
    let completedEventPayload = null;
    on('booking.completed', (payload) => {
      completedEventFired = true;
      completedEventPayload = payload;
    });

    // 5. Driver completes ride -> ride becomes COMPLETED, booking becomes COMPLETED
    const completeRes = await request(app)
      .post(`/api/rides/${rideId}/complete`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.status).toBe('COMPLETED');

    const completedBooking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { rideBooking: true },
    });
    expect(completedBooking.status).toBe('COMPLETED');
    expect(completedBooking.rideBooking.active).toBe(false);

    expect(completedEventFired).toBe(true);
    expect(completedEventPayload.bookingId).toBe(bookingId);

    // Clean up
    await prisma.rideBooking.deleteMany({ where: { bookingId } });
    await prisma.booking.delete({ where: { id: bookingId } });
  });

  it('correctly classifies bookings into upcoming, active, and past buckets', async () => {
    const futureDeparture = new Date(Date.now() + 48 * 60 * 60 * 1000); // in 2 days
    const pastDeparture = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago

    const futureRide1 = await prisma.carpoolRide.create({
      data: {
        driverId: DRIVER_ID,
        vehicleId,
        originText: 'Pune',
        originLat: 18.5204,
        originLng: 73.8567,
        destText: 'Mumbai',
        destLat: 19.076,
        destLng: 72.8777,
        departureTime: futureDeparture,
        totalSeats: 4,
        availableSeats: 4,
        costPerSeat: '500.00',
        status: 'OPEN',
      },
    });

    const futureRide2 = await prisma.carpoolRide.create({
      data: {
        driverId: DRIVER_ID,
        vehicleId,
        originText: 'Pune',
        originLat: 18.5204,
        originLng: 73.8567,
        destText: 'Nashik',
        destLat: 19.9975,
        destLng: 73.7898,
        departureTime: futureDeparture,
        totalSeats: 4,
        availableSeats: 4,
        costPerSeat: '500.00',
        status: 'OPEN',
      },
    });

    const futureRide3 = await prisma.carpoolRide.create({
      data: {
        driverId: DRIVER_ID,
        vehicleId,
        originText: 'Pune',
        originLat: 18.5204,
        originLng: 73.8567,
        destText: 'Goa',
        destLat: 15.2993,
        destLng: 74.124,
        departureTime: futureDeparture,
        totalSeats: 4,
        availableSeats: 4,
        costPerSeat: '500.00',
        status: 'OPEN',
      },
    });

    const pastRide = await prisma.carpoolRide.create({
      data: {
        driverId: DRIVER_ID,
        vehicleId,
        originText: 'Mumbai',
        originLat: 19.076,
        originLng: 72.8777,
        destText: 'Pune',
        destLat: 18.5204,
        destLng: 73.8567,
        departureTime: pastDeparture,
        totalSeats: 4,
        availableSeats: 4,
        costPerSeat: '500.00',
        status: 'OPEN',
      },
    });

    // Create bookings across different statuses:
    // 1. Upcoming: PENDING with future departure
    const bPendingFuture = await prisma.booking.create({
      data: {
        userId: PASSENGER_ID,
        type: 'RIDE',
        status: 'PENDING',
        rideBooking: { create: { rideId: futureRide1.id, passengerId: PASSENGER_ID, seatsBooked: 1, active: true } },
      },
    });

    // 2. Upcoming: ACCEPTED with future departure
    const bAcceptedFuture = await prisma.booking.create({
      data: {
        userId: PASSENGER_ID,
        type: 'RIDE',
        status: 'ACCEPTED',
        rideBooking: { create: { rideId: futureRide2.id, passengerId: PASSENGER_ID, seatsBooked: 1, active: true } },
      },
    });

    // 3. Active: ACTIVE
    const bActive = await prisma.booking.create({
      data: {
        userId: PASSENGER_ID,
        type: 'RIDE',
        status: 'ACTIVE',
        rideBooking: { create: { rideId: futureRide3.id, passengerId: PASSENGER_ID, seatsBooked: 1, active: true } },
      },
    });

    // 4. Past: COMPLETED
    const bCompleted = await prisma.booking.create({
      data: {
        userId: PASSENGER_ID,
        type: 'RIDE',
        status: 'COMPLETED',
        rideBooking: { create: { rideId: pastRide.id, passengerId: PASSENGER_ID, seatsBooked: 1, active: false } },
      },
    });

    // 5. Past: CANCELLED
    const bCancelled = await prisma.booking.create({
      data: {
        userId: PASSENGER_ID,
        type: 'RIDE',
        status: 'CANCELLED',
        rideBooking: { create: { rideId: futureRide1.id, passengerId: PASSENGER_ID, seatsBooked: 1, active: false } },
      },
    });

    // 6. Past: REJECTED
    const bRejected = await prisma.booking.create({
      data: {
        userId: PASSENGER_ID,
        type: 'RIDE',
        status: 'REJECTED',
        rideBooking: { create: { rideId: futureRide1.id, passengerId: PASSENGER_ID, seatsBooked: 1, active: false } },
      },
    });

    // 7. Past: PENDING with past departure (departure passed without activity)
    const bPendingPast = await prisma.booking.create({
      data: {
        userId: PASSENGER_ID,
        type: 'RIDE',
        status: 'PENDING',
        rideBooking: { create: { rideId: pastRide.id, passengerId: PASSENGER_ID, seatsBooked: 1, active: true } },
      },
    });

    // Test bucket=upcoming
    const upcomingRes = await request(app)
      .get('/api/bookings/mine?bucket=upcoming')
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(upcomingRes.status).toBe(200);
    const upcomingIds = upcomingRes.body.data.map((b) => b.id);
    expect(upcomingIds).toContain(bPendingFuture.id);
    expect(upcomingIds).toContain(bAcceptedFuture.id);
    expect(upcomingIds).not.toContain(bActive.id);
    expect(upcomingIds).not.toContain(bCompleted.id);
    expect(upcomingIds).not.toContain(bCancelled.id);
    expect(upcomingIds).not.toContain(bRejected.id);
    expect(upcomingIds).not.toContain(bPendingPast.id);

    // Test bucket=active
    const activeRes = await request(app)
      .get('/api/bookings/mine?bucket=active')
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(activeRes.status).toBe(200);
    const activeIds = activeRes.body.data.map((b) => b.id);
    expect(activeIds).toEqual([bActive.id]);

    // Test bucket=past
    const pastRes = await request(app)
      .get('/api/bookings/mine?bucket=past')
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(pastRes.status).toBe(200);
    const pastIds = pastRes.body.data.map((b) => b.id);
    expect(pastIds).toContain(bCompleted.id);
    expect(pastIds).toContain(bCancelled.id);
    expect(pastIds).toContain(bRejected.id);
    expect(pastIds).toContain(bPendingPast.id);
    expect(pastIds).not.toContain(bPendingFuture.id);
    expect(pastIds).not.toContain(bAcceptedFuture.id);
    expect(pastIds).not.toContain(bActive.id);

    // Clean up
    const allCreated = [
      bPendingFuture.id,
      bAcceptedFuture.id,
      bActive.id,
      bCompleted.id,
      bCancelled.id,
      bRejected.id,
      bPendingPast.id,
    ];
    await prisma.rideBooking.deleteMany({ where: { bookingId: { in: allCreated } } });
    await prisma.booking.deleteMany({ where: { id: { in: allCreated } } });
    await prisma.carpoolRide.deleteMany({ where: { id: { in: [futureRide1.id, futureRide2.id, futureRide3.id, pastRide.id] } } });
  });

  it('lists driver requests across rides with filtering and pagination', async () => {
    const reqRide = await prisma.carpoolRide.create({
      data: {
        driverId: DRIVER_ID,
        vehicleId,
        originText: 'Pune',
        originLat: 18.5204,
        originLng: 73.8567,
        destText: 'Goa',
        destLat: 15.2993,
        destLng: 74.124,
        departureTime: new Date(Date.now() + 36 * 60 * 60 * 1000),
        totalSeats: 3,
        availableSeats: 3,
        costPerSeat: '1200.00',
        status: 'OPEN',
      },
    });

    const b = await request(app)
      .post(`/api/rides/${reqRide.id}/bookings`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ seatsBooked: 2, pickupNote: 'Carrying one backpack' });
    expect(b.status).toBe(201);

    const driverRequestsRes = await request(app)
      .get('/api/driver/requests?status=PENDING&page=1&limit=10')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(driverRequestsRes.status).toBe(200);
    expect(driverRequestsRes.body.data.length).toBeGreaterThanOrEqual(1);
    const found = driverRequestsRes.body.data.find((item) => item.id === b.body.data.id);
    expect(found).toBeDefined();
    expect(found.rideBooking.seatsBooked).toBe(2);
    expect(found.user.name).toBe('Lifecycle Passenger');

    // Other driver gets empty list
    const otherDriverRequestsRes = await request(app)
      .get('/api/driver/requests?status=PENDING')
      .set('Authorization', `Bearer ${otherDriverToken}`);
    expect(otherDriverRequestsRes.status).toBe(200);
    const foundOther = otherDriverRequestsRes.body.data.find((item) => item.id === b.body.data.id);
    expect(foundOther).toBeUndefined();

    // Clean up
    await prisma.rideBooking.deleteMany({ where: { bookingId: b.body.data.id } });
    await prisma.booking.delete({ where: { id: b.body.data.id } });
    await prisma.carpoolRide.delete({ where: { id: reqRide.id } });
  });
});
