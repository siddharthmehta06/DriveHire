const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
  role: z.enum(['USER', 'DRIVER', 'ADMIN']),
}).strict();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100),
  email: z.string().trim().email('Please enter a valid email address.').max(254),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number.').optional().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
  role: z.enum(['USER', 'DRIVER'], { errorMap: () => ({ message: 'Account type must be Owner or Driver.' }) }),
}).strict();

module.exports = { loginSchema, registerSchema };
