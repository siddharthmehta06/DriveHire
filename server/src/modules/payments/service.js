const prisma = require('../../lib/prisma');
const { Prisma } = require('@prisma/client');
const { AppError } = require('../../lib/errors');

async function ensureReceiptSequence() {
  try {
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START WITH 1 INCREMENT BY 1;`);
  } catch (error) {
    // If running in an environment where sequence creation isn't supported or fails, let error log handle
  }
}

async function getCommissionConfig() {
  let config = await prisma.pricingConfig.findUnique({
    where: { id: 1 },
    include: {
      updatedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!config) {
    config = await prisma.pricingConfig.create({
      data: {
        id: 1,
        commissionRatePct: new Prisma.Decimal('10.00'),
      },
      include: {
        updatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  return {
    id: config.id,
    commissionRatePct: config.commissionRatePct.toString(),
    updatedById: config.updatedById,
    updatedBy: config.updatedBy,
    updatedAt: config.updatedAt,
  };
}

async function updateCommissionConfig({ commissionRatePct, adminId }) {
  const decimalRate = new Prisma.Decimal(commissionRatePct);
  if (decimalRate.lessThan(0) || decimalRate.greaterThan(50)) {
    throw new AppError('VALIDATION_ERROR', 'Commission rate must be between 0 and 50 percent.', 400);
  }

  const updated = await prisma.pricingConfig.upsert({
    where: { id: 1 },
    update: {
      commissionRatePct: decimalRate,
      updatedById: adminId,
    },
    create: {
      id: 1,
      commissionRatePct: decimalRate,
      updatedById: adminId,
    },
    include: {
      updatedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return {
    id: updated.id,
    commissionRatePct: updated.commissionRatePct.toString(),
    updatedById: updated.updatedById,
    updatedBy: updated.updatedBy,
    updatedAt: updated.updatedAt,
  };
}

module.exports = {
  ensureReceiptSequence,
  getCommissionConfig,
  updateCommissionConfig,
};
