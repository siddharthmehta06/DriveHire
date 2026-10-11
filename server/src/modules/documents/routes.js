const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { documentUpload } = require('../../middleware/documentUpload');
const controller = require('./controller');

const router = express.Router();

router.use(requireAuth);
router.post('/', requireRole('USER', 'DRIVER'), documentUpload.single('file'), controller.upload);
router.get('/', requireRole('USER', 'DRIVER', 'ADMIN'), controller.list);
router.get('/:id/file', requireRole('USER', 'DRIVER', 'ADMIN'), controller.download);
router.get('/:id', requireRole('USER', 'DRIVER', 'ADMIN'), controller.get);
router.delete('/:id', requireRole('USER', 'DRIVER'), controller.remove);

module.exports = router;
