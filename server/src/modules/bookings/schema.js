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

module.exports = {
  createBookingSchema,
  bookingIdParamSchema,
  rejectBookingSchema,
  cancelBookingSchema,
};
