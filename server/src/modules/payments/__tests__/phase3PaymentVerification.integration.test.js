const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../../../app');
const prisma = require('../../../lib/prisma');
const { createPaymentForBooking, ensureReceiptSequence } = require('../service');

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
      email: 'p3-passenger@example.com',
      name: 'P3 Passenger',
      passwordHash: 'dummy',
      role: 'USER',
    },
  });

  await prisma.user.upsert({
    where: { id: DRIVER_ID },
    update: {},
    create: {
      id: DRIVER_ID,
      email: 'p3-driver@example.com',
      name: 'P3 Driver',
      passwordHash: 'dummy',
      role: 'DRIVER',
    },
  });

  await prisma.user.upsert({
    where: { id: OTHER_USER_ID },
    update: {},
    create: {
      id: OTHER_USER_ID,
      email: 'p3-other@example.com',
      name: 'P3 Other',
      passwordHash: 'dummy',
      role: 'USER',
    },
  });

  await prisma.user.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: {
      id: ADMIN_ID,
      email: 'p3-admin@example.com',
      name: 'P3 Admin',
      passwordHash: 'dummy',
      role: 'ADMIN',
    },
  });

  const vehicle = await prisma.vehicle.upsert({
    where: { registrationNumber: 'DL01P30001' },
    update: {},
    create: {
      ownerId: DRIVER_ID,
      make: 'Honda',
      model: 'City',
      year: 2024,
      registrationNumber: 'DL01P30001',
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
      originText: 'Saket, New Delhi',
      originLat: 28.52,
      originLng: 77.21,
      destText: 'Noida Sector 62',
      destLat: 28.62,
      destLng: 77.36,
      distanceKm: 25,
      departureTime: new Date(Date.now() + 4 * 3600000),
      totalSeats: 3,
      availableSeats: 1,
      costPerSeat: '300.00',
      status: 'OPEN',
    },
  });
  testRideId = ride.id;

  await prisma.pricingConfig.upsert({
    where: { id: 1 },
    update: { commissionRatePct: 10 },
    create: { id: 1, commissionRatePct: 10 },
  });

  await ensureReceiptSequence();
});

