const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');
const controller = require('./controller');

const router = express.Router();

router.use(requireAuth);
router.post('/rides', requireRole('DRIVER'), controller.createRide);
router.get('/rides/mine', requireRole('DRIVER'), controller.listMyRides);
router.get('/rides', controller.searchRides);
router.patch('/rides/:id/cancel', requireRole('DRIVER'), controller.cancelRide);
router.get('/rides/:id', controller.getRide);

module.exports = router;
