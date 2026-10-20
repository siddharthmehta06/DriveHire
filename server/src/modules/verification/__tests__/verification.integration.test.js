const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");
const prisma = require("../../../lib/prisma");
const { recomputeVehicleStatus } = require("../status");
const { assertDriverApproved, assertVehicleVerified } = require("../guards");
const {
  handleDocumentUploaded,
  handleExpiredDocument,
} = require("../expiryListener");
const request = require("supertest");
const app = require("../../../app");

const OWNER_ID = "f3f3ff70-21ce-4e65-a104-a5f31c7f4174";
const ADMIN_ID = "f4f4ff70-21ce-4e65-a104-a5f31c7f4175";
const DRIVER_ID = "f5f5ff70-21ce-4e65-a104-a5f31c7f4176";

let vehicleId;
let ownerToken;
let adminToken;

async function createVehicle(status = "UNDER_REVIEW") {
  const vehicle = await prisma.vehicle.create({
    data: {
      ownerId: OWNER_ID,
      make: "Test",
      model: "Verification Vehicle",
      year: new Date().getFullYear(),
      registrationNumber: `VF${randomUUID().replace(/-/g, "").slice(0, 8)}`,
      vehicleType: "SEDAN",
      seatCapacity: 4,
      verificationStatus: status,
    },
  });
  vehicleId = vehicle.id;
  return vehicle;
}

async function createDocument(
  type,
  {
    status = "PENDING",
    insuranceType = null,
    expiryDate = new Date(Date.now() + 86400000),
  } = {},
) {
  return prisma.vehicleDocument.create({
    data: {
      ownerId: OWNER_ID,
      vehicleId,
      type,
      insuranceType,
      documentNumber: `${type}-${randomUUID().slice(0, 8)}`,
      expiryDate,
      fileUrl: `${OWNER_ID}/${randomUUID()}`,
      originalName: "verification.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
      status,
    },
  });
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash("VerificationPassword12!", 4);
  await Promise.all([
    prisma.user.upsert({
      where: { email: "verification-owner@example.com" },
      update: { emailVerified: true },
      create: {
        id: OWNER_ID,
        name: "Verification Owner",
        email: "verification-owner@example.com",
        passwordHash,
        role: "USER",
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email: "verification-admin@example.com" },
      update: { emailVerified: true },
      create: {
        id: ADMIN_ID,
        name: "Verification Admin",
        email: "verification-admin@example.com",
        passwordHash,
        role: "ADMIN",
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email: "verification-driver@example.com" },
      update: { emailVerified: true },
      create: {
        id: DRIVER_ID,
        name: "Verification Driver",
        email: "verification-driver@example.com",
        passwordHash,
        role: "DRIVER",
        emailVerified: true,
      },
    }),
  ]);
  await prisma.driverProfile.upsert({
    where: { userId: DRIVER_ID },
    update: { backgroundCheckStatus: "PENDING" },
    create: { userId: DRIVER_ID },
  });
  const [ownerLogin, adminLogin] = await Promise.all([
    request(app).post("/api/auth/login").send({
      email: "verification-owner@example.com",
      password: "VerificationPassword12!",
      role: "USER",
    }),
    request(app).post("/api/auth/login").send({
      email: "verification-admin@example.com",
      password: "VerificationPassword12!",
      role: "ADMIN",
    }),
  ]);
  ownerToken = ownerLogin.body.data.token;
  adminToken = adminLogin.body.data.token;
});

beforeEach(async () => {
  await prisma.verificationAudit.deleteMany({
    where: { adminId: { in: [OWNER_ID, ADMIN_ID, "SYSTEM"] } },
  });
  await prisma.notification.deleteMany({ where: { userId: OWNER_ID } });
  await prisma.notification.deleteMany({ where: { userId: DRIVER_ID } });
  await prisma.vehicleDocument.deleteMany({ where: { ownerId: OWNER_ID } });
  await prisma.vehicleDocument.deleteMany({ where: { ownerId: DRIVER_ID } });
  await prisma.vehicle.deleteMany({ where: { ownerId: OWNER_ID } });
  await prisma.driverProfile.update({
    where: { userId: DRIVER_ID },
    data: { backgroundCheckStatus: "PENDING" },
  });
});

