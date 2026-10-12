const { z } = require('zod');

const createBookingSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    seatsBooked: z.number().int().min(1).max(6),
    pickupNote: z.string().max(255).optional(),
  }),
};

const bookingIdParamSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

const rejectBookingSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().max(255).optional(),
  }).default({}),
};

const cancelBookingSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().max(255).optional(),
  }).default({}),
};

const rideIdParamSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

const myBookingsQuerySchema = {
  query: z.object({
    bucket: z.enum(['upcoming', 'active', 'past']).optional(),
    type: z.enum(['RIDE', 'RENTAL']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

const driverRequestsQuerySchema = {
  query: z.object({
    status: z.enum(['PENDING', 'ACCEPTED', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'ACTIVE', 'COMPLETED']).default('PENDING'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

const updateRideLocationSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  }),
};

const getRideLocationSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

module.exports = {
  createBookingSchema,
  bookingIdParamSchema,
  rejectBookingSchema,
  cancelBookingSchema,
  rideIdParamSchema,
  myBookingsQuerySchema,
  driverRequestsQuerySchema,
  updateRideLocationSchema,
  getRideLocationSchema,
};

