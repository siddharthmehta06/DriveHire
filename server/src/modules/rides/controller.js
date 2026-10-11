const { parseBody } = require('../../lib/validate');
const { successResponse } = require('../../lib/response');
const service = require('./service');
const { createRideSchema, mineQuerySchema, rideIdSchema } = require('./schema');
const { searchQuerySchema } = require('./searchSchema');

async function createRide(req, res, next) {
  try {
    const input = parseBody(createRideSchema, req.body);
    const ride = await service.createRide(req.user.id, input);
    return res.status(201).json(successResponse(ride));
  } catch (error) {
    return next(error);
  }
}

async function getRide(req, res, next) {
  try {
    const { id } = parseBody(rideIdSchema, req.params);
    return res.json(successResponse(await service.getRide(id)));
  } catch (error) {
    return next(error);
  }
}

async function searchRides(req, res, next) {
  try {
    const query = parseBody(searchQuerySchema, req.query);
    const result = await service.searchRides(query);
    return res.json(successResponse(result.items, {
      page: query.page,
      limit: query.limit,
      total: result.total,
    }));
  } catch (error) {
    return next(error);
  }
}

async function listMyRides(req, res, next) {
  try {
    const query = parseBody(mineQuerySchema, req.query);
    const result = await service.listMyRides(req.user.id, query);
    return res.json(successResponse(result.items, {
      page: query.page,
      limit: query.limit,
      total: result.total,
    }));
  } catch (error) {
    return next(error);
  }
}

async function cancelRide(req, res, next) {
  try {
    const { id } = parseBody(rideIdSchema, req.params);
    return res.json(successResponse(await service.cancelRide(req.user.id, id)));
  } catch (error) {
    return next(error);
  }
}

module.exports = { createRide, getRide, searchRides, listMyRides, cancelRide };
