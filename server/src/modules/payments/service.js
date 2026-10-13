const prisma = require('../../lib/prisma');
const { Prisma } = require('@prisma/client');
const { AppError } = require('../../lib/errors');
const { notify } = require('../../lib/notifications');
const { emit } = require('../../lib/events');
const { emitToUser } = require('../../lib/realtime');
const logger = require('../../lib/logger');
const { getAmountStrategy } = require('./strategies');
const { getPaymentGateway, RazorpayPaymentGateway } = require('./gateway');

async function ensureReceiptSequence() {
  try {
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START WITH 1 INCREMENT BY 1;`);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create or verify receipt_number_seq');
  }
}

async function generateReceiptNumber(tx) {
  const today = new Date();
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');

  const result = await tx.$queryRawUnsafe(`SELECT nextval('receipt_number_seq') AS seq;`);
  const seqNum = String(result[0].seq).padStart(6, '0');
  return `DH-${yyyy}${mm}${dd}-${seqNum}`;
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
  // Idempotency: return existing payment if already created
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

async function payOnline(paymentId, userId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { booking: true },
  });

  if (!payment || payment.payerId !== userId) {
    throw new AppError('NOT_FOUND', 'Payment record not found.', 404);
  }

  if (payment.status === 'SUCCEEDED') {
    throw new AppError('CONFLICT', 'Payment has already succeeded.', 409);
  }

  if (payment.status === 'CANCELLED') {
    throw new AppError('UNPROCESSABLE', 'Payment has been cancelled.', 422);
  }

  const gateway = getPaymentGateway();
  const order = await gateway.createOrder({
    amount: payment.amount,
    receipt: payment.id,
    notes: {
      bookingId: payment.bookingId,
      payerId: payment.payerId,
    },
  });

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      method: 'ONLINE',
      status: 'PROCESSING',
      gatewayProvider: gateway.provider,
      gatewayOrderId: order.orderId,
    },
  });

  return {
    orderId: order.orderId,
    keyId: order.keyId,
    amount: updated.amount.toString(),
    currency: order.currency || 'INR',
    paymentId: updated.id,
    status: updated.status,
  };
}

async function processPaymentSuccess(paymentId, { gatewayPaymentId, method = 'ONLINE' } = {}) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { booking: true },
    });

    if (!current) {
      throw new AppError('NOT_FOUND', 'Payment not found.', 404);
    }

    if (current.status === 'SUCCEEDED') {
      // Idempotent: already marked as SUCCEEDED
      return current;
    }

    const receiptNumber = current.receiptNumber || (await generateReceiptNumber(tx));
    const paidAt = new Date();
    const effectiveMethod = method || current.method || 'ONLINE';

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'SUCCEEDED',
        method: effectiveMethod,
        paidAt,
        receiptNumber,
        ...(gatewayPaymentId ? { gatewayPaymentId } : {}),
      },
      include: { booking: true },
    });

    const isOnline = effectiveMethod === 'ONLINE';
    const existingEntry = await tx.earningEntry.findUnique({
      where: { paymentId },
    });

    if (!existingEntry) {
      await tx.earningEntry.create({
        data: {
          earnerId: updated.payeeId,
          paymentId: updated.id,
          bookingType: updated.booking.type,
          grossAmount: updated.amount,
          commissionAmount: updated.commissionAmount,
          netAmount: updated.payeeAmount,
          withdrawable: isOnline,
        },
      });

      const netAmount = updated.payeeAmount;
      await tx.earningsAccount.upsert({
        where: { userId: updated.payeeId },
        update: {
          totalEarned: { increment: netAmount },
          ...(isOnline ? { withdrawableBalance: { increment: netAmount } } : {}),
        },
        create: {
          userId: updated.payeeId,
          totalEarned: netAmount,
          withdrawableBalance: isOnline ? netAmount : new Prisma.Decimal('0.00'),
        },
      });
    }

    return updated;
  });

  // Emitted after transaction commits successfully
  emit('payment.succeeded', { paymentId: result.id, payment: result }).catch(() => {});
  emitToUser(result.payerId, 'payment:succeeded', result);

  notify(
    result.payerId,
    'PAYMENT_RECEIPT',
    'Payment Confirmed',
    `Your payment of ₹${result.amount.toString()} has been confirmed. Receipt #${result.receiptNumber}.`,
    {
      paymentId: result.id,
      receiptNumber: result.receiptNumber,
      bookingId: result.bookingId,
    }
  ).catch((err) => {
    logger.warn({ err, paymentId: result.id }, 'Failed to dispatch payment success notification');
  });

  return result;
}

