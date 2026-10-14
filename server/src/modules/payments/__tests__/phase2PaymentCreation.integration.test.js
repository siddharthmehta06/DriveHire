const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../../../app');
const prisma = require('../../../lib/prisma');
const { emit } = require('../../../lib/events');
const { getPaymentGateway, MockPaymentGateway, RazorpayPaymentGateway } = require('../gateway');
const { registerAmountStrategy, getAmountStrategy } = require('../strategies');
const { createPaymentForBooking } = require('../service');

const DRIVER_ID = '22222222-2222-4222-8222-222222222222';
const PASSENGER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '55555555-5555-4555-8555-555555555555';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

let passengerToken;
let driverToken;
let otherToken;
let adminToken;
let testVehicleId;
let testRideId;

beforeAll(async () => {
  const secret = process.env.JWT_SECRET || 'test-only';
  passengerToken = jwt.sign({ sub: PASSENGER_ID, role: 'USER' }, secret);
  driverToken = jwt.sign({ sub: DRIVER_ID, role: 'DRIVER' }, secret);
  otherToken = jwt.sign({ sub: OTHER_USER_ID, role: 'USER' }, secret);
  adminToken = jwt.sign({ sub: ADMIN_ID, role: 'ADMIN' }, secret);

  await prisma.user.upsert({
    where: { id: PASSENGER_ID },
    update: {},
    create: {
      id: PASSENGER_ID,
      email: 'passenger-phase2@example.com',
      name: 'Phase 2 Passenger',
      passwordHash: 'dummy',
      role: 'USER',
    },
  });

  await prisma.user.upsert({
    where: { id: DRIVER_ID },
    update: {},
    create: {
      id: DRIVER_ID,
      email: 'driver-phase2@example.com',
      name: 'Phase 2 Driver',
      passwordHash: 'dummy',
      role: 'DRIVER',
    },
  });

  await prisma.user.upsert({
    where: { id: OTHER_USER_ID },
    update: {},
    create: {
      id: OTHER_USER_ID,
      email: 'other-phase2@example.com',
      name: 'Phase 2 Other User',
      passwordHash: 'dummy',
      role: 'USER',
    },
  });

  await prisma.user.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: {
      id: ADMIN_ID,
      email: 'admin-phase2@example.com',
      name: 'Phase 2 Admin',
      passwordHash: 'dummy',
      role: 'ADMIN',
    },
  });

  // Ensure driver vehicle exists
  const vehicle = await prisma.vehicle.upsert({
    where: { registrationNumber: 'DL01P20001' },
    update: {},
    create: {
      ownerId: DRIVER_ID,
      make: 'Honda',
      model: 'Amaze',
      year: 2023,
      registrationNumber: 'DL01P20001',
      vehicleType: 'SEDAN',
      seatCapacity: 4,
      photoUrls: [],
      verificationStatus: 'VERIFIED',
      isAvailable: true,
    },
  });
  testVehicleId = vehicle.id;

  const ride = await prisma.carpoolRide.create({
    data: {
      driverId: DRIVER_ID,
      vehicleId: testVehicleId,
      originText: 'South Extension, Delhi',
      originLat: 28.57,
      originLng: 77.22,
      destText: 'Cyber Hub, Gurugram',
      destLat: 28.49,
      destLng: 77.09,
      distanceKm: 28,
      departureTime: new Date(Date.now() + 2 * 3600000),
      totalSeats: 3,
      availableSeats: 1,
      costPerSeat: '250.00',
      status: 'OPEN',
    },
  });
  testRideId = ride.id;

  // Ensure default pricing config has 10%
  await prisma.pricingConfig.upsert({
    where: { id: 1 },
    update: { commissionRatePct: 10 },
    create: { id: 1, commissionRatePct: 10 },
  });
});

