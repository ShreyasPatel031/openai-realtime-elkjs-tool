import { useState, useEffect, useCallback, useRef } from 'react';

interface ConnectionRecoveryOptions {
  maxRetries?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
  onRetry?: (attempt: number) => void;
  onMaxRetriesReached?: () => void;
}

export function useConnectionRecovery(
  isSessionActive: boolean,
  events: any[],
  options: ConnectionRecoveryOptions = {}
) {
  const {
    maxRetries = 3,
    retryDelay = 2000,
    exponentialBackoff = true,
    onRetry,
    onMaxRetriesReached
  } = options;

  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detect connection errors from events
  const hasConnectionError = events?.some(event => 
    event.type === 'error' && (
      event.error?.includes('Socket timeout') ||
      event.error?.includes('Unknown error') ||
      event.error?.includes('Connection closed')
    )
  );

  // Reset retry count when session becomes active and working
  useEffect(() => {
    if (isSessionActive && !hasConnectionError) {
      setRetryCount(0);
      setIsRetrying(false);
      setLastError(null);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    }
  }, [isSessionActive, hasConnectionError]);

  // Handle automatic retry
  const attemptRetry = useCallback(() => {
    if (retryCount >= maxRetries) {
      console.log(`❌ Max retries (${maxRetries}) reached. Please refresh the page.`);
      setIsRetrying(false);
      onMaxRetriesReached?.();
      return;
    }

    const nextRetryCount = retryCount + 1;
    setRetryCount(nextRetryCount);
    setIsRetrying(true);

    const delay = exponentialBackoff 
      ? retryDelay * Math.pow(2, nextRetryCount - 1)
      : retryDelay;

    console.log(`🔄 Connection lost. Retrying in ${delay}ms... (${nextRetryCount}/${maxRetries})`);
    
    retryTimeoutRef.current = setTimeout(() => {
      console.log(`🔄 Attempting reconnection (${nextRetryCount}/${maxRetries})`);
      onRetry?.(nextRetryCount);
      
      // Refresh the page to reconnect
      window.location.reload();
    }, delay);
  }, [retryCount, maxRetries, retryDelay, exponentialBackoff, onRetry, onMaxRetriesReached]);

  // Trigger retry when connection error is detected
  useEffect(() => {
    if (hasConnectionError && !isRetrying && retryCount < maxRetries) {
      setLastError('Connection lost due to socket timeout');
      attemptRetry();
    }
  }, [hasConnectionError, isRetrying, retryCount, maxRetries, attemptRetry]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return {
    retryCount,
    isRetrying,
    lastError,
    hasConnectionError,
    maxRetries
  };
} 