afterAll(async () => {
  await prisma.verificationAudit.deleteMany({
    where: { adminId: { in: [OWNER_ID, ADMIN_ID, "SYSTEM"] } },
  });
  await prisma.notification.deleteMany({
    where: { userId: { in: [OWNER_ID, DRIVER_ID] } },
  });
  await prisma.vehicleDocument.deleteMany({
    where: { ownerId: { in: [OWNER_ID, DRIVER_ID] } },
  });
  await prisma.vehicle.deleteMany({ where: { ownerId: OWNER_ID } });
  await prisma.driverProfile.deleteMany({ where: { userId: DRIVER_ID } });
  await prisma.user.deleteMany({
    where: { id: { in: [OWNER_ID, ADMIN_ID, DRIVER_ID] } },
  });
});

it("recomputes vehicle status from both current, approved, unexpired required documents", async () => {
  await createVehicle();
  await createDocument("RC", { status: "APPROVED" });
  await createDocument("INSURANCE", {
    status: "APPROVED",
    insuranceType: "COMMERCIAL",
  });

  const result = await recomputeVehicleStatus(vehicleId);
  expect(result.verificationStatus).toBe("VERIFIED");
  expect(
    (await prisma.vehicle.findUnique({ where: { id: vehicleId } }))
      .verificationStatus,
  ).toBe("VERIFIED");
});

it("rejects a vehicle when a required current document is rejected", async () => {
  await createVehicle();
  await createDocument("RC", { status: "REJECTED" });
  await createDocument("INSURANCE", {
    status: "PENDING",
    insuranceType: "COMMERCIAL",
  });

  expect((await recomputeVehicleStatus(vehicleId)).verificationStatus).toBe(
    "REJECTED",
  );
});

it("downgrades a verified vehicle when a required document expires", async () => {
  await createVehicle("VERIFIED");
  await createDocument("RC", {
    status: "EXPIRED",
    expiryDate: new Date(Date.now() - 86400000),
  });
  await createDocument("INSURANCE", {
    status: "APPROVED",
    insuranceType: "COMMERCIAL",
  });

  expect((await recomputeVehicleStatus(vehicleId)).verificationStatus).toBe(
    "EXPIRED",
  );
});

it("does not approve a vehicle with private insurance or superseded documents", async () => {
  await createVehicle();
  await createDocument("RC", { status: "APPROVED" });
  await createDocument("INSURANCE", {
    status: "APPROVED",
    insuranceType: "PRIVATE",
  });

  expect((await recomputeVehicleStatus(vehicleId)).verificationStatus).toBe(
    "UNDER_REVIEW",
  );
});

it("downgrades verification when replacement documents supersede the approved record", async () => {
  await createVehicle("VERIFIED");
  const oldRc = await createDocument("RC", { status: "APPROVED" });
  await createDocument("INSURANCE", {
    status: "APPROVED",
    insuranceType: "COMMERCIAL",
  });
  await prisma.vehicleDocument.update({
    where: { id: oldRc.id },
    data: { supersededAt: new Date() },
  });
  const replacement = await createDocument("RC");

  await handleDocumentUploaded({ id: replacement.id, vehicleId });
  expect(
    (await prisma.vehicle.findUnique({ where: { id: vehicleId } }))
      .verificationStatus,
  ).toBe("EXPIRED");
});

it("records automatic expiry and recomputes the affected vehicle status", async () => {
  await createVehicle("VERIFIED");
  const rc = await createDocument("RC", {
    status: "EXPIRED",
    expiryDate: new Date(Date.now() - 86400000),
  });
  await createDocument("INSURANCE", {
    status: "APPROVED",
    insuranceType: "COMMERCIAL",
  });

  await handleExpiredDocument({ id: rc.id, vehicleId });
  expect(
    (await prisma.vehicle.findUnique({ where: { id: vehicleId } }))
      .verificationStatus,
  ).toBe("EXPIRED");
  expect(
    await prisma.verificationAudit.findFirst({
      where: {
        targetType: "DOCUMENT",
        targetId: rc.id,
        action: "AUTO_EXPIRED",
      },
    }),
  ).toBeTruthy();
});

