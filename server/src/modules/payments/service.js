const prisma = require('../../lib/prisma');
const { Prisma } = require('@prisma/client');
const { AppError } = require('../../lib/errors');
const { notify } = require('../../lib/notifications');
const logger = require('../../lib/logger');
const { getAmountStrategy } = require('./strategies');

async function ensureReceiptSequence() {
  try {
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START WITH 1 INCREMENT BY 1;`);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create or verify receipt_number_seq');
  }
}

async function getCommissionConfig() {
  let config = await prisma.pricingConfig.findUnique({
    where: { id: 1 },
    include: {
      updatedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!config) {
    config = await prisma.pricingConfig.create({
      data: {
        id: 1,
        commissionRatePct: new Prisma.Decimal('10.00'),
      },
      include: {
        updatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  return {
    id: config.id,
    commissionRatePct: config.commissionRatePct.toString(),
    updatedById: config.updatedById,
    updatedBy: config.updatedBy,
    updatedAt: config.updatedAt,
  };
}

async function updateCommissionConfig({ commissionRatePct, adminId }) {
  const decimalRate = new Prisma.Decimal(commissionRatePct);
  if (decimalRate.lessThan(0) || decimalRate.greaterThan(50)) {
    throw new AppError('VALIDATION_ERROR', 'Commission rate must be between 0 and 50 percent.', 400);
  }

  const updated = await prisma.pricingConfig.upsert({
    where: { id: 1 },
    update: {
      commissionRatePct: decimalRate,
      updatedById: adminId,
    },
    create: {
      id: 1,
      commissionRatePct: decimalRate,
      updatedById: adminId,
    },
    include: {
      updatedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return {
    id: updated.id,
    commissionRatePct: updated.commissionRatePct.toString(),
    updatedById: updated.updatedById,
    updatedBy: updated.updatedBy,
    updatedAt: updated.updatedAt,
  };
}

async function createPaymentForBooking(bookingId) {
  // Idempotency: check if payment already exists for this booking
  const existing = await prisma.payment.findUnique({
    where: { bookingId },
  });
  if (existing) {
    return existing;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      rideBooking: {
        include: {
          ride: true,
        },
      },
    },
  });

  if (!booking) {
    throw new AppError('NOT_FOUND', `Booking ${bookingId} not found.`, 404);
  }

  let payeeId;
  if (booking.type === 'RIDE') {
    payeeId = booking.rideBooking?.ride?.driverId;
  }

  if (!payeeId) {
    throw new AppError('UNPROCESSABLE', 'Payee could not be resolved for booking.', 422);
  }

  const strategy = getAmountStrategy(booking.type);
  const baseAmount = strategy(booking);

  const config = await getCommissionConfig();
  const commissionRatePct = new Prisma.Decimal(config.commissionRatePct);

  const discountAmount = new Prisma.Decimal('0.00');
  const amount = baseAmount.minus(discountAmount);

  // commission = round half-up(amount * rate / 100); payee = amount - commission
  const commissionAmount = amount
    .times(commissionRatePct)
    .dividedBy(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const payeeAmount = amount.minus(commissionAmount);

  try {
    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        payerId: booking.userId,
        payeeId,
        baseAmount,
        discountAmount,
        amount,
        commissionRatePct,
        commissionAmount,
        payeeAmount,
        status: 'PENDING',
      },
    });

    await notify(
      booking.userId,
      'PAYMENT_RECEIPT',
      'Payment Pending',
      `Your ride booking has completed. Total payable: ₹${amount.toFixed(2)}. Please complete payment.`,
      {
        bookingId: booking.id,
        paymentId: payment.id,
        amount: amount.toString(),
      }
    ).catch((err) => {
      logger.warn({ err, paymentId: payment.id }, 'Failed to dispatch payment pending notification');
    });

    return payment;
  } catch (err) {
    if (err.code === 'P2002') {
      // Duplicate event handled cleanly
      return prisma.payment.findUnique({ where: { bookingId: booking.id } });
    }
    throw err;
  }
}

async function getPaymentByBookingId(bookingId, userId, userRole) {
  const payment = await prisma.payment.findUnique({
    where: { bookingId },
    include: {
      promoCode: true,
    },
  });

  if (!payment) {
    throw new AppError('NOT_FOUND', 'Payment not found.', 404);
  }

  const isPayer = payment.payerId === userId;
  const isPayee = payment.payeeId === userId;
  const isAdmin = String(userRole || '').toUpperCase() === 'ADMIN';

  if (!isPayer && !isPayee && !isAdmin) {
    throw new AppError('NOT_FOUND', 'Payment not found.', 404);
  }

  return {
    ...payment,
    baseAmount: payment.baseAmount.toString(),
    discountAmount: payment.discountAmount.toString(),
    amount: payment.amount.toString(),
    commissionRatePct: payment.commissionRatePct.toString(),
    commissionAmount: payment.commissionAmount.toString(),
    payeeAmount: payment.payeeAmount.toString(),
    availableMethods: ['ONLINE', 'CASH'],
  };
}

module.exports = {
  ensureReceiptSequence,
  getCommissionConfig,
  updateCommissionConfig,
  createPaymentForBooking,
  getPaymentByBookingId,
};
