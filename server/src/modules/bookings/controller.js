const { parseBody } = require('../../lib/validate');
const { successResponse } = require('../../lib/response');
const service = require('./service');
const {
  createBookingSchema,
  bookingIdParamSchema,
  rejectBookingSchema,
  cancelBookingSchema,
  rideIdParamSchema,
  myBookingsQuerySchema,
  driverRequestsQuerySchema,
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

async function startRide(req, res, next) {
  try {
    const { id: rideId } = parseBody(rideIdParamSchema.params, req.params);
    const ride = await service.startRide(req.user.id, rideId);
    return res.json(successResponse(ride));
  } catch (error) {
    return next(error);
  }
}

async function completeRide(req, res, next) {
  try {
    const { id: rideId } = parseBody(rideIdParamSchema.params, req.params);
    const ride = await service.completeRide(req.user.id, rideId);
    return res.json(successResponse(ride));
  } catch (error) {
    return next(error);
  }
}

async function listMyBookings(req, res, next) {
  try {
    const query = parseBody(myBookingsQuerySchema.query, req.query);
    const result = await service.listMyBookings(req.user.id, query);
    return res.json(successResponse(result.items, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    }));
  } catch (error) {
    return next(error);
  }
}

async function getRideBookings(req, res, next) {
  try {
    const { id: rideId } = parseBody(rideIdParamSchema.params, req.params);
    const bookings = await service.getRideBookings(req.user.id, rideId);
    return res.json(successResponse(bookings));
  } catch (error) {
    return next(error);
  }
}

async function listDriverRequests(req, res, next) {
  try {
    const query = parseBody(driverRequestsQuerySchema.query, req.query);
    const result = await service.listDriverRequests(req.user.id, query);
    return res.json(successResponse(result.items, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    }));
  } catch (error) {
    return next(error);
  }
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
};

