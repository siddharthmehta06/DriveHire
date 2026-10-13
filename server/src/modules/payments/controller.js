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
};