async function verifyPayment(paymentId, userId, payload) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { booking: true },
  });

  if (!payment || payment.payerId !== userId) {
    throw new AppError('NOT_FOUND', 'Payment not found.', 404);
  }

  if (payment.status === 'SUCCEEDED') {
    return {
      ...payment,
      baseAmount: payment.baseAmount.toString(),
      discountAmount: payment.discountAmount.toString(),
      amount: payment.amount.toString(),
      commissionRatePct: payment.commissionRatePct.toString(),
      commissionAmount: payment.commissionAmount.toString(),
      payeeAmount: payment.payeeAmount.toString(),
    };
  }

  if (!payment.gatewayOrderId) {
    throw new AppError('UNPROCESSABLE', 'No online payment order exists for this payment.', 422);
  }

  const effectivePaymentId = payload.gatewayPaymentId || payload.razorpay_payment_id;
  const effectiveSignature = payload.signature || payload.razorpay_signature;

  if (!effectivePaymentId || !effectiveSignature) {
    throw new AppError('VALIDATION_ERROR', 'Missing payment id or signature.', 400);
  }

  const gateway = getPaymentGateway(payment.gatewayProvider || process.env.PAYMENT_PROVIDER);
  const isValid = gateway.verifySignature({
    orderId: payment.gatewayOrderId,
    paymentId: effectivePaymentId,
    signature: effectiveSignature,
  });

  if (!isValid) {
    throw new AppError('VALIDATION_ERROR', 'Payment verification failed: invalid signature.', 400);
  }

  const succeeded = await processPaymentSuccess(payment.id, {
    gatewayPaymentId: effectivePaymentId,
    method: 'ONLINE',
  });

  return {
    ...succeeded,
    baseAmount: succeeded.baseAmount.toString(),
    discountAmount: succeeded.discountAmount.toString(),
    amount: succeeded.amount.toString(),
    commissionRatePct: succeeded.commissionRatePct.toString(),
    commissionAmount: succeeded.commissionAmount.toString(),
    payeeAmount: succeeded.payeeAmount.toString(),
  };
}

async function handleRazorpayWebhook(rawBody, signature, eventPayload) {
  const gateway = new RazorpayPaymentGateway();
  const isValid = gateway.verifyWebhookSignature({
    rawBody,
    signature,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  });

  if (!isValid) {
    throw new AppError('VALIDATION_ERROR', 'Invalid webhook signature.', 400);
  }

  const orderId =
    eventPayload?.payload?.payment?.entity?.order_id ||
    eventPayload?.payload?.order?.entity?.id;
  const gatewayPaymentId = eventPayload?.payload?.payment?.entity?.id;

  if (!orderId) {
    return { received: true, unhandled: true };
  }

  const payment = await prisma.payment.findUnique({
    where: { gatewayOrderId: orderId },
  });

  if (!payment) {
    return { received: true, orderNotFound: true };
  }

  if (payment.status === 'SUCCEEDED') {
    return { received: true, alreadyProcessed: true };
  }

  await processPaymentSuccess(payment.id, {
    gatewayPaymentId,
    method: 'ONLINE',
  });

  return { received: true, processed: true };
}

