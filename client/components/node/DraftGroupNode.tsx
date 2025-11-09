import React, { useState, useRef, useCallback, useEffect } from 'react';
import { NodeProps, useReactFlow } from 'reactflow';
import { LayoutDashboard, LayoutPanelLeft, CirclePlus } from 'lucide-react';

interface DraftGroupData {
  label: string;
  isDraft: boolean;
  state: 'default' | 'create' | 'interaction';
}

/**
 * DraftGroupNode - Exact Figma-style group states
 * 
 * States based on Figma MCP design:
 * - default: Clean gray border frame only (deselected)
 * - create: Blue border + corner resize handles (selected/create)
 * - interaction: Blue border + handles + node operation UI
 */
export const DraftGroupNode: React.FC<NodeProps<DraftGroupData>> = ({ data, selected, id, style, position }) => {
  const { setNodes, getNodes, getViewport, screenToFlowPosition } = useReactFlow();
  const [label, setLabel] = useState(data.label || 'Group');
  // No need for topBarWidth state - auto-sized to content
  const inputRef = useRef<HTMLInputElement>(null);
  // No measureRef needed for auto-sizing
  const resizeStartRef = useRef<{
    corner: 'nw'|'ne'|'sw'|'se';
    startPointerFlowX: number;
    startPointerFlowY: number;
    fixedX: number; // fixed opposite corner x in flow coords
    fixedY: number; // fixed opposite corner y in flow coords
    startWidth: number;
    startHeight: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);
  
  // Refs for resize handles to attach native event listeners
  const handleRefs = {
    nw: useRef<HTMLDivElement>(null),
    ne: useRef<HTMLDivElement>(null),
    sw: useRef<HTMLDivElement>(null),
    se: useRef<HTMLDivElement>(null),
  };
  
  // Determine state: selected shows "create" state, deselected shows "default" state
  const isSelected = selected || data.state === 'create';
  const showInteraction = data.state === 'interaction';
  
  // Exact Figma design colors
  const FIGMA_BLUE = '#4285F4';
  const GRAY_BORDER = '#E4E4E4';
  
  // Grid snapping utility (16px grid)
  const snap = (value: number) => Math.round(value / 16) * 16;
  
  // Get current node dimensions - MUST be defined before useEffect
  // Default size MUST be aligned to 16px grid: 480 = 30×16, 320 = 20×16
  const nodeWidth = style?.width ? (typeof style.width === 'number' ? style.width : parseFloat(style.width.toString())) : 480;
  const nodeHeight = style?.height ? (typeof style.height === 'number' ? style.height : parseFloat(style.height.toString())) : 320;
  
  
  // No width calculation needed - top bar will auto-size to content
  
  const handleResizeStart = useCallback((e: MouseEvent | React.MouseEvent, corner: 'nw'|'ne'|'sw'|'se') => {
    console.log(`🎬 RESIZE START: corner=${corner}`);
    e.preventDefault();
    e.stopPropagation();
    if ('nativeEvent' in e) (e as React.MouseEvent).nativeEvent.stopImmediatePropagation?.();
    else (e as MouseEvent).stopImmediatePropagation?.();

    // Current node position/size - get ACTUAL current state
    const nodes = getNodes();
    const currentNode = nodes.find(n => n.id === id);
    const startPosX = currentNode?.position?.x ?? position?.x ?? 0;
    const startPosY = currentNode?.position?.y ?? position?.y ?? 0;
    const startWidth = typeof currentNode?.style?.width === 'number' 
      ? currentNode.style.width 
      : (typeof currentNode?.style?.width === 'string' ? parseInt(currentNode.style.width) : nodeWidth);
    const startHeight = typeof currentNode?.style?.height === 'number' 
      ? currentNode.style.height 
      : (typeof currentNode?.style?.height === 'string' ? parseInt(currentNode.style.height) : nodeHeight);
    

    // Pointer in flow coords
    const { x: startPointerFlowX, y: startPointerFlowY } = screenToFlowPosition({ x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY });

    // Fixed opposite corner (in flow coords)
    let fixedX = startPosX;
    let fixedY = startPosY;
    switch (corner) {
      case 'nw': fixedX = startPosX + startWidth; fixedY = startPosY + startHeight; break; // keep bottom-right
      case 'ne': fixedX = startPosX;               fixedY = startPosY + startHeight; break; // keep bottom-left
      case 'sw': fixedX = startPosX + startWidth; fixedY = startPosY;               break; // keep top-right
      case 'se': fixedX = startPosX;               fixedY = startPosY;               break; // keep top-left
    }
    
    console.log(`📍 FIXED CORNER should stay at: (${fixedX}, ${fixedY})`);

    resizeStartRef.current = {
      corner,
      startPointerFlowX,
      startPointerFlowY,
      fixedX,
      fixedY,
      startWidth,
      startHeight,
      startPosX,
      startPosY,
    };

    let moveCount = 0;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      
      if (++moveCount === 1) console.log('➕ first mousemove - single handler confirmed');

      // Live pointer in flow coords
      const { x: rawX, y: rawY } = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });

      // Snap the pointer corner (not the final width/height)
      const pointerX = snap(rawX);
      const pointerY = snap(rawY);

      // Build rect from fixed corner + pointer corner (corner-specific logic)
      let newPosX, newPosY, newWidth, newHeight;
      
      switch (start.corner) {
        case 'nw': // dragging top-left, bottom-right fixed
          newWidth = Math.max(160, start.fixedX - pointerX);
          newHeight = Math.max(112, start.fixedY - pointerY);
          newPosX = start.fixedX - newWidth;
          newPosY = start.fixedY - newHeight;
          break;
        case 'ne': // dragging top-right, bottom-left fixed  
          newWidth = Math.max(160, pointerX - start.fixedX);
          newHeight = Math.max(112, start.fixedY - pointerY);
          newPosX = start.fixedX; // left edge never moves
          newPosY = start.fixedY - newHeight;
          break;
        case 'sw': // dragging bottom-left, top-right fixed
          newWidth = Math.max(160, start.fixedX - pointerX);
          newHeight = Math.max(112, pointerY - start.fixedY);
          newPosX = start.fixedX - newWidth;
          newPosY = start.fixedY; // top edge never moves
          break;
        case 'se': // dragging bottom-right, top-left fixed
          newWidth = Math.max(160, pointerX - start.fixedX);
          newHeight = Math.max(112, pointerY - start.fixedY);
          newPosX = start.fixedX; // left edge never moves
          newPosY = start.fixedY; // top edge never moves
          break;
      }

      // Calculate final opposite corner position to verify it stays fixed
      let finalOppositeX, finalOppositeY;
      switch (start.corner) {
        case 'nw': 
          finalOppositeX = newPosX + newWidth;
          finalOppositeY = newPosY + newHeight;
          break;
        case 'ne': 
          finalOppositeX = newPosX;
          finalOppositeY = newPosY + newHeight;
          break;
        case 'sw': 
          finalOppositeX = newPosX + newWidth;
          finalOppositeY = newPosY;
          break;
        case 'se': 
          finalOppositeX = newPosX;
          finalOppositeY = newPosY;
          break;
      }

      // Debug: Show if opposite corner moved (should never happen now)
      const oppositeMovedX = Math.abs(finalOppositeX - start.fixedX) > 0.1;
      const oppositeMovedY = Math.abs(finalOppositeY - start.fixedY) > 0.1;
      
      if (oppositeMovedX || oppositeMovedY) {
        console.log(`🚨 OPPOSITE CORNER MOVED [${start.corner}]:`);
        console.log(`  Fixed should be: (${start.fixedX}, ${start.fixedY})`);
        console.log(`  Calculated as:   (${finalOppositeX}, ${finalOppositeY})`);
        console.log(`  Moved by:        (${finalOppositeX - start.fixedX}, ${finalOppositeY - start.fixedY})`);
        console.log(`  New rect:        pos(${newPosX}, ${newPosY}) size(${newWidth}x${newHeight})`);
        console.log(`  Pointer:         (${pointerX}, ${pointerY}) from raw(${rawX}, ${rawY})`);
      }

      // Minimal logging - just track if opposite corner stays fixed
      if (Math.abs(finalOppositeX - start.fixedX) > 0.1 || Math.abs(finalOppositeY - start.fixedY) > 0.1) {
        console.log(`🚨 OPPOSITE DRIFT: should be(${start.fixedX}, ${start.fixedY}) got(${finalOppositeX}, ${finalOppositeY})`);
      }

      // Map back into node position depending on which corner is being dragged
      // (The math above already handled this via min/max, so we just set.)
      setNodes(nodes =>
        nodes.map(node =>
          node.id === id
            ? {
                ...node,
                position: { x: newPosX, y: newPosY },
                // Let style control the visual size; avoid also setting node.width/height to prevent conflicts
                style: { ...node.style, width: newWidth, height: newHeight },
              }
            : node
        )
      );
    };

    const handleMouseUp = () => {
      console.log(`🛑 mouseup; total moves this drag = ${moveCount}`);
      moveCount = 0;
      resizeStartRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [id, nodeWidth, nodeHeight, position, setNodes, getNodes, screenToFlowPosition]);
  
  // Native listeners to intercept BEFORE ReactFlow sees the event
  const attachHandleListener = useCallback((corner: string) => {
    return (element: HTMLDivElement | null) => {
      if (!element) return;
      
      const handleMouseDown = (e: MouseEvent) => {
        console.log(`🎯 NATIVE HANDLE CLICKED: ${corner}`);
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleResizeStart(e, corner);
      };
      
      element.addEventListener('mousedown', handleMouseDown, true); // Capture phase
      
      (element as any).__cleanupResize = () => {
        element.removeEventListener('mousedown', handleMouseDown, true);
      };
    };
  }, [handleResizeStart]);
  
  // Handle label change
  const handleLabelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newLabel = e.target.value;
    setLabel(newLabel);
  }, []);
  
  // Cursor styles for each corner
  const getCursor = (corner: string) => {
    switch (corner) {
      case 'nw':
      case 'se':
        return 'nwse-resize';
      case 'ne':
      case 'sw':
        return 'nesw-resize';
      default:
        return 'nwse-resize';
    }
  };
  
  // Base container styles - exact match to Figma
  const containerStyles = {
    width: '100%',
    height: '100%',
    position: 'relative' as const,
    boxSizing: 'border-box' as const,
    pointerEvents: 'auto' as const, // Ensure container can receive events
  };

  // Main frame styles based on state
  const frameStyles = isSelected ? {
    // CREATE STATE: Blue border like Figma selection
    width: '100%',
    height: '100%',
    background: '#FFFFFF',
    border: `0.5px solid ${FIGMA_BLUE}`,
    borderRadius: '4px',
    position: 'relative' as const,
    boxSizing: 'border-box' as const,
    pointerEvents: 'auto' as const, // Ensure frame can receive events but doesn't block handles
  } : {
    // DEFAULT STATE: Clean gray border only  
    width: '100%',
    height: '100%',
    background: '#FFFFFF',
    border: `1px solid ${GRAY_BORDER}`,
    borderRadius: '4px',
    position: 'relative' as const,
    boxSizing: 'border-box' as const,
    pointerEvents: 'auto' as const,
  };

  // Figma corner handles positioning (exact pixel values from design)
  const renderCornerHandles = () => {
    const handleBaseStyles = {
      position: 'absolute' as const,
      width: '8px',
      height: '8px',
      background: '#FFFFFF',
      border: `1px solid ${FIGMA_BLUE}`,
      borderRadius: '1px',
      zIndex: 10000,
      pointerEvents: 'auto' as const,
      cursor: 'pointer',
    };
    
    // React handler removed - using native capture phase listeners instead
    
    return (
      <>
        {/* Top-left - positioned at corner */}
        <div
          ref={(el) => {
            handleRefs.nw.current = el;
            attachHandleListener('nw')(el);
          }}
          style={{ ...handleBaseStyles, top: '-4px', left: '-4px', cursor: getCursor('nw') }}
          onClick={(e) => e.stopPropagation()}
          data-handle="nw"
          data-node-id={id}
        />
        {/* Top-right - positioned at corner */}
        <div
          ref={(el) => {
            handleRefs.ne.current = el;
            attachHandleListener('ne')(el);
          }}
          style={{ ...handleBaseStyles, top: '-4px', right: '-4px', cursor: getCursor('ne') }}
          onClick={(e) => e.stopPropagation()}
          data-handle="ne"
          data-node-id={id}
        />
        {/* Bottom-left - positioned at corner */}
        <div
          ref={(el) => {
            handleRefs.sw.current = el;
            attachHandleListener('sw')(el);
          }}
          style={{ ...handleBaseStyles, bottom: '-4px', left: '-4px', cursor: getCursor('sw') }}
          onClick={(e) => e.stopPropagation()}
          data-handle="sw"
          data-node-id={id}
        />
        {/* Bottom-right - positioned at corner */}
        <div
          ref={(el) => {
            handleRefs.se.current = el;
            attachHandleListener('se')(el);
          }}
          style={{ ...handleBaseStyles, bottom: '-4px', right: '-4px', cursor: getCursor('se') }}
          onClick={(e) => e.stopPropagation()}
          data-handle="se"
          data-node-id={id}
        />
      </>
    );
  };

  const renderInteractionUI = () => (
    <div style={{
      position: 'absolute',
      top: 8,
      right: -32,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      background: '#FFFFFF',
      border: `1px solid ${FIGMA_BLUE}`,
      borderRadius: 4,
      padding: 6,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    }}>
      {/* Add node button */}
      <button style={{
        width: 16,
        height: 16,
        border: 'none',
        background: FIGMA_BLUE,
        borderRadius: 2,
        color: 'white',
        fontSize: 12,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
      }}>
        +
      </button>
    </div>
  );

  return (
    <div style={containerStyles}>
      {/* Main frame */}
      <div style={frameStyles}>
        {/* Top Bar - FIT TO CONTENT: Calculate width from actual content */}
        <div style={{
          position: 'absolute',
          top: '-48px',
          left: '0px',
          background: '#FFFFFF',
          border: '1px solid #E4E4E4',
          borderRadius: '8px',
          boxSizing: 'border-box',
          display: 'inline-flex', // inline-flex to shrink-wrap content
          gap: '8px', 
          alignItems: 'center',
          paddingLeft: '8px', // Reduced padding
          paddingRight: '8px', // Reduced padding
          paddingTop: '8px',
          paddingBottom: '8px',
          height: '40px',
          fontFamily: 'Inter, -apple-system, sans-serif',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          // inline-flex shrinks to actual content size
        }}>
          {/* Icon Wrapper - EXACT Figma: button with p-[4px] */}
          <button style={{
            boxSizing: 'border-box',
            display: 'flex',
            gap: '10px', // gap-[10px]
            alignItems: 'center',
            overflow: 'visible', // overflow-visible
            padding: '4px', // p-[4px] 
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            flexShrink: 0, // shrink-0
            position: 'relative',
          }}>
            <div style={{
              display: 'flex',
              gap: '10px', // gap-[10px]
              alignItems: 'center',
              justifyContent: 'center',
              width: '16px', // size-[16px]
              height: '16px', // size-[16px]
              flexShrink: 0, // shrink-0
              position: 'relative',
            }}>
              <div style={{
                width: '10px', // size-[10px]
                height: '10px', // size-[10px]
                flexShrink: 0, // shrink-0
                position: 'relative',
              }}>
                <LayoutDashboard size={10} style={{ color: '#515159' }} />
              </div>
            </div>
          </button>
          
          {/* Separator - EXACT Figma */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'stretch', // self-stretch
          }}>
            <div style={{
              height: '100%',
              width: '0px',
              flexShrink: 0, // shrink-0
              position: 'relative',
              borderLeft: '1px solid #E4E4E4',
            }} />
          </div>
          
          {/* Text Wrapper - SAME 4px padding as icon */}
          <button style={{
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            overflow: 'visible',
            padding: '4px', // SAME 4px padding as icon wrapper
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            flexShrink: 0,
            position: 'relative',
          }}>
            <input
              ref={inputRef}
              type="text"
              value={label}
              onChange={handleLabelChange}
              size={label.length || 5} // size attribute = fit to text length
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '12px',
                color: '#515159',
                fontFamily: 'Inter, -apple-system, sans-serif',
                fontWeight: '400',
                lineHeight: 'normal',
                padding: '0',
                margin: '0',
                width: 'auto', // Fit exactly to content
                cursor: 'pointer',
              }}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.target.select()}
            />
          </button>
        </div>

        {/* Side Bar - FIT TO HEIGHT: auto height so justify-center works properly */}
        {isSelected && (
          <div style={{
            position: 'absolute',
            top: '0px',
            right: '-48px',
            background: '#FFFFFF',
            border: '1px solid #E4E4E4',
            borderRadius: '8px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column', // flex-col
            gap: '8px', // gap-[8px]
            alignItems: 'center', // items-center
            justifyContent: 'center', // justify-center - centers 2 icons with divider
            padding: '8px', // p-[8px]
            width: '40px',
            height: 'auto', // FIT TO CONTENT HEIGHT
            minHeight: '80px', // Ensure minimum size like Figma
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            {/* Top Icon - EXACT Figma: button p-[4px] */}
            <button 
              style={{
                boxSizing: 'border-box',
                display: 'flex',
                gap: '10px', // gap-[10px]
                alignItems: 'center',
                overflow: 'visible', // overflow-visible
                padding: '4px', // p-[4px]
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                flexShrink: 0, // shrink-0
                position: 'relative',
              }}
            >
              {/* 16px wrapper - size-[16px] */}
              <div style={{
                display: 'flex',
                gap: '10px', // gap-[10px]
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px', // size-[16px]
                height: '16px', // size-[16px]
                flexShrink: 0, // shrink-0
                position: 'relative',
              }}>
                {/* 10px icon - size-[10px] */}
                <div style={{
                  width: '10px', // size-[10px]
                  height: '10px', // size-[10px]
                  flexShrink: 0, // shrink-0
                  position: 'relative',
                }}>
                  <LayoutPanelLeft size={10} style={{ color: '#515159' }} />
                </div>
              </div>
            </button>
            
            {/* Separator - EXACT Figma: height=0px, width=0px (no layout space) */}
            <div style={{
              display: 'flex',
              height: '0px', // calc with vars=0 results in 0px = NO layout space
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              flexShrink: 0, // shrink-0
              width: '0px', // calc with vars=0 results in 0px  
            }}>
              <div style={{
                flexShrink: 0, // flex-none
                transform: 'rotate(270deg)', // rotate-[270deg]
              }}>
                <div style={{
                  height: '24px', // h-[24px] - visual line
                  position: 'relative',
                  width: '0px', // w-0
                  borderLeft: '1px solid #E4E4E4',
                }} />
              </div>
            </div>
            
            {/* Bottom Icon - EXACT Figma: button p-[4px] */}
            <button 
              style={{
                boxSizing: 'border-box',
                display: 'flex',
                gap: '10px', // gap-[10px]
                alignItems: 'center',
                overflow: 'visible', // overflow-visible
                padding: '4px', // p-[4px]
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                flexShrink: 0, // shrink-0
                position: 'relative',
              }}
            >
              {/* 16px wrapper - size-[16px] */}
              <div style={{
                display: 'flex',
                gap: '10px', // gap-[10px]
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px', // size-[16px]
                height: '16px', // size-[16px]
                flexShrink: 0, // shrink-0
                position: 'relative',
              }}>
                {/* 10px icon - size-[10px] */}
                <div style={{
                  width: '10px', // size-[10px]
                  height: '10px', // size-[10px]
                  flexShrink: 0, // shrink-0
                  position: 'relative',
                }}>
                  <CirclePlus size={10} style={{ color: '#515159' }} />
                </div>
              </div>
            </button>
          </div>
        )}

              {/* Corner handles - only when selected/create state */}
              {isSelected && renderCornerHandles()}
        
        {/* Interaction UI - only when in interaction state */}
        {showInteraction && renderInteractionUI()}
      </div>
    </div>
  );
};
