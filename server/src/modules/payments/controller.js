const { parseBody } = require('../../lib/validate');
const { successResponse } = require('../../lib/response');
<<<<<<< HEAD
const service = require('./service');
const {
  paymentByBookingSchema,
  paymentIdSchema,
  payMethodSchema,
  confirmCashSchema,
  applyPromoSchema,
  adminCommissionSchema,
  adminPromoCreateSchema,
  adminPromoUpdateSchema,
} = require('./schema');

async function getPaymentByBooking(req, res, next) {
  try {
    const { bookingId } = parseBody(paymentByBookingSchema.params, req.params);
    const payment = await service.getPaymentByBooking(req.user.id, bookingId);
    return res.json(successResponse(payment));
  } catch (error) {
    return next(error);
  }
}

async function payOnline(req, res, next) {
  try {
    const { id } = parseBody(payMethodSchema.params, req.params);
    const result = await service.payOnline(req.user.id, id);
    return res.json(successResponse(result));
  } catch (error) {
    return next(error);
  }
}

async function mockComplete(req, res, next) {
  try {
    const { id } = parseBody(paymentIdSchema.params, req.params);
    const payment = await service.mockComplete(req.user.id, id);
    return res.json(successResponse(payment));
  } catch (error) {
    return next(error);
  }
}

async function payCash(req, res, next) {
  try {
    const { id } = parseBody(payMethodSchema.params, req.params);
    const payment = await service.payCash(req.user.id, id);
    return res.json(successResponse(payment));
  } catch (error) {
    return next(error);
  }
}

async function confirmCash(req, res, next) {
  try {
    const { id } = parseBody(confirmCashSchema.params, req.params);
    const payment = await service.confirmCash(req.user.id, id);
    return res.json(successResponse(payment));
  } catch (error) {
    return next(error);
  }
}

async function applyPromo(req, res, next) {
  try {
    const { id } = parseBody(applyPromoSchema.params, req.params);
    const body = parseBody(applyPromoSchema.body, req.body);
    const payment = await service.applyPromo(req.user.id, id, body.code);
    return res.json(successResponse(payment));
  } catch (error) {
    return next(error);
  }
}

async function removePromo(req, res, next) {
  try {
    const { id } = parseBody(paymentIdSchema.params, req.params);
    const payment = await service.removePromo(req.user.id, id);
    return res.json(successResponse(payment));
  } catch (error) {
    return next(error);
  }
}

async function getReceipt(req, res, next) {
  try {
    const { id } = parseBody(paymentIdSchema.params, req.params);
    const receipt = await service.getReceipt(req.user.id, id);
    return res.json(successResponse(receipt));
  } catch (error) {
    return next(error);
  }
}

