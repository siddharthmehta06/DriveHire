CREATE TYPE "BackgroundCheckStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "AuditTargetType" AS ENUM ('DOCUMENT', 'VEHICLE', 'DRIVER');

CREATE TABLE "driver_profiles" (
    "userId" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "backgroundCheckStatus" "BackgroundCheckStatus" NOT NULL DEFAULT 'PENDING',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "driver_profiles_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "verification_audits" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "targetType" "AuditTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "verification_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verification_audits_targetType_targetId_idx"
    ON "verification_audits"("targetType", "targetId");

ALTER TABLE "driver_profiles"
    ADD CONSTRAINT "driver_profiles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
