const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const { globalRateLimiter } = require('../middlewares/rateLimiters');

router.get('/token-bucket', globalRateLimiter, apiController.handleRequest);

module.exports = router;