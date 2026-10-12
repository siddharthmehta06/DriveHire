const { parseBody } = require('../../lib/validate');
const { successResponse } = require('../../lib/response');
const service = require('./service');
const {
  createBookingSchema,
  bookingIdParamSchema,
  rejectBookingSchema,
  cancelBookingSchema,
} = require('./schema');

async function requestBooking(req, res, next) {
  try {
    const { id: rideId } = parseBody(createBookingSchema.params, req.params);
    const body = parseBody(createBookingSchema.body, req.body);
    const booking = await service.requestBooking(req.user.id, rideId, body);
    return res.status(201).json(successResponse(booking));
  } catch (error) {
    return next(error);
  }
}

async function acceptBooking(req, res, next) {
  try {
    const { id: bookingId } = parseBody(bookingIdParamSchema.params, req.params);
    const booking = await service.acceptBooking(req.user.id, bookingId);
    return res.json(successResponse(booking));
  } catch (error) {
    return next(error);
  }
}

async function rejectBooking(req, res, next) {
  try {
    const { id: bookingId } = parseBody(rejectBookingSchema.params, req.params);
    const body = parseBody(rejectBookingSchema.body, req.body);
    const booking = await service.rejectBooking(req.user.id, bookingId, body.reason);
    return res.json(successResponse(booking));
  } catch (error) {
    return next(error);
  }
}

async function cancelBooking(req, res, next) {
  try {
    const { id: bookingId } = parseBody(cancelBookingSchema.params, req.params);
    const body = parseBody(cancelBookingSchema.body, req.body);
    const booking = await service.cancelBooking(req.user.id, bookingId, body.reason);
    return res.json(successResponse(booking));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requestBooking,
  acceptBooking,
  rejectBooking,
  cancelBooking,
};
