const { on } = require('../../lib/events');
const logger = require('../../lib/logger');
const { createPaymentForBooking } = require('./service');

on('booking.completed', async (payload) => {
  const bookingId = payload?.bookingId || payload?.booking?.id;
  if (!bookingId) {
    logger.warn({ payload }, 'booking.completed event received without bookingId');
    return;
  }

  try {
    await createPaymentForBooking(bookingId);
  } catch (error) {
    logger.error({ err: error, bookingId }, 'Failed to process payment creation for completed booking');
  }
});
