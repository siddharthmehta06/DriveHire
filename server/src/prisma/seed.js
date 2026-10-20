const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");

async function main() {
  const demoPasswordHash = await bcrypt.hash("1234567890", 12);

  // 1. Core and Demo Users
  const owner = await prisma.user.upsert({
    where: { email: "owner@example.com" },
    update: { passwordHash: demoPasswordHash, emailVerified: true },
    create: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "owner@example.com",
      name: "Vehicle Owner",
      phone: "9999999999",
      passwordHash: demoPasswordHash,
      role: "USER",
      emailVerified: true,
    },
  });

  const driver = await prisma.user.upsert({
    where: { email: "driver@example.com" },
    update: { passwordHash: demoPasswordHash, emailVerified: true },
    create: {
      id: "22222222-2222-4222-8222-222222222222",
      email: "driver@example.com",
      name: "DriveHire Driver",
      phone: "9888888888",
      passwordHash: demoPasswordHash,
      role: "DRIVER",
      emailVerified: true,
    },
  });
  await prisma.driverProfile.upsert({
    where: { userId: driver.id },
    update: { backgroundCheckStatus: "APPROVED" },
    create: {
      userId: driver.id,
      licenseNumber: "MH1220230001234",
      backgroundCheckStatus: "APPROVED",
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { passwordHash: demoPasswordHash, emailVerified: true },
    create: {
      id: "33333333-3333-4333-8333-333333333333",
      email: "admin@example.com",
      name: "DriveHire Administrator",
      phone: "9777777777",
      passwordHash: demoPasswordHash,
      role: "ADMIN",
      emailVerified: true,
    },
  });

  const passenger1 = await prisma.user.upsert({
    where: { email: "passenger1@example.com" },
    update: { passwordHash: demoPasswordHash, emailVerified: true },
    create: {
      id: "11111111-1111-4111-8111-222222222221",
      email: "passenger1@example.com",
      name: "Aarav Sharma",
      phone: "9820011111",
      passwordHash: demoPasswordHash,
      role: "USER",
      emailVerified: true,
    },
  });

  const passenger2 = await prisma.user.upsert({
    where: { email: "passenger2@example.com" },
    update: { passwordHash: demoPasswordHash, emailVerified: true },
    create: {
      id: "11111111-1111-4111-8111-222222222222",
      email: "passenger2@example.com",
      name: "Priya Patel",
      phone: "9820022222",
      passwordHash: demoPasswordHash,
      role: "USER",
      emailVerified: true,
    },
  });

  const passenger3 = await prisma.user.upsert({
    where: { email: "passenger3@example.com" },
    update: { passwordHash: demoPasswordHash, emailVerified: true },
    create: {
      id: "11111111-1111-4111-8111-222222222223",
      email: "passenger3@example.com",
      name: "Rohan Verma",
      phone: "9820033333",
      passwordHash: demoPasswordHash,
      role: "USER",
      emailVerified: true,
    },
  });

  const driver2 = await prisma.user.upsert({
    where: { email: "driver2@example.com" },
    update: { passwordHash: demoPasswordHash, emailVerified: true },
    create: {
      id: "22222222-2222-4222-8222-333333333332",
      email: "driver2@example.com",
      name: "Vikram Malhotra",
      phone: "9820044444",
      passwordHash: demoPasswordHash,
      role: "DRIVER",
      emailVerified: true,
    },
  });
  await prisma.driverProfile.upsert({
    where: { userId: driver2.id },
    update: { backgroundCheckStatus: "PENDING" },
    create: {
      userId: driver2.id,
      licenseNumber: "KA0520240005678",
      backgroundCheckStatus: "PENDING",
    },
  });

  const driver3 = await prisma.user.upsert({
    where: { email: "driver3@example.com" },
    update: { passwordHash: demoPasswordHash, emailVerified: true },
    create: {
      id: "22222222-2222-4222-8222-333333333333",
      email: "driver3@example.com",
      name: "Ananya Iyer",
      phone: "9820055555",
      passwordHash: demoPasswordHash,
      role: "DRIVER",
      emailVerified: true,
    },
  });
  await prisma.driverProfile.upsert({
    where: { userId: driver3.id },
    update: { backgroundCheckStatus: "APPROVED" },
    create: {
      userId: driver3.id,
      licenseNumber: "DL0120220009876",
      backgroundCheckStatus: "APPROVED",
    },
  });

  // 2. Pricing Configuration Singleton
  await prisma.pricingConfig.upsert({
    where: { id: 1 },
    update: { commissionRatePct: 10 },
    create: { id: 1, commissionRatePct: 10 },
  });

  // 3. Vehicles
  const swift = await prisma.vehicle.upsert({
    where: { registrationNumber: "MH12AB1234" },
    update: { verificationStatus: "VERIFIED", isAvailable: true },
    create: {
      id: "55555555-5555-5555-8555-555555555551",
      ownerId: owner.id,
      make: "Maruti",
      model: "Swift",
      year: 2022,
      registrationNumber: "MH12AB1234",
      vehicleType: "HATCHBACK",
      seatCapacity: 5,
      photoUrls: ["/uploads/vehicles/sample/swift.jpg"],
      verificationStatus: "VERIFIED",
      isAvailable: true,
    },
  });

  const creta = await prisma.vehicle.upsert({
    where: { registrationNumber: "KA01CD5678" },
    update: { verificationStatus: "UNDER_REVIEW", isAvailable: false },
    create: {
      id: "55555555-5555-5555-8555-555555555552",
      ownerId: owner.id,
      make: "Hyundai",
      model: "Creta",
      year: 2023,
      registrationNumber: "KA01CD5678",
      vehicleType: "SUV",
      seatCapacity: 5,
      photoUrls: ["/uploads/vehicles/sample/creta.jpg"],
      verificationStatus: "UNDER_REVIEW",
      isAvailable: false,
    },
  });

  const city = await prisma.vehicle.upsert({
    where: { registrationNumber: "MH14EF9012" },
    update: { verificationStatus: "VERIFIED", isAvailable: true },
    create: {
      id: "55555555-5555-5555-8555-555555555553",
      ownerId: driver.id,
      make: "Honda",
      model: "City",
      year: 2024,
      registrationNumber: "MH14EF9012",
      vehicleType: "SEDAN",
      seatCapacity: 4,
      photoUrls: [],
      verificationStatus: "VERIFIED",
      isAvailable: true,
    },
  });

  const innova = await prisma.vehicle.upsert({
    where: { registrationNumber: "DL01XY3456" },
    update: { verificationStatus: "VERIFIED", isAvailable: true },
    create: {
      id: "55555555-5555-5555-8555-555555555554",
      ownerId: driver3.id,
      make: "Toyota",
      model: "Innova Crysta",
      year: 2023,
      registrationNumber: "DL01XY3456",
      vehicleType: "MPV",
      seatCapacity: 7,
      photoUrls: [],
      verificationStatus: "VERIFIED",
      isAvailable: true,
    },
  });

  const nexon = await prisma.vehicle.upsert({
    where: { registrationNumber: "MH02JK7890" },
    update: { verificationStatus: "UNVERIFIED", isAvailable: false },
    create: {
      id: "55555555-5555-5555-8555-555555555555",
      ownerId: owner.id,
      make: "Tata",
      model: "Nexon",
      year: 2023,
      registrationNumber: "MH02JK7890",
      vehicleType: "SUV",
      seatCapacity: 5,
      photoUrls: [],
      verificationStatus: "UNVERIFIED",
      isAvailable: false,
    },
  });

  const ertiga = await prisma.vehicle.upsert({
    where: { registrationNumber: "KA05MN4321" },
    update: { verificationStatus: "REJECTED", isAvailable: false },
    create: {
      id: "55555555-5555-5555-8555-555555555556",
      ownerId: driver2.id,
      make: "Maruti",
      model: "Ertiga",
      year: 2021,
      registrationNumber: "KA05MN4321",
      vehicleType: "MPV",
      seatCapacity: 7,
      photoUrls: [],
      verificationStatus: "REJECTED",
      isAvailable: false,
    },
  });

  const baleno = await prisma.vehicle.upsert({
    where: { registrationNumber: "TN09PQ8765" },
    update: { verificationStatus: "EXPIRED", isAvailable: false },
    create: {
      id: "55555555-5555-5555-8555-555555555557",
      ownerId: owner.id,
      make: "Maruti",
      model: "Baleno",
      year: 2020,
      registrationNumber: "TN09PQ8765",
      vehicleType: "HATCHBACK",
      seatCapacity: 5,
      photoUrls: [],
      verificationStatus: "EXPIRED",
      isAvailable: false,
    },
  });

  // 4. Vehicle & Driver Documents
  const futureExpiry = new Date(Date.now() + 365 * 86400000);
  const pastExpiry = new Date(Date.now() - 30 * 86400000);

  const documents = [
    // Driver Licenses
    {
      id: "66666666-6666-6666-8666-111111111111",
      ownerId: driver.id,
      vehicleId: null,
      type: "LICENSE",
      documentNumber: "MH1220230001234",
      expiryDate: futureExpiry,
      fileUrl: `${driver.id}/driver-license.pdf`,
      originalName: "driver-license.pdf",
      status: "APPROVED",
    },
    {
      id: "66666666-6666-6666-8666-111111111112",
      ownerId: driver3.id,
      vehicleId: null,
      type: "LICENSE",
      documentNumber: "DL0120220009876",
      expiryDate: futureExpiry,
      fileUrl: `${driver3.id}/ananya-license.pdf`,
      originalName: "ananya-license.pdf",
      status: "APPROVED",
    },
    {
      id: "66666666-6666-6666-8666-111111111113",
      ownerId: driver2.id,
      vehicleId: null,
      type: "LICENSE",
      documentNumber: "KA0520240005678",
      expiryDate: futureExpiry,
      fileUrl: `${driver2.id}/vikram-license.pdf`,
      originalName: "vikram-license.pdf",
      status: "PENDING",
    },
    // Swift Documents (Verified)
    {
      id: "66666666-6666-6666-8666-222222222221",
      ownerId: owner.id,
      vehicleId: swift.id,
      type: "RC",
      documentNumber: "RC-MH12AB1234",
      expiryDate: futureExpiry,
      fileUrl: `${owner.id}/swift-rc.pdf`,
      originalName: "swift-rc.pdf",
      status: "APPROVED",
    },
    {
      id: "66666666-6666-6666-8666-222222222222",
      ownerId: owner.id,
      vehicleId: swift.id,
      type: "INSURANCE",
      insuranceType: "COMMERCIAL",
      documentNumber: "INS-MH12AB1234",
      expiryDate: futureExpiry,
      fileUrl: `${owner.id}/swift-ins.pdf`,
      originalName: "swift-insurance.pdf",
      status: "APPROVED",
    },
    // City Documents (Verified)
    {
      id: "66666666-6666-6666-8666-333333333331",
      ownerId: driver.id,
      vehicleId: city.id,
      type: "RC",
      documentNumber: "RC-MH14EF9012",
      expiryDate: futureExpiry,
      fileUrl: `${driver.id}/city-rc.pdf`,
      originalName: "city-rc.pdf",
      status: "APPROVED",
    },
    {
      id: "66666666-6666-6666-8666-333333333332",
      ownerId: driver.id,
      vehicleId: city.id,
      type: "INSURANCE",
      insuranceType: "COMMERCIAL",
      documentNumber: "INS-MH14EF9012",
      expiryDate: futureExpiry,
      fileUrl: `${driver.id}/city-ins.pdf`,
      originalName: "city-insurance.pdf",
      status: "APPROVED",
    },
    // Innova Documents (Verified)
    {
      id: "66666666-6666-6666-8666-444444444441",
      ownerId: driver3.id,
      vehicleId: innova.id,
      type: "RC",
      documentNumber: "RC-DL01XY3456",
      expiryDate: futureExpiry,
      fileUrl: `${driver3.id}/innova-rc.pdf`,
      originalName: "innova-rc.pdf",
      status: "APPROVED",
    },
    {
      id: "66666666-6666-6666-8666-444444444442",
      ownerId: driver3.id,
      vehicleId: innova.id,
      type: "INSURANCE",
      insuranceType: "COMMERCIAL",
      documentNumber: "INS-DL01XY3456",
      expiryDate: futureExpiry,
      fileUrl: `${driver3.id}/innova-ins.pdf`,
      originalName: "innova-insurance.pdf",
      status: "APPROVED",
    },
    // Creta Documents (Under Review)
    {
      id: "66666666-6666-6666-8666-555555555551",
      ownerId: owner.id,
      vehicleId: creta.id,
      type: "RC",
      documentNumber: "RC-KA01CD5678",
      expiryDate: futureExpiry,
      fileUrl: `${owner.id}/creta-rc.pdf`,
      originalName: "creta-rc.pdf",
      status: "PENDING",
    },
    {
      id: "66666666-6666-6666-8666-555555555552",
      ownerId: owner.id,
      vehicleId: creta.id,
      type: "INSURANCE",
      insuranceType: "COMMERCIAL",
      documentNumber: "INS-KA01CD5678",
      expiryDate: futureExpiry,
      fileUrl: `${owner.id}/creta-ins.pdf`,
      originalName: "creta-insurance.pdf",
      status: "PENDING",
    },
    // Baleno Documents (Expired)
    {
      id: "66666666-6666-6666-8666-666666666661",
      ownerId: owner.id,
      vehicleId: baleno.id,
      type: "RC",
      documentNumber: "RC-TN09PQ8765",
      expiryDate: futureExpiry,
      fileUrl: `${owner.id}/baleno-rc.pdf`,
      originalName: "baleno-rc.pdf",
      status: "APPROVED",
    },
    {
      id: "66666666-6666-6666-8666-666666666662",
      ownerId: owner.id,
      vehicleId: baleno.id,
      type: "INSURANCE",
      insuranceType: "COMMERCIAL",
      documentNumber: "INS-TN09PQ8765",
      expiryDate: pastExpiry,
      fileUrl: `${owner.id}/baleno-ins.pdf`,
      originalName: "baleno-insurance.pdf",
      status: "APPROVED",
    },
  ];

  for (const doc of documents) {
    await prisma.vehicleDocument.upsert({
      where: { id: doc.id },
      update: {
        status: doc.status,
        expiryDate: doc.expiryDate,
      },
      create: {
        id: doc.id,
        ownerId: doc.ownerId,
        vehicleId: doc.vehicleId,
        type: doc.type,
        insuranceType: doc.insuranceType || null,
        documentNumber: doc.documentNumber,
        expiryDate: doc.expiryDate,
        fileUrl: doc.fileUrl,
        originalName: doc.originalName,
        mimeType: "application/pdf",
        sizeBytes: 1024,
        status: doc.status,
      },
    });
  }

  // 5. Carpool Rides
  const now = Date.now();
  const sampleRides = [
    {
      id: "44444444-4444-4444-8444-444444444441",
      driverId: driver.id,
      vehicleId: city.id,
      originText: "Pune, Maharashtra",
      originLat: 18.5204,
      originLng: 73.8567,
      destText: "Mumbai, Maharashtra",
      destLat: 19.076,
      destLng: 72.8777,
      distanceKm: 148,
      departureTime: new Date(now + 1 * 86400000),
      totalSeats: 4,
      availableSeats: 4,
      costPerSeat: "650.00",
      status: "OPEN",
      notes: "One short expressway rest stop planned.",
    },
    {
      id: "44444444-4444-4444-8444-444444444442",
      driverId: driver.id,
      vehicleId: city.id,
      originText: "Pune, Maharashtra",
      originLat: 18.5204,
      originLng: 73.8567,
      destText: "Nashik, Maharashtra",
      destLat: 19.9975,
      destLng: 73.7898,
      distanceKm: 210,
      departureTime: new Date(now + 2 * 86400000),
      totalSeats: 4,
      availableSeats: 4,
      costPerSeat: "480.00",
      status: "OPEN",
      notes: "Luggage space available.",
    },
    {
      id: "44444444-4444-4444-8444-444444444443",
      driverId: driver.id,
      vehicleId: city.id,
      originText: "Mumbai, Maharashtra",
      originLat: 19.076,
      originLng: 72.8777,
      destText: "Pune, Maharashtra",
      destLat: 18.5204,
      destLng: 73.8567,
      distanceKm: 148,
      departureTime: new Date(now + 3 * 86400000),
      totalSeats: 4,
      availableSeats: 4,
      costPerSeat: "650.00",
      status: "OPEN",
      notes: "Evening departure from BKC.",
    },
    // Active In-Progress Ride (for Live Simulation)
    {
      id: "44444444-4444-4444-8444-444444444444",
      driverId: driver3.id,
      vehicleId: innova.id,
      originText: "Bengaluru, Karnataka",
      originLat: 12.9716,
      originLng: 77.5946,
      destText: "Mysuru, Karnataka",
      destLat: 12.2958,
      destLng: 76.6394,
      distanceKm: 145,
      departureTime: new Date(now - 30 * 60000), // departed 30m ago
      totalSeats: 6,
      availableSeats: 4,
      costPerSeat: "350.00",
      status: "IN_PROGRESS",
      notes: "Bengaluru-Mysuru Expressway ride.",
    },
    // Completed Ride with Reviews and Bookings
    {
      id: "44444444-4444-4444-8444-444444444445",
      driverId: driver.id,
      vehicleId: city.id,
      originText: "Pune, Maharashtra",
      originLat: 18.5204,
      originLng: 73.8567,
      destText: "Mumbai, Maharashtra",
      destLat: 19.076,
      destLng: 72.8777,
      distanceKm: 148,
      departureTime: new Date(now - 2 * 86400000), // 2 days ago
      totalSeats: 4,
      availableSeats: 2,
      costPerSeat: "650.00",
      status: "COMPLETED",
      notes: "Smooth trip completed.",
    },
  ];

  for (const ride of sampleRides) {
    await prisma.carpoolRide.upsert({
      where: { id: ride.id },
      update: {
        status: ride.status,
        availableSeats: ride.availableSeats,
      },
      create: {
        id: ride.id,
        driverId: ride.driverId,
        vehicleId: ride.vehicleId,
        originText: ride.originText,
        originLat: ride.originLat,
        originLng: ride.originLng,
        destText: ride.destText,
        destLat: ride.destLat,
        destLng: ride.destLng,
        distanceKm: ride.distanceKm,
        departureTime: ride.departureTime,
        totalSeats: ride.totalSeats,
        availableSeats: ride.availableSeats,
        costPerSeat: ride.costPerSeat,
        status: ride.status,
        notes: ride.notes,
      },
    });
  }

  // 6. Live Location for In-Progress Ride
  await prisma.rideLocation.upsert({
    where: { rideId: "44444444-4444-4444-8444-444444444444" },
    update: { lat: 12.65, lng: 76.95 },
    create: {
      rideId: "44444444-4444-4444-8444-444444444444",
      lat: 12.65,
      lng: 76.95,
    },
  });

  // 7. Bookings
  const sampleBookings = [
    // Active bookings on in-progress ride 4444
    {
      id: "77777777-7777-7777-8777-111111111111",
      userId: passenger1.id,
      rideId: "44444444-4444-4444-8444-444444444444",
      status: "ACTIVE",
      seatsBooked: 1,
      totalPrice: "350.00",
    },
    {
      id: "77777777-7777-7777-8777-111111111112",
      userId: passenger2.id,
      rideId: "44444444-4444-4444-8444-444444444444",
      status: "ACTIVE",
      seatsBooked: 1,
      totalPrice: "350.00",
    },
    // Completed bookings on completed ride 4445
    {
      id: "77777777-7777-7777-8777-222222222221",
      userId: passenger1.id,
      rideId: "44444444-4444-4444-8444-444444444445",
      status: "COMPLETED",
      seatsBooked: 1,
      totalPrice: "650.00",
    },
    {
      id: "77777777-7777-7777-8777-222222222222",
      userId: passenger2.id,
      rideId: "44444444-4444-4444-8444-444444444445",
      status: "COMPLETED",
      seatsBooked: 1,
      totalPrice: "650.00",
    },
  ];

  for (const b of sampleBookings) {
    await prisma.booking.upsert({
      where: { id: b.id },
      update: { status: b.status },
      create: {
        id: b.id,
        userId: b.userId,
        type: "RIDE",
        status: b.status,
      },
    });

    await prisma.rideBooking.upsert({
      where: { bookingId: b.id },
      update: {
        active: b.status === "ACTIVE",
        seatsBooked: b.seatsBooked,
      },
      create: {
        bookingId: b.id,
        rideId: b.rideId,
        passengerId: b.userId,
        seatsBooked: b.seatsBooked,
        active: b.status === "ACTIVE",
      },
    });
  }

  // 8. Driver Reviews (on completed ride 4445)
  const reviews = [
    {
      id: "88888888-8888-8888-8888-111111111111",
      rideId: "44444444-4444-4444-8444-444444444445",
      reviewerId: passenger1.id,
      driverId: driver.id,
      rating: 5,
      comment:
        "Punctual departure, comfortable car, and smooth expressway driving. Highly recommended!",
    },
    {
      id: "88888888-8888-8888-8888-222222222222",
      rideId: "44444444-4444-4444-8444-444444444445",
      reviewerId: passenger2.id,
      driverId: driver.id,
      rating: 5,
      comment:
        "Very polite driver and great vehicle condition. Would ride again anytime.",
    },
  ];

  for (const rev of reviews) {
    await prisma.driverReview.upsert({
      where: {
        rideId_reviewerId: {
          rideId: rev.rideId,
          reviewerId: rev.reviewerId,
        },
      },
      update: {
        rating: rev.rating,
        comment: rev.comment,
      },
      create: {
        id: rev.id,
        rideId: rev.rideId,
        reviewerId: rev.reviewerId,
        driverId: rev.driverId,
        rating: rev.rating,
        comment: rev.comment,
      },
    });
  }

  // 9. Promo Codes
  await prisma.promoCode.upsert({
    where: { code: "DRIVE10" },
    update: { active: true },
    create: {
      id: "99999999-9999-9999-8999-111111111111",
      code: "DRIVE10",
      discountType: "PERCENT",
      value: 10,
      maxDiscount: 100,
      minAmount: 200,
      usageLimit: 500,
      validFrom: new Date(now - 7 * 86400000),
      validUntil: new Date(now + 180 * 86400000),
      active: true,
    },
  });

  await prisma.promoCode.upsert({
    where: { code: "WELCOME50" },
    update: { active: true },
    create: {
      id: "99999999-9999-9999-8999-222222222222",
      code: "WELCOME50",
      discountType: "FLAT",
      value: 50,
      minAmount: 300,
      usageLimit: 200,
      validFrom: new Date(now - 7 * 86400000),
      validUntil: new Date(now + 180 * 86400000),
      active: true,
    },
  });

  // Verify and report seeded database aggregates
  const [
    userCount,
    vehicleCount,
    rideCount,
    bookingCount,
    reviewCount,
    docCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.vehicle.count(),
    prisma.carpoolRide.count(),
    prisma.booking.count(),
    prisma.driverReview.count(),
    prisma.vehicleDocument.count(),
  ]);

  console.log(`✓ Seed complete:`);
  console.log(`  Users:     ${userCount}`);
  console.log(`  Vehicles:  ${vehicleCount}`);
  console.log(`  Rides:     ${rideCount}`);
  console.log(`  Bookings:  ${bookingCount}`);
  console.log(`  Reviews:   ${reviewCount}`);
  console.log(`  Documents: ${docCount}`);
}

main()
  .then(() => console.log("Seeding finished successfully."))
  .catch((error) => {
    console.error("Seed error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
