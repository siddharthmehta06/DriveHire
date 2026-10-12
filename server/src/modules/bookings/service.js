const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { notify } = require('../../lib/notifications');
const { emitToUser, emitToRide } = require('../../lib/realtime');
const { publishRideSeats } = require('../rides/service');

const PASSENGER_CANCEL_CUTOFF_MIN = 60;

async function requestBooking(passengerId, rideId, { seatsBooked, pickupNote }) {
  const ride = await prisma.carpoolRide.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      driverId: true,
      status: true,
      departureTime: true,
      availableSeats: true,
      originText: true,
      destText: true,
    },
  });

  if (!ride) {
    throw new AppError('NOT_FOUND', 'Ride not found.', 404);
  }

  if (ride.driverId === passengerId) {
    throw new AppError('UNPROCESSABLE', 'You cannot book your own ride.', 422, {
      code: 'CANNOT_BOOK_OWN_RIDE',
    });
  }

  if (ride.status !== 'OPEN') {
    throw new AppError('UNPROCESSABLE', 'Bookings are only accepted for open rides.', 422, {
      code: 'RIDE_NOT_OPEN',
    });
  }

  if (new Date(ride.departureTime) <= new Date()) {
    throw new AppError('UNPROCESSABLE', 'This ride has already departed.', 422, {
      code: 'RIDE_ALREADY_DEPARTED',
    });
  }

  if (seatsBooked > ride.availableSeats) {
    throw new AppError('UNPROCESSABLE', 'Requested seats exceed available seats.', 422, {
      code: 'EXCEEDS_AVAILABLE_SEATS',
    });
  }

  const existing = await prisma.rideBooking.findFirst({
    where: {
      rideId,
      passengerId,
      active: true,
    },
  });

  if (existing) {
    throw new AppError('CONFLICT', 'You already have an active booking request for this ride.', 409, {
      code: 'DUPLICATE_REQUEST',
    });
  }

  const booking = await prisma.$transaction(async (tx) => {
    return tx.booking.create({
      data: {
        userId: passengerId,
        type: 'RIDE',
        status: 'PENDING',
        rideBooking: {
          create: {
            rideId,
            passengerId,
            seatsBooked,
            pickupNote: pickupNote || null,
            active: true,
          },
        },
      },
      include: {
        rideBooking: true,
      },
    });
  });

  // Best-effort notification to driver
  notify(
    ride.driverId,
    'BOOKING_REQUESTED',
    'New Booking Request',
    `A passenger requested ${seatsBooked} seat(s) on your ride from ${ride.originText} to ${ride.destText}.`,
    { bookingId: booking.id, rideId }
  ).catch(() => {});

  return booking;
}

async function acceptBooking(driverId, bookingId) {
  let updatedRideData;
  let passengerUserId;
  let bookedSeats;

  const updatedBooking = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { rideBooking: true },
    });

    if (!booking || !booking.rideBooking) {
      throw new AppError('NOT_FOUND', 'Booking not found.', 404);
    }

    const ride = await tx.carpoolRide.findUnique({
      where: { id: booking.rideBooking.rideId },
    });

    if (!ride || ride.driverId !== driverId) {
      throw new AppError('NOT_FOUND', 'Booking not found.', 404);
    }

    if (booking.status !== 'PENDING') {
      throw new AppError('CONFLICT', 'Only pending bookings can be accepted.', 409, {
        code: 'INVALID_BOOKING_STATUS',
      });
    }

    bookedSeats = booking.rideBooking.seatsBooked;
    passengerUserId = booking.userId;

    // Atomic accept (REQ-4.4.4):
    // Inside one transaction run UPDATE carpool_rides SET available_seats = available_seats - $n,
    // status = CASE WHEN available_seats - $n = 0 THEN 'FULL' ELSE status END
    // WHERE id = $id AND status = 'OPEN' AND available_seats >= $n RETURNING *
    const rows = await tx.$queryRaw`
      UPDATE "carpool_rides"
      SET "availableSeats" = "availableSeats" - ${bookedSeats},
          "status" = CASE WHEN "availableSeats" - ${bookedSeats} = 0 THEN 'FULL'::"RideStatus" ELSE "status" END,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${ride.id}
        AND "status" = 'OPEN'
        AND "availableSeats" >= ${bookedSeats}
      RETURNING *
    `;

    if (!rows || rows.length === 0) {
      throw new AppError('CONFLICT', 'Seats are no longer available for this ride.', 409, {
        code: 'SEATS_UNAVAILABLE',
      });
    }

    updatedRideData = rows[0];

    const accepted = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: 'ACCEPTED',
      },
      include: {
        rideBooking: true,
      },
    });

    return accepted;
  });

  if (updatedRideData) {
    publishRideSeats(updatedRideData).catch(() => {});
  }

  emitToUser(passengerUserId, 'booking:updated', updatedBooking);

  notify(
    passengerUserId,
    'BOOKING_ACCEPTED',
    'Booking Accepted',
    'Your booking request has been accepted by the driver.',
    { bookingId: updatedBooking.id, rideId: updatedRideData?.id }
  ).catch(() => {});

  return updatedBooking;
}