it("guards downstream features against unverified vehicles and unapproved drivers", async () => {
  await createVehicle();
  await expect(assertVehicleVerified(vehicleId)).rejects.toMatchObject({
    code: "UNPROCESSABLE",
    details: { code: "VEHICLE_NOT_VERIFIED" },
  });
  await expect(assertDriverApproved(DRIVER_ID)).rejects.toMatchObject({
    code: "UNPROCESSABLE",
    details: { code: "DRIVER_NOT_APPROVED" },
  });

  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { verificationStatus: "VERIFIED" },
  });
  await prisma.driverProfile.update({
    where: { userId: DRIVER_ID },
    data: { backgroundCheckStatus: "APPROVED" },
  });
  await prisma.vehicleDocument.create({
    data: {
      ownerId: DRIVER_ID,
      type: "LICENSE",
      documentNumber: "DRIVER-LICENSE",
      expiryDate: new Date(Date.now() + 86400000),
      fileUrl: `${DRIVER_ID}/${randomUUID()}`,
      originalName: "license.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
      status: "APPROVED",
    },
  });
  await expect(assertVehicleVerified(vehicleId)).resolves.toBeDefined();
  await expect(assertDriverApproved(DRIVER_ID)).resolves.toBeDefined();
});

it("requires current RC and insurance before owner submission and masks other owners", async () => {
  const vehicle = await createVehicle("UNVERIFIED");
  const missing = await request(app)
    .post(`/api/vehicles/${vehicle.id}/submit-verification`)
    .set("Authorization", `Bearer ${ownerToken}`);
  expect(missing.status).toBe(422);
  expect(missing.body.error.details.code).toBe("MISSING_REQUIRED_DOCUMENTS");

  const other = await request(app)
    .post(`/api/vehicles/${vehicle.id}/submit-verification`)
    .set("Authorization", `Bearer ${await loginAsDriver()}`);
  expect(other.status).toBe(404);
});

it("submits vehicle documents to the admin queue without exposing storage paths", async () => {
  const vehicle = await createVehicle("UNVERIFIED");
  await createDocument("RC");
  await createDocument("INSURANCE", { insuranceType: "COMMERCIAL" });

  const submitted = await request(app)
    .post(`/api/vehicles/${vehicle.id}/submit-verification`)
    .set("Authorization", `Bearer ${ownerToken}`);
  expect(submitted.status).toBe(200);
  expect(submitted.body.data.verificationStatus).toBe("UNDER_REVIEW");

  const queue = await request(app)
    .get("/api/admin/verifications?page=1&limit=10")
    .set("Authorization", `Bearer ${adminToken}`);
  expect(queue.status).toBe(200);
  expect(queue.body.data.some((item) => item.id === vehicle.id)).toBe(true);
  expect(
    queue.body.data
      .find((item) => item.id === vehicle.id)
      .documents.every((item) => !("fileUrl" in item)),
  ).toBe(true);

  const detail = await request(app)
    .get(`/api/admin/verifications/${vehicle.id}`)
    .set("Authorization", `Bearer ${adminToken}`);
  expect(detail.status).toBe(200);
  expect(detail.body.data.owner).toEqual({
    name: "Verification Owner",
    email: "verification-owner@example.com",
    phone: null,
  });
  expect(
    detail.body.data.audit.some((item) => item.action === "SUBMITTED"),
  ).toBe(true);
});

it.each(["REJECTED", "EXPIRED"])(
  "allows a %s vehicle to return to review after replacement documents are supplied",
  async (status) => {
    const vehicle = await createVehicle(status);
    await createDocument("RC");
    await createDocument("INSURANCE", { insuranceType: "COMMERCIAL" });

    const response = await request(app)
      .post(`/api/vehicles/${vehicle.id}/submit-verification`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.verificationStatus).toBe("UNDER_REVIEW");
  },
);

