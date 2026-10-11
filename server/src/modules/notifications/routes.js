const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const controller = require('./controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', controller.list);
router.patch('/:id/read', controller.markRead);
router.post('/read-all', controller.markAllRead);

module.exports = router;
