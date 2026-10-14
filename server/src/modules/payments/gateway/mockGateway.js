const crypto = require('crypto');

class MockPaymentGateway {
  constructor(options = {}) {
    this.keyId = options.keyId || 'mock_key_id';
    this.keySecret = options.keySecret || 'mock_key_secret';
    this.provider = 'mock';
  }

  async createOrder({ amount, receipt, notes = {} }) {
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      throw new Error('Order amount must be greater than zero.');
    }

    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const orderId = `order_mock_${Date.now()}_${randomSuffix}`;

    return {
      orderId,
      keyId: this.keyId,
      amount: numericAmount,
      currency: 'INR',
      receipt: receipt || null,
      notes,
      provider: this.provider,
    };
  }

  verifySignature({ orderId, paymentId, signature }) {
    if (!orderId || !paymentId || !signature) {
      return false;
    }

    // Direct mock match: mock_sig_<orderId>_<paymentId>
    const directExpected = `mock_sig_${orderId}_${paymentId}`;
    if (signature === directExpected) {
      return true;
    }

    // Standard HMAC comparison using mock key secret
    const hmacExpected = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const sigBuffer = Buffer.from(signature, 'utf8');
    const expBuffer = Buffer.from(hmacExpected, 'utf8');

    if (sigBuffer.length !== expBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expBuffer);
  }
}

module.exports = MockPaymentGateway;
