const request = require("supertest");
const bcrypt = require("bcryptjs");
const app = require("../../../app");
const prisma = require("../../../lib/prisma");
const { notify } = require("../../../lib/notifications");

const USER_ID = "c9c0ff70-21ce-4e65-a104-a5f31c7f4178";
let token;
let originalSmtpHost;
let originalSmtpPort;

beforeAll(async () => {
  const passwordHash = await bcrypt.hash("NotifyPassword12!", 4);
  await prisma.user.upsert({
    where: { email: "notification-owner@example.com" },
    update: { passwordHash, emailVerified: true },
    create: {
      id: USER_ID,
      name: "Notification Owner",
      email: "notification-owner@example.com",
      passwordHash,
      role: "USER",
      emailVerified: true,
    },
  });
  const login = await request(app)
    .post("/api/auth/login")
    .send({
      email: "notification-owner@example.com",
      password: "NotifyPassword12!",
      role: "USER",
    });
  token = login.body.data.token;
});

afterEach(async () => {
  await prisma.notification.deleteMany({ where: { userId: USER_ID } });
  if (originalSmtpHost === undefined) delete process.env.SMTP_HOST;
  else process.env.SMTP_HOST = originalSmtpHost;
  if (originalSmtpPort === undefined) delete process.env.SMTP_PORT;
  else process.env.SMTP_PORT = originalSmtpPort;
});

beforeEach(() => {
  originalSmtpHost = process.env.SMTP_HOST;
  originalSmtpPort = process.env.SMTP_PORT;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: USER_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
});

it("persists a notification even when SMTP delivery fails", async () => {
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "1";

  const result = await notify(
    USER_ID,
    "GENERAL",
    "Test notice",
    "A persisted test message.",
    { purpose: "test" },
  );

  expect(result.userId).toBe(USER_ID);
  expect(result.emailSentAt).toBeNull();
  expect(await prisma.notification.count({ where: { id: result.id } })).toBe(1);
});

it("lists only the current user notifications and supports unread pagination", async () => {
  await notify(USER_ID, "GENERAL", "Unread", "Unread notice.");
  const response = await request(app)
    .get("/api/notifications?unreadOnly=true&page=1&limit=10")
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(response.body.data).toHaveLength(1);
  expect(response.body.meta.unreadCount).toBe(1);
});

it("marks a notification and all remaining notifications read for the current user", async () => {
  const first = await notify(USER_ID, "GENERAL", "First", "First notice.");
  await notify(USER_ID, "GENERAL", "Second", "Second notice.");

  const marked = await request(app)
    .patch(`/api/notifications/${first.id}/read`)
    .set("Authorization", `Bearer ${token}`);
  expect(marked.status).toBe(200);
  expect(marked.body.data.readAt).toBeTruthy();

  const all = await request(app)
    .post("/api/notifications/read-all")
    .set("Authorization", `Bearer ${token}`);
  expect(all.status).toBe(200);
  expect(all.body.data.updated).toBe(1);
});

it("requires authentication and masks notifications owned by another user", async () => {
  const response = await request(app).get("/api/notifications");
  expect(response.status).toBe(401);

  const unavailable = await request(app)
    .patch("/api/notifications/c9c0ff70-21ce-4e65-a104-a5f31c7f4179/read")
    .set("Authorization", `Bearer ${token}`);
  expect(unavailable.status).toBe(404);
});
