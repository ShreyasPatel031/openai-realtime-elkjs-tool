import React, { useEffect, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { baseHandleStyle } from './graph/handles';

// Use Vite's glob pattern to load all icons at build time
const modules = (import.meta as any).glob('../assets/canvas/*.(svg|png|jpeg|jpg)', { eager: true });

// Create icons map from the glob results
const icons: Record<string, string> = {};
const iconExtensions: Record<string, string> = {};

Object.entries(modules).forEach(([path, module]: [string, any]) => {
  const match = path.match(/\/([^/]+)\.(svg|png|jpeg|jpg)$/);
  if (match) {
    const [, name, ext] = match;
    icons[name] = module.default;
    iconExtensions[name] = `.${ext}`;
  }
});

interface CustomNodeProps {
  data: {
    label: string;
    icon?: string;
    width?: number;
    height?: number;
    leftHandles?: string[];
    rightHandles?: string[];
    topHandles?: string[];
    bottomHandles?: string[];
  };
  id: string;
  selected?: boolean;
}

const CustomNode: React.FC<CustomNodeProps> = ({ data, id, selected }) => {
  const { leftHandles = [], rightHandles = [], topHandles = [], bottomHandles = [] } = data;
  const [iconLoaded, setIconLoaded] = useState(false);
  const [iconError, setIconError] = useState(false);
  const [finalIconSrc, setFinalIconSrc] = useState<string | undefined>(undefined);
  
  // Use the icon from the data if it exists in our icons map
  const iconName = data.icon || '';
  
  useEffect(() => {
    // Reset states when icon changes
    if (data.icon) {
      setIconLoaded(false);
      setIconError(false);
      
      // Try loading SVG first
      const svgSrc = `/assets/canvas/${data.icon}.svg`;
      const imgSvg = new Image();
      imgSvg.onload = () => {
        setFinalIconSrc(svgSrc);
        setIconLoaded(true);
      };
      imgSvg.onerror = () => {
        // Try PNG if SVG fails
        const pngSrc = `/assets/canvas/${data.icon}.png`;
        const imgPng = new Image();
        imgPng.onload = () => {
          setFinalIconSrc(pngSrc);
          setIconLoaded(true);
        };
        imgPng.onerror = () => {
          // If both fail, try JPEG
          const jpgSrc = `/assets/canvas/${data.icon}.jpeg`;
          const imgJpg = new Image();
          imgJpg.onload = () => {
            setFinalIconSrc(jpgSrc);
            setIconLoaded(true);
          };
          imgJpg.onerror = () => {
            setIconError(true);
          };
          imgJpg.src = jpgSrc;
        };
        imgPng.src = pngSrc;
      };
      imgSvg.src = svgSrc;
    }
  }, [data.icon]);
  
  const nodeStyle = {
    background: selected ? '#f8f9fa' : 'white',
    border: selected ? '2px solid #6c757d' : '1px solid #ccc',
    borderRadius: '4px',
    padding: '10px',
    width: data.width || 80,
    height: data.height || 40,
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    fontSize: '12px',
    boxShadow: selected ? '0 0 5px rgba(0, 0, 0, 0.3)' : '0 1px 4px rgba(0, 0, 0, 0.1)',
    position: 'relative' as const,
    zIndex: selected ? 100 : 50,
    pointerEvents: 'all' as const
  };

  return (
    <div style={nodeStyle}>
      {/* Left handles */}
      {leftHandles.map((yPos: string, index: number) => (
        <React.Fragment key={`left-${index}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={`left-${index}-target`}
            style={{ 
              ...baseHandleStyle,
              position: 'absolute',
              top: yPos
            }}
          />
          <Handle
            type="source"
            position={Position.Left}
            id={`left-${index}-source`}
            style={{ 
              ...baseHandleStyle,
              position: 'absolute',
              top: yPos,
              opacity: 0 // Make it invisible but functional
            }}
          />
        </React.Fragment>
      ))}
      
      {/* Right handles */}
      {rightHandles.map((yPos: string, index: number) => (
        <React.Fragment key={`right-${index}`}>
          <Handle
            type="source"
            position={Position.Right}
            id={`right-${index}-source`}
            style={{ 
              ...baseHandleStyle,
              top: yPos
            }}
          />
          <Handle
            type="target"
            position={Position.Right}
            id={`right-${index}-target`}
            style={{ 
              ...baseHandleStyle,
              top: yPos,
              opacity: 0 // Make it invisible but functional
            }}
          />
        </React.Fragment>
      ))}
      
      {/* Top handles */}
      {topHandles.map((xPos: string, index: number) => (
        <React.Fragment key={`top-${index}`}>
          <Handle
            type="source"
            position={Position.Top}
            id={`top-${index}-source`}
            style={{ 
              ...baseHandleStyle,
              left: xPos
            }}
          />
          <Handle
            type="target"
            position={Position.Top}
            id={`top-${index}-target`}
            style={{ 
              ...baseHandleStyle,
              left: xPos,
              opacity: 0 // Make it invisible but functional
            }}
          />
        </React.Fragment>
      ))}
      
      {/* Bottom handles */}
      {bottomHandles.map((xPos: string, index: number) => (
        <React.Fragment key={`bottom-${index}`}>
          <Handle
            type="target"
            position={Position.Bottom}
            id={`bottom-${index}-target`}
            style={{ 
              ...baseHandleStyle,
              left: xPos
            }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id={`bottom-${index}-source`}
            style={{ 
              ...baseHandleStyle,
              left: xPos,
              opacity: 0 // Make it invisible but functional
            }}
          />
        </React.Fragment>
      ))}
      
      {/* Node icon and label */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        width: '100%',
        height: '100%',
        position: 'relative'
      }}>
        {/* Icon container */}
        <div style={{
          width: '60px',
          height: '60px',
          borderRadius: data.icon ? '8px' : '50%', 
          backgroundColor: finalIconSrc && !iconError ? 'transparent' : '#f0f0f0',
          border: finalIconSrc && !iconError ? 'none' : '2px solid #ddd',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#333',
          fontWeight: 'bold',
          fontSize: '16px',
          marginTop: '2px',
          overflow: 'hidden'
        }}>
          {/* If we have an icon and no error loading it, show the image */}
          {finalIconSrc && !iconError && (
            <img
              src={finalIconSrc}
              alt={data.label}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'contain'
              }}
              onError={() => {
                console.warn(`Failed to load icon: ${finalIconSrc}`);
                setIconError(true);
              }}
            />
          )}
          
          {/* If we have an error loading the icon or no icon specified, show the first letter */}
          {(!finalIconSrc || iconError) && (
            <span>{data.label.charAt(0).toUpperCase()}</span>
          )}
        </div>
        
        {/* Label at bottom */}
        <div style={{ 
          position: 'absolute',
          bottom: '-8px',
          left: '0',
          right: '0',
          padding: '2px 4px',
          fontSize: '11px',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const
        }}>
          {data.label}
        </div>
      </div>
    </div>
  );
};

export default CustomNode; 