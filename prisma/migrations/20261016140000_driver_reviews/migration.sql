CREATE TABLE "driver_reviews" (
  "id" TEXT NOT NULL,
  "ride_id" TEXT NOT NULL,
  "reviewer_id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "driver_reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "driver_reviews_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "carpool_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "driver_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "driver_reviews_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "driver_reviews_ride_id_reviewer_id_key" ON "driver_reviews"("ride_id", "reviewer_id");
CREATE INDEX "driver_reviews_driver_id_created_at_idx" ON "driver_reviews"("driver_id", "created_at");