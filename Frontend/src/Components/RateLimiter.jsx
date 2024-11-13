import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS } from 'chart.js/auto';

function RateLimiter() {
  const [stats, setStats] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const interval = setInterval(sendRequests, 60000); // 1 minute
    return () => clearInterval(interval);
  }, []);

  const sendRequests = async () => {
    const successRequests = [];
    const failedRequests = [];

    for (let i = 0; i < 30; i++) {
      try {
        await axios.get('http://localhost:8080/api/token-bucket');
        successRequests.push(new Date().toISOString());
      } catch (err) {
        failedRequests.push({
          time: new Date().toISOString(),
          retryAfter: err.response?.headers['retry-after'] || 'N/A'
        });
      }
    }

    setStats((prev) => [
      ...prev,
      {
        total: 30,
        success: successRequests.length,
        failed: failedRequests.length,
        successRequests,
        failedRequests
      }
    ]);

    setError(null);
  };

  const data = {
    labels: stats.map((_, index) => `Minute ${index + 1}`),
    datasets: [
      {
        label: 'Success Requests',
        data: stats.map((stat) => stat.success),
        borderColor: 'green',
        fill: false,
      },
      {
        label: 'Failed Requests (429)',
        data: stats.map((stat) => stat.failed),
        borderColor: 'red',
        fill: false,
      }
    ]
  };

  return (
    <div>
      <h1>Rate Limiter Demo</h1>
      <table>
        <thead>
          <tr>
            <th>Minute</th>
            <th>Total Requests</th>
            <th>Success Requests</th>
            <th>Failed Requests</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((stat, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <td>{stat.total}</td>
              <td>{stat.success}</td>
              <td>{stat.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Line data={data} />
      {error && (
        <div>
          <h2>Error:</h2>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default RateLimiter;