const { z } = require('zod');

const documentType = z.enum(['RC', 'INSURANCE', 'LICENSE', 'PERMIT']);
const documentStatus = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);
const insuranceType = z.enum(['COMMERCIAL', 'PRIVATE']);

const uploadSchema = z.object({
  type: documentType,
  vehicleId: z.string().uuid().optional(),
  insuranceType: insuranceType.optional(),
  documentNumber: z.string().trim().min(1).max(100),
  issueDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date(),
}).strict().superRefine((value, context) => {
  const vehicleDocument = value.type === 'RC' || value.type === 'INSURANCE';
  if (vehicleDocument && !value.vehicleId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['vehicleId'], message: 'Vehicle documents require a vehicle.' });
  }
  if (!vehicleDocument && value.vehicleId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['vehicleId'], message: 'Driver documents cannot be attached to a vehicle.' });
  }
  if (value.type === 'INSURANCE' && !value.insuranceType) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['insuranceType'], message: 'Insurance type is required.' });
  }
  if (value.type !== 'INSURANCE' && value.insuranceType) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['insuranceType'], message: 'Insurance type applies only to insurance documents.' });
  }
  if (value.issueDate && value.issueDate > value.expiryDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['issueDate'], message: 'Issue date must not be after expiry date.' });
  }
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  vehicleId: z.string().uuid().optional(),
  type: documentType.optional(),
  status: documentStatus.optional(),
  includeHistory: z.union([
    z.boolean(),
    z.enum(['true', 'false']).transform((value) => value === 'true'),
  ]).default(false),
}).strict();

const idSchema = z.object({ id: z.string().uuid() }).strict();

module.exports = { uploadSchema, listSchema, idSchema };
