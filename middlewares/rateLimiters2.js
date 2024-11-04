const redisClient = require('../config/redisClient');

// Fixed Window Counter
exports.fixedWindow = async (req, res, next) => {
    try {
        const key = `fixed:${req.ip}`;
        const windowSize = 60; // seconds
        const limit = 10;

        // Using Redis Lua script for atomic operations
        const luaScript = `
            local key = KEYS[1]
            local limit = tonumber(ARGV[1])
            local windowSize = tonumber(ARGV[2])
            
            local current = redis.call('INCR', key)
            
            if current == 1 then
                redis.call('EXPIRE', key, windowSize)
            end
            
            if current > limit then
                return {current, redis.call('TTL', key)}
            end
            
            return {current, redis.call('TTL', key)}
        `;

        const [count, ttl] = await redisClient.eval(
            luaScript,
            1, // number of keys
            key, // key name
            limit, // limit value
            windowSize // window size
        );

        // If count exceeds limit, return 429
        if (count > limit) {
            return res.status(429).json({
                error: "Rate limit exceeded",
                retryAfter: ttl
            });
        }

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', limit);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
        res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + ttl);

        next();
    } catch (err) {
        next(err);
    }
};
// Sliding Window Log
exports.slidingWindowLog = async (req, res, next) => {
    try {
        const key = `log:${req.ip}`;
        const windowSize = 60000; // 1 minute in ms
        const limit = 10;
        const now = Date.now();

        // Clean up old entries and get current window entries atomically
        const cleanupScript = `
            local key = KEYS[1]
            local now = tonumber(ARGV[1])
            local windowSize = tonumber(ARGV[2])
            local cutoff = now - windowSize
            
            -- Remove timestamps older than cutoff
            redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
            
            -- Add new timestamp
            redis.call('ZADD', key, now, now)
            
            -- Get count of requests in current window
            return redis.call('ZCOUNT', key, cutoff, '+inf')
        `;

        const count = await redisClient.eval(
            cleanupScript,
            1,
            key,
            now,
            windowSize
        );

        if (count > limit) {
            const oldestTimestamp = await redisClient.zrange(key, 0, 0);
            const retryAfter = Math.ceil((parseInt(oldestTimestamp) + windowSize - now) / 1000);
            
            return res.status(429).json({
                error: "Rate limit exceeded",
                retryAfter
            });
        }

        await redisClient.pexpire(key, windowSize);
        
        res.setHeader('X-RateLimit-Limit', limit);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
        res.setHeader('X-RateLimit-Reset', Math.floor((now + windowSize) / 1000));
        
        next();
    } catch (err) {
        next(err);
    }
};

// Token Bucket
exports.tokenBucket = async (req, res, next) => {
    try {
        const key = `token:${req.ip}`;
        const capacity = 10;
        const refillRate = 1; // tokens per second
        const refillInterval = 1000; // ms

        const tokenScript = `
            local key = KEYS[1]
            local capacity = tonumber(ARGV[1])
            local refillRate = tonumber(ARGV[2])
            local refillInterval = tonumber(ARGV[3])
            local now = tonumber(ARGV[4])

            -- Get current bucket state
            local bucket = redis.call('HMGET', key, 'tokens', 'lastRefillTime')
            local tokens = tonumber(bucket[1] or capacity)
            local lastRefillTime = tonumber(bucket[2] or now)

            -- Calculate tokens to add
            local timeElapsed = math.max(0, now - lastRefillTime)
            local tokensToAdd = (timeElapsed / refillInterval) * refillRate
            tokens = math.min(capacity, tokens + tokensToAdd)

            -- Try to consume a token
            if tokens >= 1 then
                tokens = tokens - 1
                redis.call('HMSET', key, 'tokens', tokens, 'lastRefillTime', now)
                redis.call('PEXPIRE', key, refillInterval * capacity / refillRate)
                return {1, tokens}
            end

            return {0, tokens}
        `;

        const [success, remainingTokens] = await redisClient.eval(
            tokenScript,
            1,
            key,
            capacity,
            refillRate,
            refillInterval,
            Date.now()
        );

        if (!success) {
            const retryAfter = Math.ceil((1 - remainingTokens) / refillRate);
            return res.status(429).json({
                error: "Rate limit exceeded",
                retryAfter
            });
        }

        res.setHeader('X-RateLimit-Limit', capacity);
        res.setHeader('X-RateLimit-Remaining', Math.floor(remainingTokens));
        res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000 + (1 - remainingTokens) / refillRate));

        next();
    } catch (err) {
        next(err);
    }
};

