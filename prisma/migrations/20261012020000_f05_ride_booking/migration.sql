-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('RIDE', 'RENTAL');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'ACTIVE', 'COMPLETED');

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "BookingType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "bookingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_bookings" (
    "bookingId" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "seatsBooked" INTEGER NOT NULL,
    "pickupNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ride_bookings_pkey" PRIMARY KEY ("bookingId"),
    CONSTRAINT "ride_bookings_seats_booked_check" CHECK ("seatsBooked" BETWEEN 1 AND 6)
);

-- CreateTable
CREATE TABLE "ride_locations" (
    "rideId" TEXT NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_locations_pkey" PRIMARY KEY ("rideId")
);

-- CreateIndex
CREATE INDEX "bookings_userId_status_idx" ON "bookings"("userId", "status");

-- CreateIndex
CREATE INDEX "ride_bookings_rideId_idx" ON "ride_bookings"("rideId");

-- CreatePartialUniqueIndex
CREATE UNIQUE INDEX "ride_bookings_rideId_passengerId_active_unique" ON "ride_bookings"("rideId", "passengerId") WHERE active;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_bookings" ADD CONSTRAINT "ride_bookings_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_bookings" ADD CONSTRAINT "ride_bookings_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "carpool_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_bookings" ADD CONSTRAINT "ride_bookings_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_locations" ADD CONSTRAINT "ride_locations_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "carpool_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;
