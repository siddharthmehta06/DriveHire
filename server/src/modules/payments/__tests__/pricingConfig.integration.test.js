const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../../app');
const prisma = require('../../../lib/prisma');
const { ensureReceiptSequence } = require('../service');

const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const DRIVER_ID = '22222222-2222-4222-8222-222222222222';

let adminToken;
let userToken;
let driverToken;

beforeAll(async () => {
  const secret = process.env.JWT_SECRET || 'test-only';
  adminToken = jwt.sign({ sub: ADMIN_ID, role: 'ADMIN' }, secret);
  userToken = jwt.sign({ sub: USER_ID, role: 'USER' }, secret);
  driverToken = jwt.sign({ sub: DRIVER_ID, role: 'DRIVER' }, secret);

  // Ensure test users exist
  await prisma.user.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: {
      id: ADMIN_ID,
      email: 'admin-pricing-test@example.com',
      name: 'Admin Pricing Tester',
      passwordHash: 'dummy',
      role: 'ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: {
      id: USER_ID,
      email: 'user-pricing-test@example.com',
      name: 'User Pricing Tester',
      passwordHash: 'dummy',
      role: 'USER',
    },
  });

  await prisma.user.upsert({
    where: { id: DRIVER_ID },
    update: {},
    create: {
      id: DRIVER_ID,
      email: 'driver-pricing-test@example.com',
      name: 'Driver Pricing Tester',
      passwordHash: 'dummy',
      role: 'DRIVER',
    },
  });

  await ensureReceiptSequence();
});

