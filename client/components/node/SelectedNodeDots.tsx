import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface SelectedNodeDotsProps {
  nodeId: string;
  nodeEl: HTMLDivElement | null;
  nodeScale: number;
  nodeWidth?: number;
  nodeHeight?: number;
  onConnectorDotClick?: (nodeId: string, handleId: string) => void;
}

const SelectedNodeDots: React.FC<SelectedNodeDotsProps> = ({ 
  nodeId, 
  nodeEl, 
  nodeScale,
  nodeWidth = 96,
  nodeHeight = 96,
  onConnectorDotClick
}) => {
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [expandedHandles, setExpandedHandles] = useState<Set<string>>(new Set());
  
  // FIXED: Track expansion time to prevent rapid flickering
  const expansionTimeRef = useRef<Map<string, number>>(new Map());
  const MIN_EXPANSION_TIME = 50; // Minimum 50ms between expand/collapse to prevent flicker
  
  // FIXED: Cancel previous timeouts to prevent race conditions
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // DEBUG: Track all state changes to localize flicker
  const renderCountRef = useRef(0);
  const lastStateRef = useRef<{isExpanded: boolean, isWhite: boolean, hoveredHandle: string | null}>({
    isExpanded: false, isWhite: false, hoveredHandle: null
  });

  // Track mouse position on node for proximity detection
  useEffect(() => {
    if (!nodeEl) return;
    let logCount = 0;
    const onMouseMove = (e: MouseEvent) => {
      const rect = nodeEl.getBoundingClientRect();
      const newPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setMousePos(newPos);
      
    };
    const onMouseLeave = () => {
      setMousePos(null);
      setHoveredHandle(null);
      setExpandedHandles(new Set()); // Collapse all when mouse leaves node
    };
    nodeEl.addEventListener('mousemove', onMouseMove);
    nodeEl.addEventListener('mouseleave', onMouseLeave);
    return () => {
      nodeEl.removeEventListener('mousemove', onMouseMove);
      nodeEl.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [nodeEl, nodeId]);

  return (
    <>
      {[
        { key: 'top', rotation: 0 },
        { key: 'right', rotation: 90 },
        { key: 'bottom', rotation: 180 },
        { key: 'left', rotation: 270 },
      ].map(({ key, rotation }) => {
        const GAP = 8; // pixels from border
        const NODE_CENTER_X = nodeWidth / 2; // center of node horizontally
        const NODE_CENTER_Y = nodeHeight / 2; // center of node vertically
        
        // Small dot: 4x6, so half-sizes are 2x3
        // Large dot: 16x16, so half-sizes are 8x8
        const smallHalfW = 2, smallHalfH = 3;
        const largeHalfW = 8, largeHalfH = 8;
        
        let baseSmallCx, baseSmallCy, baseLargeCx, baseLargeCy;
        
        // Dots positioned 8px AWAY from border (not on the border)
        // Top dot: X at center, Y = 0 - GAP - halfHeight (8px away from top border)
        // Bottom dot: X at center, Y = nodeHeight + GAP + halfHeight (8px away from bottom border)
        // Left dot: X = 0 - GAP - halfWidth (8px away from left border), Y at center
        // Right dot: X = nodeWidth + GAP + halfWidth (8px away from right border), Y at center
        if (key === 'top') {
          baseSmallCx = NODE_CENTER_X;     // X: always centered
          baseSmallCy = 0 - GAP - smallHalfH;      // Y: top border - gap - half height
          baseLargeCx = NODE_CENTER_X;     // X: always centered (same as small)
          baseLargeCy = 0 - GAP - largeHalfH;      // Y: top border - gap - half height
        } else if (key === 'bottom') {
          baseSmallCx = NODE_CENTER_X;     // X: always centered
          baseSmallCy = nodeHeight + GAP + smallHalfH;     // Y: bottom border + gap + half height
          baseLargeCx = NODE_CENTER_X;     // X: always centered (same as small)
          baseLargeCy = nodeHeight + GAP + largeHalfH;     // Y: bottom border + gap + half height
        } else if (key === 'left') {
          baseSmallCx = 0 - GAP - smallHalfW;      // X: left border - gap - half width
          baseSmallCy = NODE_CENTER_Y;     // Y: always centered
          baseLargeCx = 0 - GAP - largeHalfW;      // X: left border - gap - half width
          baseLargeCy = NODE_CENTER_Y;     // Y: always centered (same as small)
        } else { // right
          baseSmallCx = nodeWidth + GAP + smallHalfW;     // X: right border + gap + half width
          baseSmallCy = NODE_CENTER_Y;     // Y: always centered
          baseLargeCx = nodeWidth + GAP + largeHalfW;     // X: right border + gap + half width
          baseLargeCy = NODE_CENTER_Y;     // Y: always centered (same as small)
        }
        
        // Actual centers after ReactFlow scaling (for proximity detection)
        const smallCx = baseSmallCx * nodeScale;
        const smallCy = baseSmallCy * nodeScale;
        const largeCx = baseLargeCx * nodeScale;
        const largeCy = baseLargeCy * nodeScale;
        
        const smallCssCx = baseSmallCx;
        const smallCssCy = baseSmallCy;
        const largeCssCx = baseLargeCx;
        const largeCssCy = baseLargeCy;
        const isHovered = hoveredHandle === key;
        
        const isExpanded = expandedHandles.has(key);
        const isWhite = isExpanded && hoveredHandle === key;
        
        // Prevent flickering by ensuring smooth state transitions
        const stableIsWhite = React.useMemo(() => {
          return isExpanded && hoveredHandle === key;
        }, [isExpanded, hoveredHandle, key]);
        
        // DEBUG: Track every render and state change for top dot
        if (key === 'top') {
          renderCountRef.current++;
        }
        
        const hoverAreaCssCx = smallCssCx;
        const hoverAreaCssCy = smallCssCy;
        
        const hoverAreaPos = {
          left: (key === 'left' || key === 'right') ? hoverAreaCssCx : '50%',
          top: (key === 'top' || key === 'bottom') ? hoverAreaCssCy : '50%'
        };
        
        const dotCssCx = isExpanded ? largeCssCx : smallCssCx;
        const dotCssCy = isExpanded ? largeCssCy : smallCssCy;
        
        return (
          <React.Fragment key={key}>
            {/* Fixed proximity detection area (green) - actual hover area for expansion */}
            <div
              style={{
                position: 'absolute',
                left: hoverAreaPos.left,
                top: hoverAreaPos.top,
                transform: 'translate(-50%, -50%)',
                width: 64, // Larger hover area
                height: 64,
                background: isExpanded ? 'rgba(0, 255, 0, 0.15)' : 'rgba(0, 255, 0, 0.25)', // More visible green
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 1000,
                borderRadius: '8px' // Rounded corners for better visibility
              }}
              onMouseEnter={() => {
                const existingTimeout = timeoutRefs.current.get(`collapse-${key}`);
                if (existingTimeout) {
                  clearTimeout(existingTimeout);
                  timeoutRefs.current.delete(`collapse-${key}`);
                }
                
                const now = Date.now();
                const lastCollapse = expansionTimeRef.current.get(`${key}-collapse`);
                if (lastCollapse && (now - lastCollapse) < MIN_EXPANSION_TIME) {
                  return;
                }
                
                expansionTimeRef.current.set(key, now);
                setExpandedHandles(prev => new Set(prev).add(key));
              }}
              onMouseLeave={(e) => {
                const existingTimeout = timeoutRefs.current.get(`collapse-${key}`);
                if (existingTimeout) {
                  clearTimeout(existingTimeout);
                  timeoutRefs.current.delete(`collapse-${key}`);
                }
                
                const collapseTimeout = setTimeout(() => {
                  const currentHoveredHandle = hoveredHandle;
                  const currentExpandedHandles = expandedHandles;
                  
                  if (currentHoveredHandle === key) {
                    return;
                  }
                  
                  const expansionTime = expansionTimeRef.current.get(key);
                  const now = Date.now();
                  if (expansionTime && (now - expansionTime) < MIN_EXPANSION_TIME) {
                    return;
                  }
                  
                  if (mousePos && nodeEl) {
                    const greenAreaSize = 64; // Updated to match new hover area size
                    const bigDotSize = 16 * nodeScale;
                    const greenCenterX = (typeof hoverAreaPos.left === 'number' ? hoverAreaPos.left : NODE_CENTER_X) * nodeScale;
                    const greenCenterY = (typeof hoverAreaPos.top === 'number' ? hoverAreaPos.top : NODE_CENTER_Y) * nodeScale;
                    
                    const distFromGreenCenter = Math.sqrt(
                      Math.pow(mousePos.x - greenCenterX, 2) + 
                      Math.pow(mousePos.y - greenCenterY, 2)
                    );
                    
                    const maxDistance = Math.max(greenAreaSize / 2, bigDotSize / 2) + 5;
                    if (distFromGreenCenter <= maxDistance) {
                      return;
                    }
                  }
                  
                  const collapseTime = Date.now();
                  expansionTimeRef.current.set(`${key}-collapse`, collapseTime);
                  expansionTimeRef.current.delete(key);
                  
                  setExpandedHandles(prev => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                  });
                  
                  timeoutRefs.current.delete(`collapse-${key}`);
                }, 50);
                
                timeoutRefs.current.set(`collapse-${key}`, collapseTimeout);
              }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // Starting a connection from this dot mimics connector mode behavior
                const handleId = `connector-${key}-source`;
                onConnectorDotClick?.(nodeId, handleId);
              }}
            />
            
            {/* Wrapper div for positioning */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: isExpanded ? 'auto' : 'none',
                zIndex: isExpanded ? 2000 : 1
              }}
            >
              {/* Visual dot */}
              <motion.div
                key={key}
                data-handle={key}
                style={{
                  position: 'relative',
                  borderRadius: 999,
                  display: stableIsWhite ? 'flex' : 'block',
                  alignItems: stableIsWhite ? 'center' : 'auto',
                  justifyContent: stableIsWhite ? 'center' : 'auto',
                  cursor: 'pointer',
                  pointerEvents: isExpanded ? 'auto' : 'none'
                }}
                initial={{
                  x: (isExpanded || stableIsWhite ? largeCssCx : smallCssCx) - NODE_CENTER_X,
                  y: (isExpanded || stableIsWhite ? largeCssCy : smallCssCy) - NODE_CENTER_Y,
                  width: stableIsWhite ? 16 : (isExpanded ? 16 : 4),
                  height: stableIsWhite ? 16 : (isExpanded ? 16 : 6),
                  rotate: stableIsWhite ? 0 : (isExpanded ? 0 : rotation),
                  backgroundColor: stableIsWhite ? '#ffffff' : (isExpanded ? 'rgba(66,133,244,0.15)' : 'rgba(66,133,244,0.5)')
                }}
                animate={{
                  x: (isExpanded || stableIsWhite ? largeCssCx : smallCssCx) - NODE_CENTER_X,
                  y: (isExpanded || stableIsWhite ? largeCssCy : smallCssCy) - NODE_CENTER_Y,
                  width: stableIsWhite ? 16 : (isExpanded ? 16 : 4),
                  height: stableIsWhite ? 16 : (isExpanded ? 16 : 6),
                  rotate: stableIsWhite ? 0 : (isExpanded ? 0 : rotation),
                  backgroundColor: stableIsWhite ? '#ffffff' : (isExpanded ? 'rgba(66,133,244,0.15)' : 'rgba(66,133,244,0.5)')
                }}
                transition={{
                  x: (key === 'left' || key === 'right') && !stableIsWhite ? 
                    (isExpanded ? { type: 'spring', stiffness: 7250, damping: 60, mass: 1 } : { duration: 0 }) :
                    { duration: 0 },
                  y: (key === 'top' || key === 'bottom') && !stableIsWhite ? 
                    (isExpanded ? { type: 'spring', stiffness: 7250, damping: 60, mass: 1 } : { duration: 0 }) :
                    { duration: 0 },
                  width: stableIsWhite ? { duration: 0.2, ease: 'easeOut' } : (isExpanded ? { type: 'spring', stiffness: 7250, damping: 60, mass: 1 } : { duration: 0 }),
                  height: stableIsWhite ? { duration: 0.2, ease: 'easeOut' } : (isExpanded ? { type: 'spring', stiffness: 7250, damping: 60, mass: 1 } : { duration: 0 }),
                  rotate: stableIsWhite ? { duration: 0.2, ease: 'easeOut' } : (isExpanded ? { type: 'spring', stiffness: 7250, damping: 60, mass: 1 } : { duration: 0 }),
                  backgroundColor: stableIsWhite ? { duration: 0.2, ease: 'easeOut' } : (isExpanded ? { duration: 0.2, ease: 'easeOut' } : { duration: 0 })
                }}
                onMouseEnter={() => {
                  if (isExpanded) {
                    const existingTimeout = timeoutRefs.current.get(`collapse-${key}`);
                    if (existingTimeout) {
                      clearTimeout(existingTimeout);
                      timeoutRefs.current.delete(`collapse-${key}`);
                    }
                    
                    setHoveredHandle(key);
                  }
                }}
                onMouseLeave={(e) => {
                  if (isExpanded) {
                    setHoveredHandle(null);
                  }
                }}
                onClick={(e) => {
                  // Clicking the blue/white dot starts connection from that port
                  e.stopPropagation();
                  e.preventDefault();
                  const handleId = `connector-${key}-source`;
                  onConnectorDotClick?.(nodeId, handleId);
                }}
              >
                {/* Border with smooth transition - only visible when white */}
                {isWhite && (
                  <motion.div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 'inherit',
                      border: '1px solid #e4e4e4',
                      pointerEvents: 'none'
                    }}
                    initial={{ borderColor: 'rgba(228, 228, 228, 0)' }}
                    animate={{ borderColor: '#e4e4e4' }}
                    transition={{ duration: 0 }}
                  />
                )}
                
                {/* Chevron icon for white state */}
                {isWhite && (
                  <>
                    {key === 'top' && <ChevronUp size={10} color="#e4e4e4" />}
                    {key === 'right' && <ChevronRight size={10} color="#e4e4e4" />}
                    {key === 'bottom' && <ChevronDown size={10} color="#e4e4e4" />}
                    {key === 'left' && <ChevronLeft size={10} color="#e4e4e4" />}
                  </>
                )}
              </motion.div>
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
};

export default SelectedNodeDots;