it.each(["UNDER_REVIEW", "VERIFIED"])(
  "does not allow a %s vehicle to be submitted again",
  async (status) => {
    const vehicle = await createVehicle(status);
    const documentStatus = status === "VERIFIED" ? "APPROVED" : "PENDING";
    await createDocument("RC", { status: documentStatus });
    await createDocument("INSURANCE", {
      status: documentStatus,
      insuranceType: "COMMERCIAL",
    });

    const response = await request(app)
      .post(`/api/vehicles/${vehicle.id}/submit-verification`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(409);
    expect(response.body.error.details.code).toBe("INVALID_VERIFICATION_STATE");
    expect(
      (await prisma.vehicle.findUnique({ where: { id: vehicle.id } }))
        .verificationStatus,
    ).toBe(status);
    expect(
      await prisma.verificationAudit.count({
        where: {
          targetType: "VEHICLE",
          targetId: vehicle.id,
          action: "SUBMITTED",
        },
      }),
    ).toBe(0);
  },
);

it("restricts verification endpoints to administrators", async () => {
  const response = await request(app)
    .get("/api/admin/verifications")
    .set("Authorization", `Bearer ${ownerToken}`);
  expect(response.status).toBe(403);
});

it("only approves commercial, unexpired documents and verifies when both required files are approved", async () => {
  const vehicle = await createVehicle("UNVERIFIED");
  const rc = await createDocument("RC");
  const privateInsurance = await createDocument("INSURANCE", {
    insuranceType: "PRIVATE",
  });
  await request(app)
    .post(`/api/vehicles/${vehicle.id}/submit-verification`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .expect(200);

  const [first, duplicate] = await Promise.all([
    request(app)
      .post(`/api/admin/documents/${rc.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`),
    request(app)
      .post(`/api/admin/documents/${rc.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`),
  ]);
  expect([first.status, duplicate.status].sort()).toEqual([200, 409]);
  const review = await request(app)
    .get(`/api/admin/verifications/${vehicle.id}`)
    .set("Authorization", `Bearer ${adminToken}`);
  expect(
    review.body.data.audit.some(
      (entry) => entry.targetId === rc.id && entry.action === "APPROVED",
    ),
  ).toBe(true);

  const privateDecision = await request(app)
    .post(`/api/admin/documents/${privateInsurance.id}/approve`)
    .set("Authorization", `Bearer ${adminToken}`);
  expect(privateDecision.status).toBe(422);
  expect(privateDecision.body.error.details.code).toBe(
    "INSURANCE_NOT_COMMERCIAL",
  );
  await prisma.vehicleDocument.update({
    where: { id: privateInsurance.id },
    data: { supersededAt: new Date() },
  });
  const insurance = await createDocument("INSURANCE", {
    insuranceType: "COMMERCIAL",
  });

  const approvedInsurance = await request(app)
    .post(`/api/admin/documents/${insurance.id}/approve`)
    .set("Authorization", `Bearer ${adminToken}`);
  expect(approvedInsurance.status).toBe(200);
  expect(approvedInsurance.body.data.vehicleStatus).toBe("VERIFIED");
  expect(
    (await prisma.vehicle.findUnique({ where: { id: vehicle.id } }))
      .verificationStatus,
  ).toBe("VERIFIED");
  expect(
    await prisma.verificationAudit.count({
      where: {
        targetType: "DOCUMENT",
        targetId: { in: [rc.id, insurance.id] },
        action: "APPROVED",
      },
    }),
  ).toBe(2);
});

it("requires a substantive reason for document rejection and persists the decision", async () => {
  const vehicle = await createVehicle("UNVERIFIED");
  const document = await createDocument("RC");
  await createDocument("INSURANCE", { insuranceType: "COMMERCIAL" });
  await request(app)
    .post(`/api/vehicles/${vehicle.id}/submit-verification`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .expect(200);

  const invalid = await request(app)
    .post(`/api/admin/documents/${document.id}/reject`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ reason: "no" });
  expect(invalid.status).toBe(400);

  const rejected = await request(app)
    .post(`/api/admin/documents/${document.id}/reject`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ reason: "Registration details are unreadable." });
  expect(rejected.status).toBe(200);
  expect(rejected.body.data.rejectionReason).toBe(
    "Registration details are unreadable.",
  );
  expect(
    (await prisma.vehicle.findUnique({ where: { id: vehicle.id } }))
      .verificationStatus,
  ).toBe("REJECTED");
  expect(
    await prisma.verificationAudit.findFirst({
      where: {
        targetType: "DOCUMENT",
        targetId: document.id,
        action: "REJECTED",
      },
    }),
  ).toMatchObject({ adminId: ADMIN_ID });
});

it("requires an approved current license before an admin can approve a driver", async () => {
  const queue = await request(app)
    .get("/api/admin/drivers?backgroundCheckStatus=PENDING")
    .set("Authorization", `Bearer ${adminToken}`);
  expect(queue.status).toBe(200);
  const driver = queue.body.data.find((entry) => entry.userId === DRIVER_ID);
  expect(driver).toBeDefined();
  expect(driver.user.vehicleDocuments).toHaveLength(0);

  const blocked = await request(app)
    .post(`/api/admin/drivers/${DRIVER_ID}/approve`)
    .set("Authorization", `Bearer ${adminToken}`);
  expect(blocked.status).toBe(422);
  expect(blocked.body.error.details.code).toBe("APPROVED_LICENSE_REQUIRED");

  await prisma.vehicleDocument.create({
    data: {
      ownerId: DRIVER_ID,
      type: "LICENSE",
      documentNumber: "DRIVER-APPROVAL-LICENSE",
      expiryDate: new Date(Date.now() + 86400000),
      fileUrl: `${DRIVER_ID}/${randomUUID()}`,
      originalName: "license.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
      status: "APPROVED",
    },
  });
  const approved = await request(app)
    .post(`/api/admin/drivers/${DRIVER_ID}/approve`)
    .set("Authorization", `Bearer ${adminToken}`);
  expect(approved.status).toBe(200);
  expect(approved.body.data.backgroundCheckStatus).toBe("APPROVED");
  await expect(assertDriverApproved(DRIVER_ID)).resolves.toBeDefined();
  expect(
    await prisma.verificationAudit.findFirst({
      where: { targetType: "DRIVER", targetId: DRIVER_ID, action: "APPROVED" },
    }),
  ).toMatchObject({ adminId: ADMIN_ID });
});

it("rejects drivers with a required reason and returns them to no-approval state", async () => {
  const invalid = await request(app)
    .post(`/api/admin/drivers/${DRIVER_ID}/reject`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ reason: "no" });
  expect(invalid.status).toBe(400);

  const rejected = await request(app)
    .post(`/api/admin/drivers/${DRIVER_ID}/reject`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ reason: "Identity could not be confirmed." });
  expect(rejected.status).toBe(200);
  expect(rejected.body.data.backgroundCheckStatus).toBe("REJECTED");
  await expect(assertDriverApproved(DRIVER_ID)).rejects.toMatchObject({
    details: { code: "DRIVER_NOT_APPROVED" },
  });
  expect(
    await prisma.verificationAudit.findFirst({
      where: { targetType: "DRIVER", targetId: DRIVER_ID, action: "REJECTED" },
    }),
  ).toMatchObject({
    adminId: ADMIN_ID,
    reason: "Identity could not be confirmed.",
  });
});

