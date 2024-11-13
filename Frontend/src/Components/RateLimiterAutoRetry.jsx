import React, { useState, useEffect } from 'react';
import axios from 'axios';

function RateLimiterAutoRetry() {
  const [log, setLog] = useState([]);
  const [retryAfter, setRetryAfter] = useState(0);

  useEffect(() => {
    if (retryAfter > 0) {
      const countdown = setInterval(() => {
        setRetryAfter((prev) => prev - 1);
      }, 1000);
      
      return () => clearInterval(countdown);
    } else {
      sendContinuousRequest();
    }
  }, [retryAfter]);

  const sendContinuousRequest = async () => {
    try {
      const res = await axios.get('/api/token-bucket');
      setLog((prev) => [...prev, { type: 'success', time: new Date().toISOString() }]);
    } catch (err) {
      const retryAfterValue = parseInt(err.response?.headers['retry-after'] || 60, 10);
      setLog((prev) => [...prev, { type: 'failed', time: new Date().toISOString(), retryAfter: retryAfterValue }]);
      setRetryAfter(retryAfterValue);
    }
  };

  useEffect(() => {
    sendContinuousRequest();
  }, []);

  return (
    <div>
      <h1>Auto-Retry Rate Limiter</h1>
      <table border="1">
        <thead>
          <tr>
            <th>Time Interval</th>
            <th>Total Requests</th>
            <th>Successful Requests</th>
            <th>Failed Requests</th>
          </tr>
        </thead>
        <tbody>
          {log.map((entry, index) => (
            <tr key={index}>
            <td>{entry.time}</td>
            <td>{entry.type === 'success' ? 'Success' : `Failed - Retry After ${entry.retryAfter}s`}</td>
          </tr>
        ))}
      </tbody>
    </table>
    {retryAfter > 0 && <p>Too many requests, retrying in: {retryAfter}s</p>}
  </div>
);
}

export { RateLimiter, RateLimiterAutoRetry };

