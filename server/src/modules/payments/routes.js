const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');
const controller = require('./controller');

const router = express.Router();

// Admin pricing config
router.get('/admin/pricing/commission', requireAuth, requireRole('ADMIN'), controller.getCommission);
router.put('/admin/pricing/commission', requireAuth, requireRole('ADMIN'), controller.updateCommission);

// Admin promo codes
router.get('/admin/promo-codes', requireAuth, requireRole('ADMIN'), controller.listPromoCodes);
router.post('/admin/promo-codes', requireAuth, requireRole('ADMIN'), controller.createPromoCode);
router.patch('/admin/promo-codes/:id', requireAuth, requireRole('ADMIN'), controller.updatePromoCode);

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

// Promo code apply / remove
router.post('/payments/:id/promo', requireAuth, controller.applyPromo);
router.delete('/payments/:id/promo', requireAuth, controller.removePromo);

// Cash payment workflow
router.post('/payments/:id/pay-cash', requireAuth, controller.payCash);
router.post('/payments/:id/confirm-cash', requireAuth, controller.confirmCash);

// Digital receipts
router.get('/payments/:id/receipt.pdf', requireAuth, controller.getReceiptPdf);
router.get('/payments/:id/receipt', requireAuth, controller.getReceipt);

// Payment details by ID
router.get('/payments/:id', requireAuth, controller.getPaymentById);

module.exports = router;
