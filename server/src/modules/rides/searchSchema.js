const { z } = require('zod');

const searchQuerySchema = z.object({
  destination: z.string().trim().min(1).max(160).optional(),
  origin: z.string().trim().min(1).max(160).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeFrom: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  timeTo: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  seats: z.coerce.number().int().min(1).max(8).default(1),
  maxPrice: z.coerce.number().finite().min(0).max(10000).optional(),
  lat: z.coerce.number().finite().min(-90).max(90).optional(),
  lng: z.coerce.number().finite().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().finite().positive().max(500).default(10),
  sort: z.enum(['time', 'price']).default('time'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict().superRefine((query, context) => {
  if ((query.lat === undefined) !== (query.lng === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Latitude and longitude must be supplied together.',
      path: ['lat'],
    });
  }
  if (query.timeFrom && query.timeTo && query.timeFrom >= query.timeTo) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End time must be later than start time.',
      path: ['timeTo'],
    });
  }
  if (query.date) {
    const parsed = new Date(`${query.date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== query.date) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Date must be a valid calendar day.',
        path: ['date'],
      });
    }
  }
});

module.exports = { searchQuerySchema };