describe('Phase 2 - Payment Gateway Abstraction', () => {
  describe('Mock Gateway', () => {
    it('works without Razorpay credentials and returns mock order details', async () => {
      const gateway = getPaymentGateway('mock');
      expect(gateway).toBeInstanceOf(MockPaymentGateway);

      const order = await gateway.createOrder({
        amount: 500,
        receipt: 'rec_test_123',
        notes: { bookingId: 'b_123' },
      });

      expect(order).toHaveProperty('orderId');
      expect(order.orderId).toMatch(/^order_mock_/);
      expect(order.keyId).toBe('mock_key_id');
      expect(order.amount).toBe(500);
      expect(order.currency).toBe('INR');
      expect(order.provider).toBe('mock');
    });

    it('rejects order with zero or negative amount', async () => {
      const gateway = new MockPaymentGateway();
      await expect(gateway.createOrder({ amount: 0 })).rejects.toThrow('greater than zero');
      await expect(gateway.createOrder({ amount: -50 })).rejects.toThrow('greater than zero');
    });

    it('verifies mock signature using direct pattern and HMAC pattern', () => {
      const gateway = new MockPaymentGateway({ keyId: 'mock_key', keySecret: 'secret_123' });
      const orderId = 'order_mock_test_1';
      const paymentId = 'pay_mock_test_1';

      // 1. Direct pattern
      const directSig = `mock_sig_${orderId}_${paymentId}`;
      expect(gateway.verifySignature({ orderId, paymentId, signature: directSig })).toBe(true);

      // 2. HMAC pattern
      const hmacSig = crypto
        .createHmac('sha256', 'secret_123')
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
      expect(gateway.verifySignature({ orderId, paymentId, signature: hmacSig })).toBe(true);

      // 3. Invalid signature
      expect(gateway.verifySignature({ orderId, paymentId, signature: 'invalid_sig' })).toBe(false);
    });
  });

  describe('Razorpay Gateway Adapter', () => {
    it('throws error when credentials are not configured', () => {
      const gateway = new RazorpayPaymentGateway({ keyId: null, keySecret: null });
      expect(() => gateway.ensureConfigured()).toThrow();
    });

    it('creates order with amount converted to paise and Basic Auth', async () => {
      const originalFetch = global.fetch;
      try {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'order_rzp_mock_999',
            amount: 50000,
            currency: 'INR',
            receipt: 'rec_rzp_1',
          }),
        });

        const gateway = new RazorpayPaymentGateway({
          keyId: 'rzp_test_samplekey',
          keySecret: 'sample_secret_key',
        });

        const order = await gateway.createOrder({
          amount: 500,
          receipt: 'rec_rzp_1',
        });

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [url, options] = global.fetch.mock.calls[0];
        expect(url).toBe('https://api.razorpay.com/v1/orders');
        expect(options.method).toBe('POST');
        const parsedBody = JSON.parse(options.body);
        expect(parsedBody.amount).toBe(50000); // 500 INR = 50000 paise
        expect(parsedBody.currency).toBe('INR');

        expect(order.orderId).toBe('order_rzp_mock_999');
        expect(order.keyId).toBe('rzp_test_samplekey');
        expect(order.amount).toBe(500);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('verifies valid HMAC-SHA256 signature and rejects tampered signature', () => {
      const keySecret = 'rzp_test_secret_xyz';
      const gateway = new RazorpayPaymentGateway({
        keyId: 'rzp_test_id',
        keySecret,
      });

      const orderId = 'order_test_456';
      const paymentId = 'pay_test_789';
      const validSig = crypto
        .createHmac('sha256', keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      expect(gateway.verifySignature({ orderId, paymentId, signature: validSig })).toBe(true);

      // Tampered paymentId
      expect(gateway.verifySignature({ orderId, paymentId: 'tampered', signature: validSig })).toBe(false);

      // Tampered signature string
      const tamperedSig = validSig.substring(0, validSig.length - 2) + '00';
      expect(gateway.verifySignature({ orderId, paymentId, signature: tamperedSig })).toBe(false);
    });

    it('verifies webhook signature using constant-time comparison', () => {
      const webhookSecret = 'wh_secret_abc';
      const gateway = new RazorpayPaymentGateway({
        keyId: 'rzp_test_id',
        keySecret: 'k_sec',
        webhookSecret,
      });

      const rawBody = JSON.stringify({ event: 'payment.captured' });
      const validSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      expect(gateway.verifyWebhookSignature({ rawBody, signature: validSig })).toBe(true);
      expect(gateway.verifyWebhookSignature({ rawBody, signature: 'wrong_sig' })).toBe(false);
    });
  });

  describe('Gateway Factory', () => {
    it('throws validation error for unsupported provider', () => {
      expect(() => getPaymentGateway('stripe')).toThrow();
    });
  });
});

describe('Phase 2 - Amount Strategy Registry', () => {
  it('calculates correct base amount for RIDE strategy (seatsBooked * costPerSeat)', () => {
    const rideStrategy = getAmountStrategy('RIDE');
    const mockBooking = {
      type: 'RIDE',
      rideBooking: {
        seatsBooked: 2,
        ride: {
          costPerSeat: '250.00',
        },
      },
    };

    const amount = rideStrategy(mockBooking);
    expect(amount.toString()).toBe('500');
  });

  it('throws 422 when strategy for unknown booking type is requested', () => {
    expect(() => getAmountStrategy('FLIGHT')).toThrow();
  });

  it('allows registering a new strategy (extension point for F07)', () => {
    registerAmountStrategy('CUSTOM_RENTAL', (booking) => {
      return (booking.days || 1) * 1000;
    });

    const customStrategy = getAmountStrategy('CUSTOM_RENTAL');
    expect(customStrategy({ days: 3 })).toBe(3000);
  });
});

