const { z } = require('zod');

<<<<<<< HEAD
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
=======
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
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d
};
