import React, { createContext, useContext, useMemo, useState } from 'react';

// Simplified view mode - just use path-based routing, no complex environment logic
export type ViewMode = 'embed' | 'canvas' | 'auth' | 'libavoid-test' | 'libavoid-canvas';

export interface LibavoidOptions {
  shapeBufferDistance: number; // edge-to-node spacing
  portEdgeSpacing: number; // spacing between edges at the same port (in pixels)
  routingType: 'orthogonal' | 'polyline';
  hateCrossings: boolean;
  nudgeOrthSegments: boolean;
  nudgeSharedPaths: boolean;
  nudgeTouchingColinear: boolean; // nudge collinear segments that touch
  segmentPenalty: number;
  bendPenalty: number;
  crossingPenalty: number;
  sharedPathPenalty: number; // closest to edge-to-edge spacing
  // idealNudgingDistance: The PRIMARY parameter for uniform spacing between parallel edges
  // Controls the spacing when libavoid nudges overlapping parallel segments apart
  // This ensures uniform spacing throughout the diagram (default: 56px to match port spacing)
  idealNudgingDistance?: number;
}

export interface ViewModeConfig {
  mode: ViewMode;
  isEmbedded: boolean;
  
  // Authentication & User Features
  requiresAuth: boolean;
  showSaveButton: boolean;
  showEditButton: boolean;
  showProfileSection: boolean;
  showSidebar: boolean;
  
  // Content & Collaboration Features
  allowSharing: boolean;
  allowExporting: boolean;
  allowArchitectureManagement: boolean;
  
  // UI Features
  showDevPanel: boolean;
  showSettings: boolean;
  showChatPanel: boolean;
  showAgentIcon: boolean;
  showChatbox: boolean;

  // Canvas initialization behavior
  autoLoadLibavoidFixtures: boolean;
  // Debug/tuning panels
  showLibavoidTuningPanel: boolean;
  // Default libavoid tuning values per mode (can be overridden at runtime)
  libavoidDefaults: LibavoidOptions;
}

