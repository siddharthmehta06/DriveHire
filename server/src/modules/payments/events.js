const { on } = require('../../lib/events');
<<<<<<< HEAD
const { createPaymentForBooking } = require('./service');
const logger = require('../../lib/logger');

on('booking.completed', async ({ bookingId, booking, ride }) => {
  try {
    await createPaymentForBooking(bookingId, booking, ride);
  } catch (error) {
    logger.error({ err: error, bookingId }, 'Failed to create payment for completed booking');
=======
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
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d
  }
});
