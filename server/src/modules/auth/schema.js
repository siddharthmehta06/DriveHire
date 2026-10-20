const { z } = require("zod");

const loginSchema = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(128),
    role: z.enum(["USER", "DRIVER", "ADMIN"]).optional(),
  })
  .strict();

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be no more than 128 characters.")
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[0-9]/, "Password must include a number.")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character.")
  .refine(
    (value) =>
      !/^(password|password123|qwerty123|letmein123|welcome123)!?$/i.test(
        value,
      ),
    {
      message: "Choose a less common password.",
    },
  );

const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(100),
    email: z
      .string()
      .trim()
      .email("Please enter a valid email address.")
      .max(254),
    phone: z
      .string()
      .trim()
      .regex(
        /^[6-9]\d{9}$/,
        "Please enter a valid 10-digit Indian mobile number.",
      )
      .optional()
      .or(z.literal("")),
    password: passwordSchema,
    role: z.enum(["USER", "DRIVER", "ADMIN"], {
      errorMap: () => ({ message: "Select a supported account type." }),
    }),
    adminInviteCode: z.string().max(128).optional(),
  })
  .strict();

module.exports = {
  loginSchema,
  registerSchema,
};
