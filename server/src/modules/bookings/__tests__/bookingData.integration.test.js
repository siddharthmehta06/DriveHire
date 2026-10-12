const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../../../lib/prisma');

const DRIVER_ID = 'b1b1ff70-21ce-4e65-a104-a5f31c7f4101';
const PASSENGER_ID = 'b2b2ff70-21ce-4e65-a104-a5f31c7f4102';
let vehicleId;
let rideId;

beforeAll(async () => {
  const passwordHash = await bcrypt.hash('Secret123!', 4);
  await prisma.user.upsert({
    where: { id: DRIVER_ID },
    update: {},
    create: {
      id: DRIVER_ID,
      name: 'Booking Driver',
      email: 'booking-driver@example.com',
      passwordHash,
      role: 'DRIVER',
    },
  });

  await prisma.user.upsert({
    where: { id: PASSENGER_ID },
    update: {},
    create: {
      id: PASSENGER_ID,
      name: 'Booking Passenger',
      email: 'booking-passenger@example.com',
      passwordHash,
      role: 'USER',
    },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      ownerId: DRIVER_ID,
      make: 'Maruti',
      model: 'Ertiga',
      year: 2022,
      registrationNumber: `MH12BK${randomUUID().slice(0, 4).toUpperCase()}`,
      vehicleType: 'MPV',
      seatCapacity: 6,
      verificationStatus: 'VERIFIED',
      isAvailable: true,
      photoUrls: ['https://example.com/ertiga.jpg'],
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
      departureTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      totalSeats: 4,
      availableSeats: 4,
      costPerSeat: '500.00',
    },
  });
  rideId = ride.id;

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ride_bookings_rideId_passengerId_active_unique"
    ON "ride_bookings"("rideId", "passengerId") WHERE active;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ride_bookings_seats_booked_check'
      ) THEN
        ALTER TABLE "ride_bookings" ADD CONSTRAINT "ride_bookings_seats_booked_check" CHECK ("seatsBooked" BETWEEN 1 AND 6);
      END IF;
    END $$;
  `);
});

afterAll(async () => {
  await prisma.rideLocation.deleteMany({ where: { rideId } });
  await prisma.rideBooking.deleteMany({ where: { rideId } });
  await prisma.booking.deleteMany({ where: { userId: PASSENGER_ID } });
  await prisma.carpoolRide.deleteMany({ where: { id: rideId } });
  if (vehicleId) await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.user.deleteMany({ where: { id: { in: [DRIVER_ID, PASSENGER_ID] } } });
});

describe('F05 Phase 1: Data layer models and database constraints', () => {
  it('creates booking and ride booking successfully', async () => {
    const booking = await prisma.booking.create({
      data: {
        userId: PASSENGER_ID,
        type: 'RIDE',
        status: 'PENDING',
        rideBooking: {
          create: {
            rideId,
            passengerId: PASSENGER_ID,
            seatsBooked: 2,
            pickupNote: 'Near main gate',
            active: true,
          },
        },
      },
      include: { rideBooking: true },
    });

    expect(booking.id).toBeDefined();
    expect(booking.status).toBe('PENDING');
    expect(booking.rideBooking.seatsBooked).toBe(2);
    expect(booking.rideBooking.active).toBe(true);

    // Clean up for subsequent tests
    await prisma.rideBooking.deleteMany({ where: { bookingId: booking.id } });
    await prisma.booking.delete({ where: { id: booking.id } });
  });

  it('rejects duplicate active requests for the same ride and passenger at database level', async () => {
    const booking1 = await prisma.booking.create({
      data: {
        userId: PASSENGER_ID,
        type: 'RIDE',
        status: 'PENDING',
        rideBooking: {
          create: {
            rideId,
            passengerId: PASSENGER_ID,
            seatsBooked: 1,
            active: true,
          },
        },
      },
      include: { rideBooking: true },
    });

    // Attempt second active request for same ride and passenger
    await expect(
      prisma.booking.create({
        data: {
          userId: PASSENGER_ID,
          type: 'RIDE',
          status: 'PENDING',
          rideBooking: {
            create: {
              rideId,
              passengerId: PASSENGER_ID,
              seatsBooked: 1,
              active: true,
            },
          },
        },
      })
    ).rejects.toThrow();

    // Now mark the first booking inactive (e.g. cancelled/rejected)
    await prisma.rideBooking.update({
      where: { bookingId: booking1.id },
      data: { active: false },
    });

    // Inserting a new active request should now succeed because the previous one is inactive
    const booking2 = await prisma.booking.create({
      data: {
        userId: PASSENGER_ID,
        type: 'RIDE',
        status: 'PENDING',
        rideBooking: {
          create: {
            rideId,
            passengerId: PASSENGER_ID,
            seatsBooked: 2,
            active: true,
          },
        },
      },
      include: { rideBooking: true },
    });

    expect(booking2.id).toBeDefined();
    expect(booking2.rideBooking.active).toBe(true);

    // Cleanup
    await prisma.rideBooking.deleteMany({ where: { bookingId: { in: [booking1.id, booking2.id] } } });
    await prisma.booking.deleteMany({ where: { id: { in: [booking1.id, booking2.id] } } });
  });

  it('enforces CHECK (seatsBooked BETWEEN 1 AND 6) at database level', async () => {
    // Attempt seatsBooked = 0
    await expect(
      prisma.booking.create({
        data: {
          userId: PASSENGER_ID,
          type: 'RIDE',
          status: 'PENDING',
          rideBooking: {
            create: {
              rideId,
              passengerId: PASSENGER_ID,
              seatsBooked: 0,
              active: true,
            },
          },
        },
      })
    ).rejects.toThrow();

    // Attempt seatsBooked = 7
    await expect(
      prisma.booking.create({
        data: {
          userId: PASSENGER_ID,
          type: 'RIDE',
          status: 'PENDING',
          rideBooking: {
            create: {
              rideId,
              passengerId: PASSENGER_ID,
              seatsBooked: 7,
              active: true,
            },
          },
        },
      })
    ).rejects.toThrow();
  });

  it('creates and updates RideLocation correctly', async () => {
    const loc = await prisma.rideLocation.upsert({
      where: { rideId },
      update: { lat: 18.5204, lng: 73.8567 },
      create: { rideId, lat: 18.5204, lng: 73.8567 },
    });

    expect(Number(loc.lat)).toBeCloseTo(18.5204, 4);
    expect(Number(loc.lng)).toBeCloseTo(73.8567, 4);

    const updated = await prisma.rideLocation.upsert({
      where: { rideId },
      update: { lat: 18.5300, lng: 73.8600 },
      create: { rideId, lat: 18.5300, lng: 73.8600 },
    });

    expect(Number(updated.lat)).toBeCloseTo(18.5300, 4);
    expect(Number(updated.lng)).toBeCloseTo(73.8600, 4);

    await prisma.rideLocation.deleteMany({ where: { rideId } });
  });
});
