exports.handleRequest = (req, res) => {
    const remaining = res.getHeader('X-RateLimit-Remaining');
    const limit = res.getHeader('X-RateLimit-Limit');
    const reset = res.getHeader('X-RateLimit-Reset');
  
    res.status(200).json({
      success: true,
      message: "Request successful!",
      rateLimit: {
        limit: limit,
        remaining: remaining,
        resetAt: new Date(reset * 1000).toISOString()
      }
    });
  };