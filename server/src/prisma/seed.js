const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

async function main() {
  const demoPasswordHash = await bcrypt.hash('DriveHire2026!', 12);
  const owner = await prisma.user.upsert({
    where: { email: 'owner@example.com' },
    update: { passwordHash: demoPasswordHash },
    create: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'owner@example.com',
      name: 'Vehicle Owner',
      phone: '9999999999',
      passwordHash: demoPasswordHash,
      role: 'USER',
    },
  });

  const driver = await prisma.user.upsert({
    where: { email: 'driver@example.com' },
    update: { passwordHash: demoPasswordHash },
    create: {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'driver@example.com',
      name: 'DriveHire Driver',
      phone: '9888888888',
      passwordHash: demoPasswordHash,
      role: 'DRIVER',
    },
  });
  await prisma.driverProfile.upsert({
    where: { userId: driver.id },
    update: {},
    create: { userId: driver.id },
  });

  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { passwordHash: demoPasswordHash },
    create: {
      id: '33333333-3333-4333-8333-333333333333',
      email: 'admin@example.com',
      name: 'DriveHire Administrator',
      phone: '9777777777',
      passwordHash: demoPasswordHash,
      role: 'ADMIN',
    },
  });

  await prisma.pricingConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      commissionRatePct: 10,
    },
  });

  await prisma.vehicle.upsert({
    where: { registrationNumber: 'MH12AB1234' },
    update: {},
    create: {
      ownerId: owner.id,
      make: 'Maruti',
      model: 'Swift',
      year: 2022,
      registrationNumber: 'MH12AB1234',
      vehicleType: 'HATCHBACK',
      seatCapacity: 5,
      photoUrls: ['/uploads/vehicles/sample/swift.jpg'],
      verificationStatus: 'VERIFIED',
      isAvailable: true,
    },
  });

  await prisma.vehicle.upsert({
    where: { registrationNumber: 'KA01CD5678' },
    update: {},
    create: {
      ownerId: owner.id,
      make: 'Hyundai',
      model: 'Creta',
      year: 2023,
      registrationNumber: 'KA01CD5678',
      vehicleType: 'SUV',
      seatCapacity: 5,
      photoUrls: ['/uploads/vehicles/sample/creta.jpg'],
      verificationStatus: 'UNDER_REVIEW',
      isAvailable: false,
    },
  });

  const driverVehicle = await prisma.vehicle.upsert({
    where: { registrationNumber: 'MH14EF9012' },
    update: { verificationStatus: 'VERIFIED', isAvailable: true },
    create: {
      ownerId: driver.id,
      make: 'Honda',
      model: 'City',
      year: 2024,
      registrationNumber: 'MH14EF9012',
      vehicleType: 'SEDAN',
      seatCapacity: 4,
      photoUrls: [],
      verificationStatus: 'VERIFIED',
      isAvailable: true,
    },
  });

  const driverLicense = await prisma.vehicleDocument.findFirst({
    where: { ownerId: driver.id, vehicleId: null, type: 'LICENSE', documentNumber: 'MH1220230001234' },
  });
  if (!driverLicense) {
    await prisma.vehicleDocument.create({
      data: {
        ownerId: driver.id,
        type: 'LICENSE',
        documentNumber: 'MH1220230001234',
        expiryDate: new Date(Date.now() + 365 * 86400000),
        fileUrl: `${driver.id}/sample-driver-license.pdf`,
        originalName: 'sample-driver-license.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        status: 'APPROVED',
      },
    });
  }

  const sampleRides = [
    {
      id: '44444444-4444-4444-8444-444444444441',
      originText: 'Pune, Maharashtra',
      originLat: 18.5204,
      originLng: 73.8567,
      destText: 'Mumbai, Maharashtra',
      destLat: 19.076,
      destLng: 72.8777,
      distanceKm: 148,
      daysAhead: 1,
      costPerSeat: '650.00',
      notes: 'One short rest stop planned.',
    },
    {
      id: '44444444-4444-4444-8444-444444444442',
      originText: 'Pune, Maharashtra',
      originLat: 18.5204,
      originLng: 73.8567,
      destText: 'Nashik, Maharashtra',
      destLat: 19.9975,
      destLng: 73.7898,
      distanceKm: 210,
      daysAhead: 2,
      costPerSeat: '480.00',
      notes: 'Luggage space is available.',
    },
    {
      id: '44444444-4444-4444-8444-444444444443',
      originText: 'Mumbai, Maharashtra',
      originLat: 19.076,
      originLng: 72.8777,
      destText: 'Pune, Maharashtra',
      destLat: 18.5204,
      destLng: 73.8567,
      distanceKm: 148,
      daysAhead: 3,
      costPerSeat: '650.00',
      notes: 'Evening departure.',
    },
  ];
  for (const ride of sampleRides) {
    await prisma.carpoolRide.upsert({
      where: { id: ride.id },
      update: {},
      create: {
        id: ride.id,
        driverId: driver.id,
        vehicleId: driverVehicle.id,
        originText: ride.originText,
        originLat: ride.originLat,
        originLng: ride.originLng,
        destText: ride.destText,
        destLat: ride.destLat,
        destLng: ride.destLng,
        distanceKm: ride.distanceKm,
        departureTime: new Date(Date.now() + ride.daysAhead * 86400000),
        totalSeats: 4,
        availableSeats: 4,
        costPerSeat: ride.costPerSeat,
        notes: ride.notes,
      },
    });
  }

  // Seed pricing config singleton
  await prisma.pricingConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, commissionRatePct: 10 },
  });

  console.log(`Sample vehicle owner ID: ${owner.id}`);
}

main()
  .then(() => console.log('Seeded sample vehicles and carpool rides'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
