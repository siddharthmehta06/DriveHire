const prisma = require('../../lib/prisma');
const { emit } = require('../../lib/events');
const { AppError } = require('../../lib/errors');
const { assertDriverApproved, assertVehicleVerified } = require('../verification/guards');
const vehicleService = require('../vehicles/service');

const VEHICLE_GAP_HOURS = Number(process.env.RIDE_VEHICLE_GAP_HOURS || 3);
const GAP_MILLISECONDS = VEHICLE_GAP_HOURS * 60 * 60 * 1000;

async function createRide(driverId, input) {
  await assertDriverApproved(driverId);

  const departureTime = new Date(input.departureTime);
  if (departureTime.getTime() < Date.now() + 30 * 60 * 1000) {
    throw new AppError('UNPROCESSABLE', 'Departure must be at least 30 minutes from now.', 422, {
      code: 'DEPARTURE_TOO_SOON',
    });
  }

  const vehicle = await vehicleService.getVehicleForOwner(input.vehicleId, driverId);
  if (!vehicle) throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);
  await assertVehicleVerified(input.vehicleId);
  if (!vehicle.isAvailable) {
    throw new AppError('UNPROCESSABLE', 'The selected vehicle is unavailable.', 422, {
      code: 'VEHICLE_UNAVAILABLE',
    });
  }
  if (input.totalSeats > vehicle.seatCapacity) {
    throw new AppError('UNPROCESSABLE', 'Ride seats cannot exceed vehicle capacity.', 422, {
      code: 'SEAT_CAPACITY_EXCEEDED',
    });
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "vehicles" WHERE "id" = ${input.vehicleId} FOR UPDATE`;
      const currentVehicle = await transaction.vehicle.findFirst({
        where: {
          id: input.vehicleId,
          ownerId: driverId,
          deletedAt: null,
          isAvailable: true,
          verificationStatus: 'VERIFIED',
        },
        select: { id: true, seatCapacity: true },
      });
      if (!currentVehicle) throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);
      if (input.totalSeats > currentVehicle.seatCapacity) {
        throw new AppError('UNPROCESSABLE', 'Ride seats cannot exceed vehicle capacity.', 422, {
          code: 'SEAT_CAPACITY_EXCEEDED',
        });
      }

      const gap = await transaction.carpoolRide.findFirst({
        where: {
          vehicleId: input.vehicleId,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          departureTime: {
            gte: new Date(departureTime.getTime() - GAP_MILLISECONDS),
            lte: new Date(departureTime.getTime() + GAP_MILLISECONDS),
          },
        },
        select: { id: true },
      });
      if (gap) {
        throw new AppError('CONFLICT', 'This vehicle has another ride scheduled within three hours.', 409, {
          code: 'VEHICLE_RIDE_GAP',
        });
      }

      return transaction.carpoolRide.create({
        data: {
          driverId,
          vehicleId: currentVehicle.id,
          originText: input.originText,
          originLat: input.originLat,
          originLng: input.originLng,
          destText: input.destText,
          destLat: input.destLat,
          destLng: input.destLng,
          distanceKm: input.distanceKm,
          departureTime,
          totalSeats: input.totalSeats,
          availableSeats: input.totalSeats,
          costPerSeat: input.costPerSeat.toFixed(2),
          notes: input.notes || null,
        },
      });
    });
  } catch (error) {
    if (error.code === 'P2034') {
      throw new AppError('CONFLICT', 'Another ride was scheduled for this vehicle at the same time.', 409, {
        code: 'VEHICLE_RIDE_GAP',
      });
    }
    throw error;
  }
}

async function getRide(rideId) {
  const ride = await prisma.carpoolRide.findUnique({
    where: { id: rideId },
    include: {
      driver: { select: { name: true } },
      vehicle: { select: { make: true, model: true, vehicleType: true } },
    },
  });
  if (!ride) throw new AppError('NOT_FOUND', 'Ride not found.', 404);
  return {
    ...ride,
    driver: { firstName: ride.driver.name.trim().split(/\s+/)[0] },
    rating: null,
  };
}

async function listMyRides(driverId, query) {
  const where = {
    driverId,
    ...(query.status ? { status: query.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.carpoolRide.findMany({
      where,
      include: { vehicle: { select: { make: true, model: true, registrationNumber: true } } },
      orderBy: { departureTime: 'asc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.carpoolRide.count({ where }),
  ]);
  return { items, total };
}

async function cancelRide(driverId, rideId) {
  const result = await prisma.carpoolRide.updateMany({
    where: { id: rideId, driverId, status: { in: ['OPEN', 'FULL'] } },
    data: { status: 'CANCELLED' },
  });
  if (!result.count) {
    const ride = await prisma.carpoolRide.findUnique({
      where: { id: rideId },
      select: { id: true, driverId: true },
    });
    if (!ride || ride.driverId !== driverId) throw new AppError('NOT_FOUND', 'Ride not found.', 404);
    throw new AppError('CONFLICT', 'Only open or full rides can be cancelled.', 409);
  }
  const ride = await prisma.carpoolRide.findUnique({ where: { id: rideId } });
  await emit('ride.cancelled', { rideId, driverId, ride });
  return ride;
}

function hasVehicleCommitments(vehicleId) {
  return prisma.carpoolRide.findFirst({
    where: {
      vehicleId,
      status: { in: ['OPEN', 'FULL', 'IN_PROGRESS'] },
      departureTime: { gt: new Date() },
    },
    select: { id: true },
  }).then(Boolean);
}

vehicleService.registerCommitmentCheck(hasVehicleCommitments);

module.exports = { createRide, getRide, listMyRides, cancelRide, hasVehicleCommitments };