// Leaking Bucket
exports.leakingBucket = async (req, res, next) => {
    try {
        const key = `leak:${req.ip}`;
        const capacity = 10;
        const leakRate = 1; // requests per second

        const leakScript = `
            local key = KEYS[1]
            local capacity = tonumber(ARGV[1])
            local leakRate = tonumber(ARGV[2])
            local now = tonumber(ARGV[3])

            -- Get current bucket state
            local bucket = redis.call('HMGET', key, 'water', 'lastLeakTime')
            local water = tonumber(bucket[1] or 0)
            local lastLeakTime = tonumber(bucket[2] or now)

            -- Calculate leaked water
            local timeElapsed = math.max(0, now - lastLeakTime)
            water = math.max(0, water - (timeElapsed / 1000) * leakRate)

            -- Try to add new request
            if water < capacity then
                water = water + 1
                redis.call('HMSET', key, 'water', water, 'lastLeakTime', now)
                redis.call('PEXPIRE', key, (water / leakRate) * 1000)
                return {1, water}
            end

            return {0, water}
        `;

        const [success, currentWater] = await redisClient.eval(
            leakScript,
            1,
            key,
            capacity,
            leakRate,
            Date.now()
        );

        if (!success) {
            const retryAfter = Math.ceil((currentWater - capacity + 1) / leakRate);
            return res.status(429).json({
                error: "Rate limit exceeded",
                retryAfter
            });
        }

        res.setHeader('X-RateLimit-Limit', capacity);
        res.setHeader('X-RateLimit-Remaining', Math.floor(capacity - currentWater));
        res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000 + (currentWater / leakRate)));

        next();
    } catch (err) {
        next(err);
    }
};

// Sliding Window Counter
exports.slidingWindowCounter = async (req, res, next) => {
    try {
        const key = `swc:${req.ip}`;
        const windowSize = 60; // seconds
        const limit = 10;
        
        const slidingScript = `
            local key = KEYS[1]
            local windowSize = tonumber(ARGV[1])
            local limit = tonumber(ARGV[2])
            local now = tonumber(ARGV[3])
            
            -- Get current and previous window
            local currentWindow = math.floor(now / windowSize)
            local prevWindow = currentWindow - 1
            
            -- Get counts
            local currentCount = tonumber(redis.call('HGET', key, currentWindow) or 0)
            local prevCount = tonumber(redis.call('HGET', key, prevWindow) or 0)
            
            -- Calculate weighted previous count
            local windowOffset = now % windowSize
            local weightedPrevCount = prevCount * (1 - (windowOffset / windowSize))
            local totalCount = currentCount + weightedPrevCount
            
            if totalCount >= limit then
                return {0, totalCount}
            end
            
            -- Increment current window
            redis.call('HINCRBY', key, currentWindow, 1)
            redis.call('EXPIRE', key, windowSize * 2)
            
            return {1, totalCount + 1}
        `;

        const [success, currentCount] = await redisClient.eval(
            slidingScript,
            1,
            key,
            windowSize,
            limit,
            Math.floor(Date.now() / 1000)
        );

        if (!success) {
            return res.status(429).json({
                error: "Rate limit exceeded",
                retryAfter: windowSize
            });
        }

        res.setHeader('X-RateLimit-Limit', limit);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - Math.ceil(currentCount)));
        res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000 + windowSize));

        next();
    } catch (err) {
        next(err);
    }
};