async function rejectBooking(driverId, bookingId, reason) {
  let passengerUserId;
  let rideId;

  const rejectedBooking = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { rideBooking: true },
    });

    if (!booking || !booking.rideBooking) {
      throw new AppError('NOT_FOUND', 'Booking not found.', 404);
    }

    const ride = await tx.carpoolRide.findUnique({
      where: { id: booking.rideBooking.rideId },
    });

    if (!ride || ride.driverId !== driverId) {
      throw new AppError('NOT_FOUND', 'Booking not found.', 404);
    }

    if (booking.status !== 'PENDING') {
      throw new AppError('CONFLICT', 'Only pending bookings can be rejected.', 409, {
        code: 'INVALID_BOOKING_STATUS',
      });
    }

    passengerUserId = booking.userId;
    rideId = ride.id;

    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: 'REJECTED',
        cancelReason: reason || null,
        rideBooking: {
          update: {
            active: false,
          },
        },
      },
      include: {
        rideBooking: true,
      },
    });

    return updated;
  });

  emitToUser(passengerUserId, 'booking:updated', rejectedBooking);

  notify(
    passengerUserId,
    'BOOKING_REJECTED',
    'Booking Rejected',
    reason || 'Your booking request was rejected by the driver.',
    { bookingId: rejectedBooking.id, rideId, reason }
  ).catch(() => {});

  return rejectedBooking;
}

async function cancelBooking(passengerId, bookingId, reason) {
  let driverId;
  let updatedRideData;

  const cancelledBooking = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { rideBooking: true },
    });

    if (!booking || !booking.rideBooking || booking.userId !== passengerId) {
      throw new AppError('NOT_FOUND', 'Booking not found.', 404);
    }

    if (!['PENDING', 'ACCEPTED'].includes(booking.status)) {
      throw new AppError('CONFLICT', 'Only pending or accepted bookings can be cancelled.', 409, {
        code: 'CANNOT_CANCEL',
      });
    }

    const ride = await tx.carpoolRide.findUnique({
      where: { id: booking.rideBooking.rideId },
    });

    if (!ride) {
      throw new AppError('NOT_FOUND', 'Ride not found.', 404);
    }

    driverId = ride.driverId;

    const departureTime = new Date(ride.departureTime).getTime();
    const cutoffTime = departureTime - PASSENGER_CANCEL_CUTOFF_MIN * 60 * 1000;
    if (Date.now() > cutoffTime) {
      throw new AppError(
        'UNPROCESSABLE',
        'Bookings can only be cancelled at least 60 minutes before departure.',
        422,
        { code: 'CANCELLATION_CUTOFF_EXCEEDED' }
      );
    }

    if (booking.status === 'ACCEPTED') {
      // Returning seats atomically
      const rows = await tx.$queryRaw`
        UPDATE "carpool_rides"
        SET "availableSeats" = "availableSeats" + ${booking.rideBooking.seatsBooked},
            "status" = CASE WHEN "status" = 'FULL' THEN 'OPEN'::"RideStatus" ELSE "status" END,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${ride.id}
        RETURNING *
      `;
      if (rows && rows.length > 0) {
        updatedRideData = rows[0];
      }
    }

    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason || 'Cancelled by passenger',
        rideBooking: {
          update: {
            active: false,
          },
        },
      },
      include: {
        rideBooking: true,
      },
    });

    return updated;
  });

  if (updatedRideData) {
    publishRideSeats(updatedRideData).catch(() => {});
  }

  emitToUser(passengerId, 'booking:updated', cancelledBooking);

  notify(
    driverId,
    'BOOKING_CANCELLED',
    'Booking Cancelled',
    'A passenger has cancelled their booking.',
    { bookingId: cancelledBooking.id, rideId: cancelledBooking.rideBooking.rideId }
  ).catch(() => {});

  return cancelledBooking;
}

