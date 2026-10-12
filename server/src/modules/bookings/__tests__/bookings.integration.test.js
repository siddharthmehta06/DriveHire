const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const prisma = require('../../../lib/prisma');
const app = require('../../../app');
const { emit } = require('../../../lib/events');

const JWT_SECRET = process.env.JWT_SECRET || 'test-only';

const DRIVER_ID = 'c1c1ff70-21ce-4e65-a104-a5f31c7f4111';
const PASSENGER_1_ID = 'c2c2ff70-21ce-4e65-a104-a5f31c7f4112';
const PASSENGER_2_ID = 'c3c3ff70-21ce-4e65-a104-a5f31c7f4113';

let driverToken;
let passenger1Token;
let passenger2Token;
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

  const [driver, pass1, pass2] = await Promise.all([
    prisma.user.upsert({
      where: { id: DRIVER_ID },
      update: {},
      create: {
        id: DRIVER_ID,
        name: 'Primary Driver',
        email: 'primary-driver@example.com',
        passwordHash,
        role: 'DRIVER',
      },
    }),
    prisma.user.upsert({
      where: { id: PASSENGER_1_ID },
      update: {},
      create: {
        id: PASSENGER_1_ID,
        name: 'Passenger One',
        email: 'passenger-one@example.com',
        passwordHash,
        role: 'USER',
      },
    }),
    prisma.user.upsert({
      where: { id: PASSENGER_2_ID },
      update: {},
      create: {
        id: PASSENGER_2_ID,
        name: 'Passenger Two',
        email: 'passenger-two@example.com',
        passwordHash,
        role: 'USER',
      },
    }),
  ]);

  driverToken = makeToken(driver);
  passenger1Token = makeToken(pass1);
  passenger2Token = makeToken(pass2);

  const vehicle = await prisma.vehicle.create({
    data: {
      ownerId: DRIVER_ID,
      make: 'Honda',
      model: 'City',
      year: 2022,
      registrationNumber: `MH14BK${randomUUID().slice(0, 4).toUpperCase()}`,
      vehicleType: 'SEDAN',
      seatCapacity: 4,
      verificationStatus: 'VERIFIED',
      isAvailable: true,
      photoUrls: ['https://example.com/city.jpg'],
    },
  });
  vehicleId = vehicle.id;

  const ride = await prisma.carpoolRide.create({
    data: {
      driverId: DRIVER_ID,
      vehicleId,
      originText: 'Pune, Maharashtra',
      originLat: 18.5204,
      originLng: 73.8567,
      destText: 'Mumbai, Maharashtra',
      destLat: 19.076,
      destLng: 72.8777,
      departureTime: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours ahead
      totalSeats: 3,
      availableSeats: 3,
      costPerSeat: '600.00',
      status: 'OPEN',
    },
  });
  rideId = ride.id;
});

afterAll(async () => {
  await prisma.rideLocation.deleteMany({ where: { rideId } });
  await prisma.rideBooking.deleteMany({ where: { rideId } });
  await prisma.booking.deleteMany({ where: { userId: { in: [PASSENGER_1_ID, PASSENGER_2_ID] } } });
  await prisma.carpoolRide.deleteMany({ where: { id: rideId } });
  if (vehicleId) await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.user.deleteMany({ where: { id: { in: [DRIVER_ID, PASSENGER_1_ID, PASSENGER_2_ID] } } });
});