it("restricts the admin dashboard and serves every database-backed section", async () => {
  const unauthenticated = await request(app).get("/api/admin/dashboard");
  expect(unauthenticated.status).toBe(401);

  const forbidden = await request(app)
    .get("/api/admin/dashboard")
    .set("Authorization", `Bearer ${ownerToken}`);
  expect(forbidden.status).toBe(403);

  for (const section of [
    "USERS",
    "DRIVERS",
    "VEHICLES",
    "DOCUMENTS",
    "RIDES",
    "REVIEWS",
  ]) {
    const response = await request(app)
      .get(`/api/admin/dashboard?section=${section}&page=1&limit=5`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.section).toBe(section);
    expect(response.body.data.items).toBeInstanceOf(Array);
    expect(response.body.data.stats).toMatchObject({
      activeRides: expect.any(Number),
      upcomingRides: expect.any(Number),
      reviews: expect.any(Number),
    });
    expect(response.body.meta).toMatchObject({ page: 1, limit: 5 });
  }
});

it("filters and paginates admin vehicle records using database status", async () => {
  const vehicle = await createVehicle("UNVERIFIED");
  const response = await request(app)
    .get(
      "/api/admin/dashboard?section=VEHICLES&status=UNVERIFIED&q=Verification%20Vehicle&page=1&limit=1",
    )
    .set("Authorization", `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(response.body.data.items).toHaveLength(1);
  expect(response.body.data.items[0]).toMatchObject({
    id: vehicle.id,
    verificationStatus: "UNVERIFIED",
  });
  expect(response.body.meta.total).toBe(1);
  expect(response.body.data.stats.vehicles.UNVERIFIED).toBeGreaterThanOrEqual(
    1,
  );
});

async function loginAsDriver() {
  const login = await request(app).post("/api/auth/login").send({
    email: "verification-driver@example.com",
    password: "VerificationPassword12!",
    role: "DRIVER",
  });
  return login.body.data.token;
}