const VIEW_MODE_CONFIGS: Record<ViewMode, Omit<ViewModeConfig, 'mode' | 'isEmbedded'>> = {
  embed: {
    requiresAuth: false,
    showSaveButton: false,
    showEditButton: true,
    showProfileSection: false,
    showSidebar: true,
    allowSharing: true,
    allowExporting: true,
    allowArchitectureManagement: false,
    showDevPanel: false,
    showSettings: false,
    showChatPanel: false,
    showAgentIcon: false,
    showChatbox: true, // Only chatbox in embed
    autoLoadLibavoidFixtures: false,
    showLibavoidTuningPanel: false,
    libavoidDefaults: {
      shapeBufferDistance: 16,
      portEdgeSpacing: 8, // spacing between edges at same port
      routingType: 'polyline',
      hateCrossings: true,
      nudgeOrthSegments: true, // Enabled: may help space vertical segments consistently
      nudgeSharedPaths: false, // Disabled: might be causing shared intermediate segments
      nudgeTouchingColinear: false, // Disabled: interferes with orthogonal routing
      segmentPenalty: 1, // Reduced to allow longer paths that avoid sharing segments
      bendPenalty: 20,
      crossingPenalty: 100,
      sharedPathPenalty: 10000, // Extreme penalty to completely prevent shared paths
    },
  },
  canvas: {
    requiresAuth: false,
    showSaveButton: true,
    showEditButton: false,
    showProfileSection: true,
    showSidebar: true,
    allowSharing: true,
    allowExporting: true,
    allowArchitectureManagement: false,
    showDevPanel: false,
    showSettings: false,
    showChatPanel: true, // Full chat panel
    showAgentIcon: true,
    showChatbox: false,
    autoLoadLibavoidFixtures: true,
    showLibavoidTuningPanel: true,
    libavoidDefaults: {
      shapeBufferDistance: 16, // Balanced buffer: enough spacing but allows routing through gaps
      portEdgeSpacing: 16, // Port spacing for multiple edges from same port (reverted)
      routingType: 'orthogonal', // Force orthogonal routing
      hateCrossings: true,
      nudgeOrthSegments: false, // Disabled: was causing sliding behavior
      nudgeSharedPaths: true, // Enabled: proactively separates shared paths
      nudgeTouchingColinear: false, // Disabled: interferes with orthogonal routing
      segmentPenalty: 3, // Balanced penalty
      bendPenalty: 10, // Lower bend penalty to allow more turns
      crossingPenalty: 100,
      sharedPathPenalty: 100000, // Extreme penalty to prevent shared segments
      idealNudgingDistance: 16, // Config 1: Match port spacing for uniform edge spacing
    },
  },
  auth: {
    requiresAuth: true,
    showSaveButton: true,
    showEditButton: false,
    showProfileSection: true,
    showSidebar: true,
    allowSharing: true,
    allowExporting: true,
    allowArchitectureManagement: true,
    showDevPanel: true,
    showSettings: true,
    showChatPanel: true, // Full chat panel
    showAgentIcon: true,
    showChatbox: false,
    autoLoadLibavoidFixtures: false,
    showLibavoidTuningPanel: true,
    libavoidDefaults: {
      shapeBufferDistance: 16,
      portEdgeSpacing: 8, // spacing between edges at same port
      routingType: 'polyline',
      hateCrossings: true,
      nudgeOrthSegments: true, // Enabled: may help space vertical segments consistently
      nudgeSharedPaths: false, // Disabled: might be causing shared intermediate segments
      nudgeTouchingColinear: false, // Disabled: interferes with orthogonal routing
      segmentPenalty: 1, // Reduced to allow longer paths that avoid sharing segments
      bendPenalty: 20,
      crossingPenalty: 100,
      sharedPathPenalty: 10000, // Extreme penalty to completely prevent shared paths
    },
  },
  'libavoid-test': {
    requiresAuth: false,
    showSaveButton: false,
    showEditButton: false,
    showProfileSection: false,
    showSidebar: false,
    allowSharing: false,
    allowExporting: false,
    allowArchitectureManagement: false,
    showDevPanel: false,
    showSettings: false,
    showChatPanel: false,
    showAgentIcon: false,
    showChatbox: false,
    autoLoadLibavoidFixtures: false,
    showLibavoidTuningPanel: true,
    libavoidDefaults: {
      shapeBufferDistance: 16,
      portEdgeSpacing: 8, // spacing between edges at same port
      routingType: 'polyline',
      hateCrossings: true,
      nudgeOrthSegments: true, // Enabled: may help space vertical segments consistently
      nudgeSharedPaths: false, // Disabled: might be causing shared intermediate segments
      nudgeTouchingColinear: false, // Disabled: interferes with orthogonal routing
      segmentPenalty: 1, // Reduced to allow longer paths that avoid sharing segments
      bendPenalty: 20,
      crossingPenalty: 100,
      sharedPathPenalty: 10000, // Extreme penalty to completely prevent shared paths
    },
  },
  'libavoid-canvas': {
    requiresAuth: false,
    showSaveButton: false,
    showEditButton: false,
    showProfileSection: false,
    showSidebar: false,
    allowSharing: false,
    allowExporting: false,
    allowArchitectureManagement: false,
    showDevPanel: false,
    showSettings: false,
    showChatPanel: false,
    showAgentIcon: false,
    showChatbox: false,
    autoLoadLibavoidFixtures: true,
    showLibavoidTuningPanel: true,
    libavoidDefaults: {
      shapeBufferDistance: 16,
      portEdgeSpacing: 8, // spacing between edges at same port
      routingType: 'polyline',
      hateCrossings: true,
      nudgeOrthSegments: true, // Enabled: may help space vertical segments consistently
      nudgeSharedPaths: false, // Disabled: might be causing shared intermediate segments
      nudgeTouchingColinear: false, // Disabled: interferes with orthogonal routing
      segmentPenalty: 1, // Reduced to allow longer paths that avoid sharing segments
      bendPenalty: 20,
      crossingPenalty: 100,
      sharedPathPenalty: 10000, // Extreme penalty to completely prevent shared paths
    },
  },
};

