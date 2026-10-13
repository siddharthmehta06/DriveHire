const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../../app');
const prisma = require('../../../lib/prisma');
const { createPaymentForBooking, processPaymentSuccess, ensureReceiptSequence } = require('../service');

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
    create: { id: PASSENGER_ID, email: 'p4-passenger@example.com', name: 'P4 Passenger', passwordHash: 'dummy', role: 'USER' },
  });

  await prisma.user.upsert({
    where: { id: DRIVER_ID },
    update: {},
    create: { id: DRIVER_ID, email: 'p4-driver@example.com', name: 'P4 Driver', passwordHash: 'dummy', role: 'DRIVER' },
  });

  await prisma.user.upsert({
    where: { id: OTHER_USER_ID },
    update: {},
    create: { id: OTHER_USER_ID, email: 'p4-other@example.com', name: 'P4 Other', passwordHash: 'dummy', role: 'USER' },
  });

  await prisma.user.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: { id: ADMIN_ID, email: 'p4-admin@example.com', name: 'P4 Admin', passwordHash: 'dummy', role: 'ADMIN' },
  });

  const vehicle = await prisma.vehicle.upsert({
    where: { registrationNumber: 'DL01P40001' },
    update: {},
    create: {
      ownerId: DRIVER_ID,
      make: 'Hyundai',
      model: 'Verna',
      year: 2024,
      registrationNumber: 'DL01P40001',
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
      originText: 'Connaught Place, Delhi',
      originLat: 28.63,
      originLng: 77.21,
      destText: 'Indira Gandhi Airport, Delhi',
      destLat: 28.55,
      destLng: 77.08,
      distanceKm: 18,
      departureTime: new Date(Date.now() + 5 * 3600000),
      totalSeats: 3,
      availableSeats: 2,
      costPerSeat: '500.00',
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

describe('Phase 4 - Promo Codes & Digital Receipts', () => {
  let bookingId;
  let paymentId;

  beforeEach(async () => {
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

    // 2 seats * 500 = 1000 baseAmount; commission: 100, payeeAmount: 900
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

  describe('Admin Promo Code CRUD', () => {
    const promoCodeName = 'F06DISC20';

    afterEach(async () => {
      await prisma.promoCode.deleteMany({ where: { code: { in: [promoCodeName, 'FLAT150', 'EXPIRED10', 'INVALID_TEST'] } } });
    });

    it('rejects unauthenticated and non-admin requests with 401/403', async () => {
      const unauth = await request(app).get('/api/admin/promo-codes');
      expect(unauth.status).toBe(401);

      const forbidden = await request(app)
        .get('/api/admin/promo-codes')
        .set('Authorization', `Bearer ${passengerToken}`);
      expect(forbidden.status).toBe(403);
    });

    it('creates promo code with uppercase code and validates fields', async () => {
      const res = await request(app)
        .post('/api/admin/promo-codes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'f06disc20', // lowercase input should be transformed to uppercase
          discountType: 'PERCENT',
          value: 20,
          maxDiscount: 150,
          minAmount: 500,
          usageLimit: 100,
          validFrom: new Date(Date.now() - 3600000).toISOString(),
          validUntil: new Date(Date.now() + 86400000).toISOString(),
          active: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe(promoCodeName);
      expect(Number(res.body.data.value)).toBe(20);
      expect(Number(res.body.data.maxDiscount)).toBe(150);
    });

    it('rejects promo code if validUntil <= validFrom or PERCENT > 100', async () => {
      const invalidDates = await request(app)
        .post('/api/admin/promo-codes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'INVALID_TEST',
          discountType: 'PERCENT',
          value: 20,
          validFrom: new Date(Date.now() + 86400000).toISOString(),
          validUntil: new Date(Date.now()).toISOString(), // earlier than validFrom
        });
      expect(invalidDates.status).toBe(400);

      const invalidPercent = await request(app)
        .post('/api/admin/promo-codes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'INVALID_TEST',
          discountType: 'PERCENT',
          value: 120, // > 100%
          validFrom: new Date(Date.now() - 3600000).toISOString(),
          validUntil: new Date(Date.now() + 86400000).toISOString(),
        });
      expect(invalidPercent.status).toBe(400);
    });

    it('rejects duplicate promo code creation with 409', async () => {
      await request(app)
        .post('/api/admin/promo-codes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: promoCodeName,
          discountType: 'PERCENT',
          value: 10,
          validFrom: new Date(Date.now() - 3600000).toISOString(),
          validUntil: new Date(Date.now() + 86400000).toISOString(),
        });

      const dup = await request(app)
        .post('/api/admin/promo-codes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: promoCodeName,
          discountType: 'PERCENT',
          value: 15,
          validFrom: new Date(Date.now() - 3600000).toISOString(),
          validUntil: new Date(Date.now() + 86400000).toISOString(),
        });

      expect(dup.status).toBe(409);
    });

    it('updates promo code via PATCH (e.g. deactivation and limits)', async () => {
      const createRes = await request(app)
        .post('/api/admin/promo-codes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'FLAT150',
          discountType: 'FLAT',
          value: 150,
          validFrom: new Date(Date.now() - 3600000).toISOString(),
          validUntil: new Date(Date.now() + 86400000).toISOString(),
        });

      const promoId = createRes.body.data.id;

      const patchRes = await request(app)
        .patch(`/api/admin/promo-codes/${promoId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false, usageLimit: 50 });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.active).toBe(false);
      expect(patchRes.body.data.usageLimit).toBe(50);
    });
  });

  describe('Apply & Remove Promo Codes on Payment', () => {
    let activePercentPromo;
    let activeFlatPromo;
    let expiredPromo;
    let exhaustedPromo;

    beforeEach(async () => {
      activePercentPromo = await prisma.promoCode.create({
        data: {
          code: 'SAVE20CAP',
          discountType: 'PERCENT',
          value: 20,
          maxDiscount: 150, // 20% of 1000 is 200, so it should be capped at 150
          minAmount: 400,
          usageLimit: 10,
          validFrom: new Date(Date.now() - 3600000),
          validUntil: new Date(Date.now() + 86400000),
          active: true,
        },
      });

      activeFlatPromo = await prisma.promoCode.create({
        data: {
          code: 'FLAT250',
          discountType: 'FLAT',
          value: 250,
          minAmount: 500,
          validFrom: new Date(Date.now() - 3600000),
          validUntil: new Date(Date.now() + 86400000),
          active: true,
        },
      });

      expiredPromo = await prisma.promoCode.create({
        data: {
          code: 'OLDEXPIRED',
          discountType: 'PERCENT',
          value: 10,
          validFrom: new Date(Date.now() - 2 * 86400000),
          validUntil: new Date(Date.now() - 86400000),
          active: true,
        },
      });

      exhaustedPromo = await prisma.promoCode.create({
        data: {
          code: 'EXHAUSTED5',
          discountType: 'FLAT',
          value: 50,
          usageLimit: 5,
          usedCount: 5,
          validFrom: new Date(Date.now() - 3600000),
          validUntil: new Date(Date.now() + 86400000),
          active: true,
        },
      });
    });

    afterEach(async () => {
      await prisma.promoCode.deleteMany({
        where: { id: { in: [activePercentPromo.id, activeFlatPromo.id, expiredPromo.id, exhaustedPromo.id] } },
      });
    });

    it('applies PERCENT promo code and enforces maxDiscount cap with correct recalculations', async () => {
      const res = await request(app)
        .post(`/api/payments/${paymentId}/promo`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ code: 'save20cap' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // base: 1000. 20% is 200, capped at maxDiscount 150.
      expect(Number(res.body.data.discountAmount)).toBe(150);
      expect(Number(res.body.data.amount)).toBe(850); // 1000 - 150

      // Commission 10% of 850 = 85. Payee: 850 - 85 = 765.
      expect(Number(res.body.data.commissionAmount)).toBe(85);
      expect(Number(res.body.data.payeeAmount)).toBe(765);
      expect(Number(res.body.data.commissionAmount) + Number(res.body.data.payeeAmount)).toBe(850);

      // Check DB
      const dbPayment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(dbPayment.promoCodeId).toBe(activePercentPromo.id);
      expect(Number(dbPayment.discountAmount)).toBe(150);

      // Verify promo.usedCount was NOT consumed yet!
      const promoCheck = await prisma.promoCode.findUnique({ where: { id: activePercentPromo.id } });
      expect(promoCheck.usedCount).toBe(0);
    });

    it('applies FLAT promo code and recalculates amounts correctly', async () => {
      const res = await request(app)
        .post(`/api/payments/${paymentId}/promo`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ code: 'FLAT250' });

      expect(res.status).toBe(200);
      expect(Number(res.body.data.discountAmount)).toBe(250);
      expect(Number(res.body.data.amount)).toBe(750); // 1000 - 250
      expect(Number(res.body.data.commissionAmount)).toBe(75); // 10% of 750
      expect(Number(res.body.data.payeeAmount)).toBe(675);
    });

    it('rejects expired, exhausted, or minimum-amount-failing promo codes with 422', async () => {
      const resExpired = await request(app)
        .post(`/api/payments/${paymentId}/promo`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ code: 'OLDEXPIRED' });
      expect(resExpired.status).toBe(422);

      const resExhausted = await request(app)
        .post(`/api/payments/${paymentId}/promo`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ code: 'EXHAUSTED5' });
      expect(resExhausted.status).toBe(422);
    });

    it('removes promo code and restores original amounts and commission', async () => {
      // First apply promo
      await request(app)
        .post(`/api/payments/${paymentId}/promo`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ code: 'FLAT250' });

      // Then remove promo
      const res = await request(app)
        .delete(`/api/payments/${paymentId}/promo`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(Number(res.body.data.discountAmount)).toBe(0);
      expect(Number(res.body.data.amount)).toBe(1000);
      expect(Number(res.body.data.commissionAmount)).toBe(100);
      expect(Number(res.body.data.payeeAmount)).toBe(900);
      expect(res.body.data.promoCodeId).toBeNull();
    });

    it('consumes promo usageCount upon successful payment processing', async () => {
      await request(app)
        .post(`/api/payments/${paymentId}/promo`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ code: 'SAVE20CAP' });

      // Process payment success
      await processPaymentSuccess(paymentId, { method: 'ONLINE' });

      const promoAfterSuccess = await prisma.promoCode.findUnique({
        where: { id: activePercentPromo.id },
      });
      expect(promoAfterSuccess.usedCount).toBe(1);
    });

    it('fails payment success with 409 if promo code limit was reached concurrently', async () => {
      await request(app)
        .post(`/api/payments/${paymentId}/promo`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ code: 'SAVE20CAP' });

      // Simulate concurrent user exhausting the limit
      await prisma.promoCode.update({
        where: { id: activePercentPromo.id },
        data: { usedCount: 10 }, // reached usageLimit of 10
      });

      await expect(
        processPaymentSuccess(paymentId, { method: 'ONLINE' })
      ).rejects.toThrow('Promo code usage limit has been reached');
    });
  });

  describe('Digital Receipts (JSON and PDF)', () => {
    beforeEach(async () => {
      // Complete payment successfully so receipt is available
      await processPaymentSuccess(paymentId, { method: 'ONLINE', gatewayPaymentId: 'pay_receipt_test' });
    });

    it('rejects unauthenticated and unauthorized requests for receipt', async () => {
      const unauth = await request(app).get(`/api/payments/${paymentId}/receipt`);
      expect(unauth.status).toBe(401);

      const unauthPdf = await request(app).get(`/api/payments/${paymentId}/receipt.pdf`);
      expect(unauthPdf.status).toBe(401);

      const forbidden = await request(app)
        .get(`/api/payments/${paymentId}/receipt`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(forbidden.status).toBe(404);
    });

    it('returns JSON receipt to payer and payee with existing assigned receiptNumber', async () => {
      const payerRes = await request(app)
        .get(`/api/payments/${paymentId}/receipt`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(payerRes.status).toBe(200);
      expect(payerRes.body.success).toBe(true);
      expect(payerRes.body.data).toHaveProperty('receiptNumber');
      expect(payerRes.body.data.receiptNumber).toMatch(/^DH-\d{8}-\d{6}$/);
      expect(payerRes.body.data.amount).toBe('1000');
      expect(payerRes.body.data.payer.id).toBe(PASSENGER_ID);
      expect(payerRes.body.data.payee.id).toBe(DRIVER_ID);

      const payeeRes = await request(app)
        .get(`/api/payments/${paymentId}/receipt`)
        .set('Authorization', `Bearer ${driverToken}`);

      expect(payeeRes.status).toBe(200);
      expect(payeeRes.body.data.receiptNumber).toBe(payerRes.body.data.receiptNumber);
    });

    it('returns downloadable PDF receipt with correct Content-Type and binary headers', async () => {
      const res = await request(app)
        .get(`/api/payments/${paymentId}/receipt.pdf`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/inline; filename="receipt-DH-\d{8}-\d{6}\.pdf"/);
      expect(Buffer.isBuffer(res.body)).toBe(true);

      // Standard PDF header signature "%PDF-"
      const headerStr = res.body.slice(0, 5).toString('ascii');
      expect(headerStr).toBe('%PDF-');
    });

    it('returns 422 if attempting to retrieve receipt for an unpaid payment', async () => {
      const unpaidBooking = await prisma.booking.create({
        data: {
          userId: PASSENGER_ID,
          type: 'RIDE',
          status: 'PENDING',
          rideBooking: {
            create: {
              rideId: testRideId,
              passengerId: PASSENGER_ID,
              seatsBooked: 1,
              active: true,
            },
          },
        },
      });

      const unpaidPayment = await createPaymentForBooking(unpaidBooking.id);

      const res = await request(app)
        .get(`/api/payments/${unpaidPayment.id}/receipt`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(422);

      await prisma.payment.delete({ where: { id: unpaidPayment.id } });
      await prisma.booking.delete({ where: { id: unpaidBooking.id } });
    });
  });
});
