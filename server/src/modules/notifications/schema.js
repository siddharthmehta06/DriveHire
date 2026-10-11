const { z } = require('zod');

const idSchema = z.object({ id: z.string().uuid() }).strict();
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.union([
    z.boolean(),
    z.enum(['true', 'false']).transform((value) => value === 'true'),
  ]).default(false),
}).strict();

module.exports = { idSchema, listSchema };
