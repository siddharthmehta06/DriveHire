const prisma = require('../../lib/prisma');
const { Prisma } = require('@prisma/client');
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
    const ride = await prisma.$transaction(async (transaction) => {
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
    await publishRideSeats(ride);
    return ride;
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

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function buildDepartureRange(query) {
  const now = new Date();
  const date = query.date || now.toISOString().slice(0, 10);
  const start = new Date(`${date}T${query.timeFrom || '00:00'}:00.000Z`);
  const end = new Date(`${date}T${query.timeTo || '23:59'}:59.999Z`);
  return { start, end };
}

async function searchRides(query) {
  const conditions = [
    Prisma.sql`r."status" = 'OPEN'`,
    Prisma.sql`r."availableSeats" >= ${query.seats}`,
    Prisma.sql`r."departureTime" > ${new Date()}`,
  ];

  if (query.origin) {
    conditions.push(Prisma.sql`r."originText" ILIKE ${`%${escapeLike(query.origin)}%`} ESCAPE E'\\\\'`);
  }
  if (query.destination) {
    conditions.push(Prisma.sql`r."destText" ILIKE ${`%${escapeLike(query.destination)}%`} ESCAPE E'\\\\'`);
  }
  if (query.date || query.timeFrom || query.timeTo) {
    const { start, end } = buildDepartureRange(query);
    conditions.push(Prisma.sql`r."departureTime" >= ${start} AND r."departureTime" <= ${end}`);
  }
  if (query.maxPrice !== undefined) {
    conditions.push(Prisma.sql`r."costPerSeat" <= ${query.maxPrice}`);
  }
  if (query.lat !== undefined && query.lng !== undefined) {
    const radians = Math.PI / 180;
    const distance = Prisma.sql`6371 * 2 * ASIN(SQRT(
      POWER(SIN((${query.lat} - r."destLat") * ${radians} / 2), 2)
      + COS(r."destLat" * ${radians}) * COS(${query.lat} * ${radians})
      * POWER(SIN((${query.lng} - r."destLng") * ${radians} / 2), 2)
    ))`;
    conditions.push(Prisma.sql`${distance} <= ${query.radiusKm}`);
  }

  const where = Prisma.join(conditions, ' AND ');
  const orderBy = query.sort === 'price'
    ? Prisma.sql`r."costPerSeat" ASC, r."departureTime" ASC`
    : Prisma.sql`r."departureTime" ASC, r."id" ASC`;
  const offset = (query.page - 1) * query.limit;
  const [items, countRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT r."id", r."driverId", r."vehicleId", r."originText", r."originLat", r."originLng",
        r."destText", r."destLat", r."destLng", r."distanceKm", r."departureTime",
        r."totalSeats", r."availableSeats", r."costPerSeat", r."notes", r."status", r."createdAt",
        u."name" AS "driverName", v."make" AS "vehicleMake", v."model" AS "vehicleModel",
        v."vehicleType" AS "vehicleType"
      FROM "carpool_rides" r
      JOIN "users" u ON u."id" = r."driverId"
      JOIN "vehicles" v ON v."id" = r."vehicleId"
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${query.limit} OFFSET ${offset}
    `,
    prisma.$queryRaw`
      SELECT COUNT(*)::INTEGER AS "total"
      FROM "carpool_rides" r
      WHERE ${where}
    `,
  ]);

  return {
    items: items.map(({ driverName, vehicleMake, vehicleModel, vehicleType, ...ride }) => ({
      ...ride,
      driver: { firstName: driverName.trim().split(/\s+/)[0] },
      vehicle: { make: vehicleMake, model: vehicleModel, vehicleType },
      rating: null,
    })),
    total: countRows[0].total,
  };
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
  await publishRideSeats(ride);
  await emit('ride.cancelled', { rideId, driverId, ride });
  return ride;
}

async function publishRideSeats(ride) {
  const realtime = require('../../lib/realtime');
  realtime.emitToRide(ride.id, 'ride:seats-updated', {
    rideId: ride.id,
    availableSeats: ride.availableSeats,
    status: ride.status,
  });
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

module.exports = {
  createRide,
  getRide,
  listMyRides,
  searchRides,
  cancelRide,
  hasVehicleCommitments,
  publishRideSeats,
};
