import React, { useEffect, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { baseHandleStyle } from './graph/handles';
import { getStyle } from './graph/styles';
import { CANVAS_STYLES } from './graph/styles/canvasStyles';
import { getGroupIconHex, allGroupIcons } from '../generated/groupIconColors';
import { cn } from '../lib/utils';
import { iconLists } from '../generated/iconLists';
import { iconFallbackService } from '../utils/iconFallbackService';
import { iconCacheService } from '../utils/iconCacheService';
import { useApiEndpoint, buildAssetUrl } from '../contexts/ApiEndpointContext';

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
  onAddNode: (groupId: string) => void;
}

const GroupNode: React.FC<GroupNodeProps> = ({ data, id, selected, isConnectable, onAddNode }) => {
  const [iconLoaded, setIconLoaded] = useState(false);
  const [iconError, setIconError] = useState(false);
  const [finalIconSrc, setFinalIconSrc] = useState<string | undefined>(undefined);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);
    const apiEndpoint = useApiEndpoint();

  // Function to find which category an icon belongs to
  const findIconCategory = (provider: string, iconName: string): string | null => {
    const providerIcons = iconLists[provider as keyof typeof iconLists];
    if (!providerIcons) return null;
    
    for (const [category, icons] of Object.entries(providerIcons)) {
      if (icons.includes(iconName)) {
        return category;
      }
    }
    return null;
  };

  // Function to try loading an icon (same as CustomNode)
  const tryLoadIcon = async (iconName: string) => {
    // Check cache first
    const cachedUrl = iconCacheService.getCachedIcon(iconName);
    if (cachedUrl) {
      return cachedUrl;
    }

    console.log(`🔄 Loading icon: ${iconName}`);
    
    // Check if icon has provider prefix (e.g., 'gcp_cloud_monitoring')
    const prefixMatch = iconName.match(/^(aws|gcp|azure)_(.+)$/);

    if (prefixMatch) {
      const [, provider, actualIconName] = prefixMatch;
      // Find the correct category for this icon
      const category = findIconCategory(provider, actualIconName);

      if (category) {
        const iconPath = `/icons/${provider}/${category}/${actualIconName}.png`;
        const fullIconUrl = buildAssetUrl(iconPath, apiEndpoint);

        try {
          // First check if the URL returns actual image content
          const response = await fetch(fullIconUrl);
          const contentType = response.headers.get('content-type') || '';
          
          // If we get HTML instead of an image, it means the icon doesn't exist
          if (contentType.includes('text/html')) {
            throw new Error(`Icon returned HTML instead of image: ${iconName}`);
          }
          
          // If content type looks like an image, try to load it
          if (contentType.includes('image/') || response.ok) {
            const img = new Image();
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = fullIconUrl;
            });

            // Cache the successfully loaded icon
            iconCacheService.cacheIcon(iconName, fullIconUrl);
            console.log(`✅ Cached icon: ${iconName}`);
            return fullIconUrl;
          }
        } catch (error) {
          console.log(`❌ Icon not found in database: ${iconName} (${error instanceof Error ? error.message : 'Unknown error'})`);
          // Fall through to legacy paths
        }
      } else {
        console.log(`❌ Icon not in database: ${iconName} (${provider})`);
      }
    }
    
    // Get the actual icon name (remove provider prefix if present)
    const actualIconName = prefixMatch ? prefixMatch[2] : iconName;
    
    // Try legacy paths for backward compatibility
    const legacyPaths = [
      `/assets/canvas/${actualIconName}.svg`,
      `/assets/canvas/${actualIconName}.png`,
      `/assets/canvas/${actualIconName}.jpeg`
    ];
    
    for (const legacyPath of legacyPaths) {
      const fullUrl = buildAssetUrl(legacyPath, apiEndpoint);
      
      try {
        // Check content type for legacy paths too
        const response = await fetch(fullUrl);
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('text/html')) {
          continue; // Skip HTML responses
        }
        
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = fullUrl;
        });
        
        // Cache the successfully loaded icon
        iconCacheService.cacheIcon(iconName, fullUrl);
        console.log(`✅ Cached legacy icon: ${iconName}`);
        return fullUrl;
      } catch (error) {
        // Continue to next path
      }
    }
    
    throw new Error(`Icon not found: ${iconName}`);
  };
  
  useEffect(() => {
    // Reset states
    setIconLoaded(false);
    setIconError(false);
    setFallbackAttempted(false);

    if (data.icon) {
      // Try to load the specified icon
      tryLoadIcon(data.icon)
        .then((path) => {
          setFinalIconSrc(path);
          setIconLoaded(true);
          setIconError(false);
          setFallbackAttempted(false);
        })
        .catch(() => {
          setIconError(true);
          
          // Immediate fallback attempt (removed delay)
          if (!fallbackAttempted) {
            setFallbackAttempted(true);
            
            iconFallbackService.findFallbackIcon(data.icon)
              .then(async (fallbackIcon) => {
                if (fallbackIcon) {
                  try {
                    const fallbackPath = await tryLoadIcon(fallbackIcon);
                    setFinalIconSrc(fallbackPath);
                    setIconLoaded(true);
                    setIconError(false);
                    return;
                  } catch (fallbackLoadError) {
                    // Keep letter fallback
                  }
                }
              })
              .catch((searchError) => {
                // Keep letter fallback on error
              });
          }
        });
    } else {
      // No icon specified - show letter fallback immediately, then try AI search asynchronously
      setIconError(true);
      
      // Skip icon fallback for root node
      if (id === 'root') {
        return;
      }
      
      // Immediate fallback attempt (removed delay)  
      if (!fallbackAttempted) {
        setFallbackAttempted(true);
        iconFallbackService.findFallbackIcon(`gcp_${id}`)
          .then(async (fallbackIcon) => {
            if (fallbackIcon) {
              try {
                const fallbackPath = await tryLoadIcon(fallbackIcon);
                setFinalIconSrc(fallbackPath);
                setIconLoaded(true);
                setIconError(false);
                return;
              } catch (fallbackLoadError) {
                // Keep letter fallback
              }
            }
          })
          .catch((searchError) => {
            // Keep letter fallback on error
          });
      }
    }
  }, [data.icon, id]);

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
  let customBgColor = resolvedStyle.bg || CANVAS_STYLES.nodes.group.background;
  let customBorderColor = resolvedStyle.border || CANVAS_STYLES.nodes.group.border;
  
  if (groupIconHex && data.groupIcon) {
    // Find the group icon data to check if it's filled
    const groupIconData = allGroupIcons.find(icon => icon.name === data.groupIcon);
    
    if (groupIconData && groupIconData.fill) {
      // Do not override background; only set border color
      customBorderColor = groupIconHex;
    } else {
      // For border-only group icons, only set the border color
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
    backgroundColor: customBgColor,
    border: data.groupIcon 
      ? (selected ? `3px solid ${customBorderColor}` : `2px solid ${customBorderColor}`) 
      : (selected ? `2px dashed ${customBorderColor}` : `1px dashed ${customBorderColor}`),
    borderRadius: '8px',
    // Add padding for root node, minimal for others
    padding: id === 'root' ? '20px' : '8px',
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
      border: selected ? `3px solid ${CANVAS_STYLES.nodes.group.border}` : `2px solid ${CANVAS_STYLES.nodes.group.border}`
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
      
      {/* Node label with icon - do not render for the root node */}
      {id !== 'root' && (
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
      )}

      {/* Plus button to add a node */}
      {selected && (
        <button
          style={{
            position: 'absolute',
            top: '-12px',
            right: '-12px',
            width: '24px',
            height: '24px',
            background: '#333',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10
          }}
          title="Add Node"
          onClick={() => onAddNode(id)}
        >
          +
        </button>
      )}
    </div>
  );
};

export default GroupNode;