import React, { useState, useEffect } from 'react';
import { Handle, Position } from 'reactflow';

interface ConnectorDotsProps {
  nodeId: string;
  nodeWidth?: number;
  connectingFrom?: string | null; // Track if a connection is being started
  connectingFromHandle?: string | null; // Track which handle is being connected from
  onHandleClick?: (nodeId: string, handleId: string) => void; // Callback when handle is clicked
  showVisualDots?: boolean; // Whether to show the visual dots (only when connector tool is active)
}

const ConnectorDots: React.FC<ConnectorDotsProps> = ({ 
  nodeId, 
  nodeWidth = 96,
  connectingFrom,
  connectingFromHandle,
  onHandleClick,
  showVisualDots = false // Default to false - only show visual dots when connector tool is active
}) => {
  const [hoveredConnectorDot, setHoveredConnectorDot] = useState<string | null>(null);
  const clearHoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const nodeContainerRef = React.useRef<HTMLDivElement | null>(null);
  const clickedPortRef = React.useRef<string | null>(null);
  
  // Track if this port is the selected source
  const isConnecting = connectingFrom !== null;
  const isConnectingFromThisNode = connectingFrom === nodeId;
  
  // Clear clickedPortRef when connection state is cleared (connection complete or cancelled)
  useEffect(() => {
    if (!isConnecting) {
      // Connection ended - clear the clicked port ref
      clickedPortRef.current = null;
    }
  }, [isConnecting]);
  
  // Clear hover when mouse leaves this node (if not the selected node)
  useEffect(() => {
    const nodeElement = nodeContainerRef.current?.closest('[data-id]');
    if (!nodeElement) return;
    
    const handleNodeMouseLeave = () => {
      // Only clear hover if we're leaving a different node (not the selected one)
      // Selected handles stay blue via isSelectedHandle, so we only clear hover state
      // for nodes that aren't the selected source
      if (!isConnectingFromThisNode) {
        // Clear hover state, but selected handles will stay blue via isSelectedHandle
        setHoveredConnectorDot((currentHover) => {
          // Don't clear if the current hover is actually a selected handle
          // This check ensures we don't clear selected handles even briefly
          if (currentHover && isConnectingFromThisNode && 
              connectingFromHandle === `connector-${currentHover}-source`) {
            return currentHover;
          }
          return null;
        });
        if (clearHoverTimeoutRef.current) {
          clearTimeout(clearHoverTimeoutRef.current);
          clearHoverTimeoutRef.current = null;
        }
      }
    };
    
    nodeElement.addEventListener('mouseleave', handleNodeMouseLeave);
    return () => {
      nodeElement.removeEventListener('mouseleave', handleNodeMouseLeave);
    };
  }, [isConnectingFromThisNode, connectingFromHandle]);

  // Shared click handler for selecting a port
  const handlePortClick = React.useCallback((key: string, e: React.MouseEvent) => {
    // CRITICAL: Stop ALL event propagation to prevent node selection
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    
    // Immediately set the port as clicked and blue
    clickedPortRef.current = key;
    setHoveredConnectorDot(key);
    
    // Clear any pending hover timeout
    if (clearHoverTimeoutRef.current) {
      clearTimeout(clearHoverTimeoutRef.current);
      clearHoverTimeoutRef.current = null;
    }
    
    // Check if there's already a connection in progress
    // If so, complete the connection instead of starting a new one
    if (isConnecting && !isConnectingFromThisNode) {
      // There's a connection in progress from another node
      // Try to connect to this port's target handle
      const targetHandleId = `connector-${key}-target`;
      onHandleClick?.(nodeId, targetHandleId);
      return;
    }
    
    // Otherwise, start a new connection from this port
    const handleId = `connector-${key}-source`;
    onHandleClick?.(nodeId, handleId);
  }, [nodeId, onHandleClick, isConnecting, isConnectingFromThisNode]);

  return (
    <div ref={nodeContainerRef}>
      {[
        { key: 'top', position: Position.Top },
        { key: 'right', position: Position.Right },
        { key: 'bottom', position: Position.Bottom },
        { key: 'left', position: Position.Left },
      ].map(({ key, position }) => {
        const DOT_SIZE = 8; // 8px dots as per Figma
        const DOT_RADIUS = DOT_SIZE / 2; // 4px radius
        
        // Calculate dot positions with CENTER on the border (half inside, half outside)
        // Position dot centers exactly on the border edge
        let dotPosition: string | number;
        if (key === 'top' || key === 'bottom') {
          dotPosition = '50%'; // Centered horizontally
        } else {
          dotPosition = key === 'left' 
            ? 0 // Left border - center at border
            : nodeWidth; // Right border - center at border
        }
        
        const topPosition = key === 'top' 
          ? 0 // Top border - center at border
          : key === 'bottom'
          ? nodeWidth // Bottom border - center at border
          : '50%'; // Centered vertically
        
        // Check if this is the selected handle
        const isSelectedHandle = isConnectingFromThisNode && connectingFromHandle === `connector-${key}-source`;
        // Also check if this port was just clicked (before state updates)
        const wasJustClicked = clickedPortRef.current === key;
        // Port is blue if hovered OR if it's the selected handle OR if it was just clicked
        // Selected handles stay blue permanently until connection is complete
        const isHovered = hoveredConnectorDot === key || isSelectedHandle || wasJustClicked;
        
        
        // Keep all ports visible - don't hide them when connecting
        const shouldShow = true;
        
        // Figma styling: white with blue border (default), blue with white border (hover)
        const backgroundColor = isHovered ? '#4285f4' : '#ffffff';
        const borderColor = isHovered ? '#ffffff' : '#4285f4';
        
        if (!shouldShow) return null;
        
        return (
          <React.Fragment key={`connector-${key}`}>
            {/* ReactFlow Handles - ALWAYS rendered so ReactFlow can find them for edges */}
            {/* They're invisible but must exist for edges to work */}
            <Handle
              type="source"
              position={position}
              id={`connector-${key}-source`}
              style={{
                left: (key === 'left' || key === 'right') ? dotPosition : '50%',
                top: (key === 'top' || key === 'bottom') ? topPosition : '50%',
                width: 0,
                height: 0,
                borderRadius: '50%',
                backgroundColor: 'transparent',
                border: 'none',
                opacity: 0,
                pointerEvents: 'none', // COMPLETELY DISABLED
                zIndex: -1,
                transform: 'translate(-50%, -50%)',
                cursor: 'default'
              }}
            />
            <Handle
              type="target"
              position={position}
              id={`connector-${key}-target`}
              style={{
                left: (key === 'left' || key === 'right') ? dotPosition : '50%',
                top: (key === 'top' || key === 'bottom') ? topPosition : '50%',
                width: 0, // Zero size - COMPLETELY DISABLED
                height: 0,
                borderRadius: '50%',
                backgroundColor: 'transparent',
                border: 'none',
                opacity: 0,
                pointerEvents: 'none', // COMPLETELY DISABLED - no cursor changes
                zIndex: -1,
                transform: 'translate(-50%, -50%)',
                cursor: 'default' // Never crosshair
              }}
            />
            
            {/* Visual elements - only show when connector tool is active */}
            {showVisualDots && (
              <>
                {/* Visible green hover area - detects hover and shows blue dot */}
                <div
                  style={{
                    position: 'absolute',
                    left: (key === 'left' || key === 'right') ? dotPosition : '50%',
                    top: (key === 'top' || key === 'bottom') ? topPosition : '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 64, // Larger hover area
                    height: 64,
                    cursor: 'pointer', // ALWAYS pointer, never crosshair
                    pointerEvents: 'auto', // Detect hover and clicks
                    zIndex: 997,
                    background: 'rgba(0, 255, 0, 0.25)', // Green hover area (visible)
                    borderRadius: '8px', // Rounded corners
                    opacity: isHovered ? 1 : 0.5 // More visible on hover
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    e.nativeEvent.stopImmediatePropagation();
                    handlePortClick(key, e);
                  }}
                  onMouseDown={(e) => {
                    // CRITICAL: Stop mousedown to prevent node selection
                    e.stopPropagation();
                    e.preventDefault();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  onMouseUp={(e) => {
                    // CRITICAL: Stop mouseup to prevent node selection
                    e.stopPropagation();
                    e.preventDefault();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  onPointerDown={(e) => {
                    // Also stop pointer events
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onPointerUp={(e) => {
                    // Also stop pointer events
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onMouseEnter={() => {
                    // Clear any pending clear timeout
                    if (clearHoverTimeoutRef.current) {
                      clearTimeout(clearHoverTimeoutRef.current);
                      clearHoverTimeoutRef.current = null;
                    }
                    // Set hover for this specific port
                    setHoveredConnectorDot(key);
                  }}
                  onMouseLeave={(e) => {
                    // Never clear hover if this is the selected handle or was just clicked
                    if (isSelectedHandle || wasJustClicked) {
                      return;
                    }
                    
                    // Check if we're moving to another port on the same node
                    const relatedTarget = e.relatedTarget as HTMLElement;
                    const isMovingToAnotherPort = relatedTarget?.closest('[data-connector-dot]') && 
                                                 relatedTarget.closest('[data-node-id]')?.getAttribute('data-node-id') === nodeId;
                    
                    // Don't clear if moving to another port on the same node
                    if (!isMovingToAnotherPort) {
                      // Use a small delay to handle quick movements
                      if (clearHoverTimeoutRef.current) {
                        clearTimeout(clearHoverTimeoutRef.current);
                      }
                      clearHoverTimeoutRef.current = setTimeout(() => {
                        // Only clear if still not the selected handle and wasn't just clicked
                        const stillSelected = isConnectingFromThisNode && connectingFromHandle === `connector-${key}-source`;
                        const stillClicked = clickedPortRef.current === key;
                        if (!stillSelected && !stillClicked) {
                          setHoveredConnectorDot(null);
                        }
                      }, 50);
                    }
                  }}
                />
                
                {/* Visual dot overlay - handles hover styling */}
                <div
                  style={{
                    position: 'absolute',
                    left: (key === 'left' || key === 'right') ? dotPosition : '50%',
                    top: (key === 'top' || key === 'bottom') ? topPosition : '50%',
                    transform: 'translate(-50%, -50%)',
                    width: DOT_SIZE,
                    height: DOT_SIZE,
                    borderRadius: '50%',
                    backgroundColor,
                    border: `1px solid ${borderColor}`,
                    cursor: 'pointer', // ALWAYS pointer, never crosshair
                    pointerEvents: 'auto', // Made clickable so clicking directly on dot works
                    zIndex: 1001, // Above everything
                    transition: 'background-color 0.2s ease-out, border-color 0.2s ease-out'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    e.nativeEvent.stopImmediatePropagation();
                    handlePortClick(key, e);
                  }}
                  onMouseDown={(e) => {
                    // CRITICAL: Stop mousedown propagation to prevent ReactFlow node selection
                    e.stopPropagation();
                    e.preventDefault();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  onMouseUp={(e) => {
                    // Also stop mouseup to be safe
                    e.stopPropagation();
                    e.preventDefault();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  onPointerDown={(e) => {
                    // Also stop pointer events
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onPointerUp={(e) => {
                    // Also stop pointer events
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                />
              </>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default ConnectorDots;

