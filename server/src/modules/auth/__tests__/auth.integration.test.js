const request = require("supertest");
const app = require("../../../app");
const prisma = require("../../../lib/prisma");

const email = "otp-registration-test@example.com";
const password = "CorrectHorse9!";

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.OTP_DEV_MODE = "true";
  process.env.SMTP_HOST = "";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-only";
});

beforeEach(async () => {
  await prisma.registrationOtp.deleteMany({ where: { email } });
  await prisma.user.deleteMany({ where: { email } });
});

afterAll(async () => {
  await prisma.registrationOtp.deleteMany({ where: { email } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("registration and login", () => {
  it("registers an account directly with password and role, creating driver profile when applicable", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Demo Driver",
      email,
      phone: "9876543210",
      password,
      role: "DRIVER",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.role).toBe("DRIVER");
    expect(res.body.data.user.email).toBe(email);

    const saved = await prisma.user.findUnique({ where: { email } });
    expect(saved).not.toBeNull();
    expect(
      await prisma.driverProfile.findUnique({
        where: { userId: saved.id },
      }),
    ).not.toBeNull();
  });

  it("enforces password composition and does not allow public admin registration", async () => {
    const weakPassword = await request(app).post("/api/auth/register").send({
      name: "Demo Owner",
      email,
      password: "password",
      role: "USER",
    });
    expect(weakPassword.status).toBe(400);

    const admin = await request(app).post("/api/auth/register").send({
      name: "Demo Admin",
      email,
      password,
      role: "ADMIN",
    });
    expect(admin.status).toBe(403);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it("derives login role from the database and allows sign-in", async () => {
    const registered = await request(app).post("/api/auth/register").send({
      name: "Demo Driver",
      email,
      password,
      role: "DRIVER",
    });
    expect(registered.status).toBe(201);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe("DRIVER");

    const legacyRoleChoice = await request(app)
      .post("/api/auth/login")
      .send({ email, password, role: "USER" });
    expect(legacyRoleChoice.status).toBe(200);
    expect(legacyRoleChoice.body.data.user.role).toBe("DRIVER");
  });
});
