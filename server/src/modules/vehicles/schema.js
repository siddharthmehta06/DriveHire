const { z } = require('zod');

const vehicleTypeEnum = z.enum(['HATCHBACK', 'SEDAN', 'SUV', 'MPV', 'LUXURY']);
const verificationStatusEnum = z.enum(['UNVERIFIED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED']);

const createVehicleSchema = z.object({
  make: z.string().min(1).max(120),
  model: z.string().min(1).max(120),
  year: z.number().int().min(1990).max(new Date().getFullYear() + 1),
  registrationNumber: z.string().min(1).max(40),
  vehicleType: vehicleTypeEnum,
  seatCapacity: z.number().int().min(1).max(8),
  isAvailable: z.boolean().optional().default(true),
}).strict();

const updateVehicleSchema = z.object({
  make: z.string().min(1).max(120).optional(),
  model: z.string().min(1).max(120).optional(),
  year: z.number().int().min(1990).max(new Date().getFullYear() + 1).optional(),
  vehicleType: vehicleTypeEnum.optional(),
  seatCapacity: z.number().int().min(1).max(8).optional(),
  removePhotoUrls: z.array(z.string()).max(5).optional(),
  addPhotoUrls: z.array(z.string()).max(5).optional(),
}).strict();

const availabilitySchema = z.object({
  isAvailable: z.boolean(),
}).strict();

const listVehicleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  verificationStatus: verificationStatusEnum.optional(),
  isAvailable: z.union([
    z.boolean(),
    z.enum(['true', 'false']).transform((value) => value === 'true'),
  ]).optional(),
}).strict();

module.exports = {
  createVehicleSchema,
  updateVehicleSchema,
  availabilitySchema,
  listVehicleQuerySchema,
  verificationStatusEnum,
  vehicleTypeEnum,
};
