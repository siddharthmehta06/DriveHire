const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { notify } = require('../../lib/notifications');
const { emitToUser } = require('../../lib/realtime');
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

module.exports = {
  requestBooking,
  acceptBooking,
  rejectBooking,
  cancelBooking,
};
