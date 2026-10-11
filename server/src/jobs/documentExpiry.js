const prisma = require('../lib/prisma');
const { emit } = require('../lib/events');
const { deliverNotificationEmail } = require('../lib/notifications');

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_THRESHOLDS = [1, 7, 30];

function istDay(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
}

function daysUntil(expiryDate, now) {
  return Math.ceil((istDay(expiryDate) - istDay(now)) / DAY_MS);
}

async function createReminder(document, threshold) {
  const notification = await prisma.$transaction(async (transaction) => {
    const claimed = await transaction.vehicleDocument.updateMany({
      where: {
        id: document.id,
        status: 'APPROVED',
        supersededAt: null,
        OR: [
          { lastReminderDays: null },
          { lastReminderDays: { not: threshold } },
        ],
      },
      data: { lastReminderDays: threshold },
    });
    if (!claimed.count) return null;
    return transaction.notification.create({
      data: {
        userId: document.ownerId,
        type: 'DOC_EXPIRY_REMINDER',
        title: 'Vehicle document expiring soon',
        body: `${document.type} document ${document.documentNumber} expires in ${threshold} day${threshold === 1 ? '' : 's'}.`,
        data: { documentId: document.id, vehicleId: document.vehicleId, daysRemaining: threshold },
      },
    });
  });
  if (notification) await deliverNotificationEmail(notification);
  return Boolean(notification);
}

async function markExpired(document) {
  const updated = await prisma.vehicleDocument.updateMany({
    where: {
      id: document.id,
      status: 'APPROVED',
      supersededAt: null,
      expiryDate: { lte: document.expiryDate },
    },
    data: { status: 'EXPIRED' },
  });
  if (!updated.count) return false;
  emit('document.expired', {
    id: document.id,
    ownerId: document.ownerId,
    vehicleId: document.vehicleId,
    type: document.type,
  });
  return true;
}

async function runExpiryScan(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('Expiry scan requires a valid Date.');
  }

  const expiring = await prisma.vehicleDocument.findMany({
    where: { status: 'APPROVED', supersededAt: null, expiryDate: { gt: now } },
    select: { id: true, ownerId: true, vehicleId: true, type: true, documentNumber: true, expiryDate: true, lastReminderDays: true },
  });
  let remindersSent = 0;
  for (const document of expiring) {
    const remaining = daysUntil(document.expiryDate, now);
    const dueThreshold = REMINDER_THRESHOLDS.find((threshold) => remaining > 0 && remaining <= threshold);
    if (dueThreshold && document.lastReminderDays !== dueThreshold) {
      if (await createReminder(document, dueThreshold)) remindersSent += 1;
    }
  }

  const expired = await prisma.vehicleDocument.findMany({
    where: { status: 'APPROVED', supersededAt: null, expiryDate: { lte: now } },
    select: { id: true, ownerId: true, vehicleId: true, type: true, expiryDate: true },
  });
  let expiredCount = 0;
  for (const document of expired) {
    if (await markExpired(document)) expiredCount += 1;
  }
  return { remindersSent, expiredCount };
}

module.exports = { runExpiryScan, daysUntil };
