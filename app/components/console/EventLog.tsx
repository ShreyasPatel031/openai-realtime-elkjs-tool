import React from 'react';

interface Event {
  type: string;
  timestamp: string;
  [key: string]: any;
}

interface EventLogProps {
  events: Event[];
}

export default function EventLog({ events }: EventLogProps) {
  return (
    <div className="h-full">
      <h2 className="text-sm font-semibold mb-4">Event Log</h2>
      <div className="space-y-2">
        {events.map((event, index) => (
          <div key={index} className="text-xs bg-gray-50 p-2 rounded">
            <div className="font-mono text-gray-500">{event.timestamp}</div>
            <div className="font-mono">{event.type}</div>
            <pre className="mt-1 text-gray-600 whitespace-pre-wrap">
              {JSON.stringify(event, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
} 