interface ViewModeContextValue {
  config: ViewModeConfig;
  mode: ViewMode;
  isEmbedded: boolean;
  libavoidOptions: LibavoidOptions;
  setLibavoidOptions: (next: LibavoidOptions) => void;
}

const ViewModeContext = createContext<ViewModeContextValue | null>(null);

export function useViewMode(): ViewModeContextValue {
  const context = useContext(ViewModeContext);
  if (!context) {
    throw new Error('useViewMode must be used within a ViewModeProvider');
  }
  return context;
}

// --- Convenience helpers (keep all feature decisions centralized) --- //
type BooleanKeys<T> = { [K in keyof T]-?: T[K] extends boolean ? K : never }[keyof T];
export type FeatureKey = BooleanKeys<ViewModeConfig>;

export function useFeature(flag: FeatureKey): boolean {
  const { config } = useViewMode();
  return Boolean(config[flag]);
}

// Optional: tiny component gate to avoid inline ternaries everywhere
export function FeatureGate(
  { flag, children, fallback = null }:
  { flag: FeatureKey; children: React.ReactNode; fallback?: React.ReactNode }
) {
  return useFeature(flag) ? <>{children}</> : <>{fallback}</>;
}

interface ViewModeProviderProps {
  children: React.ReactNode;
  fallbackMode?: ViewMode;
}

