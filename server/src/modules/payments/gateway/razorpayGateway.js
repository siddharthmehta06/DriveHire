const crypto = require('crypto');
const { AppError } = require('../../../lib/errors');

class RazorpayPaymentGateway {
  constructor(options = {}) {
    this.keyId = options.keyId !== undefined ? options.keyId : process.env.RAZORPAY_KEY_ID;
    this.keySecret = options.keySecret !== undefined ? options.keySecret : process.env.RAZORPAY_KEY_SECRET;
    this.webhookSecret = options.webhookSecret !== undefined ? options.webhookSecret : process.env.RAZORPAY_WEBHOOK_SECRET;
    this.provider = 'razorpay';
  }

  ensureConfigured() {
    if (!this.keyId || !this.keySecret) {
      throw new AppError(
        'INTERNAL',
        'Razorpay credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured.',
        500
      );
    }
  }

  async createOrder({ amount, receipt, notes = {} }) {
    this.ensureConfigured();

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Order amount must be greater than zero.', 400);
    }

    // Razorpay amount in smallest currency unit (paise)
    const amountInPaise = Math.round(numericAmount * 100);

    const authHeader = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: receipt ? String(receipt) : undefined,
        notes,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new AppError(
        'INTERNAL',
        errorData.error?.description || 'Failed to create order with Razorpay.',
        502,
        errorData
      );
    }

    const order = await response.json();
    return {
      orderId: order.id,
      keyId: this.keyId,
      amount: numericAmount,
      currency: order.currency || 'INR',
      receipt: order.receipt || null,
      notes: order.notes || notes,
      provider: this.provider,
    };
  }

  verifySignature({ orderId, paymentId, signature }) {
    this.ensureConfigured();

    if (!orderId || !paymentId || !signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const sigBuffer = Buffer.from(signature, 'utf8');
    const expBuffer = Buffer.from(expectedSignature, 'utf8');

    if (sigBuffer.length !== expBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expBuffer);
  }

  verifyWebhookSignature({ rawBody, signature, webhookSecret }) {
    const secret = webhookSecret || this.webhookSecret;
    if (!secret || !signature || !rawBody) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const sigBuffer = Buffer.from(signature, 'utf8');
    const expBuffer = Buffer.from(expectedSignature, 'utf8');

    if (sigBuffer.length !== expBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expBuffer);
  }
}

module.exports = RazorpayPaymentGateway;
