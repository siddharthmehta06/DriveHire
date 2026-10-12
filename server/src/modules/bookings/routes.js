const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');
const controller = require('./controller');

const router = express.Router();

router.use(requireAuth);

router.post('/rides/:id/bookings', requireRole('USER', 'DRIVER'), controller.requestBooking);
router.post('/bookings/:id/accept', requireRole('DRIVER'), controller.acceptBooking);
router.post('/bookings/:id/reject', requireRole('DRIVER'), controller.rejectBooking);
router.post('/bookings/:id/cancel', controller.cancelBooking);

module.exports = router;
