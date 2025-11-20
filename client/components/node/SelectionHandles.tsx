import React, { useState } from 'react';

interface SelectionHandlesProps {
  nodeWidth: number;
  nodeHeight: number;
  nodeScale: number;
}

const FIGMA_BLUE = '#4285F4';
const GRAY_BORDER = '#E4E4E4';

/**
 * SelectionHandles - Renders selection border and four corner squares for selected nodes
 * Similar to DraftGroupNode's resize handles but non-interactive (visual only)
 */
const SelectionHandles: React.FC<SelectionHandlesProps> = ({ 
  nodeWidth, 
  nodeHeight, 
  nodeScale 
}) => {
  const [hoveredCorner, setHoveredCorner] = useState<'nw' | 'ne' | 'sw' | 'se' | null>(null);

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
      {/* Selection border */}
      <div
        style={{
          position: 'absolute',
          top: '-1px',
          left: '-1px',
          right: '-1px',
          bottom: '-1px',
          border: `0.5px solid ${FIGMA_BLUE}`,
          borderRadius: '8px',
          pointerEvents: 'none',
          zIndex: 9999,
        }}
      />
      
      {/* Corner handles */}
      {corners.map((corner) => {
        const isHovered = hoveredCorner === corner;
        const baseStyle: React.CSSProperties = {
          position: 'absolute',
          width: `${zoomAwareSize}px`,
          height: `${zoomAwareSize}px`,
          borderRadius: '12px',
          background: isHovered ? 'rgba(52, 211, 153, 0.22)' : 'rgba(52, 211, 153, 0.10)',
          border: `1px solid ${isHovered ? 'rgba(52, 211, 153, 0.48)' : 'rgba(52, 211, 153, 0.18)'}`,
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
            style={baseStyle}
            onMouseEnter={() => setHoveredCorner(corner)}
            onMouseLeave={() => setHoveredCorner(null)}
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

export default SelectionHandles;









