import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AlertCircle, CheckCircle } from 'lucide-react';

const RateLimiter = () => {
  const [stats, setStats] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [minuteStartTime, setMinuteStartTime] = useState(null);
  const [minuteCounts, setMinuteCounts] = useState([]); 
  const [currentMinute, setCurrentMinute] = useState(0);
  const [totalStats, setTotalStats] = useState({ success: 0, failed: 0 });

  const sendSingleRequest = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/token-bucket');
      const data = await response.json();
      return {
        status: response.status,
        data
      };
    } catch (error) {
      console.error('Request failed:', error);
      return {
        status: 429,
        data: null
      };
    }
  };

  useEffect(() => {
    let requestInterval;
    let isProcessing = false;  // Flag to prevent concurrent processing
    
    if (isRunning) {
      if (!minuteStartTime) {
        setMinuteStartTime(new Date());
        setMinuteCounts([{ success: 0, failed: 0 }]);
      }

      requestInterval = setInterval(async () => {
        if (isProcessing) return; 
        isProcessing = true;

        try {
          const now = new Date();
          if (minuteStartTime && (now - minuteStartTime) >= 60000) {
            const completedMinuteCounts = minuteCounts[currentMinute];
            setStats(prev => [...prev, {
              minute: prev.length,
              success: completedMinuteCounts.success,
              failed: completedMinuteCounts.failed,
              total: completedMinuteCounts.success + completedMinuteCounts.failed,
              timestamp: minuteStartTime.toLocaleTimeString()
            }]);

            setCurrentMinute(prev => prev + 1);
            setMinuteCounts(prev => [...prev, { success: 0, failed: 0 }]);
            setMinuteStartTime(now);
          }

          const { status } = await sendSingleRequest();
          const isSuccess = status === 200;
          
          setMinuteCounts(prev => {
            const newCounts = [...prev];
            const currentCount = newCounts[currentMinute] || { success: 0, failed: 0 };
            newCounts[currentMinute] = {
              success: isSuccess ? currentCount.success + 1 : currentCount.success,
              failed: !isSuccess ? currentCount.failed + 1 : currentCount.failed
            };
            return newCounts;
          });

          setTotalStats(prev => ({
            success: isSuccess ? prev.success + 1 : prev.success,
            failed: !isSuccess ? prev.failed + 1 : prev.failed
          }));
        } finally {
          isProcessing = false;  
        }
      }, 1000);
    }

    return () => {
      if (requestInterval) {
        clearInterval(requestInterval);
      }
    };
  }, [currentMinute, isRunning, minuteCounts, minuteStartTime]);

  const handleStartStop = () => {
    if (!isRunning) {
      setStats([]);
      setMinuteCounts([{ success: 0, failed: 0 }]);
      setCurrentMinute(0);
      setTotalStats({ success: 0, failed: 0 });
      setMinuteStartTime(new Date());
    } else {
      setMinuteStartTime(null);
    }
    setIsRunning(prev => !prev);
  };

  const getElapsedSeconds = () => {
    if (!minuteStartTime) return 0;
    return Math.floor((new Date() - minuteStartTime) / 1000);
  };

  const getCurrentCounts = () => {
    return minuteCounts[currentMinute] || { success: 0, failed: 0 };
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
       <h1 className="text-3xl font-bold text-center my-6">API Rate Limit Monitor</h1>
      
        <div className="flex items-center justify-between mt-4">
          <div className="text-md text-gray-600 space-y-1">
            <div>
              <span className='font-medium text-yellow-600'>Current Minute</span> ({60 - getElapsedSeconds()}s remaining) -
              <span className='text-green-500 ml-2'>Success:</span> {getCurrentCounts().success} <span className='text-red-500 ml-4'>Failed:</span> {getCurrentCounts().failed}
            </div>
            <div>
              <span className='font-medium text-blue-900'>Total</span> - 
              <span className='text-green-500 ml-2'>Success:</span> {totalStats.success} <span className='text-red-500 ml-4'>Failed:</span> {totalStats.failed}
            </div>
            {minuteStartTime && (
              <div>Started at: {minuteStartTime.toLocaleTimeString()}</div>
            )}
          </div>
          <button
            onClick={handleStartStop}
            className={`px-4 py-2 rounded-lg ${
              isRunning 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-blue-500 hover:bg-blue-600'
            } text-white`}
          >
            {isRunning ? 'Stop Monitoring' : 'Start Monitoring'}
          </button>
        </div>

      <div className="bg-white rounded-lg shadow p-4 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={stats}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="minute" 
              label={{ value: 'Minutes', position: 'bottom' }}
            />
            <YAxis 
              label={{ value: 'Requests', angle: -90, position: 'left' }} 
            />
            <Tooltip 
              labelFormatter={(value) => `Minute ${value}`}
              formatter={(value, name) => [value, name === 'success' ? 'Successful' : 'Failed']}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="success" 
              stroke="#10B981" 
              name="Successful"
              isAnimationActive={false}
            />
            <Line 
              type="monotone" 
              dataKey="failed" 
              stroke="#EF4444" 
              name="Failed"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Minute
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Successful
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Failed
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {[...stats].reverse().map((stat) => (
              <tr key={stat.minute}>
                <td className="px-6 py-4 whitespace-nowrap">
                  {stat.minute}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {stat.timestamp}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                    {stat.success}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <AlertCircle className="w-4 h-4 text-red-500 mr-2" />
                    {stat.failed}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {stat.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RateLimiter;