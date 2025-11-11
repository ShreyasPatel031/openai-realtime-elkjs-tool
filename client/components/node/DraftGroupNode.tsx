import React, { useState, useRef, useCallback, useEffect } from 'react';
import { NodeProps, useReactFlow, Handle, Position } from 'reactflow';
import { LayoutDashboard, LayoutPanelLeft, CirclePlus } from 'lucide-react';
import { baseHandleStyle } from '../graph/handles';
import { useNodeInteractions } from '../../contexts/NodeInteractionContext';

type DraftGroupState = 'default' | 'create' | 'interaction';

interface DraftGroupData {
  label: string;
  isDraft?: boolean;
  state?: DraftGroupState;
  leftHandles?: string[];
  rightHandles?: string[];
  topHandles?: string[];
  bottomHandles?: string[];
}

interface DraftGroupNodeProps extends NodeProps<DraftGroupData> {
  onAddNode?: (groupId: string) => void;
}

/**
 * DraftGroupNode - Figma-style group frame with resize handles and toolbar states.
 */
const DraftGroupNode: React.FC<DraftGroupNodeProps> = ({ data, selected, id, style, position, onAddNode }) => {
  const interactions = useNodeInteractions();
  const { setNodes, getNodes, screenToFlowPosition } = useReactFlow();
  const handleAddNodeToGroup = interactions?.handleAddNodeToGroup ?? onAddNode;
  const [label, setLabel] = useState(data.label || 'Group');
  const [hoveredCorner, setHoveredCorner] = useState<'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRefs = useRef<Record<'nw' | 'ne' | 'sw' | 'se', HTMLDivElement | null>>({
    nw: null,
    ne: null,
    sw: null,
    se: null,
  });
  const cleanupRefs = useRef<Record<'nw' | 'ne' | 'sw' | 'se', (() => void) | null>>({
    nw: null,
    ne: null,
    sw: null,
    se: null,
  });
  const resizeStartRef = useRef<{
    corner: 'nw' | 'ne' | 'sw' | 'se';
    startPointerFlowX: number;
    startPointerFlowY: number;
    fixedX: number;
    fixedY: number;
    startWidth: number;
    startHeight: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);

  const currentState: DraftGroupState = data.state || 'default';
  const showSelection = selected || currentState === 'create' || currentState === 'interaction';
  const showInteraction = currentState === 'interaction';

  const FIGMA_BLUE = '#4285F4';
  const GRAY_BORDER = '#E4E4E4';
  const snap = (value: number) => Math.round(value / 16) * 16;

  const nodeWidth = style?.width
    ? typeof style.width === 'number'
      ? style.width
      : parseFloat(style.width.toString())
    : 480;
  const nodeHeight = style?.height
    ? typeof style.height === 'number'
      ? style.height
      : parseFloat(style.height.toString())
    : 320;

  const handleResizeStart = useCallback(
    (e: MouseEvent | React.MouseEvent, corner: 'nw' | 'ne' | 'sw' | 'se') => {
      e.preventDefault();
      e.stopPropagation();
      if ('nativeEvent' in e) {
        (e as React.MouseEvent).nativeEvent.stopImmediatePropagation?.();
      } else {
        (e as MouseEvent).stopImmediatePropagation?.();
      }

      const nodes = getNodes();
      const currentNode = nodes.find((n) => n.id === id);
      const startPosX = currentNode?.position?.x ?? position?.x ?? 0;
      const startPosY = currentNode?.position?.y ?? position?.y ?? 0;
      const startWidth =
        typeof currentNode?.style?.width === 'number'
          ? currentNode.style.width
          : typeof currentNode?.style?.width === 'string'
          ? parseInt(currentNode.style.width, 10)
          : nodeWidth;
      const startHeight =
        typeof currentNode?.style?.height === 'number'
          ? currentNode.style.height
          : typeof currentNode?.style?.height === 'string'
          ? parseInt(currentNode.style.height, 10)
          : nodeHeight;

      const { x: startPointerFlowX, y: startPointerFlowY } = screenToFlowPosition({
        x: (e as MouseEvent).clientX,
        y: (e as MouseEvent).clientY,
      });

      let fixedX = startPosX;
      let fixedY = startPosY;
      switch (corner) {
        case 'nw':
          fixedX = startPosX + startWidth;
          fixedY = startPosY + startHeight;
          break;
        case 'ne':
          fixedX = startPosX;
          fixedY = startPosY + startHeight;
          break;
        case 'sw':
          fixedX = startPosX + startWidth;
          fixedY = startPosY;
          break;
        case 'se':
          fixedX = startPosX;
          fixedY = startPosY;
          break;
      }

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

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const start = resizeStartRef.current;
        if (!start) return;

        const { x: rawX, y: rawY } = screenToFlowPosition({
          x: moveEvent.clientX,
          y: moveEvent.clientY,
        });

        const pointerX = snap(rawX);
        const pointerY = snap(rawY);

        let newPosX = start.startPosX;
        let newPosY = start.startPosY;
        let newWidth = start.startWidth;
        let newHeight = start.startHeight;

        switch (start.corner) {
          case 'nw':
            newWidth = Math.max(160, start.fixedX - pointerX);
            newHeight = Math.max(112, start.fixedY - pointerY);
            newPosX = start.fixedX - newWidth;
            newPosY = start.fixedY - newHeight;
            break;
          case 'ne':
            newWidth = Math.max(160, pointerX - start.fixedX);
            newHeight = Math.max(112, start.fixedY - pointerY);
            newPosX = start.fixedX;
            newPosY = start.fixedY - newHeight;
            break;
          case 'sw':
            newWidth = Math.max(160, start.fixedX - pointerX);
            newHeight = Math.max(112, pointerY - start.fixedY);
            newPosX = start.fixedX - newWidth;
            newPosY = start.fixedY;
            break;
          case 'se':
            newWidth = Math.max(160, pointerX - start.fixedX);
            newHeight = Math.max(112, pointerY - start.fixedY);
            newPosX = start.fixedX;
            newPosY = start.fixedY;
            break;
        }

        setNodes((nodes) =>
          nodes.map((node) =>
            node.id === id
              ? {
                  ...node,
                  position: { x: newPosX, y: newPosY },
                  style: { ...node.style, width: newWidth, height: newHeight },
                }
              : node
          )
        );
      };

      const handleMouseUp = () => {
        resizeStartRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [getNodes, id, nodeHeight, nodeWidth, position, screenToFlowPosition, setNodes]
  );

  const handleLabelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLabel(e.target.value);
  }, []);

  const getCursor = (corner: 'nw' | 'ne' | 'sw' | 'se') => {
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

  const containerStyles: React.CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'relative',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
  };

  const frameStyles: React.CSSProperties = showSelection
    ? {
        width: '100%',
        height: '100%',
        background: '#FFFFFF',
        border: `0.5px solid ${FIGMA_BLUE}`,
        borderRadius: '4px',
        position: 'relative',
        boxSizing: 'border-box',
        pointerEvents: 'auto',
      }
    : {
        width: '100%',
        height: '100%',
        background: '#FFFFFF',
        border: `1px solid ${GRAY_BORDER}`,
        borderRadius: '4px',
        position: 'relative',
        boxSizing: 'border-box',
        pointerEvents: 'auto',
      };

  const renderTopBar = () => (
    <div
      style={{
        position: 'absolute',
        top: '-48px',
        left: '0px',
        background: '#FFFFFF',
        border: '1px solid #E4E4E4',
        borderRadius: '8px',
        boxSizing: 'border-box',
        display: 'inline-flex',
        gap: '8px',
        alignItems: 'center',
        padding: '8px',
        height: '40px',
        fontFamily: 'Inter, -apple-system, sans-serif',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <button
        style={{
          boxSizing: 'border-box',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          overflow: 'visible',
          padding: '4px',
          cursor: 'pointer',
          border: 'none',
          background: 'transparent',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <div
            style={{
              width: '10px',
              height: '10px',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            <LayoutDashboard size={10} style={{ color: '#515159' }} />
          </div>
        </div>
      </button>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'stretch',
        }}
      >
        <div
          style={{
            height: '100%',
            width: '0px',
            flexShrink: 0,
            position: 'relative',
            borderLeft: '1px solid #E4E4E4',
          }}
        />
      </div>
      <button
        style={{
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          overflow: 'visible',
          padding: '4px',
          cursor: 'pointer',
          border: 'none',
          background: 'transparent',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={label}
          onChange={handleLabelChange}
          size={label.length || 5}
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
            width: 'auto',
            cursor: 'pointer',
          }}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.target.select()}
        />
      </button>
    </div>
  );

  const renderSideToolbar = () => (
    <div
        style={{
        position: 'absolute',
        top: '0px',
        right: '-48px',
        background: '#FFFFFF',
          border: '1px solid #E4E4E4',
        borderRadius: '8px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
        width: '40px',
        minHeight: '80px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <button
        style={{
          boxSizing: 'border-box',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          overflow: 'visible',
          padding: '4px',
          cursor: 'pointer',
          border: 'none',
          background: 'transparent',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <div
            style={{
              width: '10px',
              height: '10px',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            <LayoutPanelLeft size={10} style={{ color: '#515159' }} />
          </div>
        </div>
      </button>
      <div
        style={{
          display: 'flex',
          height: '0px',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          flexShrink: 0,
          width: '0px',
        }}
      >
        <div
          style={{
            flexShrink: 0,
            transform: 'rotate(270deg)',
          }}
        >
          <div
            style={{
              height: '24px',
              position: 'relative',
              width: '0px',
              borderLeft: '1px solid #E4E4E4',
            }}
          />
        </div>
      </div>
      <button
        style={{
          boxSizing: 'border-box',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          overflow: 'visible',
          padding: '4px',
          cursor: 'pointer',
          border: 'none',
          background: 'transparent',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <div
            style={{
              width: '10px',
              height: '10px',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            <CirclePlus size={10} style={{ color: '#515159' }} />
          </div>
        </div>
      </button>
    </div>
  );

  const registerHandleRef = useCallback(
    (corner: 'nw' | 'ne' | 'sw' | 'se') =>
      (element: HTMLDivElement | null) => {
        if (cleanupRefs.current[corner]) {
          cleanupRefs.current[corner]?.();
          cleanupRefs.current[corner] = null;
        }
        handleRefs.current[corner] = element;
        if (!element) return;

        const handleMouseDown = (event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          handleResizeStart(event, corner);
        };

        element.addEventListener('mousedown', handleMouseDown, true);
        cleanupRefs.current[corner] = () => {
          element.removeEventListener('mousedown', handleMouseDown, true);
        };
      },
    [handleResizeStart]
  );

  useEffect(() => {
    return () => {
      (['nw', 'ne', 'sw', 'se'] as const).forEach((corner) => {
        cleanupRefs.current[corner]?.();
        cleanupRefs.current[corner] = null;
      });
    };
  }, []);

  const renderCornerHandles = () => {
    const HOVER_FILL = 'rgba(52, 211, 153, 0.22)';
    const HOVER_BORDER = 'rgba(52, 211, 153, 0.48)';
    const IDLE_FILL = 'rgba(52, 211, 153, 0.10)';
    const IDLE_BORDER = 'rgba(52, 211, 153, 0.18)';
    const MIN_SIZE = 48;
    const MAX_SIZE = 112;

    const zoomAwareSize = Math.min(
      MAX_SIZE,
      Math.max(MIN_SIZE, Math.min(nodeWidth, nodeHeight) * 0.35)
    );
    const half = zoomAwareSize / 2;

    const corners: Array<'nw' | 'ne' | 'sw' | 'se'> = ['nw', 'ne', 'sw', 'se'];

    return (
      <>
        {corners.map((corner) => {
          const isHovered = hoveredCorner === corner;
          const baseStyle: React.CSSProperties = {
            position: 'absolute',
            width: `${zoomAwareSize}px`,
            height: `${zoomAwareSize}px`,
            cursor: getCursor(corner),
            borderRadius: '12px',
            background: isHovered ? HOVER_FILL : IDLE_FILL,
            border: `1px solid ${isHovered ? HOVER_BORDER : IDLE_BORDER}`,
            transition: 'background 0.12s ease-out, border-color 0.12s ease-out',
            pointerEvents: 'auto',
            zIndex: 9998,
          };

          switch (corner) {
            case 'nw':
              baseStyle.top = `${-half}px`;
              baseStyle.left = `${-half}px`;
              break;
            case 'ne':
              baseStyle.top = `${-half}px`;
              baseStyle.right = `${-half}px`;
              break;
            case 'sw':
              baseStyle.bottom = `${-half}px`;
              baseStyle.left = `${-half}px`;
              break;
            case 'se':
              baseStyle.bottom = `${-half}px`;
              baseStyle.right = `${-half}px`;
              break;
          }

          return (
            <div
              key={corner}
              ref={registerHandleRef(corner)}
              style={baseStyle}
              onMouseEnter={() => setHoveredCorner(corner)}
              onMouseLeave={() => setHoveredCorner((prev) => (prev === corner ? null : prev))}
            >
              <div
                style={{
                  position: 'absolute',
                  width: '8px',
                  height: '8px',
                  background: '#FFFFFF',
                  border: `1px solid ${FIGMA_BLUE}`,
                  borderRadius: '1px',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  boxShadow: isHovered ? '0 0 0 1px rgba(52, 211, 153, 0.5)' : 'none',
                }}
              />
            </div>
          );
        })}
      </>
    );
  };

  const renderInteractionUI = () => (
    <div
      style={{
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
      }}
    >
      <button
        style={{
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
        }}
        onClick={(event) => {
          event.stopPropagation();
          handleAddNodeToGroup?.(id);
        }}
      >
        +
      </button>
    </div>
  );

  const renderHandles = () => (
    <>
      {(data.leftHandles || []).map((yPos, index) => (
        <React.Fragment key={`left-${index}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={`left-${index}-target`}
            style={{ ...baseHandleStyle, top: yPos }}
          />
          <Handle
            type="source"
            position={Position.Left}
            id={`left-${index}-source`}
            style={{ ...baseHandleStyle, top: yPos, opacity: 0 }}
          />
        </React.Fragment>
      ))}

      {(data.rightHandles || []).map((yPos, index) => (
        <React.Fragment key={`right-${index}`}>
          <Handle
            type="source"
            position={Position.Right}
            id={`right-${index}-source`}
            style={{ ...baseHandleStyle, top: yPos }}
          />
          <Handle
            type="target"
            position={Position.Right}
            id={`right-${index}-target`}
            style={{ ...baseHandleStyle, top: yPos }}
          />
        </React.Fragment>
      ))}

      {(data.topHandles || []).map((xPos, index) => (
        <React.Fragment key={`top-${index}`}>
          <Handle
            type="source"
            position={Position.Top}
            id={`top-${index}-source`}
            style={{ ...baseHandleStyle, left: xPos }}
          />
          <Handle
            type="target"
            position={Position.Top}
            id={`top-${index}-target`}
            style={{ ...baseHandleStyle, left: xPos }}
          />
        </React.Fragment>
      ))}

      {(data.bottomHandles || []).map((xPos, index) => (
        <React.Fragment key={`bottom-${index}`}>
          <Handle
            type="target"
            position={Position.Bottom}
            id={`bottom-${index}-target`}
            style={{ ...baseHandleStyle, left: xPos }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id={`bottom-${index}-source`}
            style={{ ...baseHandleStyle, left: xPos }}
          />
        </React.Fragment>
      ))}
    </>
  );

  return (
    <div style={containerStyles}>
      <div style={frameStyles}>
        {renderTopBar()}
        {showSelection && renderSideToolbar()}
        {showSelection && renderCornerHandles()}
        {renderHandles()}
        {showInteraction && renderInteractionUI()}
      </div>
    </div>
  );
};

export default DraftGroupNode;
