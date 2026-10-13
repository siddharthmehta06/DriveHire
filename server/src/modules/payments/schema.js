const { z } = require('zod');

const updateCommissionSchema = z.object({
  commissionRatePct: z.coerce
    .number()
    .min(0, 'Commission rate must be at least 0%')
    .max(50, 'Commission rate cannot exceed 50%')
    .refine((val) => Number.isFinite(val) && Number(val.toFixed(2)) === val, {
      message: 'Commission rate can have at most 2 decimal places',
    }),
}).strict();

const bookingIdSchema = z.object({
  bookingId: z.string().uuid(),
}).strict();

const paymentIdSchema = z.object({
  id: z.string().uuid(),
}).strict();

module.exports = {
  updateCommissionSchema,
  bookingIdSchema,
  paymentIdSchema,
};
