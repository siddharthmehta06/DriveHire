CREATE TYPE "VehicleType" AS ENUM ('HATCHBACK', 'SEDAN', 'SUV', 'MPV', 'LUXURY');

CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "seatCapacity" INTEGER NOT NULL,
    "photoUrls" TEXT[],
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vehicles_seat_capacity_check" CHECK ("seatCapacity" BETWEEN 1 AND 8)
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "vehicles_registrationNumber_key" ON "vehicles"("registrationNumber");
CREATE INDEX "vehicles_ownerId_idx" ON "vehicles"("ownerId");

ALTER TABLE "vehicles"
    ADD CONSTRAINT "vehicles_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION validate_vehicle_year() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW."year" < 1990 OR NEW."year" > EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER + 1 THEN
        RAISE EXCEPTION 'Vehicle year must be between 1990 and next calendar year'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "vehicles_year_check"
    BEFORE INSERT OR UPDATE OF "year" ON "vehicles"
    FOR EACH ROW EXECUTE FUNCTION validate_vehicle_year();
