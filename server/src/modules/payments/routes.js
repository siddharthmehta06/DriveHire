const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');
const controller = require('./controller');

const router = express.Router();

router.get('/admin/pricing/commission', requireAuth, requireRole('ADMIN'), controller.getCommission);
router.put('/admin/pricing/commission', requireAuth, requireRole('ADMIN'), controller.updateCommission);

router.get('/payments/booking/:bookingId', requireAuth, controller.getPaymentByBookingId);

module.exports = router;
