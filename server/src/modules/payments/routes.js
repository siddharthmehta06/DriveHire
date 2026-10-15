const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');
const controller = require('./controller');

const router = express.Router();

router.use(requireAuth);

// Payment lifecycle
router.get('/payments/booking/:bookingId', controller.getPaymentByBooking);
router.post('/payments/:id/pay-online', controller.payOnline);
router.post('/payments/:id/pay-cash', controller.payCash);
router.post('/payments/:id/confirm-cash', controller.confirmCash);
router.post('/payments/:id/promo', controller.applyPromo);
router.delete('/payments/:id/promo', controller.removePromo);
router.get('/payments/:id/receipt', controller.getReceipt);
router.post('/payments/mock/complete/:id', controller.mockComplete);

// Admin endpoints
router.get('/admin/pricing/commission', requireRole('ADMIN'), controller.getCommission);
router.put('/admin/pricing/commission', requireRole('ADMIN'), controller.updateCommission);
router.get('/admin/promo-codes', requireRole('ADMIN'), controller.listPromoCodes);
router.post('/admin/promo-codes', requireRole('ADMIN'), controller.createPromoCode);
router.patch('/admin/promo-codes/:id', requireRole('ADMIN'), controller.updatePromoCode);
router.get('/admin/payments', requireRole('ADMIN'), controller.listPayments);

module.exports = router;
