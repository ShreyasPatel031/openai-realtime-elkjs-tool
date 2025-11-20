import React from 'react';

interface UnifiedSelectionBoxProps {
  nodeWidth: number;
  nodeHeight: number;
  nodeScale?: number;
}

/**
 * UnifiedSelectionBox - Renders selection border and four corner squares
 * Used for both nodes and groups when selected
 * Rectangle border and four corner squares: #4285F4 at 50% opacity, 1px width
 */
const UnifiedSelectionBox: React.FC<UnifiedSelectionBoxProps> = ({ 
  nodeWidth, 
  nodeHeight,
  nodeScale = 1
}) => {
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
      {/* Selection border - rectangle (no border radius) */}
      <div
        style={{
          position: 'absolute',
          top: '-1px',
          left: '-1px',
          right: '-1px',
          bottom: '-1px',
          border: '1px solid rgba(66, 133, 244, 0.5)', // #4285F4 at 50% opacity, 1px width
          borderRadius: '0px', // Rectangle, no rounded corners
          pointerEvents: 'none',
          zIndex: 9999,
        }}
      />
      
      {/* Four corner squares */}
      {corners.map((corner) => {
        const baseStyle: React.CSSProperties = {
          position: 'absolute',
          width: `${zoomAwareSize}px`,
          height: `${zoomAwareSize}px`,
          borderRadius: '0px', // Square, no rounded corners
          background: 'transparent',
          border: '1px solid rgba(66, 133, 244, 0.5)', // #4285F4 at 50% opacity, 1px width
          pointerEvents: 'none', // Non-interactive, visual only
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
          />
        );
      })}
    </>
  );
};

export default UnifiedSelectionBox;







