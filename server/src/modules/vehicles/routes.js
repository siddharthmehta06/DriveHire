const express = require('express');
const upload = require('../../middleware/upload');
const { requireAuth, requireRole } = require('../../middleware/auth');
const controller = require('./controller');
const service = require('./service');

const router = express.Router();

router.get('/', requireAuth, requireRole('USER', 'DRIVER', 'ADMIN'), controller.listVehicles);
router.post('/', requireAuth, requireRole('USER', 'DRIVER'), upload.fields([
  { name: 'photos', maxCount: 5 },
  { name: 'photos[]', maxCount: 5 },
]), controller.createVehicle);
router.get('/:id', requireAuth, requireRole('USER', 'DRIVER', 'ADMIN'), controller.getVehicle);
router.patch(
  '/:id',
  requireAuth,
  requireRole('USER', 'DRIVER'),
  service.requireVehicleOwner,
  upload.fields([{ name: 'photos', maxCount: 5 }]),
  controller.updateVehicle,
);
router.patch('/:id/availability', requireAuth, requireRole('USER', 'DRIVER'), controller.updateAvailability);
router.delete('/:id', requireAuth, requireRole('USER', 'DRIVER'), controller.softDeleteVehicle);

module.exports = router;
