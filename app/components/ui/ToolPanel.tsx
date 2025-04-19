import React from 'react';

interface ToolPanelProps {
  sendClientEvent: (message: any) => void;
  sendTextMessage: (message: string) => void;
  events: any[];
  isSessionActive: boolean;
}

export default function ToolPanel({
  sendClientEvent,
  sendTextMessage,
  events,
  isSessionActive,
}: ToolPanelProps) {
  return (
    <div className="h-full">
      <h2 className="text-sm font-semibold mb-4">Tools</h2>
      <div className="space-y-4">
        <div className="p-4 bg-gray-50 rounded">
          <p className="text-sm">
            This panel will contain tools for interacting with the model.
          </p>
        </div>
      </div>
    </div>
  );
} 