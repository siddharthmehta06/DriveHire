const { parseBody } = require('../../lib/validate');
const { successResponse } = require('../../lib/response');
const service = require('./service');
const {
  vehicleIdSchema,
  vehicleReviewIdSchema,
  documentIdSchema,
  driverIdSchema,
  rejectSchema,
  driverListSchema,
  queueSchema,
} = require('./schema');

async function submitVehicle(req, res, next) {
  try {
    const { id } = parseBody(vehicleIdSchema, req.params);
    const vehicle = await service.submitVehicle(req.user.id, id);
    return res.json(successResponse(vehicle));
  } catch (error) {
    return next(error);
  }
}

async function listQueue(req, res, next) {
  try {
    const query = parseBody(queueSchema, req.query);
    const result = await service.listQueue(query.page, query.limit);
    return res.json(successResponse(result.items, { page: query.page, limit: query.limit, total: result.total }));
  } catch (error) {
    return next(error);
  }
}

async function getVehicleReview(req, res, next) {
  try {
    const { vehicleId } = parseBody(vehicleReviewIdSchema, req.params);
    const vehicle = await service.getVehicleReview(vehicleId);
    const audit = await service.getAudit('VEHICLE', vehicleId);
    return res.json(successResponse({ ...vehicle, audit }));
  } catch (error) {
    return next(error);
  }
}

async function approveDocument(req, res, next) {
  try {
    const { id } = parseBody(documentIdSchema, req.params);
    const document = await service.decideDocument(req.user.id, id, 'APPROVED');
    return res.json(successResponse(document));
  } catch (error) {
    return next(error);
  }
}

async function rejectDocument(req, res, next) {
  try {
    const { id } = parseBody(documentIdSchema, req.params);
    const { reason } = parseBody(rejectSchema, req.body);
    const document = await service.decideDocument(req.user.id, id, 'REJECTED', reason);
    return res.json(successResponse(document));
  } catch (error) {
    return next(error);
  }
}

async function listDrivers(req, res, next) {
  try {
    const query = parseBody(driverListSchema, req.query);
    const result = await service.listDrivers(query);
    return res.json(successResponse(result.items, { page: query.page, limit: query.limit, total: result.total }));
  } catch (error) {
    return next(error);
  }
}

async function approveDriver(req, res, next) {
  try {
    const { userId } = parseBody(driverIdSchema, req.params);
    const profile = await service.decideDriver(req.user.id, userId, 'APPROVED');
    return res.json(successResponse(profile));
  } catch (error) {
    return next(error);
  }
}

async function rejectDriver(req, res, next) {
  try {
    const { userId } = parseBody(driverIdSchema, req.params);
    const { reason } = parseBody(rejectSchema, req.body);
    const profile = await service.decideDriver(req.user.id, userId, 'REJECTED', reason);
    return res.json(successResponse(profile));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  submitVehicle,
  listQueue,
  getVehicleReview,
  approveDocument,
  rejectDocument,
  listDrivers,
  approveDriver,
  rejectDriver,
};