describe('Phase 3 - Payment Verification, Cash Payments, Webhooks and Earnings', () => {
  let bookingId;
  let paymentId;

  beforeEach(async () => {
    // Reset driver earnings account
    await prisma.earningsAccount.deleteMany({ where: { userId: DRIVER_ID } });

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
    bookingId = booking.id;

    // 2 seats * 300 = 600 base amount; 10% commission = 60; payeeAmount = 540
    const payment = await createPaymentForBooking(bookingId);
    paymentId = payment.id;
  });

  afterEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: PASSENGER_ID } });
    if (paymentId) {
      await prisma.earningEntry.deleteMany({ where: { paymentId } });
      await prisma.payment.deleteMany({ where: { id: paymentId } });
    }
    if (bookingId) {
      await prisma.booking.deleteMany({ where: { id: bookingId } });
    }
  });

  describe('Online Payment Workflow (POST /api/payments/:id/pay-online)', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).post(`/api/payments/${paymentId}/pay-online`);
      expect(res.status).toBe(401);
    });

    it('rejects non-payer requests with 404', async () => {
      const res = await request(app)
        .post(`/api/payments/${paymentId}/pay-online`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.status).toBe(404);
    });

    it('creates gateway order and transitions payment to PROCESSING', async () => {
      const res = await request(app)
        .post(`/api/payments/${paymentId}/pay-online`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('orderId');
      expect(res.body.data.orderId).toMatch(/^order_mock_/);
      expect(res.body.data.amount).toBe('600');
      expect(res.body.data.status).toBe('PROCESSING');

      const updated = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(updated.status).toBe('PROCESSING');
      expect(updated.method).toBe('ONLINE');
      expect(updated.gatewayOrderId).toBe(res.body.data.orderId);
    });

    it('returns 409 if payment has already SUCCEEDED', async () => {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'SUCCEEDED' },
      });

      const res = await request(app)
        .post(`/api/payments/${paymentId}/pay-online`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Online Verification (POST /api/payments/:id/verify)', () => {
    let orderId;

    beforeEach(async () => {
      const orderRes = await request(app)
        .post(`/api/payments/${paymentId}/pay-online`)
        .set('Authorization', `Bearer ${passengerToken}`);
      orderId = orderRes.body.data.orderId;
    });

    it('rejects tampered or invalid signature with 400', async () => {
      const res = await request(app)
        .post(`/api/payments/${paymentId}/verify`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          gatewayPaymentId: 'pay_mock_test_1',
          signature: 'invalid_signature_string',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);

      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(payment.status).toBe('PROCESSING'); // Must not transition to SUCCEEDED
    });

    it('verifies valid signature, transitions to SUCCEEDED, credits withdrawable earnings, and generates receipt number', async () => {
      const gatewayPaymentId = 'pay_mock_success_1';
      const signature = `mock_sig_${orderId}_${gatewayPaymentId}`;

      const res = await request(app)
        .post(`/api/payments/${paymentId}/verify`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ gatewayPaymentId, signature });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('SUCCEEDED');
      expect(res.body.data.receiptNumber).toMatch(/^DH-\d{8}-\d{6}$/);

      // Verify DB record
      const dbPayment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(dbPayment.status).toBe('SUCCEEDED');
      expect(dbPayment.paidAt).toBeDefined();

      // Verify EarningEntry
      const entry = await prisma.earningEntry.findUnique({ where: { paymentId } });
      expect(entry).toBeDefined();
      expect(entry.earnerId).toBe(DRIVER_ID);
      expect(Number(entry.grossAmount)).toBe(600);
      expect(Number(entry.commissionAmount)).toBe(60);
      expect(Number(entry.netAmount)).toBe(540);
      expect(entry.withdrawable).toBe(true);

      // Verify EarningsAccount (both totalEarned and withdrawableBalance credited)
      const account = await prisma.earningsAccount.findUnique({ where: { userId: DRIVER_ID } });
      expect(account).toBeDefined();
      expect(Number(account.totalEarned)).toBe(540);
      expect(Number(account.withdrawableBalance)).toBe(540);
    });

    it('re-verifying already SUCCEEDED payment is idempotent and does not double-credit', async () => {
      const gatewayPaymentId = 'pay_mock_idem_1';
      const signature = `mock_sig_${orderId}_${gatewayPaymentId}`;

      const res1 = await request(app)
        .post(`/api/payments/${paymentId}/verify`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ gatewayPaymentId, signature });
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post(`/api/payments/${paymentId}/verify`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ gatewayPaymentId, signature });
      expect(res2.status).toBe(200);

      // Check earnings account is credited exactly once
      const account = await prisma.earningsAccount.findUnique({ where: { userId: DRIVER_ID } });
      expect(Number(account.totalEarned)).toBe(540);
      expect(Number(account.withdrawableBalance)).toBe(540);

      const count = await prisma.earningEntry.count({ where: { paymentId } });
      expect(count).toBe(1);
    });
  });

  describe('Razorpay Webhook (POST /api/payments/webhook/razorpay)', () => {
    const webhookSecret = 'test_webhook_secret_key_123';
    let orderId;

    beforeAll(() => {
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    });

    beforeEach(async () => {
      const orderRes = await request(app)
        .post(`/api/payments/${paymentId}/pay-online`)
        .set('Authorization', `Bearer ${passengerToken}`);
      orderId = orderRes.body.data.orderId;
    });

    it('rejects webhook with invalid signature with 400', async () => {
      const body = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_wh_1',
              order_id: orderId,
            },
          },
        },
      };

      const res = await request(app)
        .post('/api/payments/webhook/razorpay')
        .set('x-razorpay-signature', 'invalid_sig')
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('processes webhook with valid HMAC signature and transitions payment to SUCCEEDED', async () => {
      const bodyObj = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_wh_valid',
              order_id: orderId,
            },
          },
        },
      };
      const rawBody = JSON.stringify(bodyObj);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/webhook/razorpay')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(payment.status).toBe('SUCCEEDED');
      expect(payment.gatewayPaymentId).toBe('pay_rzp_wh_valid');

      const account = await prisma.earningsAccount.findUnique({ where: { userId: DRIVER_ID } });
      expect(Number(account.totalEarned)).toBe(540);
      expect(Number(account.withdrawableBalance)).toBe(540);
    });

    it('handles duplicate webhook delivery idempotently without double-crediting', async () => {
      const bodyObj = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_wh_dup',
              order_id: orderId,
            },
          },
        },
      };
      const rawBody = JSON.stringify(bodyObj);
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      // First webhook delivery
      const res1 = await request(app)
        .post('/api/payments/webhook/razorpay')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);
      expect(res1.status).toBe(200);

      // Duplicate delivery
      const res2 = await request(app)
        .post('/api/payments/webhook/razorpay')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);
      expect(res2.status).toBe(200);

      const account = await prisma.earningsAccount.findUnique({ where: { userId: DRIVER_ID } });
      expect(Number(account.totalEarned)).toBe(540);
      expect(Number(account.withdrawableBalance)).toBe(540);
    });
  });

  describe('Cash Payment Workflow', () => {
    it('sets payment method to CASH and stays PENDING', async () => {
      const res = await request(app)
        .post(`/api/payments/${paymentId}/pay-cash`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.method).toBe('CASH');
      expect(res.body.data.status).toBe('PENDING');

      const dbPayment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(dbPayment.method).toBe('CASH');
      expect(dbPayment.status).toBe('PENDING');
    });

    it('rejects cash confirmation from unauthorized user or passenger with 403', async () => {
      // First switch to cash
      await request(app)
        .post(`/api/payments/${paymentId}/pay-cash`)
        .set('Authorization', `Bearer ${passengerToken}`);

      // Passenger tries to confirm their own payment
      const resPassenger = await request(app)
        .post(`/api/payments/${paymentId}/confirm-cash`)
        .set('Authorization', `Bearer ${passengerToken}`);
      expect(resPassenger.status).toBe(403);

      // Unrelated user tries to confirm
      const resOther = await request(app)
        .post(`/api/payments/${paymentId}/confirm-cash`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(resOther.status).toBe(403);
    });

    it('rejects cash confirmation if payment method is not CASH with 422', async () => {
      // Payment is PENDING but method is null / not CASH
      const res = await request(app)
        .post(`/api/payments/${paymentId}/confirm-cash`)
        .set('Authorization', `Bearer ${driverToken}`);
      expect(res.status).toBe(422);
    });

    it('confirms cash payment by payee, credits totalEarned but leaves withdrawableBalance at 0', async () => {
      await request(app)
        .post(`/api/payments/${paymentId}/pay-cash`)
        .set('Authorization', `Bearer ${passengerToken}`);

      const res = await request(app)
        .post(`/api/payments/${paymentId}/confirm-cash`)
        .set('Authorization', `Bearer ${driverToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('SUCCEEDED');
      expect(res.body.data.method).toBe('CASH');
      expect(res.body.data.receiptNumber).toMatch(/^DH-\d{8}-\d{6}$/);

      // Verify EarningEntry: withdrawable is FALSE
      const entry = await prisma.earningEntry.findUnique({ where: { paymentId } });
      expect(entry).toBeDefined();
      expect(entry.withdrawable).toBe(false);
      expect(Number(entry.netAmount)).toBe(540);

      // Verify EarningsAccount: totalEarned is credited (540), withdrawableBalance is 0!
      const account = await prisma.earningsAccount.findUnique({ where: { userId: DRIVER_ID } });
      expect(account).toBeDefined();
      expect(Number(account.totalEarned)).toBe(540);
      expect(Number(account.withdrawableBalance)).toBe(0);
    });

    it('repeated confirm-cash calls are idempotent and do not double-credit', async () => {
      await request(app)
        .post(`/api/payments/${paymentId}/pay-cash`)
        .set('Authorization', `Bearer ${passengerToken}`);

      const res1 = await request(app)
        .post(`/api/payments/${paymentId}/confirm-cash`)
        .set('Authorization', `Bearer ${driverToken}`);
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post(`/api/payments/${paymentId}/confirm-cash`)
        .set('Authorization', `Bearer ${driverToken}`);
      expect(res2.status).toBe(200);

      const account = await prisma.earningsAccount.findUnique({ where: { userId: DRIVER_ID } });
      expect(Number(account.totalEarned)).toBe(540);
      expect(Number(account.withdrawableBalance)).toBe(0);

      const entryCount = await prisma.earningEntry.count({ where: { paymentId } });
      expect(entryCount).toBe(1);
    });
  });

  describe('Mock Completion (POST /api/payments/mock/complete)', () => {
    it('allows mock completion in non-production with mock provider', async () => {
      const res = await request(app)
        .post(`/api/payments/${paymentId}/mock/complete`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ gatewayPaymentId: 'pay_mock_fast_done' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('SUCCEEDED');
      expect(res.body.data.gatewayPaymentId).toBe('pay_mock_fast_done');

      const account = await prisma.earningsAccount.findUnique({ where: { userId: DRIVER_ID } });
      expect(Number(account.totalEarned)).toBe(540);
      expect(Number(account.withdrawableBalance)).toBe(540);
    });

    it('works when paymentId is passed in the request body', async () => {
      const res = await request(app)
        .post('/api/payments/mock/complete')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ paymentId, gatewayPaymentId: 'pay_mock_body_done' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('SUCCEEDED');
    });
  });
});
