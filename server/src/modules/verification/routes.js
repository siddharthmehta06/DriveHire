const express = require("express");
const { requireAuth, requireRole } = require("../../middleware/auth");
const controller = require("./controller");

const router = express.Router();

router.post(
  "/vehicles/:id/submit-verification",
  requireAuth,
  requireRole("USER", "DRIVER"),
  controller.submitVehicle,
);
router.use("/admin", requireAuth, requireRole("ADMIN"));
router.get("/admin/dashboard", controller.getAdminDashboard);
router.get("/admin/verifications", controller.listQueue);
router.get("/admin/verifications/:vehicleId", controller.getVehicleReview);
router.post("/admin/documents/:id/approve", controller.approveDocument);
router.post("/admin/documents/:id/reject", controller.rejectDocument);
router.get("/admin/drivers", controller.listDrivers);
router.post("/admin/drivers/:userId/approve", controller.approveDriver);
router.post("/admin/drivers/:userId/reject", controller.rejectDriver);

module.exports = router;
