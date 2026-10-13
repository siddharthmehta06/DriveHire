const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');
const controller = require('./controller');

const router = express.Router();

// Admin pricing config
router.get('/admin/pricing/commission', requireAuth, requireRole('ADMIN'), controller.getCommission);
router.put('/admin/pricing/commission', requireAuth, requireRole('ADMIN'), controller.updateCommission);

// Payment details by booking
router.get('/payments/booking/:bookingId', requireAuth, controller.getPaymentByBookingId);

// Webhook endpoint (unauthenticated; signature verified by handler)
router.post('/payments/webhook/razorpay', controller.handleWebhook);

// Mock payment completion (development/mock only)
router.post('/payments/mock/complete', requireAuth, controller.completeMock);
router.post('/payments/:id/mock/complete', requireAuth, controller.completeMock);

// Online payment workflow
router.post('/payments/:id/pay-online', requireAuth, controller.payOnline);
router.post('/payments/:id/verify', requireAuth, controller.verifyPayment);

// Cash payment workflow
router.post('/payments/:id/pay-cash', requireAuth, controller.payCash);
router.post('/payments/:id/confirm-cash', requireAuth, controller.confirmCash);

module.exports = router;
