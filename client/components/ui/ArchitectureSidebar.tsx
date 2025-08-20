import React, { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Search, 
  FileText,
  User,
  LogOut,
  PanelRightOpen
} from 'lucide-react';
import SaveAuth from '../auth/SaveAuth';

interface Architecture {
  id: string;
  name: string;
  timestamp: Date;
  nodeCount: number;
  edgeCount: number;
}

interface ArchitectureSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onNewArchitecture: () => void;
  onSelectArchitecture: (id: string) => void;
  selectedArchitectureId?: string;
  architectures?: Architecture[];
}

const ArchitectureSidebar: React.FC<ArchitectureSidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  onNewArchitecture,
  onSelectArchitecture,
  selectedArchitectureId,
  architectures = []
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredArchitectures = architectures.filter(arch =>
    arch.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={`
      relative h-full bg-gray-50 text-gray-700 border-r border-gray-200 transition-all duration-300 ease-in-out
      ${isCollapsed ? 'w-16' : 'w-80'}
    `}>
      {/* Close Button - Right side when expanded */}
      {!isCollapsed && (
        <button
          onClick={onToggleCollapse}
          className="absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center rounded-lg shadow-lg border bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md transition-all duration-200"
          title="Close Sidebar"
        >
          <PanelRightOpen className="w-4 h-4" />
        </button>
      )}


      {/* Main Icon Layout - Always Visible */}
      <div className="flex flex-col h-full pt-[4.75rem]"> {/* pt-[4.75rem] for consistent spacing with Atelier */}
        {/* Icon Bar - Fixed Positions */}
        <div className="flex flex-col gap-3 px-4">
          {/* New Architecture - Fixed Icon */}
          <div className="flex items-center gap-3">
            <button
              onClick={onNewArchitecture}
              className="w-10 h-10 flex items-center justify-center rounded-lg shadow-lg border bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md transition-all duration-200 flex-shrink-0"
              title="New Architecture"
            >
              <Plus className="w-4 h-4" />
            </button>
            {!isCollapsed && (
              <span className="font-medium text-gray-700">New Architecture</span>
            )}
          </div>

          {/* Search - Fixed Icon with Input */}
          <div className="flex items-center gap-3">
            <button
              onClick={isCollapsed ? onToggleCollapse : undefined}
              className="w-10 h-10 flex items-center justify-center rounded-lg shadow-lg border bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md transition-all duration-200 flex-shrink-0"
              title="Search Architectures"
            >
              <Search className="w-4 h-4" />
            </button>
            {!isCollapsed && (
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search architectures..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        {!isCollapsed && (
          <div className="mx-4 my-4 border-t border-gray-300"></div>
        )}

        {/* Architecture List - Only when expanded */}
        {!isCollapsed && (
          <div className="flex-1 overflow-y-auto px-4">
            {filteredArchitectures.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                {searchQuery ? 'No architectures found' : 'No architectures yet'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredArchitectures.map((architecture) => (
                  <button
                    key={architecture.id}
                    onClick={() => onSelectArchitecture(architecture.id)}
                    className={`
                      w-full text-left p-3 rounded-lg transition-colors group relative
                      ${selectedArchitectureId === architecture.id 
                        ? 'bg-gray-100 border border-gray-300' 
                        : 'hover:bg-gray-50 border border-transparent'
                      }
                    `}
                  >
                    <div className="font-medium truncate text-gray-800">{architecture.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* User Profile - Always Visible at Bottom */}
        <div className="mt-auto px-4 pb-4">
          <SaveAuth 
            onSave={(user) => {
              console.log('Save triggered from sidebar for user:', user.email);
            }}
            isCollapsed={isCollapsed}
          />
        </div>
      </div>

    </div>
  );
};

export default ArchitectureSidebar;
