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

module.exports = {
  updateCommissionSchema,
  bookingIdSchema,
  paymentIdSchema,
  verifyPaymentSchema,
  mockCompleteSchema,
};
