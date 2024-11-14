const redis = require('../config/redis');

const luaScript = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local timestamp = tonumber(ARGV[2])

-- Get the current count for this minute window
local currentCount = redis.call('GET', key)

-- If key doesn't exist, create it and set TTL
if currentCount == false then
    redis.call('SET', key, '0', 'EX', 60)
    currentCount = 0
else
    currentCount = tonumber(currentCount)
end

-- Check if we've exceeded the rate limit
if currentCount >= capacity then
    return -1
end

-- Increment the counter and return new value
redis.call('INCR', key)
return currentCount + 1
`;

async function perClientRateLimiter(req, res, next) {
    const CAPACITY = 10;
    const key = `ratelimit:${req.ip}:${Math.floor(Date.now() / 60000)}`;
    const timestamp = Math.floor(Date.now() / 1000);

    try {
        const result = await redis.eval(luaScript, 1, key, CAPACITY, timestamp);

        if (result > 0 && result <= CAPACITY) {
            res.setHeader('X-RateLimit-Limit', CAPACITY);
            res.setHeader('X-RateLimit-Remaining', CAPACITY - result);
            res.setHeader('X-RateLimit-Reset', Math.ceil(timestamp / 60) * 60);
            return next();
        } else {
            const retryAfter = 60 - (timestamp % 60);
            res.setHeader('X-RateLimit-Limit', CAPACITY);
            res.setHeader('X-RateLimit-Remaining', 0);
            res.setHeader('X-RateLimit-Reset', Math.ceil(timestamp / 60) * 60);
            res.setHeader('Retry-After', retryAfter);
            
            return res.status(429).json({
                error: 'Rate limit exceeded',
                retryAfter: retryAfter,
                message: `Too many requests. Please try again after ${retryAfter} seconds`
            });
        }
    } catch (error) {
        console.error('Rate limiter error:', error);
        next(error);
    }
}

exports.perClientRateLimiter = perClientRateLimiter;