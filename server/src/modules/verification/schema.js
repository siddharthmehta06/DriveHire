const { z } = require("zod");

const vehicleIdSchema = z.object({ id: z.string().uuid() }).strict();
const vehicleReviewIdSchema = z
  .object({ vehicleId: z.string().uuid() })
  .strict();
const documentIdSchema = z.object({ id: z.string().uuid() }).strict();
const driverIdSchema = z.object({ userId: z.string().uuid() }).strict();
const rejectSchema = z
  .object({ reason: z.string().trim().min(5).max(500) })
  .strict();
const driverListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    backgroundCheckStatus: z
      .enum(["PENDING", "APPROVED", "REJECTED"])
      .default("PENDING"),
  })
  .strict();
const queueSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
const adminDashboardSchema = z
  .object({
    section: z
      .enum(["USERS", "DRIVERS", "VEHICLES", "DOCUMENTS", "RIDES", "REVIEWS"])
      .default("USERS"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().max(100).optional(),
    status: z.string().trim().max(32).optional(),
  })
  .strict();

module.exports = {
  vehicleIdSchema,
  vehicleReviewIdSchema,
  documentIdSchema,
  driverIdSchema,
  rejectSchema,
  driverListSchema,
  queueSchema,
  adminDashboardSchema,
};
