import React from 'react';

interface ConnectionStatusProps {
  isSessionActive: boolean;
  isConnecting?: boolean;
  isAgentReady?: boolean;
  messageSendStatus: {
    sending?: boolean;
    retrying?: boolean;
    retryCount?: number;
    lastError?: string;
  };
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ 
  isSessionActive, 
  isConnecting = false,
  isAgentReady = false,
  messageSendStatus 
}) => {
  
  const getStatusInfo = () => {
    if (messageSendStatus.retrying) {
      return {
        color: 'bg-yellow-500 dark:bg-yellow-400',
        text: `Retrying (${messageSendStatus.retryCount}/3)...`,
        animate: 'animate-pulse'
      };
    }
    
    if (messageSendStatus.sending) {
      return {
        color: 'bg-blue-500 dark:bg-blue-400',
        text: 'Sending...',
        animate: 'animate-pulse'
      };
    }
    
    if (isConnecting) {
      return {
        color: 'bg-yellow-500 dark:bg-yellow-400',
        text: 'Connecting...',
        animate: 'animate-pulse'
      };
    }
    
    if (isAgentReady) {
      return {
        color: 'bg-green-500 dark:bg-green-400',
        text: 'Ready to Listen',
        animate: ''
      };
    }
    
    if (isSessionActive) {
      return {
        color: 'bg-blue-500 dark:bg-blue-400',
        text: 'Connected',
        animate: ''
      };
    }
    
    return {
      color: 'bg-red-500 dark:bg-red-400',
      text: 'Disconnected',
      animate: ''
    };
  };

  const statusInfo = getStatusInfo();

  return (
    <div className={`absolute top-4 right-4 bg-white dark:bg-gray-900 rounded-lg shadow-lg p-3 z-20 backdrop-blur-sm border border-gray-200 dark:border-gray-800 pointer-events-auto ${statusInfo.animate}`}>
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${statusInfo.color} ${statusInfo.animate}`}></span>
        <span className="text-sm font-medium text-black dark:text-white">
          {statusInfo.text}
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