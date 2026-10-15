const MockPaymentGateway = require('./mockGateway');
const RazorpayPaymentGateway = require('./razorpayGateway');
const { AppError } = require('../../../lib/errors');

function getPaymentGateway(provider = process.env.PAYMENT_PROVIDER || 'mock') {
  const normalized = String(provider).toLowerCase();
  if (normalized === 'mock') {
    return new MockPaymentGateway();
  }
  if (normalized === 'razorpay') {
    return new RazorpayPaymentGateway();
  }
  throw new AppError('VALIDATION_ERROR', `Unsupported payment provider: ${provider}`, 400);
}

module.exports = {
  getPaymentGateway,
  MockPaymentGateway,
  RazorpayPaymentGateway,
};
