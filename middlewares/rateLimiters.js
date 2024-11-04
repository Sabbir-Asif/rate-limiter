const redisClient = require('../config/redisClient');

// Fixed Window Counter
exports.fixedWindow = async (req, res, next) => {
    const key = `fixed:${req.ip}`;
    const windowSize = 60; // seconds
    const limit = 10;

    const count = await redisClient.incr(key);
    if (count === 1) await redisClient.expire(key, windowSize);

    if (count > limit) return res.status(429).json({ error: "Rate limit exceeded" });
    next();
};

// Sliding Window Log
exports.slidingWindowLog = async (req, res, next) => {
    const key = `log:${req.ip}`;
    const windowSize = 60000; // 1 minute in ms
    const limit = 10;
    const now = Date.now();

    const transactions = await redisClient.lrange(key, 0, -1);
    if (transactions.length >= limit && now - transactions[0] < windowSize) {
        return res.status(429).json({ error: "Rate limit exceeded" });
    }

    await redisClient.lpush(key, now);
    await redisClient.ltrim(key, 0, limit - 1);
    await redisClient.pexpire(key, windowSize);
    next();
};

// Token Bucket
exports.tokenBucket = async (req, res, next) => {
    const key = `token:${req.ip}`;
    const capacity = 10;
    const refillRate = 1; // refill per second
    const refillInterval = 1000;

    const lastRefillTime = await redisClient.hget(key, 'lastRefillTime');
    const tokens = await redisClient.hget(key, 'tokens') || capacity;

    const currentTime = Date.now();
    const timeElapsed = (currentTime - lastRefillTime) / refillInterval;
    const newTokens = Math.min(capacity, tokens + timeElapsed * refillRate);

    if (newTokens < 1) return res.status(429).json({ error: "Rate limit exceeded" });

    await redisClient.hmset(key, 'tokens', newTokens - 1, 'lastRefillTime', currentTime);
    next();
};

// Leaking Bucket
exports.leakingBucket = async (req, res, next) => {
    const key = `leak:${req.ip}`;
    const capacity = 10;
    const leakRate = 1; // per second

    const lastLeakTime = await redisClient.hget(key, 'lastLeakTime');
    const tokens = await redisClient.hget(key, 'tokens') || 0;

    const currentTime = Date.now();
    const timeElapsed = (currentTime - lastLeakTime) / 1000;
    const tokensLeft = Math.max(0, tokens - timeElapsed * leakRate);

    if (tokensLeft >= capacity) return res.status(429).json({ error: "Rate limit exceeded" });

    await redisClient.hmset(key, 'tokens', tokensLeft + 1, 'lastLeakTime', currentTime);
    next();
};

// Sliding Window Counter
exports.slidingWindowCounter = async (req, res, next) => {
    const key = `swc:${req.ip}`;
    const windowSize = 60;
    const limit = 10;
    const currentTime = Math.floor(Date.now() / 1000);

    const requestsInWindow = await redisClient.hget(key, currentTime) || 0;

    if (requestsInWindow >= limit) return res.status(429).json({ error: "Rate limit exceeded" });

    await redisClient.hincrby(key, currentTime, 1);
    redisClient.expire(key, windowSize + 1);
    next();
};
