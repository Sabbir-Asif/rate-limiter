const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const { perClientRateLimiter } = require('../middlewares/rateLimiters');
const { tokenBucketMiddleware } = require('../middlewares/rateLimiter2');


router.get('/token-bucket', perClientRateLimiter, apiController.handleRequest);

router.get('/token-bucket-race', tokenBucketMiddleware, apiController.handleRequest);

module.exports = router;