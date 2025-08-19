import React, { useEffect, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { baseHandleStyle } from './graph/handles';
import { iconLists } from '../generated/iconLists';
import { iconFallbackService } from '../utils/iconFallbackService';
import { useApiEndpoint, buildAssetUrl } from '../contexts/ApiEndpointContext';

// Heuristic fallback mapping for common icon patterns
const getHeuristicFallback = (iconName: string): string | null => {
  const prefixMatch = iconName.match(/^(aws|gcp|azure)_(.+)$/);
  if (!prefixMatch) return null;
  
  const [, provider, name] = prefixMatch;
  const lowerName = name.toLowerCase();
  
  // Common fallback mappings based on keywords
  const fallbackMappings: { [key: string]: string[] } = {
    // Compute services
    compute: ['compute_engine', 'ec2', 'virtual_machines'],
    vm: ['compute_engine', 'ec2', 'virtual_machines'],
    instance: ['compute_engine', 'ec2', 'virtual_machines'],
    
    // Storage services
    storage: ['cloud_storage', 's3', 'blob_storage'],
    bucket: ['cloud_storage', 's3', 'blob_storage'],
    disk: ['persistent_disk', 'ebs', 'disk_storage'],
    
    // Database services
    database: ['cloud_sql', 'rds', 'sql_database'],
    sql: ['cloud_sql', 'rds', 'sql_database'],
    db: ['cloud_sql', 'rds', 'sql_database'],
    
    // Networking
    network: ['vpc', 'vpc', 'virtual_networks'],
    vpc: ['vpc', 'vpc', 'virtual_networks'],
    dns: ['cloud_dns', 'route_53', 'dns'],
    
    // Monitoring
    monitoring: ['cloud_monitoring', 'cloudwatch', 'monitor'],
    trace: ['cloud_trace', 'x_ray', 'application_insights'],
    log: ['cloud_logging', 'cloudwatch', 'log_analytics']
  };
  
  // Find matching pattern
  for (const [pattern, fallbacks] of Object.entries(fallbackMappings)) {
    if (lowerName.includes(pattern)) {
      const providerIndex = provider === 'gcp' ? 0 : provider === 'aws' ? 1 : 2;
      const fallback = fallbacks[providerIndex];
      if (fallback) {
        return `${provider}_${fallback}`;
      }
    }
  }
  
  return null;
};

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
  const [fallbackAttempted, setFallbackAttempted] = useState(false);
  const apiEndpoint = useApiEndpoint();
  

  
  useEffect(() => {
    // Reset states
    setIconLoaded(false);
    setIconError(false);
    setFallbackAttempted(false);
    
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
    
    // Function to try loading an icon
    const tryLoadIcon = async (iconName: string) => {
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
              const img = new Image();
              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = fullIconUrl;
              });

              return fullIconUrl;
            } catch (error) {

              // Fall through to legacy paths
            }
          } else {

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
            const img = new Image();
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = fullUrl;
            });
            
            return fullUrl;
          } catch (error) {

            // Continue to next path
          }
        }
        
        throw new Error(`Icon not found: ${iconName}`);
      };
    
    if (data.icon) {
      // Try to load the specified icon
      tryLoadIcon(data.icon)
        .then((path) => {
          // Force re-render by batching state updates
          setFinalIconSrc(path);
          setIconLoaded(true);
          setIconError(false); // Ensure no error state
          setFallbackAttempted(false);
        })
        .catch(() => {
          // Show letter fallback immediately, then try AI search asynchronously
          setIconError(true);
          
          // Delay AI search to avoid flooding the API
          setTimeout(() => {
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
          }, Math.random() * 3000 + 1000); // Random delay 1-4 seconds
        });
    } else {
      // No icon specified - show letter fallback immediately, then try AI search asynchronously
      setIconError(true);
      
      // Delay AI search to avoid flooding the API
      setTimeout(() => {
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
      }, Math.random() * 3000 + 1000); // Random delay 1-4 seconds
    }
  }, [data.icon, id]);
  
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
          {(() => {

            return null;
          })()}
          {finalIconSrc && !iconError && (
            <img
              key={`${id}-${finalIconSrc}`} // Force re-render when finalIconSrc changes
              src={finalIconSrc}
              alt={data.label}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'contain'
              }}
              onLoad={() => {

              }}
              onError={() => {

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