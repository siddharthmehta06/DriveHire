const bcrypt = require('bcryptjs');
const prisma = require('../../lib/prisma');
const { on } = require('../../lib/events');
const { daysUntil, runExpiryScan } = require('../documentExpiry');

const USER_ID = 'e2e2ff70-21ce-4e65-a104-a5f31c7f4172';
const OTHER_USER_ID = 'e3e3ff70-21ce-4e65-a104-a5f31c7f4173';
const BASE_NOW = new Date('2026-01-01T02:00:00.000Z');

it('counts expiry days by the configured Asia/Kolkata calendar date', () => {
  expect(daysUntil(new Date('2026-01-31T00:15:00.000Z'), new Date('2026-01-30T18:45:00.000Z'))).toBe(0);
  expect(daysUntil(new Date('2026-02-01T00:00:00.000Z'), new Date('2026-01-31T18:00:00.000Z'))).toBe(1);
});

async function createDocument(id, { expiryDate, ownerId = USER_ID, supersededAt = null }) {
  return prisma.vehicleDocument.create({
    data: {
      id,
      ownerId,
      type: 'LICENSE',
      documentNumber: id,
      expiryDate,
      fileUrl: `${USER_ID}/${id}`,
      originalName: `${id}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 8,
      status: 'APPROVED',
      supersededAt,
    },
  });
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash('ExpiryPassword12!', 4);
  await prisma.user.upsert({
    where: { email: 'expiry-owner@example.com' },
    update: { passwordHash },
    create: {
      id: USER_ID,
      name: 'Expiry Owner',
      email: 'expiry-owner@example.com',
      passwordHash,
      role: 'DRIVER',
    },
  });
  await prisma.user.upsert({
    where: { email: 'expiry-other@example.com' },
    update: {},
    create: {
      id: OTHER_USER_ID,
      name: 'Other Expiry Owner',
      email: 'expiry-other@example.com',
      passwordHash,
      role: 'DRIVER',
    },
  });
});

afterEach(async () => {
  await prisma.vehicleDocument.deleteMany({ where: { ownerId: { in: [USER_ID, OTHER_USER_ID] } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [USER_ID, OTHER_USER_ID] } } });
});

afterAll(async () => {
  await prisma.vehicleDocument.deleteMany({ where: { ownerId: { in: [USER_ID, OTHER_USER_ID] } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [USER_ID, OTHER_USER_ID] } } });
  await prisma.user.deleteMany({ where: { id: { in: [USER_ID, OTHER_USER_ID] } } });
});

it('sends each 30, 7 and 1 day reminder once across repeated scans', async () => {
  const expiryDate = new Date('2026-01-31T12:00:00.000Z');
  const document = await createDocument('expiry-reminders-1', { expiryDate });
  const otherDocument = await createDocument('expiry-reminders-2', { expiryDate, ownerId: OTHER_USER_ID });

  expect(await runExpiryScan(BASE_NOW)).toEqual({ remindersSent: 2, expiredCount: 0 });
  expect(await runExpiryScan(BASE_NOW)).toEqual({ remindersSent: 0, expiredCount: 0 });
  expect((await prisma.vehicleDocument.findUnique({ where: { id: document.id } })).lastReminderDays).toBe(30);
  expect((await prisma.vehicleDocument.findUnique({ where: { id: otherDocument.id } })).lastReminderDays).toBe(30);

  expect(await runExpiryScan(new Date('2026-01-24T02:00:00.000Z'))).toEqual({ remindersSent: 2, expiredCount: 0 });
  expect(await runExpiryScan(new Date('2026-01-30T02:00:00.000Z'))).toEqual({ remindersSent: 2, expiredCount: 0 });
  expect(await prisma.notification.count({ where: { userId: USER_ID, type: 'DOC_EXPIRY_REMINDER' } })).toBe(3);
  expect(await prisma.notification.count({ where: { userId: OTHER_USER_ID, type: 'DOC_EXPIRY_REMINDER' } })).toBe(3);
  const ownerNotifications = await prisma.notification.findMany({ where: { userId: USER_ID, type: 'DOC_EXPIRY_REMINDER' } });
  expect(ownerNotifications.every((notification) => notification.data.documentId === document.id)).toBe(true);
  expect((await prisma.vehicleDocument.findUnique({ where: { id: document.id } })).lastReminderDays).toBe(1);
});

it('marks expired documents once and emits the expiry event for active documents only', async () => {
  const expired = await createDocument('expiry-past-1', { expiryDate: new Date('2025-12-31T12:00:00.000Z') });
  const superseded = await createDocument('expiry-history-1', {
    expiryDate: new Date('2025-12-31T12:00:00.000Z'),
    supersededAt: new Date('2025-12-01T00:00:00.000Z'),
  });
  const events = [];
  const unsubscribe = on('document.expired', (payload) => events.push(payload));
  try {
    expect(await runExpiryScan(BASE_NOW)).toEqual({ remindersSent: 0, expiredCount: 1 });
    expect(await runExpiryScan(BASE_NOW)).toEqual({ remindersSent: 0, expiredCount: 0 });
    expect((await prisma.vehicleDocument.findUnique({ where: { id: expired.id } })).status).toBe('EXPIRED');
    expect((await prisma.vehicleDocument.findUnique({ where: { id: superseded.id } })).status).toBe('APPROVED');
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(expired.id);
  } finally {
    unsubscribe();
  }
});
