-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ONLINE', 'CASH');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FLAT');

-- CreateSequence
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START WITH 1 INCREMENT BY 1;

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "payeeId" TEXT NOT NULL,
    "baseAmount" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(10,2) NOT NULL,
    "commissionRatePct" DECIMAL(5,2) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "payeeAmount" DECIMAL(10,2) NOT NULL,
    "promoCodeId" TEXT,
    "method" "PaymentMethod",
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "gatewayProvider" TEXT,
    "gatewayOrderId" TEXT,
    "gatewayPaymentId" TEXT,
    "failureReason" TEXT,
    "receiptNumber" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_amounts_check" CHECK (
        "baseAmount" >= 0 AND
        "discountAmount" >= 0 AND
        "amount" >= 0 AND
        "commissionAmount" >= 0 AND
        "payeeAmount" >= 0 AND
        "commissionRatePct" >= 0
    ),
    CONSTRAINT "payments_balance_check" CHECK ("payeeAmount" + "commissionAmount" = "amount")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "maxDiscount" DECIMAL(10,2),
    "minAmount" DECIMAL(10,2),
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "promo_codes_value_check" CHECK ("value" >= 0),
    CONSTRAINT "promo_codes_used_count_check" CHECK ("usedCount" >= 0)
);

-- CreateTable
CREATE TABLE "pricing_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "commissionRatePct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_config_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pricing_config_singleton_check" CHECK ("id" = 1),
    CONSTRAINT "pricing_config_rate_check" CHECK ("commissionRatePct" >= 0 AND "commissionRatePct" <= 50)
);

-- CreateTable
CREATE TABLE "earning_entries" (
    "id" TEXT NOT NULL,
    "earnerId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "bookingType" "BookingType" NOT NULL,
    "grossAmount" DECIMAL(10,2) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "netAmount" DECIMAL(10,2) NOT NULL,
    "withdrawable" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earning_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "earning_entries_amounts_check" CHECK (
        "grossAmount" >= 0 AND
        "commissionAmount" >= 0 AND
        "netAmount" >= 0
    ),
    CONSTRAINT "earning_entries_balance_check" CHECK ("commissionAmount" + "netAmount" = "grossAmount")
);

-- CreateTable
CREATE TABLE "earnings_accounts" (
    "userId" TEXT NOT NULL,
    "withdrawableBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalEarned" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "earnings_accounts_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "earnings_accounts_balances_check" CHECK (
        "withdrawableBalance" >= 0 AND
        "totalEarned" >= 0
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_bookingId_key" ON "payments"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_gatewayOrderId_key" ON "payments"("gatewayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receiptNumber_key" ON "payments"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "earning_entries_paymentId_key" ON "earning_entries"("paymentId");

-- CreateIndex
CREATE INDEX "earning_entries_earnerId_createdAt_idx" ON "earning_entries"("earnerId", "createdAt");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earning_entries" ADD CONSTRAINT "earning_entries_earnerId_fkey" FOREIGN KEY ("earnerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earning_entries" ADD CONSTRAINT "earning_entries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings_accounts" ADD CONSTRAINT "earnings_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
