const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
const prisma = require("../lib/prisma");
const service = require("../modules/bookings/service");

function isValidCoordinate(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return (
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLng >= -180 &&
    nLng <= 180
  );
}

function parseArgs(args = process.argv.slice(2)) {
  const options = {
    rideId: null,
    steps: 20,
    delayMs: 1000,
    autoStart: true,
  };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--ride-id" && args[i + 1]) {
      options.rideId = args[i + 1];
      i += 1;
    } else if (args[i] === "--steps" && args[i + 1]) {
      options.steps = Math.max(2, parseInt(args[i + 1], 10) || 20);
      i += 1;
    } else if (args[i] === "--delay" && args[i + 1]) {
      options.delayMs = Math.max(10, parseInt(args[i + 1], 10) || 1000);
      i += 1;
    } else if (args[i] === "--no-auto-start") {
      options.autoStart = false;
    }
  }
  return options;
}

async function findEligibleRide(targetRideId = null) {
  if (targetRideId) {
    return prisma.carpoolRide.findUnique({
      where: { id: targetRideId },
      include: { driver: { select: { id: true, name: true } } },
    });
  }

  // Find in-progress ride first
  const inProgressRide = await prisma.carpoolRide.findFirst({
    where: {
      status: "IN_PROGRESS",
    },
    include: { driver: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  if (inProgressRide) return inProgressRide;

  // Otherwise, find open/full ride with bookings
  const bookedRide = await prisma.carpoolRide.findFirst({
    where: {
      status: { in: ["OPEN", "FULL"] },
      bookings: { some: {} },
    },
    include: { driver: { select: { id: true, name: true } } },
    orderBy: { departureTime: "asc" },
  });
  if (bookedRide) return bookedRide;

  // Fallback to any future ride with valid coordinates
  return prisma.carpoolRide.findFirst({
    where: {
      status: { in: ["OPEN", "FULL"] },
    },
    include: { driver: { select: { id: true, name: true } } },
    orderBy: { departureTime: "asc" },
  });
}

function validateRideForSimulation(ride) {
  if (!ride) {
    const error = new Error("RIDE_NOT_FOUND: No eligible ride was found for simulation.");
    error.code = "RIDE_NOT_FOUND";
    throw error;
  }

  if (["COMPLETED", "CANCELLED"].includes(ride.status)) {
    const error = new Error(
      `INVALID_RIDE_STATUS: Ride ${ride.id} is already ${ride.status}. Location simulation requires an active or booked ride.`,
    );
    error.code = "INVALID_RIDE_STATUS";
    throw error;
  }

  if (
    ride.originLat === null ||
    ride.originLng === null ||
    ride.destLat === null ||
    ride.destLng === null ||
    !isValidCoordinate(ride.originLat, ride.originLng) ||
    !isValidCoordinate(ride.destLat, ride.destLng)
  ) {
    const error = new Error(
      `MISSING_COORDINATES: Ride ${ride.id} origin or destination coordinates are missing or invalid.`,
    );
    error.code = "MISSING_COORDINATES";
    throw error;
  }
}

function calculateDeterministicRoute(originLat, originLng, destLat, destLng, steps = 20) {
  const oLat = Number(originLat);
  const oLng = Number(originLng);
  const dLat = Number(destLat);
  const dLng = Number(destLng);

  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const lat = Number((oLat + (dLat - oLat) * t).toFixed(6));
    const lng = Number((oLng + (dLng - oLng) * t).toFixed(6));
    points.push({ step: i, totalSteps: steps, lat, lng, progressPct: Math.round(t * 100) });
  }
  return points;
}

async function simulateRide(options = {}) {
  const {
    rideId = null,
    steps = 20,
    delayMs = 1000,
    autoStart = true,
    onStep = null,
    abortSignal = null,
  } = options;

  console.log("----------------------------------------------------------------");
  console.log("DriveHire Ride Telemetry Simulator");
  console.log("NOTICE: Simulated route progression for development and demonstration.");
  console.log("        No claim of physical GPS tracking.");
  console.log("----------------------------------------------------------------");

  const ride = await findEligibleRide(rideId);
  validateRideForSimulation(ride);

  // Transition to IN_PROGRESS if autoStart is requested and ride is OPEN/FULL
  if (autoStart && ["OPEN", "FULL"].includes(ride.status)) {
    console.log(`Starting ride ${ride.id} for driver ${ride.driverId}...`);
    try {
      await service.startRide(ride.driverId, ride.id);
      ride.status = "IN_PROGRESS";
    } catch (startErr) {
      console.warn(`Could not start ride automatically: ${startErr.message}`);
    }
  }

  const routePoints = calculateDeterministicRoute(
    ride.originLat,
    ride.originLng,
    ride.destLat,
    ride.destLng,
    steps,
  );

  console.log(`Active ride:   ${ride.id} (${ride.originText} → ${ride.destText})`);
  console.log(`Driver:        ${ride.driver?.name || ride.driverId}`);
  console.log(`Simulation:    ${routePoints.length} steps, ${delayMs}ms interval`);
  console.log("Tracking path: Live Leaflet map updates via Socket.IO room `ride:<id>`");
  console.log("Press Ctrl+C to terminate simulation gracefully.\n");

  const results = [];
  for (const point of routePoints) {
    if (abortSignal && abortSignal.aborted) {
      console.log("\nSimulation interrupted. Gracefully terminating simulation.");
      return { status: "INTERRUPTED", stepsCompleted: results.length, totalSteps: routePoints.length, rideId: ride.id };
    }

    // Update location through authenticated backend path
    const updated = await service.updateRideLocation(ride.driverId, ride.id, {
      lat: point.lat,
      lng: point.lng,
    });

    results.push(updated);
    if (typeof onStep === "function") {
      onStep(point, updated);
    }

    process.stdout.write(
      `\r[${String(point.progressPct).padStart(3, " ")}%] Step ${point.step}/${point.totalSteps} → Coordinates: (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`,
    );

    if (point.step < point.totalSteps) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.log("\n\n✓ Simulation reached destination successfully. Terminating simulation.");
  return { status: "COMPLETED", stepsCompleted: results.length, totalSteps: routePoints.length, rideId: ride.id };
}

if (require.main === module) {
  const options = parseArgs();
  const abortController = new AbortController();

  process.on("SIGINT", () => {
    console.log("\nReceived SIGINT. Shutting down telemetry stream...");
    abortController.abort();
  });

  simulateRide({ ...options, abortSignal: abortController.signal })
    .then((result) => {
      console.log(`Simulation finished with status: ${result.status} (${result.stepsCompleted}/${result.totalSteps} steps).`);
      process.exit(result.status === "COMPLETED" || result.status === "INTERRUPTED" ? 0 : 1);
    })
    .catch((err) => {
      console.error(`\nSimulation failed: ${err.message}`);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = {
  simulateRide,
  findEligibleRide,
  validateRideForSimulation,
  calculateDeterministicRoute,
  parseArgs,
};
