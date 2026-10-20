ALTER TABLE "users"
ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "users"
ALTER COLUMN "email_verified" SET DEFAULT FALSE;

CREATE TABLE "registration_otps" (
  "email" VARCHAR(254) NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "password_hash" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "resend_available_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "registration_otps_pkey" PRIMARY KEY ("email")
);

CREATE INDEX "registration_otps_expires_at_idx" ON "registration_otps"("expires_at");