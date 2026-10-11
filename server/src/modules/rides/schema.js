const { z } = require('zod');

const uuidSchema = z.string().uuid();

const rideIdSchema = z.object({
  id: uuidSchema,
}).strict();

const createRideSchema = z.object({
  vehicleId: uuidSchema,
  originText: z.string().trim().min(2).max(160),
  originLat: z.number().finite().min(-90).max(90),
  originLng: z.number().finite().min(-180).max(180),
  destText: z.string().trim().min(2).max(160),
  destLat: z.number().finite().min(-90).max(90),
  destLng: z.number().finite().min(-180).max(180),
  distanceKm: z.number().finite().positive().max(99999).optional(),
  departureTime: z.string().datetime({ offset: true }),
  totalSeats: z.number().int().min(1).max(8),
  costPerSeat: z.number().finite().min(0).max(10000),
  notes: z.string().trim().max(1000).optional(),
}).strict();

const mineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['OPEN', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
}).strict();

module.exports = { rideIdSchema, createRideSchema, mineQuerySchema };
