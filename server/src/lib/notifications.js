const nodemailer = require('nodemailer');
const prisma = require('./prisma');
const logger = require('./logger');

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const transportOptions = {
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
  };
  if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    transportOptions.auth = {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    };
  }
  return nodemailer.createTransport(transportOptions);
}

async function deliverNotificationEmail(notification) {
  let transport;
  try {
    transport = createTransport();
  } catch (error) {
    logger.error({ err: error, notificationId: notification.id }, 'Notification email setup failed');
    return notification;
  }
  if (!transport) {
    logger.info({ notificationId: notification.id }, 'Notification email skipped because SMTP is not configured');
    return notification;
  }

  try {
    const recipient = await prisma.user.findUnique({
      where: { id: notification.userId },
      select: { email: true },
    });
    if (!recipient?.email) {
      logger.warn({ notificationId: notification.id }, 'Notification email skipped because the recipient is unavailable');
      return notification;
    }
    await transport.sendMail({
      from: process.env.SMTP_FROM || 'DriveHire <notifications@drivehire.local>',
      to: recipient.email,
      subject: notification.title,
      text: notification.body,
    });
    return prisma.notification.update({
      where: { id: notification.id },
      data: { emailSentAt: new Date() },
    });
  } catch (error) {
    logger.error({ err: error, notificationId: notification.id }, 'Notification email delivery failed');
    return notification;
  } finally {
    transport.close();
  }
}

async function notify(userId, type, title, body, data = undefined) {
  const notification = await prisma.notification.create({
    data: { userId, type, title, body, ...(data ? { data } : {}) },
  });
  return deliverNotificationEmail(notification);
}

module.exports = { notify, deliverNotificationEmail };