export function ViewModeProvider({ children, fallbackMode = 'canvas' }: ViewModeProviderProps) {
  const config = useMemo(() => {
    // Simple path-based routing - no environment complexity
    const getViewMode = (): { mode: ViewMode; isEmbedded: boolean } => {
      if (typeof window === 'undefined') {
        return { mode: fallbackMode, isEmbedded: false };
      }
      
      // Optional: localStorage override for QA (centralized here)
      const override = localStorage.getItem('viewModeOverride') as ViewMode | null;
      if (override && ['embed', 'canvas', 'auth', 'libavoid-test', 'libavoid-canvas'].includes(override)) {
        return { mode: override, isEmbedded: false };
      }
      
      const path = window.location.pathname;
      
      // Simple path-based mode detection
      if (path === '/embed') {
        const isEmbedded = window.parent !== window;
        return { mode: 'embed', isEmbedded };
      } else if (path === '/canvas') {
        return { mode: 'canvas', isEmbedded: false };
      } else if (path === '/auth') {
        return { mode: 'auth', isEmbedded: false };
      } else if (path === '/test-libavoid-static') {
        return { mode: 'libavoid-test', isEmbedded: false };
      } else if (path === '/test-libavoid-canvas') {
        return { mode: 'libavoid-canvas', isEmbedded: false };
      }
      
      // Default: root path (/) - determine mode based on auth state
      // Check if user is authenticated (Firebase auth)
      try {
        const { auth } = require('../lib/firebase');
        if (auth && auth.currentUser) {
          // User is authenticated - use auth mode
          return { mode: 'auth', isEmbedded: false };
        }
      } catch (error) {
        // Firebase not available or error - fall back to canvas
      }
      
      // Not authenticated - use canvas for root path
      return { mode: 'canvas', isEmbedded: false };
    };
    
    const { mode, isEmbedded } = getViewMode();
    console.log('[ViewModeProvider] detected mode:', mode, 'path:', typeof window !== 'undefined' ? window.location.pathname : 'SSR');
    const baseConfig = VIEW_MODE_CONFIGS[mode];
    
    const fullConfig: ViewModeConfig = {
      mode,
      isEmbedded,
      ...baseConfig
    };
    
    return fullConfig;
  }, [fallbackMode]);
  
  const [libavoidOptions, setLibavoidOptionsState] = useState<LibavoidOptions>(config.libavoidDefaults);
  
  const setLibavoidOptions = React.useCallback((next: LibavoidOptions) => {
    console.log('[ViewModeContext] 🔄 setLibavoidOptions called', { portEdgeSpacing: next.portEdgeSpacing });
    setLibavoidOptionsState(next);
  }, []); // No dependencies needed - setLibavoidOptionsState is stable
  
  const contextValue: ViewModeContextValue = useMemo(() => {
    // Apply optional experiment overrides from URL (?experiment=1..10)
    let effectiveOptions = libavoidOptions;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const experiment = params.get('experiment');
      if (experiment) {
        const exp = parseInt(experiment, 10);
        if (!Number.isNaN(exp)) {
          // Clone to avoid mutating state
          const o = { ...libavoidOptions };
          switch (exp) {
            case 1:
              // Increase connector spacing and enable shared path nudging
              o.routingType = 'orthogonal';
              o.idealNudgingDistance = 24;
              o.portEdgeSpacing = Math.max(o.portEdgeSpacing, 12);
              o.nudgeSharedPaths = true;
              break;
            case 2:
              // Disable orthogonal nudge variants that caused sliding; rely on preprocessing
              o.routingType = 'orthogonal';
              o.nudgeOrthSegments = false;
              o.nudgeTouchingColinear = false;
              o.idealNudgingDistance = 24;
              break;
            case 3:
              // Extreme penalty for shared paths + higher spacing
              o.routingType = 'orthogonal';
              o.sharedPathPenalty = 100000;
              o.idealNudgingDistance = 24;
              break;
            case 4:
              // Larger shape buffer to push edges apart
              o.routingType = 'orthogonal';
              o.shapeBufferDistance = Math.max(o.shapeBufferDistance, 24);
              o.idealNudgingDistance = 24;
              break;
            case 5:
              // Encourage fewer shared trunks by preferring bends slightly more
              o.routingType = 'orthogonal';
              o.segmentPenalty = 5;
              o.bendPenalty = 10;
              o.idealNudgingDistance = 20;
              break;
            case 6:
              // Prefer shared-path avoidance and allow crossings if it separates segments
              o.routingType = 'orthogonal';
              o.hateCrossings = true;
              o.sharedPathPenalty = 200000;
              o.idealNudgingDistance = 20;
              break;
            case 7:
              // Reduce segment penalty back to low but keep spacing high
              o.routingType = 'orthogonal';
              o.segmentPenalty = 1;
              o.idealNudgingDistance = 28;
              break;
            case 8:
              // Increase port edge spacing to desynchronize initial segment alignment
              o.routingType = 'orthogonal';
              o.portEdgeSpacing = Math.max(o.portEdgeSpacing, 16);
              o.idealNudgingDistance = 24;
              break;
            case 9:
              // Try enabling shared-path nudging to see if it proactively separates paths
              o.routingType = 'orthogonal';
              o.nudgeSharedPaths = true;
              o.idealNudgingDistance = 24;
              break;
            case 10:
              // Combine: big buffer + big connector spacing + disable problematic nudges
              o.routingType = 'orthogonal';
              o.shapeBufferDistance = Math.max(o.shapeBufferDistance, 24);
              o.idealNudgingDistance = 28;
              o.nudgeOrthSegments = false;
              o.nudgeTouchingColinear = false;
              o.nudgeSharedPaths = true;
              o.sharedPathPenalty = 100000;
              o.segmentPenalty = 3;
              o.bendPenalty = 10;
              break;
            default:
              break;
          }
          effectiveOptions = o;
        }
      }
    }
    return {
      config,
      mode: config.mode,
      isEmbedded: config.isEmbedded,
      libavoidOptions: effectiveOptions,
      setLibavoidOptions
    };
  }, [config, libavoidOptions, setLibavoidOptions]);
  
  return (
    <ViewModeContext.Provider value={contextValue}>
      {children}
    </ViewModeContext.Provider>
  );
}
