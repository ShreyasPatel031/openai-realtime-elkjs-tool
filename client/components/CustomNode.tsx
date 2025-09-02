import React, { useEffect, useState, useRef } from 'react';
import { Handle, Position } from 'reactflow';
import { baseHandleStyle } from './graph/handles';
import { iconLists } from '../generated/iconLists';
import { iconFallbackService } from '../utils/iconFallbackService';
import { iconCacheService } from '../utils/iconCacheService';
import { useApiEndpoint, buildAssetUrl } from '../contexts/ApiEndpointContext';
import { splitTextIntoLines } from '../utils/textMeasurement';

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
    isEditing?: boolean; // Added isEditing prop
  };
  id: string;
  selected?: boolean;
  onLabelChange: (id: string, label: string) => void;
}

const CustomNode: React.FC<CustomNodeProps> = ({ data, id, selected, onLabelChange }) => {
  const { leftHandles = [], rightHandles = [], topHandles = [], bottomHandles = [] } = data;
  const [isEditing, setIsEditing] = useState(data.isEditing);
  const [label, setLabel] = useState(data.label);
  const [iconLoaded, setIconLoaded] = useState(false);
  const [iconError, setIconError] = useState(false);
  const [finalIconSrc, setFinalIconSrc] = useState<string | undefined>(undefined);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const apiEndpoint = useApiEndpoint();

  // helpers hoisted for reuse
  const findIconCategory = (provider: string, iconName: string): string | null => {
    const providerIcons = iconLists[provider as keyof typeof iconLists];
    if (!providerIcons) return null;
    for (const [category, icons] of Object.entries(providerIcons)) {
      if (icons.includes(iconName)) return category;
    }
    return null;
  };

  const tryLoadIcon = async (iconName: string) => {
    // Check cache first
    const cachedUrl = iconCacheService.getCachedIcon(iconName);
    if (cachedUrl) {
      return cachedUrl;
    }

    console.log(`🔄 Loading icon: ${iconName}`);
    
    const prefixMatch = iconName.match(/^(aws|gcp|azure)_(.+)$/);
    if (prefixMatch) {
      const [, provider, actualIconName] = prefixMatch;
      const category = findIconCategory(provider, actualIconName);
      if (category) {
        const iconPath = `/icons/${provider}/${category}/${actualIconName}.png`;
        const fullIconUrl = buildAssetUrl(iconPath, apiEndpoint);
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
    }
    const actualIconName = iconName.replace(/^(aws|gcp|azure)_/, '');
    const legacyPaths = [
      `/assets/canvas/${actualIconName}.svg`,
      `/assets/canvas/${actualIconName}.png`,
      `/assets/canvas/${actualIconName}.jpeg`
    ];
    for (const legacyPath of legacyPaths) {
      const fullUrl = buildAssetUrl(legacyPath, apiEndpoint);
      const img = new Image();
      try {
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = fullUrl;
        });
        
        // Cache the successfully loaded icon
        iconCacheService.cacheIcon(iconName, fullUrl);
        console.log(`✅ Cached legacy icon: ${iconName}`);
        return fullUrl;
      } catch {}
    }
    throw new Error(`Icon not found: ${iconName}`);
  };

  useEffect(() => {
    // Reset states
    setIconLoaded(false);
    setIconError(false);
    setFallbackAttempted(false);

    if (data.icon) {
      tryLoadIcon(data.icon)
        .then((path) => {
          setFinalIconSrc(path);
          setIconLoaded(true);
          setIconError(false);
          setFallbackAttempted(false);
        })
        .catch(() => {
          setIconError(true);
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
                    } catch {}
                  }
                })
                .catch(() => {});
            }
          }, Math.random() * 3000 + 1000);
        });
    } else {
      setIconError(true);
      
      // Skip icon fallback for root node
      if (id === 'root') {
        return;
      }
      
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
              } catch {}
            }
          })
          .catch(() => {});
      }, Math.random() * 3000 + 1000);
    }
  }, [data.icon, id]);

  // keep local label in sync
  useEffect(() => {
    setLabel(data.label);
  }, [data.label]);

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLabel(e.target.value);
  };

  // On Enter: commit label and fetch icon (existing behavior)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
      onLabelChange(id, label);
      iconFallbackService.findFallbackIcon(`gcp_${label}`)
        .then(async (fallbackIcon) => {
          if (fallbackIcon) {
            try {
              const fallbackPath = await tryLoadIcon(fallbackIcon);
              setFinalIconSrc(fallbackPath);
              setIconLoaded(true);
              setIconError(false);
            } catch {}
          }
        });
    }
  };

  // Debounced icon update while editing
  useEffect(() => {
    if (!isEditing) return;
    if (!label || label.trim() === '') return;
    const t = setTimeout(() => {
      iconFallbackService.findFallbackIcon(`gcp_${label}`)
        .then(async (fallbackIcon) => {
          if (fallbackIcon) {
            try {
              const fallbackPath = await tryLoadIcon(fallbackIcon);
              setFinalIconSrc(fallbackPath);
              setIconLoaded(true);
              setIconError(false);
            } catch {
              // ignore
            }
          }
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [isEditing, label]);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  // Handle click outside to exit editing
  useEffect(() => {
    if (!isEditing) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setIsEditing(false);
        onLabelChange(id, label);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing, id, label, onLabelChange]);

  const nodeStyle = {
    background: selected ? '#f8f9fa' : 'white',
    border: selected ? '2px solid #6c757d' : '1px solid #ccc',
    borderRadius: '4px',
    padding: '0px', // Remove padding to center content properly
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
        {/* Icon container - FIXED: 48x48 square for all icons */}
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: data.icon ? '8px' : '8px', // Square for all icons
          backgroundColor: finalIconSrc && !iconError ? 'transparent' : '#f0f0f0',
          border: finalIconSrc && !iconError ? 'none' : '2px solid #ddd',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#333',
          fontWeight: 'bold',
          fontSize: '16px',
          marginTop: '12px', // Adjust for removed container padding
          overflow: 'hidden'
        }}>
          {finalIconSrc && !iconError && (
            <img
              key={`${id}-${finalIconSrc}`}
              src={finalIconSrc}
              alt={data.label}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'contain'
              }}
              onError={() => setIconError(true)}
            />
          )}
          {(!finalIconSrc || iconError) && (
            <span>{data.label.charAt(0).toUpperCase()}</span>
          )}
        </div>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={handleLabelChange}
            onKeyDown={handleKeyDown}
            autoFocus
            style={{
              width: '100%',
              padding: '4px 8px', // Added horizontal padding for space on left and right
              border: '1px solid #ccc',
              borderRadius: '4px',
              textAlign: 'center',
              fontSize: '12px',
              boxSizing: 'border-box', // Include padding in width calculation
              outline: 'none', // Remove default focus outline
              boxShadow: '0 0 0 2px rgba(0, 123, 255, 0.25)', // Custom focus style
            }}
          />
        ) : (
          <div
            onDoubleClick={handleDoubleClick}
            style={{
              textAlign: 'center',
              cursor: 'pointer',
              fontSize: '12px',
              lineHeight: '14px',
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              fontWeight: 'normal',
              width: '100px', // Match the full node width for better centering
              paddingLeft: '12px', // Add horizontal padding for breathing room
              paddingRight: '12px',
              margin: '0 auto',
              marginTop: '12px', // Direct 12px gap between icon and text
              wordBreak: 'normal',
              overflowWrap: 'normal',
              boxSizing: 'border-box' // Include padding in width calculation
            }}
          >
            {/* Render each line manually to match ELK calculation */}
            {(() => {
              const lines = splitTextIntoLines(label, 76);
              return lines.map((line, index) => (
                <div key={index} style={{ 
                  lineHeight: '14px',
                  width: '100%',
                  textAlign: 'center',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis'
                }}>
                  {line}
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomNode; 