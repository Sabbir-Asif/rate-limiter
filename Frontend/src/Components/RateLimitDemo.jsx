import { useState, useEffect, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';

const RateLimitDemo = () => {
  const [status, setStatus] = useState('idle');
  const [remaining, setRemaining] = useState(null);
  const [limit, setLimit] = useState(null);
  const [resetTime, setResetTime] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [logs, setLogs] = useState([]);
  const [isSending, setIsSending] = useState(false);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [{timestamp, message, type}, ...prev].slice(0, 10));
  };

  const sendRequest = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8080/api/token-bucket');
      const headers = response.headers;
      
      const currentRemaining = parseInt(headers.get('X-RateLimit-Remaining'));
      const currentLimit = parseInt(headers.get('X-RateLimit-Limit'));
      const resetTimestamp = parseInt(headers.get('X-RateLimit-Reset'));
      
      // Handle rate limit exceeded (status 429)
      if (response.status === 429) {
        const retryAfter = parseInt(headers.get('Retry-After')); // Get the Retry-After time
        const data = await response.json(); // Get the error message

        if (!isNaN(retryAfter) && retryAfter > 0) {
          setCountdown(retryAfter);
          setStatus('limited');
          setResetTime(new Date(resetTimestamp * 1000));
          addLog(`${data.message}. Retrying in ${retryAfter} seconds`, 'error');
        }
        return;
      }

      // Process successful response
      const data = await response.json();
      console.log(data);
      setRemaining(currentRemaining);
      setLimit(currentLimit);
      setResetTime(new Date(resetTimestamp * 1000));
      addLog(`Request successful! ${currentRemaining} requests remaining`, 'success');
      setStatus('success');
    } catch (error) {
      addLog(`Error: ${error.message}`, 'error');
      setStatus('error');
      setTimeout(() => setStatus('idle'), 5000);
    }
  }, []);

  // Countdown timer with window reset check
  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            // Check if we're at the reset time
            if (resetTime && new Date() >= resetTime) {
              setStatus('idle');
              addLog('Rate limit window reset. Resuming requests...', 'success');
              return 0;
            }
            return prev;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown, resetTime]);

  // Request sender with rate limit awareness
  useEffect(() => {
    let interval;
    const sendRequestInterval = async () => {
      while (!isSending) {
        setIsSending(true);
        await sendRequest();
        if (status !== 'limited' && status !== 'error') {
          interval = setInterval(async () => {
            await sendRequest();
          }, 1000); // Continue to send requests every second
        } else {
          break; // Break out if rate-limited
        }
      }
    };

    sendRequestInterval();
    
    return () => {
      clearInterval(interval);
    };
  }, [status, resetTime, sendRequest, isSending]);

  // Time remaining until reset
  const getTimeUntilReset = () => {
    if (!resetTime) return null;
    const now = new Date();
    if (now >= resetTime) return 'Window reset';
    const seconds = Math.ceil((resetTime - now) / 1000);
    return `Resets in ${seconds}s`;
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Status Card */}
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Rate Limit Status</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="stat">
              <div className="stat-title">Remaining Requests</div>
              <div className="stat-value text-primary">{remaining ?? '-'}/{limit ?? '-'}</div>
            </div>
            <div className="stat">
              <div className="stat-title">Window Reset</div>
              <div className="stat-value text-sm">
                {getTimeUntilReset() || '-'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rate Limit Warning */}
      {status === 'limited' && countdown > 0 && (
        <div className="alert alert-warning shadow-lg">
          <AlertCircle className="w-6 h-6" />
          <div>
            <h3 className="font-bold">Rate Limited!</h3>
            <div className="text-sm">
              Retrying in {countdown} seconds...
            </div>
          </div>
        </div>
      )}

      {/* Request Logs */}
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <h2 className="card-title flex items-center gap-2">
            Request Logs
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {logs.map((log, index) => (
              <div 
                key={index} 
                className={`text-sm p-2 rounded ${
                  log.type === 'error' ? 'bg-error/20 text-error' : 
                  log.type === 'success' ? 'bg-success/20 text-success' :
                  'bg-base-300'
                }`}
              >
                <span className="font-mono">{log.timestamp}</span>: {log.message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RateLimitDemo;
