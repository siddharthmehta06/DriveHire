const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');
const controller = require('./controller');

const router = express.Router();

router.use(requireAuth);

router.post('/rides/:id/bookings', requireRole('USER', 'DRIVER'), controller.requestBooking);
router.get('/rides/:id/bookings', requireRole('DRIVER'), controller.getRideBookings);
router.post('/rides/:id/start', requireRole('DRIVER'), controller.startRide);
router.post('/rides/:id/complete', requireRole('DRIVER'), controller.completeRide);
router.post('/rides/:id/location', requireRole('DRIVER'), controller.updateRideLocation);
router.get('/rides/:id/location', controller.getRideLocation);

router.post('/bookings/:id/accept', requireRole('DRIVER'), controller.acceptBooking);
router.post('/bookings/:id/reject', requireRole('DRIVER'), controller.rejectBooking);
router.post('/bookings/:id/cancel', controller.cancelBooking);
router.get('/bookings/mine', controller.listMyBookings);

router.get('/driver/requests', requireRole('DRIVER'), controller.listDriverRequests);

module.exports = router;

