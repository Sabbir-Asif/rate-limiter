const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const rateLimiters = require('../middlewares/rateLimiters2');


router.get('/fixed-window', rateLimiters.fixedWindow, apiController.handleRequest);
router.get('/sliding-window', rateLimiters.slidingWindowLog, apiController.handleRequest);
router.get('/token-bucket', rateLimiters.tokenBucket, apiController.handleRequest);
router.get('/leaking-bucket', rateLimiters.leakingBucket, apiController.handleRequest);
router.get('/sliding-window-counter', rateLimiters.slidingWindowCounter, apiController.handleRequest);

module.exports = router;
