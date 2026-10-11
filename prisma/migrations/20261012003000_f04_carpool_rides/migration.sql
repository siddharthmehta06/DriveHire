CREATE TYPE "RideStatus" AS ENUM ('OPEN', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TABLE "carpool_rides" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "originText" TEXT NOT NULL,
    "originLat" DECIMAL(9,6) NOT NULL,
    "originLng" DECIMAL(9,6) NOT NULL,
    "destText" TEXT NOT NULL,
    "destLat" DECIMAL(9,6) NOT NULL,
    "destLng" DECIMAL(9,6) NOT NULL,
    "distanceKm" DECIMAL(7,2),
    "departureTime" TIMESTAMP(3) NOT NULL,
    "totalSeats" INTEGER NOT NULL,
    "availableSeats" INTEGER NOT NULL,
    "costPerSeat" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "status" "RideStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "carpool_rides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "carpool_rides_seats_check" CHECK ("totalSeats" >= 1 AND "availableSeats" BETWEEN 0 AND "totalSeats"),
    CONSTRAINT "carpool_rides_cost_check" CHECK ("costPerSeat" >= 0)
);

CREATE INDEX "carpool_rides_status_departureTime_idx" ON "carpool_rides"("status", "departureTime");
CREATE INDEX "carpool_rides_driverId_idx" ON "carpool_rides"("driverId");
CREATE INDEX "carpool_rides_vehicleId_status_departureTime_idx" ON "carpool_rides"("vehicleId", "status", "departureTime");

ALTER TABLE "carpool_rides"
    ADD CONSTRAINT "carpool_rides_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "carpool_rides"
    ADD CONSTRAINT "carpool_rides_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
