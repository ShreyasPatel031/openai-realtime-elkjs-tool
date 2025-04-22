import React from 'react';

interface ConnectionStatusProps {
  isSessionActive: boolean;
  messageSendStatus: {
    sending: boolean;
    retrying: boolean;
    retryCount: number;
    lastError: any;
  };
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ isSessionActive, messageSendStatus }) => {
  return (
    <div className={`absolute top-4 right-4 bg-white dark:bg-gray-900 rounded-lg shadow-lg p-3 z-20 backdrop-blur-sm border border-gray-200 dark:border-gray-800 pointer-events-auto ${messageSendStatus.retrying ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${isSessionActive 
          ? messageSendStatus.retrying 
            ? 'bg-yellow-500 dark:bg-yellow-400' 
            : 'bg-green-500 dark:bg-green-400'
          : 'bg-red-500 dark:bg-red-400'} ${messageSendStatus.sending ? 'animate-pulse' : ''}`}></span>
        <span className="text-sm font-medium text-black dark:text-white">
          {!isSessionActive 
            ? 'Disconnected' 
            : messageSendStatus.retrying
              ? `Retrying (${messageSendStatus.retryCount}/3)...`
              : messageSendStatus.sending
                ? 'Sending...'
                : 'Connected'}
        </span>
      </div>
      {messageSendStatus.lastError && messageSendStatus.retrying && (
        <div className="text-xs text-red-600 dark:text-red-400 mt-1">
          Connection issue, retrying...
        </div>
      )}
    </div>
  );
};

export default ConnectionStatus; 