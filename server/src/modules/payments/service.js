<<<<<<< HEAD
const { Prisma } = require('@prisma/client');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { notify } = require('../../lib/notifications');
const logger = require('../../lib/logger');

// --- Amount strategies ---
const amountStrategies = new Map();

function registerAmountStrategy(bookingType, fn) {
  amountStrategies.set(bookingType, fn);
}

// RIDE strategy: seatsBooked × costPerSeat
registerAmountStrategy('RIDE', async (booking) => {
  const rb = booking.rideBooking || await prisma.rideBooking.findUnique({
    where: { bookingId: booking.id },
    include: { ride: true },
  });
  if (!rb || !rb.ride) throw new Error('Ride booking data missing');
  return new Prisma.Decimal(rb.seatsBooked).mul(rb.ride.costPerSeat);
});

// --- Mock gateway ---
const mockGateway = {
  createOrder({ amount, receipt }) {
    return {
      orderId: `mock_order_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      keyId: 'mock_key',
      amount: Number(amount),
      receipt,
    };
  },
  verifySignature() {
    return true; // mock always verifies
  },
};

function getGateway() {
  return mockGateway;
}

// --- Receipt number generation ---
let receiptCounter = 0;
async function generateReceiptNumber() {
  receiptCounter++;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(receiptCounter).padStart(6, '0');
  return `DH-${dateStr}-${seq}`;
}

// --- Get or compute commission rate ---
async function getCommissionRate() {
  const config = await prisma.pricingConfig.findUnique({ where: { id: 1 } });
  return config ? config.commissionRatePct : new Prisma.Decimal(10);
}

// --- Create payment on booking completion ---
async function createPaymentForBooking(bookingId, booking, ride) {
  // Prevent duplicate
  const existing = await prisma.payment.findUnique({ where: { bookingId } });
  if (existing) return existing;

  const strategy = amountStrategies.get(booking.type);
  if (!strategy) {
    logger.warn({ bookingId, type: booking.type }, 'No amount strategy for booking type');
    return null;
  }

  const baseAmount = await strategy(booking);
  const commissionRate = await getCommissionRate();

  // commission = round half-up(amount × rate / 100)
  const commissionAmount = baseAmount.mul(commissionRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const payeeAmount = baseAmount.sub(commissionAmount);

  // Determine payer and payee
  const payerId = booking.userId; // passenger
  const payeeId = ride.driverId;  // driver/owner

  const payment = await prisma.payment.create({
    data: {
      bookingId,
      payerId,
      payeeId,
      baseAmount,
      discountAmount: 0,
      amount: baseAmount,
      commissionRatePct: commissionRate,
      commissionAmount,
      payeeAmount,
      status: 'PENDING',
    },
  });

  // Notify payer
  notify(payerId, 'PAYMENT_RECEIPT', 'Payment Due',
    `Your ride is completed. Please complete the payment of ₹${Number(baseAmount).toLocaleString('en-IN')}.`,
    { paymentId: payment.id, bookingId }
  ).catch(() => {});

  return payment;
}

// --- Get payment by booking ---
async function getPaymentByBooking(userId, bookingId) {
  const payment = await prisma.payment.findUnique({
    where: { bookingId },
    include: { booking: true },
  });
  if (!payment) throw new AppError('NOT_FOUND', 'Payment not found for this booking.', 404);
  if (payment.payerId !== userId && payment.payeeId !== userId) {
    throw new AppError('NOT_FOUND', 'Payment not found.', 404);
  }
  return payment;
}

// --- Get payment by ID ---
async function getPaymentById(userId, paymentId) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new AppError('NOT_FOUND', 'Payment not found.', 404);
  if (payment.payerId !== userId && payment.payeeId !== userId) {
    throw new AppError('NOT_FOUND', 'Payment not found.', 404);
  }
  return payment;
}

// --- Pay online (mock) ---
async function payOnline(userId, paymentId) {
  const payment = await getPaymentById(userId, paymentId);
  if (payment.payerId !== userId) {
    throw new AppError('FORBIDDEN', 'Only the payer can pay.', 403);
  }
  if (payment.status !== 'PENDING') {
    throw new AppError('CONFLICT', 'Payment is not in a payable state.', 409);
  }

  const gateway = getGateway();
  const order = gateway.createOrder({
    amount: Number(payment.amount),
    receipt: `booking-${payment.bookingId}`,
  });

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      method: 'ONLINE',
      status: 'PROCESSING',
      gatewayProvider: 'mock',
=======
const prisma = require('../../lib/prisma');
const { Prisma } = require('@prisma/client');
const { AppError } = require('../../lib/errors');
const { notify } = require('../../lib/notifications');
const { emit } = require('../../lib/events');
const { emitToUser } = require('../../lib/realtime');
const logger = require('../../lib/logger');
const { getAmountStrategy } = require('./strategies');
const { getPaymentGateway, RazorpayPaymentGateway } = require('./gateway');
const { generateReceiptPdf } = require('./receiptPdf');

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

async function getPaymentById(paymentId, userId, userRole) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      promoCode: true,
      booking: true,
      payer: { select: { id: true, name: true, email: true } },
      payee: { select: { id: true, name: true, email: true } },
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
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d
      gatewayOrderId: order.orderId,
    },
  });

<<<<<<< HEAD
  return { payment: updated, order };
}

// --- Mock complete (only in dev) ---
async function mockComplete(userId, paymentId) {
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('FORBIDDEN', 'Not available in production.', 403);
  }

  const payment = await getPaymentById(userId, paymentId);
  if (payment.payerId !== userId) {
    throw new AppError('FORBIDDEN', 'Only the payer can complete payment.', 403);
  }
  if (payment.status !== 'PROCESSING' && payment.status !== 'PENDING') {
    throw new AppError('CONFLICT', 'Payment cannot be completed in this state.', 409);
  }

  return finalizePaymentSuccess(paymentId, payment.method || 'ONLINE');
}

// --- Pay cash ---
async function payCash(userId, paymentId) {
  const payment = await getPaymentById(userId, paymentId);
  if (payment.payerId !== userId) {
    throw new AppError('FORBIDDEN', 'Only the payer can choose payment method.', 403);
  }
  if (payment.status !== 'PENDING') {
    throw new AppError('CONFLICT', 'Payment is not in a payable state.', 409);
  }

  return prisma.payment.update({
    where: { id: paymentId },
    data: { method: 'CASH', status: 'PENDING' },
  });
}

// --- Confirm cash (payee confirms they received cash) ---
async function confirmCash(userId, paymentId) {
  const payment = await getPaymentById(userId, paymentId);
  if (payment.payeeId !== userId) {
    throw new AppError('FORBIDDEN', 'Only the payee can confirm cash receipt.', 403);
  }
  if (payment.method !== 'CASH') {
    throw new AppError('CONFLICT', 'This is not a cash payment.', 409);
  }
  if (payment.status === 'SUCCEEDED') {
    return payment; // idempotent
  }
  if (payment.status !== 'PENDING') {
    throw new AppError('CONFLICT', 'Payment cannot be confirmed in this state.', 409);
  }

  return finalizePaymentSuccess(paymentId, 'CASH');
}

// --- Finalize payment success (shared for online and cash) ---
async function finalizePaymentSuccess(paymentId, method) {
  const receiptNumber = await generateReceiptNumber();

  const result = await prisma.$transaction(async (tx) => {
    // Re-check inside tx to prevent double processing
    const current = await tx.payment.findUnique({ where: { id: paymentId } });
    if (current.status === 'SUCCEEDED') return current; // idempotent
=======
  return {
    orderId: order.orderId,
    keyId: order.keyId,
    amount: updated.amount.toString(),
    currency: order.currency || 'INR',
    paymentId: updated.id,
    status: updated.status,
    provider: gateway.provider,
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
      return current;
    }

    // If promo code applied, enforce usage limits and consume usage
    if (current.promoCodeId) {
      const promo = await tx.promoCode.findUnique({
        where: { id: current.promoCodeId },
      });
      if (promo) {
        if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) {
          throw new AppError('CONFLICT', 'Promo code usage limit has been reached.', 409);
        }
        await tx.promoCode.update({
          where: { id: promo.id },
          data: {
            usedCount: { increment: 1 },
          },
        });
      }
    }

    const receiptNumber = current.receiptNumber || (await generateReceiptNumber(tx));
    const paidAt = new Date();
    const effectiveMethod = method || current.method || 'ONLINE';
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'SUCCEEDED',
<<<<<<< HEAD
        method: method,
        paidAt: new Date(),
        receiptNumber,
      },
    });

    // Create earning entry
    const withdrawable = method === 'ONLINE';
    await tx.earningEntry.create({
      data: {
        earnerId: updated.payeeId,
        paymentId: updated.id,
        bookingType: 'RIDE',
        grossAmount: updated.baseAmount,
        commissionAmount: updated.commissionAmount,
        netAmount: updated.payeeAmount,
        withdrawable,
      },
    });

    // Upsert earnings account
    const incrementData = withdrawable
      ? { withdrawableBalance: { increment: Number(updated.payeeAmount) }, totalEarned: { increment: Number(updated.payeeAmount) } }
      : { totalEarned: { increment: Number(updated.payeeAmount) } };

    await tx.earningsAccount.upsert({
      where: { userId: updated.payeeId },
      create: {
        userId: updated.payeeId,
        withdrawableBalance: withdrawable ? updated.payeeAmount : 0,
        totalEarned: updated.payeeAmount,
      },
      update: incrementData,
    });
=======
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
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d

    return updated;
  });

<<<<<<< HEAD
  // Notify
  notify(result.payerId, 'PAYMENT_RECEIPT', 'Payment Successful',
    `Your payment of ₹${Number(result.amount).toLocaleString('en-IN')} was successful. Receipt: ${result.receiptNumber}`,
    { paymentId: result.id, receiptNumber: result.receiptNumber }
  ).catch(() => {});
=======
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
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d

  return result;
}

<<<<<<< HEAD
// --- Get receipt ---
async function getReceipt(userId, paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: {
        include: {
          rideBooking: {
            include: {
              ride: {
                include: {
                  vehicle: { select: { make: true, model: true, registrationNumber: true } },
                },
              },
            },
          },
        },
      },
      payer: { select: { name: true, email: true } },
      payee: { select: { name: true, email: true } },
    },
  });

  if (!payment) throw new AppError('NOT_FOUND', 'Payment not found.', 404);
  if (payment.payerId !== userId && payment.payeeId !== userId) {
    throw new AppError('NOT_FOUND', 'Payment not found.', 404);
  }
  if (payment.status !== 'SUCCEEDED') {
    throw new AppError('UNPROCESSABLE', 'Receipt is available only after payment.', 422);
  }

  return payment;
}

// --- Admin: get/update commission ---
async function getCommission() {
  const config = await prisma.pricingConfig.findUnique({ where: { id: 1 } });
  return config || { id: 1, commissionRatePct: 10 };
}

async function updateCommission(adminId, commissionRatePct) {
  return prisma.pricingConfig.upsert({
    where: { id: 1 },
    create: { commissionRatePct, updatedById: adminId },
    update: { commissionRatePct, updatedById: adminId },
  });
}

// --- Admin: promo CRUD ---
async function listPromoCodes() {
  return prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
}

async function createPromoCode(data) {
  return prisma.promoCode.create({
    data: {
      code: data.code.toUpperCase(),
      discountType: data.discountType,
      value: data.value,
      maxDiscount: data.maxDiscount || null,
      minAmount: data.minAmount || null,
      usageLimit: data.usageLimit || null,
      validFrom: new Date(data.validFrom),
      validUntil: new Date(data.validUntil),
    },
  });
}

async function updatePromoCode(id, data) {
  const promo = await prisma.promoCode.findUnique({ where: { id } });
  if (!promo) throw new AppError('NOT_FOUND', 'Promo code not found.', 404);

  const updateData = {};
  if (typeof data.active === 'boolean') updateData.active = data.active;
  if (data.usageLimit !== undefined) updateData.usageLimit = data.usageLimit;
  if (data.validUntil) updateData.validUntil = new Date(data.validUntil);

  return prisma.promoCode.update({ where: { id }, data: updateData });
}

// --- Apply promo ---
async function applyPromo(userId, paymentId, code) {
  const payment = await getPaymentById(userId, paymentId);
  if (payment.payerId !== userId) {
    throw new AppError('FORBIDDEN', 'Only the payer can apply a promo code.', 403);
  }
  if (payment.status !== 'PENDING') {
    throw new AppError('CONFLICT', 'Promo can only be applied before payment.', 409);
  }

  const promo = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } });
  if (!promo || !promo.active) {
    throw new AppError('VALIDATION_ERROR', 'Invalid or expired promo code.', 400);
  }

  const now = new Date();
  if (now < promo.validFrom || now > promo.validUntil) {
    throw new AppError('VALIDATION_ERROR', 'Promo code is not currently valid.', 400);
  }

  if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
    throw new AppError('VALIDATION_ERROR', 'Promo code usage limit reached.', 400);
  }

  if (promo.minAmount && payment.baseAmount.lt(promo.minAmount)) {
    throw new AppError('VALIDATION_ERROR', `Minimum amount of ₹${promo.minAmount} required.`, 400);
  }

  // Calculate discount
  let discount;
  if (promo.discountType === 'PERCENT') {
    discount = payment.baseAmount.mul(promo.value).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if (promo.maxDiscount && discount.gt(promo.maxDiscount)) {
      discount = new Prisma.Decimal(promo.maxDiscount);
    }
  } else {
    discount = new Prisma.Decimal(promo.value);
  }

  // Discount never exceeds base amount
  if (discount.gt(payment.baseAmount)) {
    discount = payment.baseAmount;
  }

  const newAmount = payment.baseAmount.sub(discount);
  const commissionAmount = newAmount.mul(payment.commissionRatePct).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const payeeAmount = newAmount.sub(commissionAmount);

  return prisma.payment.update({
    where: { id: paymentId },
    data: {
      promoCodeId: promo.id,
      discountAmount: discount,
      amount: newAmount,
      commissionAmount,
      payeeAmount,
    },
  });
}

// --- Remove promo ---
async function removePromo(userId, paymentId) {
  const payment = await getPaymentById(userId, paymentId);
  if (payment.payerId !== userId) {
    throw new AppError('FORBIDDEN', 'Only the payer can remove a promo code.', 403);
  }
  if (payment.status !== 'PENDING') {
    throw new AppError('CONFLICT', 'Promo can only be removed before payment.', 409);
  }

  const commissionAmount = payment.baseAmount.mul(payment.commissionRatePct).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const payeeAmount = payment.baseAmount.sub(commissionAmount);

  return prisma.payment.update({
    where: { id: paymentId },
    data: {
      promoCodeId: null,
      discountAmount: 0,
      amount: payment.baseAmount,
=======
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

// ---------------- Promo Code Management ---------------- //

async function listPromoCodes({ page = 1, limit = 20, active }) {
  const where = {};
  if (typeof active === 'boolean') {
    where.active = active;
  }

  const [items, total] = await Promise.all([
    prisma.promoCode.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { validFrom: 'desc' },
    }),
    prisma.promoCode.count({ where }),
  ]);

  return {
    items: items.map((p) => ({
      ...p,
      value: p.value.toString(),
      maxDiscount: p.maxDiscount ? p.maxDiscount.toString() : null,
      minAmount: p.minAmount ? p.minAmount.toString() : null,
    })),
    total,
    page,
    limit,
  };
}

async function createPromoCode(data) {
  const existing = await prisma.promoCode.findUnique({
    where: { code: data.code },
  });

  if (existing) {
    throw new AppError('CONFLICT', `Promo code ${data.code} already exists.`, 409);
  }

  const created = await prisma.promoCode.create({
    data: {
      code: data.code,
      discountType: data.discountType,
      value: new Prisma.Decimal(data.value),
      maxDiscount: data.maxDiscount ? new Prisma.Decimal(data.maxDiscount) : null,
      minAmount: data.minAmount ? new Prisma.Decimal(data.minAmount) : null,
      usageLimit: data.usageLimit ?? null,
      validFrom: new Date(data.validFrom),
      validUntil: new Date(data.validUntil),
      active: data.active ?? true,
    },
  });

  return {
    ...created,
    value: created.value.toString(),
    maxDiscount: created.maxDiscount ? created.maxDiscount.toString() : null,
    minAmount: created.minAmount ? created.minAmount.toString() : null,
  };
}

async function updatePromoCode(id, data) {
  const existing = await prisma.promoCode.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'Promo code not found.', 404);
  }

  if (data.code && data.code !== existing.code) {
    const codeTaken = await prisma.promoCode.findUnique({
      where: { code: data.code },
    });
    if (codeTaken) {
      throw new AppError('CONFLICT', `Promo code ${data.code} already exists.`, 409);
    }
  }

  const updated = await prisma.promoCode.update({
    where: { id },
    data: {
      ...(data.code ? { code: data.code } : {}),
      ...(data.discountType ? { discountType: data.discountType } : {}),
      ...(data.value ? { value: new Prisma.Decimal(data.value) } : {}),
      ...(data.maxDiscount !== undefined ? { maxDiscount: data.maxDiscount ? new Prisma.Decimal(data.maxDiscount) : null } : {}),
      ...(data.minAmount !== undefined ? { minAmount: data.minAmount ? new Prisma.Decimal(data.minAmount) : null } : {}),
      ...(data.usageLimit !== undefined ? { usageLimit: data.usageLimit } : {}),
      ...(data.validFrom ? { validFrom: new Date(data.validFrom) } : {}),
      ...(data.validUntil ? { validUntil: new Date(data.validUntil) } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  });

  return {
    ...updated,
    value: updated.value.toString(),
    maxDiscount: updated.maxDiscount ? updated.maxDiscount.toString() : null,
    minAmount: updated.minAmount ? updated.minAmount.toString() : null,
  };
}

// ---------------- Promo Apply / Remove ---------------- //

async function applyPromoCode(paymentId, userId, promoCodeStr) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment || payment.payerId !== userId) {
    throw new AppError('NOT_FOUND', 'Payment not found.', 404);
  }

  if (payment.status === 'SUCCEEDED') {
    throw new AppError('CONFLICT', 'Cannot apply promo code to a completed payment.', 409);
  }

  if (payment.status === 'CANCELLED') {
    throw new AppError('UNPROCESSABLE', 'Payment is cancelled.', 422);
  }

  const promo = await prisma.promoCode.findUnique({
    where: { code: promoCodeStr.toUpperCase() },
  });

  if (!promo || !promo.active) {
    throw new AppError('UNPROCESSABLE', 'Promo code is invalid or inactive.', 422);
  }

  const now = new Date();
  if (now < new Date(promo.validFrom) || now > new Date(promo.validUntil)) {
    throw new AppError('UNPROCESSABLE', 'Promo code has expired or is not yet valid.', 422);
  }

  if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) {
    throw new AppError('UNPROCESSABLE', 'Promo code usage limit has been reached.', 422);
  }

  if (promo.minAmount != null && payment.baseAmount.lessThan(promo.minAmount)) {
    throw new AppError(
      'UNPROCESSABLE',
      `Payment amount ₹${payment.baseAmount.toString()} is below the minimum required ₹${promo.minAmount.toString()}.`,
      422
    );
  }

  // Calculate discount
  let rawDiscount;
  if (promo.discountType === 'PERCENT') {
    rawDiscount = payment.baseAmount.times(promo.value).dividedBy(100);
    if (promo.maxDiscount != null && rawDiscount.greaterThan(promo.maxDiscount)) {
      rawDiscount = promo.maxDiscount;
    }
  } else {
    rawDiscount = promo.value;
  }

  let discountAmount = rawDiscount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (discountAmount.greaterThan(payment.baseAmount)) {
    discountAmount = payment.baseAmount;
  }

  const amount = payment.baseAmount.minus(discountAmount);
  const commissionAmount = amount
    .times(payment.commissionRatePct)
    .dividedBy(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const payeeAmount = amount.minus(commissionAmount);

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      promoCodeId: promo.id,
      discountAmount,
      amount,
      commissionAmount,
      payeeAmount,
    },
    include: { promoCode: true },
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

async function removePromoCode(paymentId, userId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment || payment.payerId !== userId) {
    throw new AppError('NOT_FOUND', 'Payment not found.', 404);
  }

  if (payment.status === 'SUCCEEDED') {
    throw new AppError('CONFLICT', 'Cannot remove promo code from a completed payment.', 409);
  }

  if (payment.status === 'CANCELLED') {
    throw new AppError('UNPROCESSABLE', 'Payment is cancelled.', 422);
  }

  const discountAmount = new Prisma.Decimal('0.00');
  const amount = payment.baseAmount;
  const commissionAmount = amount
    .times(payment.commissionRatePct)
    .dividedBy(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const payeeAmount = amount.minus(commissionAmount);

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      promoCodeId: null,
      discountAmount,
      amount,
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d
      commissionAmount,
      payeeAmount,
    },
  });
<<<<<<< HEAD
}

// --- Admin: list all payments ---
async function listPayments({ page = 1, limit = 20 }) {
  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      include: {
        payer: { select: { name: true, email: true } },
        payee: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.payment.count(),
  ]);
  return { items, total, page, limit };
}

module.exports = {
  registerAmountStrategy,
  createPaymentForBooking,
  getPaymentByBooking,
  getPaymentById,
  payOnline,
  mockComplete,
  payCash,
  confirmCash,
  getReceipt,
  getCommission,
  updateCommission,
  listPromoCodes,
  createPromoCode,
  updatePromoCode,
  applyPromo,
  removePromo,
  listPayments,
=======

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

// ---------------- Digital Receipts ---------------- //

async function getReceipt(paymentId, userId, userRole) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: true,
      promoCode: true,
      payer: {
        select: { id: true, name: true, email: true },
      },
      payee: {
        select: { id: true, name: true, email: true },
      },
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

  if (payment.status !== 'SUCCEEDED') {
    throw new AppError('UNPROCESSABLE', 'Receipt is only available for succeeded payments.', 422);
  }

  return {
    id: payment.id,
    receiptNumber: payment.receiptNumber,
    bookingId: payment.bookingId,
    bookingType: payment.booking.type,
    method: payment.method,
    status: payment.status,
    baseAmount: payment.baseAmount.toString(),
    discountAmount: payment.discountAmount.toString(),
    amount: payment.amount.toString(),
    commissionRatePct: payment.commissionRatePct.toString(),
    commissionAmount: payment.commissionAmount.toString(),
    payeeAmount: payment.payeeAmount.toString(),
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
    payer: payment.payer,
    payee: payment.payee,
    promoCode: payment.promoCode
      ? {
          code: payment.promoCode.code,
          discountType: payment.promoCode.discountType,
          value: payment.promoCode.value.toString(),
        }
      : null,
  };
}

async function getReceiptPdf(paymentId, userId, userRole) {
  const receiptData = await getReceipt(paymentId, userId, userRole);
  const pdfBuffer = await generateReceiptPdf(receiptData);
  return {
    pdfBuffer,
    filename: `receipt-${receiptData.receiptNumber}.pdf`,
  };
}

module.exports = {
  ensureReceiptSequence,
  getCommissionConfig,
  updateCommissionConfig,
  createPaymentForBooking,
  getPaymentByBookingId,
  getPaymentById,
  payOnline,
  verifyPayment,
  processPaymentSuccess,
  handleRazorpayWebhook,
  payCash,
  confirmCash,
  completeMockPayment,
  listPromoCodes,
  createPromoCode,
  updatePromoCode,
  applyPromoCode,
  removePromoCode,
  getReceipt,
  getReceiptPdf,
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d
};
