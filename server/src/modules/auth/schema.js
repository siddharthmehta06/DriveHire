const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
  role: z.enum(['USER', 'DRIVER', 'ADMIN']),
}).strict();

module.exports = { loginSchema };
