const prisma = require('../../lib/prisma');
const { on } = require('../../lib/events');
const { notify } = require('../../lib/notifications');
const { emitToUser } = require('../../lib/realtime');
const logger = require('../../lib/logger');

on('ride.cancelled', async ({ rideId }) => {
  try {
    const activeBookings = await prisma.booking.findMany({
      where: {
        type: 'RIDE',
        status: { in: ['PENDING', 'ACCEPTED'] },
        rideBooking: {
          rideId,
        },
      },
      include: {
        rideBooking: true,
      },
    });

    for (const booking of activeBookings) {
      const updated = await prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: 'Ride cancelled by driver',
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

      emitToUser(booking.userId, 'booking:updated', updated);

      notify(
        booking.userId,
        'BOOKING_CANCELLED',
        'Ride Cancelled',
        'The driver has cancelled this ride.',
        { rideId, bookingId: booking.id }
      ).catch(() => {});
    }
  } catch (error) {
    logger.error({ err: error, rideId }, 'Failed to cancel bookings for cancelled ride');
  }
});
