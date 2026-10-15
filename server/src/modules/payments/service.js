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
      gatewayOrderId: order.orderId,
    },
  });

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

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'SUCCEEDED',
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

    return updated;
  });

  // Notify
  notify(result.payerId, 'PAYMENT_RECEIPT', 'Payment Successful',
    `Your payment of ₹${Number(result.amount).toLocaleString('en-IN')} was successful. Receipt: ${result.receiptNumber}`,
    { paymentId: result.id, receiptNumber: result.receiptNumber }
  ).catch(() => {});

  return result;
}

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
      commissionAmount,
      payeeAmount,
    },
  });
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
};
