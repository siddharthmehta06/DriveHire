const prisma = require("../../lib/prisma");
const { AppError } = require("../../lib/errors");
const vehicleService = require("../vehicles/service");
const { notify } = require("../../lib/notifications");
const { recomputeVehicleStatus } = require("./status");

const REQUIRED_DOCUMENTS = ["RC", "INSURANCE"];
const SUBMITTABLE_STATUSES = ["UNVERIFIED", "REJECTED", "EXPIRED"];
const ACTIVE_RIDE_STATUSES = ["OPEN", "FULL", "IN_PROGRESS"];

function containsQuery(query, fields) {
  if (!query) return {};
  return {
    OR: fields.map((field) => ({
      [field]: { contains: query, mode: "insensitive" },
    })),
  };
}

function reviewDocument(document) {
  const { fileUrl, ...metadata } = document;
  return metadata;
}

async function submitVehicle(userId, vehicleId) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ownerId: userId, deletedAt: null },
    select: { id: true, verificationStatus: true },
  });
  if (!vehicle) throw new AppError("NOT_FOUND", "Vehicle not found.", 404);
  if (!SUBMITTABLE_STATUSES.includes(vehicle.verificationStatus)) {
    throw new AppError(
      "CONFLICT",
      "This vehicle cannot be submitted in its current verification state.",
      409,
      {
        code: "INVALID_VERIFICATION_STATE",
      },
    );
  }

  const documents = await prisma.vehicleDocument.findMany({
    where: {
      vehicleId,
      ownerId: userId,
      type: { in: REQUIRED_DOCUMENTS },
      supersededAt: null,
      status: { in: ["PENDING", "APPROVED"] },
      expiryDate: { gt: new Date() },
    },
    select: { type: true },
  });
  const present = new Set(documents.map((document) => document.type));
  if (REQUIRED_DOCUMENTS.some((type) => !present.has(type))) {
    throw new AppError(
      "UNPROCESSABLE",
      "Current registration and insurance documents are required.",
      422,
      {
        code: "MISSING_REQUIRED_DOCUMENTS",
      },
    );
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const claimed = await transaction.vehicle.updateMany({
      where: {
        id: vehicleId,
        ownerId: userId,
        deletedAt: null,
        verificationStatus: { in: SUBMITTABLE_STATUSES },
      },
      data: { verificationStatus: "UNDER_REVIEW" },
    });
    if (!claimed.count) {
      const currentVehicle = await transaction.vehicle.findFirst({
        where: { id: vehicleId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      if (!currentVehicle)
        throw new AppError("NOT_FOUND", "Vehicle not found.", 404);
      throw new AppError(
        "CONFLICT",
        "This vehicle cannot be submitted in its current verification state.",
        409,
        {
          code: "INVALID_VERIFICATION_STATE",
        },
      );
    }
    await transaction.verificationAudit.create({
      data: {
        adminId: userId,
        targetType: "VEHICLE",
        targetId: vehicleId,
        action: "SUBMITTED",
      },
    });
    return transaction.vehicle.findUnique({ where: { id: vehicleId } });
  });
  if (vehicle.verificationStatus !== "UNDER_REVIEW") {
    await vehicleService.setVerificationStatus(vehicleId, "UNDER_REVIEW");
  }
  return updated;
}

async function listQueue(page, limit) {
  const where = { deletedAt: null, verificationStatus: "UNDER_REVIEW" };
  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      include: {
        owner: { select: { name: true, email: true, phone: true } },
        documents: {
          where: { supersededAt: null },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { updatedAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.vehicle.count({ where }),
  ]);
  return {
    items: items.map((vehicle) => ({
      ...vehicle,
      documents: vehicle.documents.map(reviewDocument),
    })),
    total,
  };
}

async function getVehicleReview(vehicleId) {
  const vehicle = await prisma.vehicle.findFirst({
    where: {
      id: vehicleId,
      deletedAt: null,
      verificationStatus: "UNDER_REVIEW",
    },
    include: {
      owner: { select: { name: true, email: true, phone: true } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!vehicle)
    throw new AppError("NOT_FOUND", "Verification record not found.", 404);
  const audit = await prisma.verificationAudit.findMany({
    where: {
      OR: [
        { targetType: "VEHICLE", targetId: vehicleId },
        {
          targetType: "DOCUMENT",
          targetId: { in: vehicle.documents.map((document) => document.id) },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  return {
    ...vehicle,
    documents: vehicle.documents.map(reviewDocument),
    audit,
  };
}

async function decideDocument(adminId, documentId, action, reason = null) {
  const document = await prisma.vehicleDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      ownerId: true,
      vehicleId: true,
      type: true,
      insuranceType: true,
      status: true,
      expiryDate: true,
      supersededAt: true,
    },
  });
  if (!document || document.supersededAt)
    throw new AppError("NOT_FOUND", "Document not found.", 404);
  if (document.status !== "PENDING") {
    throw new AppError(
      "CONFLICT",
      "This document has already been reviewed.",
      409,
    );
  }
  if (action === "APPROVED") {
    if (
      document.type === "INSURANCE" &&
      document.insuranceType !== "COMMERCIAL"
    ) {
      throw new AppError(
        "UNPROCESSABLE",
        "Only commercial insurance can be approved.",
        422,
        {
          code: "INSURANCE_NOT_COMMERCIAL",
        },
      );
    }
    if (document.expiryDate <= new Date()) {
      throw new AppError(
        "UNPROCESSABLE",
        "Expired documents cannot be approved.",
        422,
      );
    }
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const changed = await transaction.vehicleDocument.updateMany({
      where: { id: documentId, status: "PENDING", supersededAt: null },
      data: {
        status: action,
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
    if (!changed.count)
      throw new AppError(
        "CONFLICT",
        "This document has already been reviewed.",
        409,
      );
    await transaction.verificationAudit.create({
      data: {
        adminId,
        targetType: "DOCUMENT",
        targetId: documentId,
        action,
        reason,
      },
    });
    return transaction.vehicleDocument.findUnique({
      where: { id: documentId },
    });
  });

  await notify(
    document.ownerId,
    action === "APPROVED" ? "DOC_APPROVED" : "DOC_REJECTED",
    action === "APPROVED" ? "Document approved" : "Document rejected",
    action === "APPROVED"
      ? "Your document has been approved."
      : `Your document was rejected: ${reason}`,
    { documentId },
  );

  let vehicleStatus;
  if (document.vehicleId) {
    const before = await prisma.vehicle.findUnique({
      where: { id: document.vehicleId },
      select: { verificationStatus: true },
    });
    const recomputed = await recomputeVehicleStatus(document.vehicleId);
    vehicleStatus = recomputed?.verificationStatus;
    if (
      vehicleStatus === "VERIFIED" &&
      before?.verificationStatus !== "VERIFIED"
    ) {
      await notify(
        document.ownerId,
        "VEHICLE_VERIFIED",
        "Vehicle verified",
        "Your vehicle verification is complete.",
        {
          vehicleId: document.vehicleId,
        },
      );
    } else if (
      vehicleStatus === "REJECTED" &&
      before?.verificationStatus !== "REJECTED"
    ) {
      await notify(
        document.ownerId,
        "VEHICLE_REJECTED",
        "Vehicle verification needs attention",
        "A required vehicle document was rejected.",
        {
          vehicleId: document.vehicleId,
        },
      );
    }
  }
  return { ...updated, vehicleStatus };
}

async function listDrivers(query) {
  const where = {
    backgroundCheckStatus: query.backgroundCheckStatus,
    user: { role: "DRIVER" },
  };
  const [items, total] = await Promise.all([
    prisma.driverProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            vehicleDocuments: {
              where: { type: "LICENSE", vehicleId: null, supersededAt: null },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
      orderBy: { updatedAt: "asc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.driverProfile.count({ where }),
  ]);
  return {
    items: items.map((profile) => ({
      ...profile,
      user: {
        ...profile.user,
        vehicleDocuments: profile.user.vehicleDocuments.map(reviewDocument),
      },
    })),
    total,
  };
}

async function getAdminDashboard(query) {
  const now = new Date();
  const [
    users,
    driversByStatus,
    vehiclesByStatus,
    documentsByStatus,
    activeRides,
    upcomingRides,
    reviewStats,
  ] = await Promise.all([
    prisma.user.count({ where: { role: { not: "ADMIN" } } }),
    prisma.driverProfile.groupBy({
      by: ["backgroundCheckStatus"],
      _count: { _all: true },
    }),
    prisma.vehicle.groupBy({
      by: ["verificationStatus"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.vehicleDocument.groupBy({
      by: ["status"],
      where: { supersededAt: null },
      _count: { _all: true },
    }),
    prisma.carpoolRide.count({
      where: { status: { in: ACTIVE_RIDE_STATUSES } },
    }),
    prisma.carpoolRide.count({
      where: { status: { in: ["OPEN", "FULL"] }, departureTime: { gt: now } },
    }),
    prisma.driverReview.aggregate({
      _count: { _all: true },
      _avg: { rating: true },
    }),
  ]);
  const stats = {
    users,
    drivers: Object.fromEntries(
      driversByStatus.map((row) => [
        row.backgroundCheckStatus,
        row._count._all,
      ]),
    ),
    vehicles: Object.fromEntries(
      vehiclesByStatus.map((row) => [row.verificationStatus, row._count._all]),
    ),
    documents: Object.fromEntries(
      documentsByStatus.map((row) => [row.status, row._count._all]),
    ),
    activeRides,
    upcomingRides,
    reviews: reviewStats._count._all,
    averageRating: reviewStats._avg.rating,
  };

  const skip = (query.page - 1) * query.limit;
  const q = query.q || undefined;
  let items;
  let total;

  if (query.section === "USERS") {
    const where = {
      role: { not: "ADMIN" },
      ...(query.status === "VERIFIED"
        ? { emailVerified: true }
        : query.status === "UNVERIFIED"
          ? { emailVerified: false }
          : {}),
      ...containsQuery(q, ["name", "email"]),
    };
    [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          emailVerified: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
      prisma.user.count({ where }),
    ]);
  } else if (query.section === "DRIVERS") {
    const where = {
      user: {
        role: "DRIVER",
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      ...(query.status ? { backgroundCheckStatus: query.status } : {}),
    };
    [items, total] = await Promise.all([
      prisma.driverProfile.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: query.limit,
      }),
      prisma.driverProfile.count({ where }),
    ]);
  } else if (query.section === "VEHICLES") {
    const where = {
      deletedAt: null,
      ...(query.status ? { verificationStatus: query.status } : {}),
      ...(q
        ? {
            OR: [
              { make: { contains: q, mode: "insensitive" } },
              { model: { contains: q, mode: "insensitive" } },
              { registrationNumber: { contains: q, mode: "insensitive" } },
              { owner: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    [items, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        include: { owner: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
      prisma.vehicle.count({ where }),
    ]);
  } else if (query.section === "DOCUMENTS") {
    const where = {
      supersededAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { documentNumber: { contains: q, mode: "insensitive" } },
              { originalName: { contains: q, mode: "insensitive" } },
              { owner: { name: { contains: q, mode: "insensitive" } } },
              { owner: { email: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    [items, total] = await Promise.all([
      prisma.vehicleDocument.findMany({
        where,
        select: {
          id: true,
          ownerId: true,
          vehicleId: true,
          type: true,
          insuranceType: true,
          documentNumber: true,
          expiryDate: true,
          status: true,
          createdAt: true,
          owner: { select: { name: true, email: true } },
          vehicle: {
            select: { make: true, model: true, registrationNumber: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
      prisma.vehicleDocument.count({ where }),
    ]);
  } else if (query.section === "RIDES") {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { originText: { contains: q, mode: "insensitive" } },
              { destText: { contains: q, mode: "insensitive" } },
              { driver: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    [items, total] = await Promise.all([
      prisma.carpoolRide.findMany({
        where,
        include: {
          driver: { select: { id: true, name: true } },
          vehicle: {
            select: { make: true, model: true, registrationNumber: true },
          },
        },
        orderBy: { departureTime: "desc" },
        skip,
        take: query.limit,
      }),
      prisma.carpoolRide.count({ where }),
    ]);
  } else {
    const parsedRating = query.status ? Number(query.status) : undefined;
    const where = {
      ...(parsedRating &&
      Number.isInteger(parsedRating) &&
      parsedRating >= 1 &&
      parsedRating <= 5
        ? { rating: parsedRating }
        : {}),
      ...(q
        ? {
            OR: [
              { comment: { contains: q, mode: "insensitive" } },
              { driver: { name: { contains: q, mode: "insensitive" } } },
              { reviewer: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    [items, total] = await Promise.all([
      prisma.driverReview.findMany({
        where,
        include: {
          reviewer: { select: { name: true } },
          driver: { select: { id: true, name: true } },
          ride: {
            select: { originText: true, destText: true, departureTime: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
      prisma.driverReview.count({ where }),
    ]);
  }

  return {
    stats,
    section: query.section,
    items,
    total,
    page: query.page,
    limit: query.limit,
  };
}

async function decideDriver(adminId, userId, action, reason = null) {
  const profile = await prisma.driverProfile.findUnique({
    where: { userId },
    include: { user: { select: { role: true, name: true } } },
  });
  if (!profile || profile.user.role !== "DRIVER")
    throw new AppError("NOT_FOUND", "Driver not found.", 404);
  if (profile.backgroundCheckStatus !== "PENDING") {
    throw new AppError(
      "CONFLICT",
      "This driver has already been reviewed.",
      409,
    );
  }
  if (action === "APPROVED") {
    const license = await prisma.vehicleDocument.findFirst({
      where: {
        ownerId: userId,
        vehicleId: null,
        type: "LICENSE",
        status: "APPROVED",
        supersededAt: null,
        expiryDate: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!license) {
      throw new AppError(
        "UNPROCESSABLE",
        "An approved, unexpired driving licence is required.",
        422,
        {
          code: "APPROVED_LICENSE_REQUIRED",
        },
      );
    }
  }

  await prisma.$transaction(async (transaction) => {
    const changed = await transaction.driverProfile.updateMany({
      where: { userId, backgroundCheckStatus: "PENDING" },
      data: { backgroundCheckStatus: action },
    });
    if (!changed.count)
      throw new AppError(
        "CONFLICT",
        "This driver has already been reviewed.",
        409,
      );
    await transaction.verificationAudit.create({
      data: {
        adminId,
        targetType: "DRIVER",
        targetId: userId,
        action,
        reason,
      },
    });
  });
  await notify(
    userId,
    "GENERAL",
    action === "APPROVED"
      ? "Driver approval complete"
      : "Driver application rejected",
    action === "APPROVED"
      ? "Your driver account is approved."
      : `Your driver application was rejected: ${reason}`,
    { userId },
  );
  return prisma.driverProfile.findUnique({ where: { userId } });
}

module.exports = {
  submitVehicle,
  listQueue,
  getVehicleReview,
  decideDocument,
  listDrivers,
  getAdminDashboard,
  decideDriver,
};