describe('F05 Phase 2: Request, Accept, Reject, Cancel APIs', () => {
  it('allows passenger to request a booking (does not consume seats)', async () => {
    const res = await request(app)
      .post(`/api/rides/${rideId}/bookings`)
      .set('Authorization', `Bearer ${passenger1Token}`)
      .send({ seatsBooked: 2, pickupNote: 'Near metro station' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.rideBooking.seatsBooked).toBe(2);
    expect(res.body.data.rideBooking.active).toBe(true);

    // Verify ride seats are NOT consumed yet
    const ride = await prisma.carpoolRide.findUnique({ where: { id: rideId } });
    expect(ride.availableSeats).toBe(3);

    // Clean up
    await prisma.rideBooking.deleteMany({ where: { bookingId: res.body.data.id } });
    await prisma.booking.delete({ where: { id: res.body.data.id } });
  });

  it('rejects booking own ride, duplicate active requests, and excess seats', async () => {
    // Driver cannot book own ride
    const ownRideRes = await request(app)
      .post(`/api/rides/${rideId}/bookings`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ seatsBooked: 1 });
    expect(ownRideRes.status).toBe(422);
    expect(ownRideRes.body.error.details.code).toBe('CANNOT_BOOK_OWN_RIDE');

    // Excess seats
    const excessRes = await request(app)
      .post(`/api/rides/${rideId}/bookings`)
      .set('Authorization', `Bearer ${passenger1Token}`)
      .send({ seatsBooked: 5 });
    expect(excessRes.status).toBe(422);

    // Valid booking
    const validRes = await request(app)
      .post(`/api/rides/${rideId}/bookings`)
      .set('Authorization', `Bearer ${passenger1Token}`)
      .send({ seatsBooked: 1 });
    expect(validRes.status).toBe(201);

    // Duplicate active request
    const dupRes = await request(app)
      .post(`/api/rides/${rideId}/bookings`)
      .set('Authorization', `Bearer ${passenger1Token}`)
      .send({ seatsBooked: 1 });
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.details.code).toBe('DUPLICATE_REQUEST');

    // Clean up
    await prisma.rideBooking.deleteMany({ where: { bookingId: validRes.body.data.id } });
    await prisma.booking.delete({ where: { id: validRes.body.data.id } });
  });

  it('allows driver to accept booking and atomically deducts seats', async () => {
    const bookingRes = await request(app)
      .post(`/api/rides/${rideId}/bookings`)
      .set('Authorization', `Bearer ${passenger1Token}`)
      .send({ seatsBooked: 2 });
    expect(bookingRes.status).toBe(201);
    const bookingId = bookingRes.body.data.id;

    const acceptRes = await request(app)
      .post(`/api/bookings/${bookingId}/accept`)
      .set('Authorization', `Bearer ${driverToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.status).toBe('ACCEPTED');

    const ride = await prisma.carpoolRide.findUnique({ where: { id: rideId } });
    expect(ride.availableSeats).toBe(1);
    expect(ride.status).toBe('OPEN');

    // Clean up
    await prisma.rideBooking.deleteMany({ where: { bookingId } });
    await prisma.booking.delete({ where: { id: bookingId } });
    await prisma.carpoolRide.update({ where: { id: rideId }, data: { availableSeats: 3, status: 'OPEN' } });
  });

  it('allows driver to reject pending booking with reason', async () => {
    const bookingRes = await request(app)
      .post(`/api/rides/${rideId}/bookings`)
      .set('Authorization', `Bearer ${passenger1Token}`)
      .send({ seatsBooked: 1 });
    const bookingId = bookingRes.body.data.id;

    const rejectRes = await request(app)
      .post(`/api/bookings/${bookingId}/reject`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ reason: 'Car luggage space is full.' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('REJECTED');
    expect(rejectRes.body.data.cancelReason).toBe('Car luggage space is full.');
    expect(rejectRes.body.data.rideBooking.active).toBe(false);

    // Clean up
    await prisma.rideBooking.deleteMany({ where: { bookingId } });
    await prisma.booking.delete({ where: { id: bookingId } });
  });

  it('allows passenger to cancel accepted booking and returns seats atomically', async () => {
    const bookingRes = await request(app)
      .post(`/api/rides/${rideId}/bookings`)
      .set('Authorization', `Bearer ${passenger1Token}`)
      .send({ seatsBooked: 3 });
    const bookingId = bookingRes.body.data.id;

    // Driver accepts all 3 seats -> ride becomes FULL
    await request(app)
      .post(`/api/bookings/${bookingId}/accept`)
      .set('Authorization', `Bearer ${driverToken}`);

    let ride = await prisma.carpoolRide.findUnique({ where: { id: rideId } });
    expect(ride.availableSeats).toBe(0);
    expect(ride.status).toBe('FULL');

    // Passenger cancels -> seats returned and status reverts to OPEN
    const cancelRes = await request(app)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${passenger1Token}`)
      .send({ reason: 'Plans changed.' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');
    expect(cancelRes.body.data.rideBooking.active).toBe(false);

    ride = await prisma.carpoolRide.findUnique({ where: { id: rideId } });
    expect(ride.availableSeats).toBe(3);
    expect(ride.status).toBe('OPEN');

    // Clean up
    await prisma.rideBooking.deleteMany({ where: { bookingId } });
    await prisma.booking.delete({ where: { id: bookingId } });
  });

  it('enforces cancellation cutoff of 60 minutes before departure', async () => {
    // Create a ride departing in 30 minutes
    const soonRide = await prisma.carpoolRide.create({
      data: {
        driverId: DRIVER_ID,
        vehicleId,
        originText: 'Pune',
        originLat: 18.5204,
        originLng: 73.8567,
        destText: 'Mumbai',
        destLat: 19.076,
        destLng: 72.8777,
        departureTime: new Date(Date.now() + 30 * 60 * 1000), // 30 min ahead
        totalSeats: 3,
        availableSeats: 3,
        costPerSeat: '600.00',
        status: 'OPEN',
      },
    });

    const bookingRes = await request(app)
      .post(`/api/rides/${soonRide.id}/bookings`)
      .set('Authorization', `Bearer ${passenger1Token}`)
      .send({ seatsBooked: 1 });
    const bookingId = bookingRes.body.data.id;

    const cancelRes = await request(app)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${passenger1Token}`);

    expect(cancelRes.status).toBe(422);
    expect(cancelRes.body.error.details.code).toBe('CANCELLATION_CUTOFF_EXCEEDED');

    // Clean up
    await prisma.rideBooking.deleteMany({ where: { bookingId } });
    await prisma.booking.delete({ where: { id: bookingId } });
    await prisma.carpoolRide.delete({ where: { id: soonRide.id } });
  });

  it('cancels pending and accepted bookings on ride.cancelled event', async () => {
    const testRide = await prisma.carpoolRide.create({
      data: {
        driverId: DRIVER_ID,
        vehicleId,
        originText: 'Pune',
        originLat: 18.5204,
        originLng: 73.8567,
        destText: 'Mumbai',
        destLat: 19.076,
        destLng: 72.8777,
        departureTime: new Date(Date.now() + 5 * 60 * 60 * 1000),
        totalSeats: 3,
        availableSeats: 3,
        costPerSeat: '500.00',
        status: 'OPEN',
      },
    });

    const b1 = await request(app)
      .post(`/api/rides/${testRide.id}/bookings`)
      .set('Authorization', `Bearer ${passenger1Token}`)
      .send({ seatsBooked: 1 });

    const b2 = await request(app)
      .post(`/api/rides/${testRide.id}/bookings`)
      .set('Authorization', `Bearer ${passenger2Token}`)
      .send({ seatsBooked: 1 });

    // Accept b1, leave b2 pending
    await request(app)
      .post(`/api/bookings/${b1.body.data.id}/accept`)
      .set('Authorization', `Bearer ${driverToken}`);

    // Emit ride.cancelled
    await emit('ride.cancelled', { rideId: testRide.id, driverId: DRIVER_ID, ride: testRide });

    const check1 = await prisma.booking.findUnique({ where: { id: b1.body.data.id }, include: { rideBooking: true } });
    const check2 = await prisma.booking.findUnique({ where: { id: b2.body.data.id }, include: { rideBooking: true } });

    expect(check1.status).toBe('CANCELLED');
    expect(check1.rideBooking.active).toBe(false);
    expect(check2.status).toBe('CANCELLED');
    expect(check2.rideBooking.active).toBe(false);

    // Clean up
    await prisma.rideBooking.deleteMany({ where: { rideId: testRide.id } });
    await prisma.booking.deleteMany({ where: { id: { in: [b1.body.data.id, b2.body.data.id] } } });
    await prisma.carpoolRide.delete({ where: { id: testRide.id } });
  });

  it('concurrency test: 10 parallel accepts on a 2-seat ride yields exactly 2 successes and available_seats = 0', async () => {
    // Create a 2-seat ride
    const concurrentRide = await prisma.carpoolRide.create({
      data: {
        driverId: DRIVER_ID,
        vehicleId,
        originText: 'Pune',
        originLat: 18.5204,
        originLng: 73.8567,
        destText: 'Nashik',
        destLat: 19.9975,
        destLng: 73.7898,
        departureTime: new Date(Date.now() + 20 * 60 * 60 * 1000),
        totalSeats: 2,
        availableSeats: 2,
        costPerSeat: '400.00',
        status: 'OPEN',
      },
    });

    // Create 10 distinct passenger users to hold 10 distinct pending requests
    const passwordHash = await bcrypt.hash('Secret123!', 4);
    const passengerUsers = [];
    for (let i = 0; i < 10; i++) {
      const user = await prisma.user.create({
        data: {
          name: `Concurrent Passenger ${i}`,
          email: `concurrent-pass-${i}-${randomUUID().slice(0, 6)}@example.com`,
          passwordHash,
          role: 'USER',
        },
      });
      passengerUsers.push(user);
    }

    const bookingIds = [];
    for (const passenger of passengerUsers) {
      const b = await prisma.booking.create({
        data: {
          userId: passenger.id,
          type: 'RIDE',
          status: 'PENDING',
          rideBooking: {
            create: {
              rideId: concurrentRide.id,
              passengerId: passenger.id,
              seatsBooked: 1, // each requests 1 seat
              active: true,
            },
          },
        },
      });
      bookingIds.push(b.id);
    }

    // Trigger 10 parallel accepts simultaneously
    const acceptPromises = bookingIds.map((bookingId) =>
      request(app)
        .post(`/api/bookings/${bookingId}/accept`)
        .set('Authorization', `Bearer ${driverToken}`)
    );

    const results = await Promise.all(acceptPromises);

    const successCount = results.filter((r) => r.status === 200).length;
    const conflictCount = results.filter((r) => r.status === 409).length;

    expect(successCount).toBe(2);
    expect(conflictCount).toBe(8);

    const finalRide = await prisma.carpoolRide.findUnique({ where: { id: concurrentRide.id } });
    expect(finalRide.availableSeats).toBe(0);
    expect(finalRide.status).toBe('FULL');

    // Clean up
    await prisma.rideBooking.deleteMany({ where: { rideId: concurrentRide.id } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.carpoolRide.delete({ where: { id: concurrentRide.id } });
    await prisma.user.deleteMany({ where: { id: { in: passengerUsers.map((u) => u.id) } } });
  });
});
