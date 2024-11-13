const redis = require('../config/redis');

const luaScript = `
local current = redis.call('GET', KEYS[1])
if current == false then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
  return tonumber(ARGV[1])
end

if tonumber(current) <= 0 then
  return -1
end

redis.call('DECR', KEYS[1])
return tonumber(current) - 1
`;

async function globalRateLimiter(req, res, next) {
  const CAPACITY = 10;
  const EXPIRY = 60; // in seconds
  const key = 'global:ratelimit';

  try {
    const result = await redis.eval(luaScript, 1, key, CAPACITY, EXPIRY);

    if (result >= 0) {
      res.setHeader('X-RateLimit-Limit', CAPACITY);
      res.setHeader('X-RateLimit-Remaining', result);
      res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + EXPIRY));
      return next();
    } else {
      const retryAfter = EXPIRY;
      res.setHeader('X-RateLimit-Limit', CAPACITY);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + retryAfter));
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

exports.globalRateLimiter = globalRateLimiter;