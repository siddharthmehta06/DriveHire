const { parseBody } = require('../../lib/validate');
const { successResponse } = require('../../lib/response');
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
    return res.json(successResponse(config));
  } catch (error) {
    return next(error);
  }
}

async function updateCommission(req, res, next) {
  try {
    const data = parseBody(updateCommissionSchema, req.body);
    const config = await service.updateCommissionConfig({
      commissionRatePct: data.commissionRatePct,
      adminId: req.user.id,
    });
    return res.json(successResponse(config));
  } catch (error) {
    return next(error);
  }
}

async function getPaymentByBookingId(req, res, next) {
  try {
    const { bookingId } = parseBody(bookingIdSchema, req.params);
    const payment = await service.getPaymentByBookingId(bookingId, req.user.id, req.user.role);
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
  } catch (error) {
    return next(error);
  }
}

async function createPromoCode(req, res, next) {
  try {
    const data = parseBody(createPromoCodeSchema, req.body);
    const promo = await service.createPromoCode(data);
    return res.status(201).json(successResponse(promo));
  } catch (error) {
    return next(error);
  }
}

async function updatePromoCode(req, res, next) {
  try {
    const { id } = parseBody(promoIdSchema, req.params);
    const data = parseBody(updatePromoCodeSchema, req.body);
    const promo = await service.updatePromoCode(id, data);
    return res.json(successResponse(promo));
  } catch (error) {
    return next(error);
  }
}

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
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getCommission,
  updateCommission,
  getPaymentByBookingId,
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
};
