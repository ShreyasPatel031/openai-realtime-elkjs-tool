import React, { useEffect, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { baseHandleStyle } from './graph/handles';
import { getStyle } from './graph/styles';
import { getGroupIconHex, allGroupIcons } from '../generated/groupIconColors';
import { cn } from '../lib/utils';

interface GroupNodeProps {
  data: {
    label: string;
    icon?: string;
    groupIcon?: string;  // Add group icon support
    style?: string | {
      bg?: string;
      border?: string;
    };
    width?: number;
    height?: number;
    leftHandles?: string[];
    rightHandles?: string[];
    topHandles?: string[];
    bottomHandles?: string[];
  };
  id: string;
  selected?: boolean;
  isConnectable: boolean;
}

const GroupNode: React.FC<GroupNodeProps> = ({ data, id, selected, isConnectable }) => {
  const [iconLoaded, setIconLoaded] = useState(false);
  const [iconError, setIconError] = useState(false);
  const [finalIconSrc, setFinalIconSrc] = useState<string | undefined>(undefined);
  
  // Use the icon from the data if it exists
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

  // Get group icon colors if specified
  const groupIconHex = data.groupIcon ? getGroupIconHex(data.groupIcon) : null;
  
  // Get custom styling using the shared getStyle helper, but override with group icon colors
  const resolvedStyle = getStyle(data.style);
  
  // Default colors for better visibility
  const defaultColors = {
    gcp: '#4285f4',     // Google Blue
    aws: '#ff9900',     // AWS Orange  
    azure: '#0078d4',   // Azure Blue
    neutral: '#6c757d'  // Gray
  };
  
  // Determine cloud provider based on group icon or node id
  const getCloudProvider = () => {
    if (data.groupIcon?.startsWith('gcp_')) return 'gcp';
    if (data.groupIcon?.startsWith('aws_')) return 'aws';
    if (data.groupIcon?.startsWith('azure_')) return 'azure';
    if (id.includes('gcp') || id.includes('google')) return 'gcp';
    if (id.includes('aws') || id.includes('amazon')) return 'aws';
    if (id.includes('azure') || id.includes('microsoft')) return 'azure';
    return 'neutral';
  };
  
  const cloudProvider = getCloudProvider();
  const fallbackColor = defaultColors[cloudProvider];
  
  // If we have a group icon, use its color as the background
  let customBgColor = resolvedStyle.bg || 'rgba(240, 240, 240, 0.6)';
  let customBorderColor = resolvedStyle.border || (selected ? '#6c757d' : fallbackColor);
  
  if (groupIconHex && data.groupIcon) {
    // Find the group icon data to check if it's filled
    const groupIconData = allGroupIcons.find(icon => icon.name === data.groupIcon);
    
    if (groupIconData && groupIconData.fill) {
      // For filled group icons, use the hex color as background with transparency
      customBgColor = `${groupIconHex}80`; // 50% opacity
      customBorderColor = groupIconHex;
    } else {
      // For border-only group icons, use the hex color as border only
      customBgColor = 'rgba(255, 255, 255, 0.1)'; // Very light background
      customBorderColor = groupIconHex;
    }
  }
  
  // Create a more saturated background color for the header based on the group's background
  const headerBgColor = customBgColor.replace(/rgba?\(([^)]+)\)/, (match, values) => {
    // Parse the values from the rgba/rgb string
    const parts = values.split(',').map((v: string) => parseFloat(v.trim()));
    
    // For RGB format
    if (parts.length === 3) {
      // Make slightly more opaque for header
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, 0.9)`;
    }
    
    // For RGBA format, just increase opacity
    if (parts.length === 4) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${Math.min(parts[3] + 0.3, 1)})`;
    }
    
    // If we can't parse, return the original
    return match;
  });
  
  // For hex colors, create a header color
  const headerBgColorFinal = customBgColor.startsWith('#') 
    ? `${customBgColor}E6` // Add 90% opacity to hex color
    : headerBgColor;

  // Style for the outer container that ReactFlow adds
  const groupStyle = {
    // Use custom styling if available
    background: customBgColor,
    border: data.groupIcon 
      ? (selected ? `3px solid ${customBorderColor}` : `2px solid ${customBorderColor}`) 
      : (selected ? `2px dashed ${customBorderColor}` : `1px dashed ${customBorderColor}`),
    borderRadius: '8px',
    // Add padding for root node, minimal for others
    padding: id === 'root' ? '20px' : '0px',
    width: '100%',
    height: '100%',
    fontSize: '12px',
    position: 'relative' as const,
    color: '#333',
    pointerEvents: 'all' as const,
    zIndex: 1,
    boxSizing: 'border-box' as const,
    // Override any internal borders that ReactFlow might add
    overflow: 'visible',
    // Add grey border specifically for GCP groups
    ...(cloudProvider === 'gcp' && {
      border: selected ? '3px solid #adb5bd' : '2px solid #adb5bd'
    })
  };

  return (
    <div style={groupStyle}>
      {/* Left handles */}
      {data.leftHandles && data.leftHandles.map((yPos: string, index: number) => (
        <React.Fragment key={`left-${index}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={`left-${index}-target`}
            style={{ 
              ...baseHandleStyle,
              top: yPos
            }}
          />
          <Handle
            type="source"
            position={Position.Left}
            id={`left-${index}-source`}
            style={{ 
              ...baseHandleStyle,
              top: yPos,
              opacity: 0 // Make it invisible but functional
            }}
          />
        </React.Fragment>
      ))}
      
      {/* Right handles */}
      {data.rightHandles && data.rightHandles.map((yPos: string, index: number) => (
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
            }}
          />
        </React.Fragment>
      ))}
      
      {/* Top handles */}
      {data.topHandles && data.topHandles.map((xPos: string, index: number) => (
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
            }}
          />
        </React.Fragment>
      ))}
      
      {/* Bottom handles */}
      {data.bottomHandles && data.bottomHandles.map((xPos: string, index: number) => (
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
            }}
          />
        </React.Fragment>
      ))}
      
      {/* Node label with icon */}
      <div style={{ 
        position: 'absolute', 
        top: '5px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize: '14px',
        color: '#333',
        backgroundColor: headerBgColorFinal,
        padding: '2px 8px',
        borderRadius: '4px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        border: data.groupIcon ? `2px solid ${customBorderColor}` : `1px solid ${customBorderColor}`,
        zIndex: 10,
        whiteSpace: 'nowrap',
        minWidth: 'min-content',
        maxWidth: 'calc(100% - 20px)'
      }}>
        {/* Display icon if available */}
        {finalIconSrc && !iconError && (
          <img
            src={finalIconSrc}
            alt={data.label}
            style={{ 
              width: '20px', 
              height: '20px', 
              marginRight: '6px',
              objectFit: 'contain'
            }}
            onError={() => {
              console.warn(`Failed to load group icon: ${finalIconSrc}`);
              setIconError(true);
            }}
          />
        )}
        <span style={{ 
          overflow: 'hidden', 
          textOverflow: 'ellipsis',
          maxWidth: '100%'
        }}>
          {data.label}
        </span>
      </div>
    </div>
  );
};

export default GroupNode; 