async function getCommission(req, res, next) {
  try {
    const config = await service.getCommission();
=======
const { AppError } = require('../../lib/errors');
const service = require('./service');
const {
  updateCommissionSchema,
  bookingIdSchema,
  paymentIdSchema,
  verifyPaymentSchema,
  mockCompleteSchema,
  promoIdSchema,
  createPromoCodeSchema,
  updatePromoCodeSchema,
  promoListQuerySchema,
  applyPromoSchema,
} = require('./schema');

async function getCommission(req, res, next) {
  try {
    const config = await service.getCommissionConfig();
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d
    return res.json(successResponse(config));
  } catch (error) {
    return next(error);
  }
}

async function updateCommission(req, res, next) {
  try {
<<<<<<< HEAD
    const body = parseBody(adminCommissionSchema, req.body);
    const config = await service.updateCommission(req.user.id, body.commissionRatePct);
=======
    const data = parseBody(updateCommissionSchema, req.body);
    const config = await service.updateCommissionConfig({
      commissionRatePct: data.commissionRatePct,
      adminId: req.user.id,
    });
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d
    return res.json(successResponse(config));
  } catch (error) {
    return next(error);
  }
}

<<<<<<< HEAD
async function listPromoCodes(req, res, next) {
  try {
    const promos = await service.listPromoCodes();
    return res.json(successResponse(promos));
=======
async function getPaymentByBookingId(req, res, next) {
  try {
    const { bookingId } = parseBody(bookingIdSchema, req.params);
    const payment = await service.getPaymentByBookingId(bookingId, req.user.id, req.user.role);
    return res.json(successResponse(payment));
  } catch (error) {
    return next(error);
  }
}

async function getPaymentById(req, res, next) {
  try {
    const { id } = parseBody(paymentIdSchema, req.params);
    const payment = await service.getPaymentById(id, req.user.id, req.user.role);
    return res.json(successResponse(payment));
  } catch (error) {
    return next(error);
  }
}

async function payOnline(req, res, next) {
  try {
    const { id } = parseBody(paymentIdSchema, req.params);
    const result = await service.payOnline(id, req.user.id);
    return res.json(successResponse(result));
  } catch (error) {
    return next(error);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const { id } = parseBody(paymentIdSchema, req.params);
    const data = parseBody(verifyPaymentSchema, req.body);
    const result = await service.verifyPayment(id, req.user.id, data);
    return res.json(successResponse(result));
  } catch (error) {
    return next(error);
  }
}

async function handleWebhook(req, res, next) {
  try {
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    const signature = req.headers['x-razorpay-signature'] || '';
    const result = await service.handleRazorpayWebhook(rawBody, signature, req.body);
    return res.json(successResponse(result));
  } catch (error) {
    return next(error);
  }
}

async function payCash(req, res, next) {
  try {
    const { id } = parseBody(paymentIdSchema, req.params);
    const result = await service.payCash(id, req.user.id);
    return res.json(successResponse(result));
  } catch (error) {
    return next(error);
  }
}

async function confirmCash(req, res, next) {
  try {
    const { id } = parseBody(paymentIdSchema, req.params);
    const result = await service.confirmCash(id, req.user.id);
    return res.json(successResponse(result));
  } catch (error) {
    return next(error);
  }
}

async function completeMock(req, res, next) {
  try {
    const data = parseBody(mockCompleteSchema, req.body);
    const paymentId = req.params.id || data.paymentId;
    if (!paymentId) {
      return next(new AppError('VALIDATION_ERROR', 'paymentId must be provided in URL or body.', 400));
    }
    const result = await service.completeMockPayment(paymentId, req.user.id, data);
    return res.json(successResponse(result));
  } catch (error) {
    return next(error);
  }
}

// ---------------- Promo Code Controller Handlers ---------------- //

async function listPromoCodes(req, res, next) {
  try {
    const query = parseBody(promoListQuerySchema, req.query);
    const result = await service.listPromoCodes(query);
    return res.json(successResponse(result.items, { page: query.page, limit: query.limit, total: result.total }));
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d
  } catch (error) {
    return next(error);
  }
}

async function createPromoCode(req, res, next) {
  try {
<<<<<<< HEAD
    const body = parseBody(adminPromoCreateSchema, req.body);
    const promo = await service.createPromoCode(body);
=======
    const data = parseBody(createPromoCodeSchema, req.body);
    const promo = await service.createPromoCode(data);
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d
    return res.status(201).json(successResponse(promo));
  } catch (error) {
    return next(error);
  }
}

async function updatePromoCode(req, res, next) {
  try {
<<<<<<< HEAD
    const { id } = parseBody(paymentIdSchema.params, req.params);
    const body = parseBody(adminPromoUpdateSchema, req.body);
    const promo = await service.updatePromoCode(id, body);
=======
    const { id } = parseBody(promoIdSchema, req.params);
    const data = parseBody(updatePromoCodeSchema, req.body);
    const promo = await service.updatePromoCode(id, data);
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d
    return res.json(successResponse(promo));
  } catch (error) {
    return next(error);
  }
}

<<<<<<< HEAD
async function listPayments(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const result = await service.listPayments({ page, limit });
    return res.json(successResponse(result.items, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    }));
=======
async function applyPromo(req, res, next) {
  try {
    const { id } = parseBody(paymentIdSchema, req.params);
    const { code } = parseBody(applyPromoSchema, req.body);
    const updated = await service.applyPromoCode(id, req.user.id, code);
    return res.json(successResponse(updated));
  } catch (error) {
    return next(error);
  }
}

async function removePromo(req, res, next) {
  try {
    const { id } = parseBody(paymentIdSchema, req.params);
    const updated = await service.removePromoCode(id, req.user.id);
    return res.json(successResponse(updated));
  } catch (error) {
    return next(error);
  }
}

// ---------------- Digital Receipt Controller Handlers ---------------- //

async function getReceipt(req, res, next) {
  try {
    const { id } = parseBody(paymentIdSchema, req.params);
    const receipt = await service.getReceipt(id, req.user.id, req.user.role);
    return res.json(successResponse(receipt));
  } catch (error) {
    return next(error);
  }
}

async function getReceiptPdf(req, res, next) {
  try {
    const { id } = parseBody(paymentIdSchema, req.params);
    const { pdfBuffer, filename } = await service.getReceiptPdf(id, req.user.id, req.user.role);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.send(pdfBuffer);
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d
  } catch (error) {
    return next(error);
  }
}

module.exports = {
<<<<<<< HEAD
  getPaymentByBooking,
  payOnline,
  mockComplete,
  payCash,
  confirmCash,
  applyPromo,
  removePromo,
  getReceipt,
  getCommission,
  updateCommission,
  listPromoCodes,
  createPromoCode,
  updatePromoCode,
  listPayments,
=======
  getCommission,
  updateCommission,
  getPaymentByBookingId,
  getPaymentById,
  payOnline,
  verifyPayment,
  handleWebhook,
  payCash,
  confirmCash,
  completeMock,
  listPromoCodes,
  createPromoCode,
  updatePromoCode,
  applyPromo,
  removePromo,
  getReceipt,
  getReceiptPdf,
>>>>>>> b53e39ea1187268ad051517ac54a471ad4dc041d
};
