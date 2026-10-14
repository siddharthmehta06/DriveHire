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

const verifyPaymentSchema = z
  .object({
    gatewayPaymentId: z.string().trim().min(1).optional(),
    signature: z.string().trim().min(1).optional(),
    razorpay_payment_id: z.string().trim().min(1).optional(),
    razorpay_signature: z.string().trim().min(1).optional(),
    razorpay_order_id: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine(
    (data) =>
      (data.gatewayPaymentId && data.signature) ||
      (data.razorpay_payment_id && data.razorpay_signature),
    {
      message: 'Must provide gatewayPaymentId and signature (or razorpay_payment_id and razorpay_signature).',
    }
  );

const mockCompleteSchema = z
  .object({
    paymentId: z.string().uuid().optional(),
    gatewayPaymentId: z.string().trim().min(1).optional(),
  })
  .strict();

const promoIdSchema = z.object({
  id: z.string().uuid(),
}).strict();

const createPromoCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(32)
      .transform((val) => val.toUpperCase()),
    discountType: z.enum(['PERCENT', 'FLAT']),
    value: z.coerce.number().positive('Discount value must be greater than zero'),
    maxDiscount: z.coerce.number().positive().optional().nullable(),
    minAmount: z.coerce.number().nonnegative().optional().nullable(),
    usageLimit: z.coerce.number().int().positive().optional().nullable(),
    validFrom: z.string().datetime({ offset: true }),
    validUntil: z.string().datetime({ offset: true }),
    active: z.boolean().optional().default(true),
  })
  .strict()
  .refine(
    (data) => new Date(data.validUntil).getTime() > new Date(data.validFrom).getTime(),
    {
      message: 'validUntil must be after validFrom',
      path: ['validUntil'],
    }
  )
  .refine(
    (data) => {
      if (data.discountType === 'PERCENT' && data.value > 100) {
        return false;
      }
      return true;
    },
    {
      message: 'Percentage discount value cannot exceed 100%',
      path: ['value'],
    }
  );

const updatePromoCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(32)
      .transform((val) => val.toUpperCase())
      .optional(),
    discountType: z.enum(['PERCENT', 'FLAT']).optional(),
    value: z.coerce.number().positive().optional(),
    maxDiscount: z.coerce.number().positive().optional().nullable(),
    minAmount: z.coerce.number().nonnegative().optional().nullable(),
    usageLimit: z.coerce.number().int().positive().optional().nullable(),
    validFrom: z.string().datetime({ offset: true }).optional(),
    validUntil: z.string().datetime({ offset: true }).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.validFrom && data.validUntil) {
        return new Date(data.validUntil).getTime() > new Date(data.validFrom).getTime();
      }
      return true;
    },
    {
      message: 'validUntil must be after validFrom',
      path: ['validUntil'],
    }
  )
  .refine(
    (data) => {
      if (data.discountType === 'PERCENT' && data.value && data.value > 100) {
        return false;
      }
      return true;
    },
    {
      message: 'Percentage discount value cannot exceed 100%',
      path: ['value'],
    }
  );

const promoListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    active: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();

const applyPromoSchema = z
  .object({
    code: z.string().trim().min(1).max(32),
  })
  .strict();

module.exports = {
  updateCommissionSchema,
  bookingIdSchema,
  paymentIdSchema,
  verifyPaymentSchema,
  mockCompleteSchema,
  promoIdSchema,
  createPromoCodeSchema,
  updatePromoCodeSchema,
  promoListQuerySchema,
  applyPromoSchema,
};