async function startRide(driverId, rideId) {
  const ride = await prisma.carpoolRide.findUnique({
    where: { id: rideId },
    select: { id: true, driverId: true, status: true },
  });

  if (!ride || ride.driverId !== driverId) {
    throw new AppError('NOT_FOUND', 'Ride not found.', 404);
  }

  if (!['OPEN', 'FULL'].includes(ride.status)) {
    throw new AppError('CONFLICT', 'Only open or full rides can be started.', 409, {
      code: 'INVALID_RIDE_STATUS',
    });
  }

  const { updatedRide, activatedBookings } = await prisma.$transaction(async (tx) => {
    const r = await tx.carpoolRide.update({
      where: { id: rideId },
      data: { status: 'IN_PROGRESS' },
    });

    const accepted = await tx.booking.findMany({
      where: {
        type: 'RIDE',
        status: 'ACCEPTED',
        rideBooking: { rideId },
      },
      include: { rideBooking: true },
    });

    if (accepted.length > 0) {
      await tx.booking.updateMany({
        where: {
          id: { in: accepted.map((b) => b.id) },
        },
        data: {
          status: 'ACTIVE',
        },
      });
    }

    return { updatedRide: r, activatedBookings: accepted };
  });

  for (const b of activatedBookings) {
    emitToUser(b.userId, 'booking:updated', { ...b, status: 'ACTIVE' });
  }

  publishRideSeats(updatedRide).catch(() => {});
  return updatedRide;
}

async function completeRide(driverId, rideId) {
  const { emit } = require('../../lib/events');
  const ride = await prisma.carpoolRide.findUnique({
    where: { id: rideId },
    select: { id: true, driverId: true, status: true },
  });

  if (!ride || ride.driverId !== driverId) {
    throw new AppError('NOT_FOUND', 'Ride not found.', 404);
  }

  if (ride.status !== 'IN_PROGRESS') {
    throw new AppError('CONFLICT', 'Only in-progress rides can be completed.', 409, {
      code: 'INVALID_RIDE_STATUS',
    });
  }

  const { updatedRide, completedBookings } = await prisma.$transaction(async (tx) => {
    const r = await tx.carpoolRide.update({
      where: { id: rideId },
      data: { status: 'COMPLETED' },
    });

    const activeOrAccepted = await tx.booking.findMany({
      where: {
        type: 'RIDE',
        status: { in: ['ACTIVE', 'ACCEPTED'] },
        rideBooking: { rideId },
      },
      include: { rideBooking: true },
    });

    if (activeOrAccepted.length > 0) {
      await tx.booking.updateMany({
        where: {
          id: { in: activeOrAccepted.map((b) => b.id) },
        },
        data: {
          status: 'COMPLETED',
        },
      });

      await tx.rideBooking.updateMany({
        where: {
          bookingId: { in: activeOrAccepted.map((b) => b.id) },
        },
        data: {
          active: false,
        },
      });
    }

    return { updatedRide: r, completedBookings: activeOrAccepted };
  });

  for (const b of completedBookings) {
    const completedBookingRecord = {
      ...b,
      status: 'COMPLETED',
      rideBooking: b.rideBooking ? { ...b.rideBooking, active: false } : null,
    };
    emit('booking.completed', { bookingId: b.id, booking: completedBookingRecord, ride: updatedRide }).catch(() => {});
    emitToUser(b.userId, 'booking:updated', completedBookingRecord);
  }

  publishRideSeats(updatedRide).catch(() => {});
  return updatedRide;
}

function classifyBucket(booking) {
  if (booking.status === 'ACTIVE') return 'active';
  const departure = booking.rideBooking?.ride?.departureTime
    ? new Date(booking.rideBooking.ride.departureTime).getTime()
    : null;
  const isFuture = departure !== null ? departure > Date.now() : true;

  if (['PENDING', 'ACCEPTED', 'CONFIRMED'].includes(booking.status)) {
    return isFuture ? 'upcoming' : 'past';
  }
  return 'past'; // COMPLETED, CANCELLED, REJECTED
}

