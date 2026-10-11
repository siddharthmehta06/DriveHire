CREATE TYPE "DocumentType" AS ENUM ('RC', 'INSURANCE', 'LICENSE', 'PERMIT');
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "InsuranceType" AS ENUM ('COMMERCIAL', 'PRIVATE');
CREATE TYPE "NotificationType" AS ENUM (
    'DOC_EXPIRY_REMINDER',
    'DOC_APPROVED',
    'DOC_REJECTED',
    'VEHICLE_VERIFIED',
    'VEHICLE_REJECTED',
    'BOOKING_REQUESTED',
    'BOOKING_ACCEPTED',
    'BOOKING_REJECTED',
    'BOOKING_CANCELLED',
    'PAYMENT_RECEIPT',
    'CASHOUT_PROCESSED',
    'GENERAL'
);

CREATE TABLE "vehicle_documents" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "type" "DocumentType" NOT NULL,
    "insuranceType" "InsuranceType",
    "documentNumber" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "supersededAt" TIMESTAMP(3),
    "lastReminderDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vehicle_documents_vehicleId_type_idx" ON "vehicle_documents"("vehicleId", "type");
CREATE INDEX "vehicle_documents_status_expiryDate_idx" ON "vehicle_documents"("status", "expiryDate");
CREATE INDEX "vehicle_documents_ownerId_vehicleId_type_supersededAt_idx"
    ON "vehicle_documents"("ownerId", "vehicleId", "type", "supersededAt");
CREATE UNIQUE INDEX "vehicle_documents_current_owner_vehicle_type_key"
    ON "vehicle_documents"("ownerId", COALESCE("vehicleId", ''), "type")
    WHERE "supersededAt" IS NULL;
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

ALTER TABLE "vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
