const { parseBody } = require('../../lib/validate');
const { successResponse } = require('../../lib/response');
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
    return res.json(successResponse(config));
  } catch (error) {
    return next(error);
  }
}

async function updateCommission(req, res, next) {
  try {
    const body = parseBody(adminCommissionSchema, req.body);
    const config = await service.updateCommission(req.user.id, body.commissionRatePct);
    return res.json(successResponse(config));
  } catch (error) {
    return next(error);
  }
}

async function listPromoCodes(req, res, next) {
  try {
    const promos = await service.listPromoCodes();
    return res.json(successResponse(promos));
  } catch (error) {
    return next(error);
  }
}

async function createPromoCode(req, res, next) {
  try {
    const body = parseBody(adminPromoCreateSchema, req.body);
    const promo = await service.createPromoCode(body);
    return res.status(201).json(successResponse(promo));
  } catch (error) {
    return next(error);
  }
}

async function updatePromoCode(req, res, next) {
  try {
    const { id } = parseBody(paymentIdSchema.params, req.params);
    const body = parseBody(adminPromoUpdateSchema, req.body);
    const promo = await service.updatePromoCode(id, body);
    return res.json(successResponse(promo));
  } catch (error) {
    return next(error);
  }
}

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
  } catch (error) {
    return next(error);
  }
}

module.exports = {
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
};
