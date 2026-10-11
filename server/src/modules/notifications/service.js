const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');

async function list(userId, { page, limit, unreadOnly }) {
  const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, total, unreadCount };
}

async function markRead(userId, id) {
  const result = await prisma.notification.updateMany({
    where: { id, userId },
    data: { readAt: new Date() },
  });
  if (!result.count) throw new AppError('NOT_FOUND', 'Notification not found.', 404);
  return prisma.notification.findUnique({ where: { id } });
}

async function markAllRead(userId) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}

module.exports = { list, markRead, markAllRead };
