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

  console.log(`Sample vehicle owner ID: ${owner.id}`);
}

main()
  .then(() => console.log('Seeded sample vehicles'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