describe('Phase 1 - Admin Commission Endpoints', () => {
  beforeEach(async () => {
    await prisma.pricingConfig.upsert({
      where: { id: 1 },
      update: {
        commissionRatePct: 10,
        updatedById: null,
      },
      create: {
        id: 1,
        commissionRatePct: 10,
      },
    });
  });

  describe('GET /api/admin/pricing/commission', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/admin/pricing/commission');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns 403 when authenticated as regular USER', async () => {
      const res = await request(app)
        .get('/api/admin/pricing/commission')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when authenticated as DRIVER', async () => {
      const res = await request(app)
        .get('/api/admin/pricing/commission')
        .set('Authorization', `Bearer ${driverToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with commission config when authenticated as ADMIN', async () => {
      const res = await request(app)
        .get('/api/admin/pricing/commission')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id', 1);
      expect(res.body.data).toHaveProperty('commissionRatePct');
      expect(Number(res.body.data.commissionRatePct)).toBe(10);
    });
  });

  describe('PUT /api/admin/pricing/commission', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .put('/api/admin/pricing/commission')
        .send({ commissionRatePct: 15 });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 when caller is not an ADMIN', async () => {
      const res = await request(app)
        .put('/api/admin/pricing/commission')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ commissionRatePct: 15 });
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when commissionRatePct is negative', async () => {
      const res = await request(app)
        .put('/api/admin/pricing/commission')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ commissionRatePct: -5 });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when commissionRatePct exceeds 50%', async () => {
      const res = await request(app)
        .put('/api/admin/pricing/commission')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ commissionRatePct: 55 });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when unknown properties are included', async () => {
      const res = await request(app)
        .put('/api/admin/pricing/commission')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ commissionRatePct: 15, extraField: 'invalid' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when commissionRatePct has more than 2 decimal places', async () => {
      const res = await request(app)
        .put('/api/admin/pricing/commission')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ commissionRatePct: 15.125 });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('updates commission rate successfully and persists updatedById', async () => {
      const updateRes = await request(app)
        .put('/api/admin/pricing/commission')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ commissionRatePct: 18.5 });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(Number(updateRes.body.data.commissionRatePct)).toBe(18.5);
      expect(updateRes.body.data.updatedById).toBe(ADMIN_ID);

      const getRes = await request(app)
        .get('/api/admin/pricing/commission')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(200);
      expect(Number(getRes.body.data.commissionRatePct)).toBe(18.5);
      expect(getRes.body.data.updatedById).toBe(ADMIN_ID);
    });
  });
});

describe('Phase 1 - Database CHECK Constraints & Sequences', () => {
  it('enforces receipt_number_seq generates sequential identifiers', async () => {
    const result = await prisma.$queryRawUnsafe(`SELECT nextval('receipt_number_seq') AS seq;`);
    expect(result).toBeDefined();
    expect(Number(result[0].seq)).toBeGreaterThan(0);
  });

  it('rejects pricing_config row with id != 1', async () => {
    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO pricing_config (id, "commissionRatePct", "updatedAt")
        VALUES (2, 10.00, NOW());
      `)
    ).rejects.toThrow();
  });

  it('rejects pricing_config row with commissionRatePct > 50', async () => {
    await expect(
      prisma.$executeRawUnsafe(`
        UPDATE pricing_config SET "commissionRatePct" = 60.00 WHERE id = 1;
      `)
    ).rejects.toThrow();
  });

  it('rejects pricing_config row with commissionRatePct < 0', async () => {
    await expect(
      prisma.$executeRawUnsafe(`
        UPDATE pricing_config SET "commissionRatePct" = -5.00 WHERE id = 1;
      `)
    ).rejects.toThrow();
  });

  it('rejects payment if payeeAmount + commissionAmount != amount', async () => {
    // Need a booking to reference
    const booking = await prisma.booking.create({
      data: {
        userId: USER_ID,
        type: 'RIDE',
        status: 'COMPLETED',
      },
    });

    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO payments (
          id, "bookingId", "payerId", "payeeId",
          "baseAmount", "discountAmount", "amount",
          "commissionRatePct", "commissionAmount", "payeeAmount",
          status, "updatedAt"
        ) VALUES (
          gen_random_uuid(), '${booking.id}', '${USER_ID}', '${DRIVER_ID}',
          500.00, 0.00, 500.00,
          10.00, 50.00, 400.00, -- 50 + 400 = 450 != 500
          'PENDING', NOW()
        );
      `)
    ).rejects.toThrow();

    await prisma.booking.delete({ where: { id: booking.id } });
  });

  it('rejects payment if any amount is negative', async () => {
    const booking = await prisma.booking.create({
      data: {
        userId: USER_ID,
        type: 'RIDE',
        status: 'COMPLETED',
      },
    });

    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO payments (
          id, "bookingId", "payerId", "payeeId",
          "baseAmount", "discountAmount", "amount",
          "commissionRatePct", "commissionAmount", "payeeAmount",
          status, "updatedAt"
        ) VALUES (
          gen_random_uuid(), '${booking.id}', '${USER_ID}', '${DRIVER_ID}',
          -100.00, 0.00, -100.00,
          10.00, -10.00, -90.00,
          'PENDING', NOW()
        );
      `)
    ).rejects.toThrow();

    await prisma.booking.delete({ where: { id: booking.id } });
  });

  it('rejects earning_entries if commissionAmount + netAmount != grossAmount', async () => {
    const booking = await prisma.booking.create({
      data: {
        userId: USER_ID,
        type: 'RIDE',
        status: 'COMPLETED',
      },
    });

    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        payerId: USER_ID,
        payeeId: DRIVER_ID,
        baseAmount: 500,
        discountAmount: 0,
        amount: 500,
        commissionRatePct: 10,
        commissionAmount: 50,
        payeeAmount: 450,
        status: 'PENDING',
      },
    });

    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO earning_entries (
          id, "earnerId", "paymentId", "bookingType",
          "grossAmount", "commissionAmount", "netAmount",
          withdrawable, "createdAt"
        ) VALUES (
          gen_random_uuid(), '${DRIVER_ID}', '${payment.id}', 'RIDE',
          500.00, 50.00, 400.00, -- 50 + 400 = 450 != 500
          true, NOW()
        );
      `)
    ).rejects.toThrow();

    await prisma.payment.delete({ where: { id: payment.id } });
    await prisma.booking.delete({ where: { id: booking.id } });
  });

  it('rejects earnings_accounts if balances are negative', async () => {
    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO earnings_accounts ("userId", "withdrawableBalance", "totalEarned", "updatedAt")
        VALUES ('${USER_ID}', -50.00, 100.00, NOW());
      `)
    ).rejects.toThrow();
  });
});
