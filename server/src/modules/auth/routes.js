const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const controller = require('./controller');

const router = express.Router();

router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', requireAuth, controller.currentUser);

module.exports = router;