async function listMyBookings(userId, { bucket, type, page = 1, limit = 20 }) {
  const where = {
    userId,
    ...(type ? { type } : {}),
  };

  const allUserBookings = await prisma.booking.findMany({
    where,
    include: {
      rideBooking: {
        include: {
          ride: {
            include: {
              driver: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                },
              },
              vehicle: {
                select: {
                  id: true,
                  make: true,
                  model: true,
                  vehicleType: true,
                  registrationNumber: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      bookingDate: 'desc',
    },
  });

  let filtered = allUserBookings;
  if (bucket) {
    filtered = allUserBookings.filter((b) => classifyBucket(b) === bucket);
  }

  const total = filtered.length;
  const startIndex = (page - 1) * limit;
  const items = filtered.slice(startIndex, startIndex + limit);

  return { items, total, page, limit };
}

async function getRideBookings(driverId, rideId) {
  const ride = await prisma.carpoolRide.findUnique({
    where: { id: rideId },
    select: { id: true, driverId: true },
  });

  if (!ride || ride.driverId !== driverId) {
    throw new AppError('NOT_FOUND', 'Ride not found.', 404);
  }

  const bookings = await prisma.booking.findMany({
    where: {
      rideBooking: {
        rideId,
      },
    },
    include: {
      rideBooking: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
    },
    orderBy: {
      bookingDate: 'desc',
    },
  });

  return bookings;
}

async function listDriverRequests(driverId, { status = 'PENDING', page = 1, limit = 20 }) {
  const driverRides = await prisma.carpoolRide.findMany({
    where: { driverId },
    select: { id: true },
  });
  const rideIds = driverRides.map((r) => r.id);

  if (rideIds.length === 0) {
    return { items: [], total: 0, page, limit };
  }

  const where = {
    type: 'RIDE',
    status,
    rideBooking: {
      rideId: { in: rideIds },
    },
  };

  const [total, items] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: {
        rideBooking: {
          include: {
            ride: {
              select: {
                id: true,
                originText: true,
                destText: true,
                departureTime: true,
                availableSeats: true,
                totalSeats: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: {
        bookingDate: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { items, total, page, limit };
}

async function updateRideLocation(driverId, rideId, { lat, lng }) {
  const ride = await prisma.carpoolRide.findUnique({
    where: { id: rideId },
    select: { id: true, driverId: true, status: true },
  });

  if (!ride || ride.driverId !== driverId) {
    throw new AppError('NOT_FOUND', 'Ride not found.', 404);
  }

  if (['CANCELLED', 'COMPLETED'].includes(ride.status)) {
    throw new AppError('UNPROCESSABLE', 'Location cannot be updated for inactive rides.', 422, {
      code: 'RIDE_INACTIVE',
    });
  }

  const location = await prisma.rideLocation.upsert({
    where: { rideId },
    create: {
      rideId,
      lat,
      lng,
    },
    update: {
      lat,
      lng,
    },
  });

  const payload = {
    rideId: location.rideId,
    lat: Number(location.lat),
    lng: Number(location.lng),
    updatedAt: location.updatedAt,
  };

  emitToRide(rideId, 'ride:location', payload);

  return payload;
}

async function getRideLocation(userId, rideId) {
  const ride = await prisma.carpoolRide.findUnique({
    where: { id: rideId },
    select: { id: true, driverId: true },
  });

  if (!ride) {
    throw new AppError('NOT_FOUND', 'Ride not found.', 404);
  }

  const isDriver = ride.driverId === userId;
  let isPassenger = false;

  if (!isDriver) {
    const booking = await prisma.rideBooking.findFirst({
      where: {
        rideId,
        passengerId: userId,
        active: true,
        booking: {
          status: { in: ['ACCEPTED', 'ACTIVE'] },
        },
      },
      select: { bookingId: true },
    });
    isPassenger = Boolean(booking);
  }

  if (!isDriver && !isPassenger) {
    throw new AppError('NOT_FOUND', 'Ride not found.', 404);
  }

  const location = await prisma.rideLocation.findUnique({
    where: { rideId },
  });

  if (!location) {
    throw new AppError('NOT_FOUND', 'Ride location not available.', 404, {
      code: 'LOCATION_NOT_FOUND',
    });
  }

  return {
    rideId: location.rideId,
    lat: Number(location.lat),
    lng: Number(location.lng),
    updatedAt: location.updatedAt,
  };
}

module.exports = {
  requestBooking,
  acceptBooking,
  rejectBooking,
  cancelBooking,
  startRide,
  completeRide,
  listMyBookings,
  getRideBookings,
  listDriverRequests,
  classifyBucket,
  updateRideLocation,
  getRideLocation,
};

