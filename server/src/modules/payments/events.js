const { on } = require('../../lib/events');
const { createPaymentForBooking } = require('./service');
const logger = require('../../lib/logger');

on('booking.completed', async ({ bookingId, booking, ride }) => {
  try {
    await createPaymentForBooking(bookingId, booking, ride);
  } catch (error) {
    logger.error({ err: error, bookingId }, 'Failed to create payment for completed booking');
  }
});
