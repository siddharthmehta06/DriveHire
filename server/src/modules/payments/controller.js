const { parseBody } = require('../../lib/validate');
const { successResponse } = require('../../lib/response');
const service = require('./service');
const { updateCommissionSchema, bookingIdSchema } = require('./schema');

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

module.exports = {
  getCommission,
  updateCommission,
  getPaymentByBookingId,
};