async function payCash(paymentId, userId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment || payment.payerId !== userId) {
    throw new AppError('NOT_FOUND', 'Payment not found.', 404);
  }

  if (payment.status === 'SUCCEEDED') {
    throw new AppError('CONFLICT', 'Payment has already succeeded.', 409);
  }

  if (payment.status === 'CANCELLED') {
    throw new AppError('UNPROCESSABLE', 'Payment has been cancelled.', 422);
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      method: 'CASH',
      status: 'PENDING',
    },
  });

  return {
    ...updated,
    baseAmount: updated.baseAmount.toString(),
    discountAmount: updated.discountAmount.toString(),
    amount: updated.amount.toString(),
    commissionRatePct: updated.commissionRatePct.toString(),
    commissionAmount: updated.commissionAmount.toString(),
    payeeAmount: updated.payeeAmount.toString(),
  };
}

async function confirmCash(paymentId, userId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    throw new AppError('NOT_FOUND', 'Payment not found.', 404);
  }

  if (payment.payeeId !== userId) {
    throw new AppError('FORBIDDEN', 'Only the payee can confirm cash payment.', 403);
  }

  if (payment.status === 'SUCCEEDED') {
    // Idempotent return
    return {
      ...payment,
      baseAmount: payment.baseAmount.toString(),
      discountAmount: payment.discountAmount.toString(),
      amount: payment.amount.toString(),
      commissionRatePct: payment.commissionRatePct.toString(),
      commissionAmount: payment.commissionAmount.toString(),
      payeeAmount: payment.payeeAmount.toString(),
    };
  }

  if (payment.method !== 'CASH') {
    throw new AppError('UNPROCESSABLE', 'Payment method is not set to CASH.', 422);
  }

  if (payment.status !== 'PENDING') {
    throw new AppError('CONFLICT', `Cannot confirm cash for payment with status ${payment.status}.`, 409);
  }

  const succeeded = await processPaymentSuccess(payment.id, {
    method: 'CASH',
  });

  return {
    ...succeeded,
    baseAmount: succeeded.baseAmount.toString(),
    discountAmount: succeeded.discountAmount.toString(),
    amount: succeeded.amount.toString(),
    commissionRatePct: succeeded.commissionRatePct.toString(),
    commissionAmount: succeeded.commissionAmount.toString(),
    payeeAmount: succeeded.payeeAmount.toString(),
  };
}

async function completeMockPayment(paymentId, userId, payload = {}) {
  const isMock = (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase() === 'mock';
  const isDev = process.env.NODE_ENV !== 'production';

  if (!isMock || !isDev) {
    throw new AppError('FORBIDDEN', 'Mock completion is only allowed in development with mock provider.', 403);
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment || payment.payerId !== userId) {
    throw new AppError('NOT_FOUND', 'Payment not found.', 404);
  }

  if (payment.status === 'SUCCEEDED') {
    return {
      ...payment,
      baseAmount: payment.baseAmount.toString(),
      discountAmount: payment.discountAmount.toString(),
      amount: payment.amount.toString(),
      commissionRatePct: payment.commissionRatePct.toString(),
      commissionAmount: payment.commissionAmount.toString(),
      payeeAmount: payment.payeeAmount.toString(),
    };
  }

  const mockGatewayPaymentId = payload.gatewayPaymentId || `pay_mock_${Date.now()}`;
  const succeeded = await processPaymentSuccess(payment.id, {
    gatewayPaymentId: mockGatewayPaymentId,
    method: 'ONLINE',
  });

  return {
    ...succeeded,
    baseAmount: succeeded.baseAmount.toString(),
    discountAmount: succeeded.discountAmount.toString(),
    amount: succeeded.amount.toString(),
    commissionRatePct: succeeded.commissionRatePct.toString(),
    commissionAmount: succeeded.commissionAmount.toString(),
    payeeAmount: succeeded.payeeAmount.toString(),
  };
}

module.exports = {
  ensureReceiptSequence,
  getCommissionConfig,
  updateCommissionConfig,
  createPaymentForBooking,
  getPaymentByBookingId,
  payOnline,
  verifyPayment,
  processPaymentSuccess,
  handleRazorpayWebhook,
  payCash,
  confirmCash,
  completeMockPayment,
};
