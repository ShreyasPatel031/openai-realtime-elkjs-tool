import React, { useState } from 'react';

interface SessionControlsProps {
  startSession: () => Promise<void>;
  stopSession: () => void;
  sendClientEvent: (message: any) => void;
  sendTextMessage: (message: string) => void;
  events: any[];
  isSessionActive: boolean;
}

export default function SessionControls({
  startSession,
  stopSession,
  sendTextMessage,
  isSessionActive,
}: SessionControlsProps) {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      sendTextMessage(message);
      setMessage('');
    }
  };

  return (
    <div className="h-full">
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <div className="flex-1">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message here..."
            className="w-full h-full p-2 border rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={!isSessionActive}
          />
        </div>
        <div className="flex justify-between items-center mt-2">
          <button
            type="button"
            onClick={isSessionActive ? stopSession : startSession}
            className={`px-4 py-2 rounded ${
              isSessionActive
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {isSessionActive ? 'Stop Session' : 'Start Session'}
          </button>
          <button
            type="submit"
            disabled={!isSessionActive || !message.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
} 