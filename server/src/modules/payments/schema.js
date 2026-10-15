const { z } = require('zod');

const paymentByBookingSchema = {
  params: z.object({
    bookingId: z.string().uuid(),
  }),
};

const paymentIdSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

const payMethodSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

const confirmCashSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

const applyPromoSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    code: z.string().trim().min(1).max(50),
  }).strict(),
};

const adminCommissionSchema = z.object({
  commissionRatePct: z.number().min(0).max(50),
}).strict();

const adminPromoCreateSchema = z.object({
  code: z.string().trim().min(2).max(50),
  discountType: z.enum(['PERCENT', 'FLAT']),
  value: z.number().positive(),
  maxDiscount: z.number().positive().optional().nullable(),
  minAmount: z.number().min(0).optional().nullable(),
  usageLimit: z.number().int().positive().optional().nullable(),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
}).strict();

const adminPromoUpdateSchema = z.object({
  active: z.boolean().optional(),
  usageLimit: z.number().int().positive().optional().nullable(),
  validUntil: z.string().datetime().optional(),
}).strict();

module.exports = {
  paymentByBookingSchema,
  paymentIdSchema,
  payMethodSchema,
  confirmCashSchema,
  applyPromoSchema,
  adminCommissionSchema,
  adminPromoCreateSchema,
  adminPromoUpdateSchema,
};
