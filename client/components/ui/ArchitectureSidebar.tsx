import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Search, 
  FileText,
  User,
  LogOut,
  PanelRightOpen,
  MoreHorizontal,
  Trash2,
  Share,
  Edit3
} from 'lucide-react';
import SaveAuth from '../auth/SaveAuth';
import { User as FirebaseUser } from 'firebase/auth';

interface Architecture {
  id: string;
  name: string;
  timestamp: Date;
  nodeCount: number;
  edgeCount: number;
}

interface ArchitectureSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse?: () => void;
  onNewArchitecture: () => void;
  onSelectArchitecture: (id: string) => void;
  onDeleteArchitecture?: (id: string) => void;
  onShareArchitecture?: (id: string) => void;
  onEditArchitecture?: (id: string) => void;
  selectedArchitectureId?: string;
  architectures?: Architecture[];
  width?: number;
  onWidthChange?: (width: number) => void;
  isArchitectureOperationRunning?: (id: string) => boolean;
  user?: FirebaseUser | null;
}

const ArchitectureSidebar: React.FC<ArchitectureSidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  onNewArchitecture,
  onSelectArchitecture,
  onDeleteArchitecture,
  onShareArchitecture,
  onEditArchitecture,
  selectedArchitectureId,
  architectures = [],
  isArchitectureOperationRunning = () => false,
  user
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredArchitecture, setHoveredArchitecture] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleDropdownToggle = (architectureId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering onSelectArchitecture
    setActiveDropdown(activeDropdown === architectureId ? null : architectureId);
  };

  const handleMenuAction = (action: 'share' | 'edit' | 'delete', architectureId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setActiveDropdown(null);
    
    switch (action) {
      case 'share':
        onShareArchitecture?.(architectureId);
        break;
      case 'edit':
        onEditArchitecture?.(architectureId);
        break;
      case 'delete':
        onDeleteArchitecture?.(architectureId);
        break;
    }
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
          {/* Search - Extended Button/Input (only show when user is signed in) */}
          {user && (isCollapsed ? (
            <button
              onClick={onToggleCollapse}
              className="w-10 h-10 flex items-center justify-center rounded-lg shadow-lg border bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md transition-all duration-200"
              title="Search Architectures"
            >
              <Search className="w-4 h-4" />
            </button>
          ) : (
            <div className="relative flex items-center h-10">
              <Search className="absolute left-3 w-4 h-4 text-gray-400 z-10" />
              <input
                type="text"
                placeholder="Search architectures..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-lg hover:shadow-md transition-all duration-200"
              />
            </div>
          ))}
        </div>

        {/* Divider */}
        {!isCollapsed && (
          <div className="mx-4 my-4 border-t border-gray-300"></div>
        )}

        {/* Architecture List - Only when expanded */}
        {!isCollapsed && (
          <div className="flex-1 overflow-y-auto px-4">
            {/* Add New Architecture Button */}
            <div className="mb-3">
              <button
                onClick={onNewArchitecture}
                className="flex items-center gap-2 w-full p-2 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors duration-200"
                title="Add New Architecture"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">Add New Architecture</span>
              </button>
            </div>

            {filteredArchitectures.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                {searchQuery ? 'No architectures found' : 'No architectures yet'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredArchitectures.map((architecture) => (
                  <div
                    key={architecture.id}
                    className={`
                      w-full text-left p-3 rounded-lg transition-colors group relative
                      ${selectedArchitectureId === architecture.id 
                        ? 'bg-gray-100 border border-gray-300' 
                        : 'hover:bg-gray-50 border border-transparent'
                      }
                    `}
                  >
                    {/* Main clickable area */}
                    <button
                      onClick={() => onSelectArchitecture(architecture.id)}
                      className="w-full text-left pr-8 relative"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium truncate text-gray-800">{architecture.name}</div>
                        {/* Loading spinner for ongoing operations - positioned to the far right */}
                        {isArchitectureOperationRunning(architecture.id) && (
                          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin flex-shrink-0 ml-auto" />
                        )}
                      </div>
                    </button>

                    {/* Ellipsis menu - shows only on ellipsis button hover */}
                    <div 
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 z-[1000]" 
                      ref={dropdownRef}
                      data-dropdown
                      onMouseEnter={() => {
                        // Clear any pending timeout
                        if (hoverTimeoutRef.current) {
                          clearTimeout(hoverTimeoutRef.current);
                        }
                        setHoveredArchitecture(architecture.id);
                      }}
                      onMouseLeave={() => {
                        // Keep menu visible when cursor is over the dropdown area
                        hoverTimeoutRef.current = setTimeout(() => {
                          setHoveredArchitecture(null);
                          setActiveDropdown(null);
                        }, 150);
                      }}
                    >
                      <button
                        onClick={(e) => handleDropdownToggle(architecture.id, e)}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-all duration-200 relative z-[1001] opacity-0 group-hover:opacity-100"
                        onMouseEnter={() => {
                          // Clear any pending timeout
                          if (hoverTimeoutRef.current) {
                            clearTimeout(hoverTimeoutRef.current);
                          }
                          setHoveredArchitecture(architecture.id);
                        }}
                        onMouseLeave={() => {
                          // Only hide if not clicking into dropdown
                          hoverTimeoutRef.current = setTimeout(() => {
                            if (activeDropdown !== architecture.id) {
                              setHoveredArchitecture(null);
                            }
                          }, 100);
                        }}
                      >
                        <MoreHorizontal className="w-4 h-4 text-gray-500" />
                      </button>

                      {/* Dropdown menu - positioned to the right */}
                      {(activeDropdown === architecture.id || hoveredArchitecture === architecture.id) && (
                          <div 
                            className="absolute right-0 top-8 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[1002]"
                            onMouseEnter={() => {
                              // Clear any pending timeout
                              if (hoverTimeoutRef.current) {
                                clearTimeout(hoverTimeoutRef.current);
                              }
                              setHoveredArchitecture(architecture.id);
                            }}
                            onMouseLeave={() => {
                              hoverTimeoutRef.current = setTimeout(() => {
                                setHoveredArchitecture(null);
                                setActiveDropdown(null);
                              }, 100);
                            }}
                          >
                            <button
                              onClick={(e) => handleMenuAction('share', architecture.id, e)}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                            >
                              <Share className="w-4 h-4" />
                              Share
                            </button>
                            <button
                              onClick={(e) => handleMenuAction('edit', architecture.id, e)}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                            >
                              <Edit3 className="w-4 h-4" />
                              Edit
                            </button>
                            <button
                              onClick={(e) => handleMenuAction('delete', architecture.id, e)}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                  </div>
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