describe('Phase 2 - Booking Integration & Payment Creation', () => {
  let createdBookingId;

  beforeEach(async () => {
    const booking = await prisma.booking.create({
      data: {
        userId: PASSENGER_ID,
        type: 'RIDE',
        status: 'COMPLETED',
        rideBooking: {
          create: {
            rideId: testRideId,
            passengerId: PASSENGER_ID,
            seatsBooked: 2,
            active: false,
          },
        },
      },
    });
    createdBookingId = booking.id;
  });

  afterEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: PASSENGER_ID } });
    await prisma.payment.deleteMany({ where: { bookingId: createdBookingId } });
    await prisma.booking.delete({ where: { id: createdBookingId } });
  });

  it('creates payment with exact rate snapshot and non-negative breakdown when createPaymentForBooking is called', async () => {
    const payment = await createPaymentForBooking(createdBookingId);

    expect(payment).toBeDefined();
    expect(payment.bookingId).toBe(createdBookingId);
    expect(payment.payerId).toBe(PASSENGER_ID);
    expect(payment.payeeId).toBe(DRIVER_ID);
    expect(payment.status).toBe('PENDING');

    // 2 seats * 250 = 500
    expect(Number(payment.baseAmount)).toBe(500);
    expect(Number(payment.discountAmount)).toBe(0);
    expect(Number(payment.amount)).toBe(500);
    expect(Number(payment.commissionRatePct)).toBe(10);
    expect(Number(payment.commissionAmount)).toBe(50); // 10% of 500
    expect(Number(payment.payeeAmount)).toBe(450); // 500 - 50

    // Strict balance check
    expect(Number(payment.commissionAmount) + Number(payment.payeeAmount)).toBe(Number(payment.amount));

    // Check notification was sent to payer
    const notification = await prisma.notification.findFirst({
      where: {
        userId: PASSENGER_ID,
        type: 'PAYMENT_RECEIPT',
      },
    });
    expect(notification).toBeDefined();
    expect(notification.title).toBe('Payment Pending');
  });

  it('handles duplicate payment creation calls idempotently without creating duplicate records', async () => {
    const firstPayment = await createPaymentForBooking(createdBookingId);
    const secondPayment = await createPaymentForBooking(createdBookingId);

    expect(firstPayment.id).toBe(secondPayment.id);

    const count = await prisma.payment.count({ where: { bookingId: createdBookingId } });
    expect(count).toBe(1);
  });

  it('creates payment automatically via booking.completed event listener', async () => {
    await emit('booking.completed', { bookingId: createdBookingId });

    // Allow event loop to complete listener execution
    await new Promise((resolve) => setTimeout(resolve, 100));

    const payment = await prisma.payment.findUnique({
      where: { bookingId: createdBookingId },
    });
    expect(payment).toBeDefined();
    expect(payment.status).toBe('PENDING');
    expect(Number(payment.amount)).toBe(500);
  });

  describe('GET /api/payments/booking/:bookingId', () => {
    beforeEach(async () => {
      await createPaymentForBooking(createdBookingId);
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get(`/api/payments/booking/${createdBookingId}`);
      expect(res.status).toBe(401);
    });

    it('returns 404 when requested by an unrelated user (ownership protection)', async () => {
      const res = await request(app)
        .get(`/api/payments/booking/${createdBookingId}`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with breakdown and availableMethods when requested by payer', async () => {
      const res = await request(app)
        .get(`/api/payments/booking/${createdBookingId}`)
        .set('Authorization', `Bearer ${passengerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bookingId).toBe(createdBookingId);
      expect(res.body.data.amount).toBe('500');
      expect(res.body.data.availableMethods).toEqual(['ONLINE', 'CASH']);
    });

    it('returns 200 with breakdown when requested by payee (driver)', async () => {
      const res = await request(app)
        .get(`/api/payments/booking/${createdBookingId}`)
        .set('Authorization', `Bearer ${driverToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bookingId).toBe(createdBookingId);
    });

    it('returns 200 with breakdown when requested by ADMIN', async () => {
      const res = await request(app)
        .get(`/api/payments/booking/${createdBookingId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
