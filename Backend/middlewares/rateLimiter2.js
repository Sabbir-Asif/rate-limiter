const redis = require('../config/redis');

async function tokenBucketMiddleware(req, res, next) {
    const BUCKET_CAPACITY = 10;
    const REFILL_RATE = 1;
    const REFILL_TIME = 1000;
    
    const userKey = `tokenbucket:${req.ip}`;
    const now = Date.now();

    try {
        const bucketData = await redis.get(userKey);
        
        let tokens;
        let lastRefillTime;
        
        if (!bucketData) {
            tokens = BUCKET_CAPACITY;
            lastRefillTime = now;
        } else {
            const data = JSON.parse(bucketData);
            lastRefillTime = data.lastRefillTime;
            
            const timePassed = now - lastRefillTime;
            const tokensToAdd = Math.floor((timePassed / REFILL_TIME) * REFILL_RATE);
            tokens = Math.min(BUCKET_CAPACITY, data.tokens + tokensToAdd);
        }

        if (tokens >= 1) {
            tokens -= 1;
            
            await redis.setex(
                userKey,
                3600,
                JSON.stringify({
                    tokens,
                    lastRefillTime: now
                })
            );
            res.setHeader('X-RateLimit-Limit', BUCKET_CAPACITY);
            res.setHeader('X-RateLimit-Remaining', tokens);
            res.setHeader('X-RateLimit-Reset', 
                Math.ceil(now/1000) + Math.ceil((BUCKET_CAPACITY - tokens)/REFILL_RATE)
            );
            
            return next();
        } else {
            await redis.setex(
                userKey,
                3600,
                JSON.stringify({
                    tokens,
                    lastRefillTime: now
                })
            );
            const retryAfter = Math.ceil((1 - tokens) / REFILL_RATE);
            
            return res.status(429).json({
                success: false,
                message: "Rate limit exceeded. Please try again later.",
                rateLimit: {
                    limit: BUCKET_CAPACITY,
                    remaining: tokens,
                    resetAt: new Date(now + (retryAfter * 1000)).toISOString(),
                    retryAfter: retryAfter
                }
            });
        }
        
    } catch (error) {
        console.error('Token bucket error:', error);
        next(error);
    }
}

module.exports = {
    tokenBucketMiddleware
};