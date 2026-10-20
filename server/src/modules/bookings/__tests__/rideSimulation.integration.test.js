const prisma = require("../../../lib/prisma");
const {
  validateRideForSimulation,
  calculateDeterministicRoute,
  simulateRide,
} = require("../../../scripts/simulateRide");

describe("Phase 5: Ride Simulation & Telemetry", () => {
  let driverUser;
  let vehicle;
  let testRide;

  beforeAll(async () => {
    driverUser = await prisma.user.upsert({
      where: { email: "sim-driver@example.com" },
      update: { emailVerified: true },
      create: {
        id: "22222222-2222-4222-8222-999999999999",
        name: "Simulation Driver",
        email: "sim-driver@example.com",
        passwordHash: "hash",
        role: "DRIVER",
        emailVerified: true,
      },
    });

    vehicle = await prisma.vehicle.upsert({
      where: { registrationNumber: "MH01SIM1234" },
      update: { verificationStatus: "VERIFIED", isAvailable: true },
      create: {
        id: "55555555-5555-5555-8555-999999999999",
        ownerId: driverUser.id,
        make: "Toyota",
        model: "Camry",
        year: 2023,
        registrationNumber: "MH01SIM1234",
        vehicleType: "SEDAN",
        seatCapacity: 4,
        photoUrls: [],
        verificationStatus: "VERIFIED",
        isAvailable: true,
      },
    });

    testRide = await prisma.carpoolRide.upsert({
      where: { id: "44444444-4444-4444-8444-999999999999" },
      update: {
        status: "IN_PROGRESS",
        originLat: 18.5204,
        originLng: 73.8567,
        destLat: 19.076,
        destLng: 72.8777,
      },
      create: {
        id: "44444444-4444-4444-8444-999999999999",
        driverId: driverUser.id,
        vehicleId: vehicle.id,
        originText: "Pune",
        originLat: 18.5204,
        originLng: 73.8567,
        destText: "Mumbai",
        destLat: 19.076,
        destLng: 72.8777,
        distanceKm: 148,
        departureTime: new Date(Date.now() + 3600000),
        totalSeats: 4,
        availableSeats: 4,
        costPerSeat: "500.00",
        status: "IN_PROGRESS",
      },
    });
  });

  afterAll(async () => {
    await prisma.rideLocation.deleteMany({ where: { rideId: testRide.id } });
    await prisma.carpoolRide.deleteMany({ where: { id: testRide.id } });
    await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
    await prisma.user.deleteMany({ where: { id: driverUser.id } });
    await prisma.$disconnect();
  });

  describe("Validation guards", () => {
    it("rejects simulation when ride is null or not found", () => {
      expect(() => validateRideForSimulation(null)).toThrow("RIDE_NOT_FOUND");
    });

    it("rejects simulation when ride is already completed or cancelled", () => {
      expect(() =>
        validateRideForSimulation({ id: "r-1", status: "COMPLETED" }),
      ).toThrow("INVALID_RIDE_STATUS");

      expect(() =>
        validateRideForSimulation({ id: "r-2", status: "CANCELLED" }),
      ).toThrow("INVALID_RIDE_STATUS");
    });

    it("rejects simulation when origin or destination coordinates are missing or invalid", () => {
      expect(() =>
        validateRideForSimulation({
          id: "r-3",
          status: "IN_PROGRESS",
          originLat: null,
          originLng: 73.85,
          destLat: 19.07,
          destLng: 72.87,
        }),
      ).toThrow("MISSING_COORDINATES");

      expect(() =>
        validateRideForSimulation({
          id: "r-4",
          status: "OPEN",
          originLat: 18.52,
          originLng: 73.85,
          destLat: 200, // Invalid latitude > 90
          destLng: 72.87,
        }),
      ).toThrow("MISSING_COORDINATES");
    });
  });

  describe("Deterministic route calculation", () => {
    it("computes linear coordinates between origin and destination across N steps", () => {
      const steps = 4;
      const points = calculateDeterministicRoute(10, 20, 20, 40, steps);

      expect(points).toHaveLength(5); // 0, 1, 2, 3, 4
      expect(points[0]).toMatchObject({ step: 0, lat: 10, lng: 20, progressPct: 0 });
      expect(points[2]).toMatchObject({ step: 2, lat: 15, lng: 30, progressPct: 50 });
      expect(points[4]).toMatchObject({ step: 4, lat: 20, lng: 40, progressPct: 100 });
    });
  });

  describe("Execution & Telemetry update", () => {
    it("executes deterministic steps, persists coordinates, and completes gracefully", async () => {
      const steps = 3;
      const captured = [];

      const result = await simulateRide({
        rideId: testRide.id,
        steps,
        delayMs: 20,
        onStep: (point, updated) => {
          captured.push({ point, updated });
        },
      });

      expect(result.status).toBe("COMPLETED");
      expect(result.stepsCompleted).toBe(steps + 1);
      expect(captured).toHaveLength(steps + 1);

      // Verify the location was saved in the database
      const dbLocation = await prisma.rideLocation.findUnique({
        where: { rideId: testRide.id },
      });
      expect(dbLocation).not.toBeNull();
      expect(Number(dbLocation.lat)).toBeCloseTo(19.076, 3);
      expect(Number(dbLocation.lng)).toBeCloseTo(72.8777, 3);
    });

    it("terminates gracefully when simulation is interrupted", async () => {
      const abortController = new AbortController();

      // Abort after first step
      let stepCount = 0;
      const result = await simulateRide({
        rideId: testRide.id,
        steps: 10,
        delayMs: 50,
        abortSignal: abortController.signal,
        onStep: () => {
          stepCount += 1;
          if (stepCount >= 2) {
            abortController.abort();
          }
        },
      });

      expect(result.status).toBe("INTERRUPTED");
      expect(result.stepsCompleted).toBeLessThan(11);
    });
  });
});
