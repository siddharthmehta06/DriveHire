const { successResponse } = require('../../lib/response');
const { parseBody } = require('../../lib/validate');
const path = require('path');
const service = require('./service');
const { createVehicleSchema, updateVehicleSchema, availabilitySchema, listVehicleQuerySchema } = require('./schema');

async function createVehicle(req, res, next) {
  try {
    const payload = parseBody(createVehicleSchema, {
      ...req.body,
      year: req.body.year ? Number(req.body.year) : undefined,
      seatCapacity: req.body.seatCapacity ? Number(req.body.seatCapacity) : undefined,
      isAvailable: req.body.isAvailable === undefined ? true : String(req.body.isAvailable) === 'true',
    });

    const files = Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
    const vehicle = await service.createVehicle(req.user.id, payload, files);
    return res.status(201).json(successResponse(vehicle));
  } catch (error) {
    return next(error);
  }
}

async function listVehicles(req, res, next) {
  try {
    const query = parseBody(listVehicleQuerySchema, {
      page: req.query.page || 1,
      limit: req.query.limit || 20,
      verificationStatus: req.query.verificationStatus,
      isAvailable: req.query.isAvailable,
    });

    const result = await service.listVehiclesForOwner(
      req.user.id,
      query,
      Number(query.page),
      Number(query.limit),
      req.user.role === 'ADMIN',
    );
    return res.json(successResponse(result.items, { page: result.page, limit: result.limit, total: result.total }));
  } catch (error) {
    return next(error);
  }
}

async function getVehicle(req, res, next) {
  try {
    const vehicle = await service.getVehicleById(req.params.id, req.user.id, req.user.role === 'ADMIN');
    return res.json(successResponse(vehicle));
  } catch (error) {
    return next(error);
  }
}

async function updateVehicle(req, res, next) {
  try {
    const files = Object.values(req.files || {}).flat();
    const payload = parseBody(updateVehicleSchema, {
      ...req.body,
      year: req.body.year !== undefined ? Number(req.body.year) : undefined,
      seatCapacity: req.body.seatCapacity !== undefined ? Number(req.body.seatCapacity) : undefined,
      removePhotoUrls: req.body.removePhotoUrls ? JSON.parse(req.body.removePhotoUrls) : undefined,
      addPhotoUrls: [
        ...(req.body.addPhotoUrls ? JSON.parse(req.body.addPhotoUrls) : []),
        ...files.map((file) => `/uploads/vehicles/${req.user.id}/${path.basename(file.path)}`),
      ],
    });

    const vehicle = await service.updateVehicle(req.params.id, req.user.id, payload);
    return res.json(successResponse(vehicle));
  } catch (error) {
    return next(error);
  }
}

async function updateAvailability(req, res, next) {
  try {
    const payload = parseBody(availabilitySchema, {
      isAvailable: String(req.body.isAvailable) === 'true',
    });

    const vehicle = await service.updateAvailability(req.params.id, req.user.id, payload.isAvailable);
    return res.json(successResponse(vehicle));
  } catch (error) {
    return next(error);
  }
}

async function softDeleteVehicle(req, res, next) {
  try {
    const vehicle = await service.deleteVehicle(req.params.id, req.user.id);
    return res.json(successResponse(vehicle, { deleted: true }));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createVehicle,
  listVehicles,
  getVehicle,
  updateVehicle,
  updateAvailability,
  softDeleteVehicle,
};
