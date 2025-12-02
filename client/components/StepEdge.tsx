import React, { useEffect, useMemo, useState, useRef } from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, Position, useStore } from 'reactflow';
import { getEdgeStyle, CANVAS_STYLES } from './graph/styles/canvasStyles';
import { testEdgeCollision } from '../utils/edgeCollisionTest';
import { AvoidLib } from 'libavoid-js';
import { useViewMode } from '../contexts/ViewModeContext';
import { getBatchRoutingCoordinator } from '../lib/BatchRoutingCoordinator';

const DEFAULT_NODE_WIDTH = 96;
const DEFAULT_NODE_HEIGHT = 96;
const DEFAULT_OBSTACLE_MARGIN = 8; // Reduced from 20 - smaller spacing makes routing work better

const safeNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

type Point = { x: number; y: number };
type NodeRect = { id: string; x: number; y: number; width: number; height: number };
type RoutingStatus = 'ok' | 'degraded' | 'error';

declare global {
  interface Window {
    libavoid?: any;
    Avoid?: any;
    __edgeDebug?: {
      [key: string]: {
        snappedPoints: Point[];
        rawPolyline?: Point[];
        fallbackApplied: boolean;
        status?: RoutingStatus;
        message?: string;
        sourcePosition: Position | undefined;
        targetPosition: Position | undefined;
      };
    };
  }
}

const isClient = typeof window !== 'undefined';
let avoidInstancePromise: Promise<any> | null = null;

const ensureAvoidInstance = async () => {
  if (!isClient) {
    throw new Error('libavoid is only available in the browser environment');
  }

  if (!avoidInstancePromise) {
    avoidInstancePromise = (async () => {
      const globalInstance = window.libavoid ?? window.Avoid;
      if (globalInstance) {
        return globalInstance;
      }

      await AvoidLib.load('/libavoid.wasm');

      return AvoidLib.getInstance();
    })()
      .catch((error) => {
        avoidInstancePromise = null;
        throw error;
      });
  }

  return avoidInstancePromise;
};

const pointsToPath = (points: Point[]): string =>
  points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');

const arePointArraysEqual = (a: Point[], b: Point[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs(a[i].x - b[i].x) > 0.01 || Math.abs(a[i].y - b[i].y) > 0.01) {
      return false;
    }
  }
  return true;
};

const resolvePositionValue = (position: Position | undefined, fallback: Position): Position =>
  position ?? fallback;

const deriveDirectionBetween = (from: Point, to: Point): Position => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? Position.Right : Position.Left;
  }
  return dy >= 0 ? Position.Bottom : Position.Top;
};

const StepEdge: React.FC<EdgeProps> = (props) => {
  const { 
  id, 
  source,
  target,
  sourceX, 
  sourceY, 
  targetX, 
  targetY, 
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
  style = {},
  } = props;
  const edgeData = data as any;
  
  // Debug logging for edge-vertical
  if (id === 'edge-vertical') {
    console.log(`[StepEdge:${id}] 🔍 MOUNTED`, {
      source, target,
      hasStaticObstacleIds: !!edgeData?.staticObstacleIds,
      obstacleCount: edgeData?.staticObstacleIds?.length,
      hasRerouteKey: !!edgeData?.rerouteKey,
      hasStaticObstacles: !!edgeData?.staticObstacles,
      staticObstaclesCount: edgeData?.staticObstacles?.length
    });
  }
  
  const [computedBendPoints, setComputedBendPoints] = useState<Point[]>([]);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [edgePath, setEdgePath] = useState<string>(() =>
    pointsToPath([{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }])
  );
  const [routingStatus, setRoutingStatus] = useState<RoutingStatus>('ok');
  const [routingMessage, setRoutingMessage] = useState<string>('');
  
  // State for batch routing - stores pathPoints from coordinator
  const [coordinatorPathPoints, setCoordinatorPathPoints] = useState<Point[] | null>(null);
  const coordinatorCallbackRef = useRef<((route: Point[]) => void) | null>(null);

  // Get libavoid options from context (for FREE mode parameter tuning)
  const { config, libavoidOptions: contextLibavoidOptions } = useViewMode();
  const libavoidOptions = contextLibavoidOptions || config.libavoidDefaults || {};
  
  // Extract portEdgeSpacing to track it separately for reactivity
  const portEdgeSpacing = libavoidOptions?.portEdgeSpacing ?? config.libavoidDefaults?.portEdgeSpacing ?? 8;
  
  // Track options changes to force rerouting
  const [optionsVersion, setOptionsVersion] = useState(0);
  const prevOptionsRef = React.useRef<string>('');
  const prevPortEdgeSpacingRef = React.useRef<number>(portEdgeSpacing);
  
  React.useEffect(() => {
    const currentOptionsStr = JSON.stringify(libavoidOptions);
    const optionsChanged = prevOptionsRef.current !== currentOptionsStr;
    const spacingChanged = prevPortEdgeSpacingRef.current !== portEdgeSpacing;
    
    if (optionsChanged || spacingChanged) {
      prevOptionsRef.current = currentOptionsStr;
      prevPortEdgeSpacingRef.current = portEdgeSpacing;
      // Clear edge path to force re-render while routing
      setEdgePath(pointsToPath([{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }]));
      setOptionsVersion(v => {
        const newVersion = v + 1;
        console.log(`[StepEdge:${id}] 🔄 Options changed (options=${optionsChanged}, spacing=${spacingChanged}), incrementing optionsVersion to ${newVersion}, portEdgeSpacing=${portEdgeSpacing}`);
        return newVersion;
      });
    }
  }, [libavoidOptions, portEdgeSpacing, id, sourceX, sourceY, targetX, targetY]);

  const allNodes = useStore((state) => state?.nodes ?? []);
  const allEdges = useStore((state) => state?.edges ?? []);
  const nodeCount = allNodes.length;
  const edgeCount = allEdges.length;
  
  // Step 3: Update expected edge count when allEdges changes
  useEffect(() => {
    const coordinator = getBatchRoutingCoordinator();
    coordinator.setExpectedEdgeCount(allEdges.length);
  }, [allEdges.length]);

  const condensedNodes = useMemo<NodeRect[]>(
    () =>
      allNodes.map((node) => {
        const width = safeNumber((node as any).width ?? node.data?.width, DEFAULT_NODE_WIDTH);
        const height = safeNumber((node as any).height ?? node.data?.height, DEFAULT_NODE_HEIGHT);
        const position = (node as any).positionAbsolute ?? node.position;
        return {
          id: node.id,
          x: safeNumber(position?.x, 0),
          y: safeNumber(position?.y, 0),
          width,
          height,
        };
      }),
    [allNodes]
  );

  const resolvedObstacleRects = useMemo<NodeRect[]>(() => {
    const staticObstacleIds: string[] = Array.isArray(edgeData?.staticObstacleIds)
      ? edgeData.staticObstacleIds
      : [];
    const staticObstacles = Array.isArray(edgeData?.staticObstacles)
      ? edgeData.staticObstacles
      : [];

    // Debug for edge-vertical
    if (id === 'edge-vertical') {
      console.log(`[StepEdge:${id}] 🔍 Resolving obstacles`, {
        staticObstacleIdsCount: staticObstacleIds.length,
        staticObstaclesCount: staticObstacles.length,
        condensedNodesCount: condensedNodes.length
      });
    }

    let result: NodeRect[];
    
    if (staticObstacleIds.length > 0) {
      result = staticObstacleIds.map((obstacleId, index) => {
        const liveNode = condensedNodes.find((node) => node.id === obstacleId);
        const initialRect = staticObstacles.find((rect: any) => rect?.id === obstacleId);
        
        // Use live position if available, otherwise fall back to initial position from staticObstacles
        const x = liveNode && liveNode.x !== undefined
          ? liveNode.x
          : safeNumber(initialRect?.x, 0);
        const y = liveNode && liveNode.y !== undefined
          ? liveNode.y
          : safeNumber(initialRect?.y, 0);
        const width = safeNumber(liveNode?.width ?? initialRect?.width, DEFAULT_NODE_WIDTH);
        const height = safeNumber(liveNode?.height ?? initialRect?.height, DEFAULT_NODE_HEIGHT);

        return {
          id: obstacleId ?? `${id}-static-${index}`,
          x,
          y,
          width,
          height,
        };
      });
    } else if (staticObstacles.length === 0) {
      result = condensedNodes;
    } else {
      result = staticObstacles.map((rect, index) => {
      const liveNode = rect?.id ? condensedNodes.find((node) => node.id === rect.id) : undefined;
      const width = safeNumber(liveNode?.width ?? rect?.width, DEFAULT_NODE_WIDTH);
      const height = safeNumber(liveNode?.height ?? rect?.height, DEFAULT_NODE_HEIGHT);
      // Use live position if available, otherwise use initial position
      const x = liveNode && liveNode.x !== undefined
        ? liveNode.x
        : safeNumber(rect?.x, 0);
      const y = liveNode && liveNode.y !== undefined
        ? liveNode.y
        : safeNumber(rect?.y, 0);

      return {
        id: rect?.id ?? liveNode?.id ?? `${id}-static-${index}`,
        x,
        y,
        width,
        height,
      };
    });
    }
    
    // Debug for edge-vertical - log final resolved obstacles
    if (id === 'edge-vertical') {
      console.log(`[StepEdge:${id}] 🔍 Resolved obstacles:`, {
        count: result.length,
        sample: result.slice(0, 3).map(r => ({ id: r.id, x: r.x, y: r.y }))
      });
    }
    
    return result;
  }, [edgeData?.staticObstacleIds, edgeData?.staticObstacles, condensedNodes, id]);

  const obstacleSignature = useMemo(() => {
    if (!resolvedObstacleRects || resolvedObstacleRects.length === 0) {
      return 'empty';
    }
    return resolvedObstacleRects
      .map((node) => {
        const x = Math.round(node.x);
        const y = Math.round(node.y);
        const w = Math.round(node.width);
        const h = Math.round(node.height);
        return `${node.id}:${x}:${y}:${w}:${h}`;
      })
      .sort()
      .join('|');
  }, [resolvedObstacleRects]);

  useEffect(() => {
    if (!isClient) {
      return;
    }


    setRoutingStatus('ok');
    setRoutingMessage('');

    let cancelled = false;
    let avoidModule: any;
    const resources: any[] = [];

    const register = (resource: any) => {
      if (resource) {
        resources.push(resource);
      }
      return resource;
    };

    const routeWithLibavoid = async () => {
      try {
        // Debug: Log all edge routing to see which edges are being routed
        console.log(`[STRAIGHT-DEBUG:${id}] 🚀 ROUTING STARTED`);
        avoidModule = await ensureAvoidInstance();
        if (cancelled) return;

        // Use a shared router for all edges to enable proper pin sharing
        // Reset router when optionsVersion or obstacle positions change
        // Combine optionsVersion and obstacleSignature to create a unique router version
        const routerVersion = `${optionsVersion}:${obstacleSignature}`;
        
        // Router configuration helper - sets all parameters ONCE per router version
        // This matches Joint.js pattern: configure router once, then batch route all connections
        const configureRouter = (router: any, avoidModule: any, libavoidOptions: any, spacing: number) => {
          // Enable nudging options
        if (typeof avoidModule.nudgeOrthogonalSegmentsConnectedToShapes === 'number') {
            router.setRoutingOption?.(avoidModule.nudgeOrthogonalSegmentsConnectedToShapes, libavoidOptions?.nudgeOrthSegments !== false);
        }
        if (typeof avoidModule.nudgeSharedPathsWithCommonEndPoint === 'number') {
          router.setRoutingOption?.(avoidModule.nudgeSharedPathsWithCommonEndPoint, !!libavoidOptions?.nudgeSharedPaths);
        }
        if (typeof avoidModule.nudgeOrthogonalTouchingColinearSegments === 'number') {
          router.setRoutingOption?.(avoidModule.nudgeOrthogonalTouchingColinearSegments, !!libavoidOptions?.nudgeTouchingColinear);
        }
          
          // Critical: Unifying nudging preprocessing - "unifies segments and centers them in free space"
          // This is the key to proper edge spacing that Joint.js uses
          if (typeof avoidModule.performUnifyingNudgingPreprocessingStep === 'number') {
            router.setRoutingOption?.(avoidModule.performUnifyingNudgingPreprocessingStep, true);
          }
          
          // Enable additional spacing options if available
          if (typeof (avoidModule as any).improvingConnectorNudging === 'number') {
            router.setRoutingOption?.((avoidModule as any).improvingConnectorNudging, true);
          }
          
          // Enable sideDirections to enforce side-constrained pins (critical for preventing overlap)
          if (typeof (avoidModule as any).sideDirections === 'number') {
            router.setRoutingOption?.((avoidModule as any).sideDirections, true);
            console.log(`[StepEdge:ROUTER-CONFIG] ✅ Enabled sideDirections for side-constrained pins`);
          } else {
            console.log(`[StepEdge:ROUTER-CONFIG] ⚠️  sideDirections not available in this libavoid build`);
          }
          
          // Set routing parameters
        if (typeof avoidModule.shapeBufferDistance === 'number') {
          router.setRoutingParameter?.(avoidModule.shapeBufferDistance, spacing);
        }
          // idealNudgingDistance: The PRIMARY parameter for uniform spacing between parallel edges
          // This controls the spacing when libavoid nudges overlapping parallel segments apart
          // Set to match the spacing between ports on nodes for visual consistency
          if (typeof avoidModule.idealNudgingDistance === 'number') {
            const nudgingDistance = safeNumber(libavoidOptions?.idealNudgingDistance, 56);
            router.setRoutingParameter?.(avoidModule.idealNudgingDistance, nudgingDistance);
            console.log(`[StepEdge:ROUTER-CONFIG] ✅ idealNudgingDistance set to ${nudgingDistance}px (uniform edge spacing)`);
        }
        if (typeof avoidModule.portDirectionPenalty === 'number') {
          router.setRoutingParameter?.(avoidModule.portDirectionPenalty, 50);
        }
        if (typeof avoidModule.segmentPenalty === 'number') {
            router.setRoutingParameter?.(avoidModule.segmentPenalty, safeNumber(libavoidOptions?.segmentPenalty, 1));
        }
        if (typeof avoidModule.bendPenalty === 'number') {
          router.setRoutingParameter?.(avoidModule.bendPenalty, safeNumber(libavoidOptions?.bendPenalty, 20));
        }
        if (typeof avoidModule.crossingPenalty === 'number') {
          router.setRoutingParameter?.(avoidModule.crossingPenalty, safeNumber(libavoidOptions?.crossingPenalty, 100));
        }
        if (typeof avoidModule.sharedPathPenalty === 'number') {
            router.setRoutingParameter?.(avoidModule.sharedPathPenalty, safeNumber(libavoidOptions?.sharedPathPenalty, 10000));
          }
        };
        
        // Use libavoidOptions.shapeBufferDistance from context as priority, fallback to edgeData.obstacleMargin
        const spacing = safeNumber(libavoidOptions?.shapeBufferDistance, safeNumber(edgeData?.obstacleMargin, DEFAULT_OBSTACLE_MARGIN));
        
        // Create or get shared router - configure ONCE per router version
        if (!(window as any).__libavoidSharedRouter || (window as any).__libavoidSharedRouterVersion !== routerVersion) {
          const newRouter = new avoidModule.Router(avoidModule.OrthogonalRouting);
          (window as any).__libavoidSharedRouter = newRouter;
          (window as any).__libavoidSharedRouterVersion = routerVersion;
          
          // Initialize pinIdMap and pinObjectMap on the new router
          (newRouter as any).__pinIdMap = new Map<string, number>();
          (newRouter as any).__pinObjectMap = new Map<number, any>();
          (newRouter as any).__nextPinId = 1000;
          
          // Configure router ONCE when created - this is critical for Joint.js-style batch routing
          configureRouter(newRouter, avoidModule, libavoidOptions, spacing);
          
          // Step 2 & 3: Initialize batch routing coordinator for new router
          const coordinator = getBatchRoutingCoordinator();
          coordinator.reset();
          coordinator.initialize(newRouter, avoidModule, routerVersion);
          coordinator.setExpectedEdgeCount(allEdges.length);
        }
        
        const router = register((window as any).__libavoidSharedRouter);
        
        // Step 2: Get coordinator and ensure it's initialized (will be reused later in routing)
        const coordinatorInstance = getBatchRoutingCoordinator();
        if (!coordinatorInstance.getStatus().routerVersion || coordinatorInstance.getStatus().routerVersion !== routerVersion) {
          coordinatorInstance.initialize(router, avoidModule, routerVersion);
          coordinatorInstance.setExpectedEdgeCount(allEdges.length);
        }
        
        // coordinatorInstance is now available for use in the routing section below

        type ShapeInfo = {
          shape: any;
          origin: Point;
          width: number;
          height: number;
        };

        const shapeMap = new Map<string, ShapeInfo>();
        
        const pinIdMap = (router as any).__pinIdMap;
        let nextPinId = (router as any).__nextPinId;

        const allDirFlag =
          typeof avoidModule.ConnDirAll === 'number'
            ? avoidModule.ConnDirAll
            : (avoidModule.ConnDirLeft ?? 0) |
              (avoidModule.ConnDirRight ?? 0) |
              (avoidModule.ConnDirUp ?? 0) |
              getConnDirDown();

        const obstacleRects: NodeRect[] = resolvedObstacleRects;

        // DEBUG: Log obstacle registration
        console.log(`[StepEdge:${id}] 🔍 OBSTACLES: ${obstacleRects.length} nodes to register as obstacles:`, 
          obstacleRects.map(n => `${n.id}(${Math.round(n.x)},${Math.round(n.y)},${Math.round(n.width)}x${Math.round(n.height)})`).join(', '));

        // CRITICAL FIX: Skip routing if all obstacles are at origin (0,0)
        // This prevents routing with invalid positions before nodes are positioned
        const allAtOrigin = obstacleRects.length > 0 && obstacleRects.every(n => n.x === 0 && n.y === 0);
        if (allAtOrigin) {
          console.log(`[StepEdge:${id}] ⏳ SKIPPING ROUTING - all obstacles at origin (0,0), waiting for valid positions`);
          return;
        }

        // CRITICAL: Register obstacles BEFORE creating connections
        // Obstacles are registered synchronously, so they're guaranteed to be in router before connections
        // IMPORTANT: Do NOT exclude source/target nodes - they need to be obstacles too!
        // Only the pins on source/target should allow connections, the rest of the node should be an obstacle
        obstacleRects.forEach((node) => {
          const width = safeNumber(node.width, DEFAULT_NODE_WIDTH);
          const height = safeNumber(node.height, DEFAULT_NODE_HEIGHT);
          const topLeft = register(new avoidModule.Point(node.x, node.y));
          const bottomRight = register(new avoidModule.Point(node.x + width, node.y + height));
          const rectangle = register(new avoidModule.Rectangle(topLeft, bottomRight));
          const shape = register(new avoidModule.ShapeRef(router, rectangle));
          
          // Do NOT create default center pin - Joint.js pattern: only create side pins that are actually used
          // This prevents libavoid from treating nodes as having "all-direction" connection points
          // which can cause edges to merge into shared trunks
          
          shapeMap.set(node.id, {
            shape,
            origin: { x: node.x, y: node.y },
            width,
            height,
          });
        });
        
        // CRITICAL: Ensure obstacles are registered in router before proceeding
        // This is synchronous, so obstacles are guaranteed to be in router before connections

        // Port edge tracking using global registry
        // Initialize shared port registry on window if not exists
        if (!(window as any).__portEdgeRegistry) {
          (window as any).__portEdgeRegistry = new Map<string, string[]>();
          (window as any).__portEdgeRegistryVersion = '';
          (window as any).__portEdgeRegistrationBarrier = {
            version: '',
            registeredEdges: new Set<string>(),
            registrationComplete: false,
          };
        }
        
        // Clear registry when routerVersion changes (includes optionsVersion and obstacleSignature)
        // This ensures port grouping is recalculated when nodes move or options change
        if ((window as any).__portEdgeRegistryVersion !== routerVersion) {
          (window as any).__portEdgeRegistry.clear();
          (window as any).__portEdgeRegistryVersion = routerVersion;
          // Reset registration barrier for new version
          (window as any).__portEdgeRegistrationBarrier = {
            version: routerVersion,
            registeredEdges: new Set<string>(),
            registrationComplete: false,
          };
        }
        
        // Get registry and barrier for current routing session
        const portEdgeMap: Map<string, string[]> = (window as any).__portEdgeRegistry;
        const registrationBarrier = (window as any).__portEdgeRegistrationBarrier;
        
        // Determine this edge's port keys based on its own coordinates
        // This needs to match the logic used later for derivedSourcePosition/derivedTargetPosition
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        
        // Calculate base positions (before resolvePositionValue is applied)
        const baseSourcePosition = Math.abs(dx) > Math.abs(dy) 
          ? (dx >= 0 ? Position.Right : Position.Left)
          : (dy >= 0 ? Position.Bottom : Position.Top);
        const baseTargetPosition = Math.abs(dx) > Math.abs(dy)
          ? (dx >= 0 ? Position.Left : Position.Right)
          : (dy >= 0 ? Position.Top : Position.Bottom);
        
        // Convert string positions from edge data to Position enum
        const stringToPosition = (pos: string | undefined): Position | undefined => {
          if (!pos) return undefined;
          if (pos === 'right' || pos.includes('right')) return Position.Right;
          if (pos === 'left' || pos.includes('left')) return Position.Left;
          if (pos === 'top' || pos.includes('top')) return Position.Top;
          if (pos === 'bottom' || pos.includes('bottom')) return Position.Bottom;
          return undefined;
        };
        
        // Get positions from edge data (string format) - these take priority
        const dataSourcePosition = stringToPosition(edgeData?.sourcePosition);
        const dataTargetPosition = stringToPosition(edgeData?.targetPosition);
        
        // Apply sourcePosition/targetPosition overrides if specified
        // Priority: edge data > React Flow props > calculated base
        const effectiveSourcePosition = dataSourcePosition ?? resolvePositionValue(sourcePosition, baseSourcePosition);
        const effectiveTargetPosition = dataTargetPosition ?? resolvePositionValue(targetPosition, baseTargetPosition);
        
        // Debug: Log position resolution for edge-vertical
        if (id === 'edge-vertical') {
          console.log(`[StepEdge:${id}] 🔍 POSITION DEBUG:`, {
            edgeDataSourcePos: edgeData?.sourcePosition,
            edgeDataTargetPos: edgeData?.targetPosition,
            dataSourcePosition: dataSourcePosition ? Position[dataSourcePosition] : 'undefined',
            dataTargetPosition: dataTargetPosition ? Position[dataTargetPosition] : 'undefined',
            effectiveSourcePosition: Position[effectiveSourcePosition],
            effectiveTargetPosition: Position[effectiveTargetPosition],
            baseSourcePosition: Position[baseSourcePosition],
            baseTargetPosition: Position[baseTargetPosition],
          });
        }
        
        
        // Phase 1: Register this edge in the port map
        const srcPortKey = `${source}:${effectiveSourcePosition}`;
        if (!portEdgeMap.has(srcPortKey)) {
          portEdgeMap.set(srcPortKey, []);
        }
        if (!portEdgeMap.get(srcPortKey)!.includes(id)) {
          portEdgeMap.get(srcPortKey)!.push(id);
        }
        
        const tgtPortKey = `${target}:${effectiveTargetPosition}`;
        if (!portEdgeMap.has(tgtPortKey)) {
          portEdgeMap.set(tgtPortKey, []);
        }
        if (!portEdgeMap.get(tgtPortKey)!.includes(id)) {
          portEdgeMap.get(tgtPortKey)!.push(id);
        }
        
        // Mark this edge as registered in the barrier
        registrationBarrier.registeredEdges.add(id);
        
        // Sort edges in each port group by edge ID for consistent ordering
        portEdgeMap.forEach((edgeIds, portKey) => {
          edgeIds.sort();
        });
        
        // Phase 2: Wait for registration phase to complete
        // Use a two-tick approach: wait, check if new edges registered, wait again if needed
        // This ensures all edges in the current batch have registered before calculating offsets
        const initialRegistrySize = registrationBarrier.registeredEdges.size;
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Check if more edges registered during the delay
        const currentRegistrySize = registrationBarrier.registeredEdges.size;
        if (currentRegistrySize > initialRegistrySize) {
          // More edges registered during first tick, wait another tick for stability
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        // Mark registration as complete for this version (all edges have had a chance to register)
        if (!registrationBarrier.registrationComplete) {
          registrationBarrier.registrationComplete = true;
        }
        
        const srcEdgeList = portEdgeMap.get(srcPortKey) || [];
        const tgtEdgeList = portEdgeMap.get(tgtPortKey) || [];
        
        // Calculate this edge's offsets after all edges have registered
        const srcEdgeIndex = srcEdgeList.indexOf(id);
        const tgtEdgeIndex = tgtEdgeList.indexOf(id);
        const preComputedSrcOffset = srcEdgeIndex >= 0 ? srcEdgeIndex - (srcEdgeList.length - 1) / 2 : 0;
        const preComputedTgtOffset = tgtEdgeIndex >= 0 ? tgtEdgeIndex - (tgtEdgeList.length - 1) / 2 : 0;

        function getConnDirDown(): number {
          if (typeof avoidModule.ConnDirDown === 'number') {
            return avoidModule.ConnDirDown;
          }
          if (typeof avoidModule.ConnDirBottom === 'number') {
            return avoidModule.ConnDirBottom;
          }
          // CRITICAL FIX: Never return ConnDirAll - use ConnDirRight as safe fallback
          // This prevents edges from "sliding" along node faces and passing through nodes
          return avoidModule.ConnDirRight ?? 0;
        }

        const getConnDirFlag = (dx: number, dy: number) => {
          const absX = Math.abs(dx);
          const absY = Math.abs(dy);
          if (absX > absY) {
            return dx >= 0 ? avoidModule.ConnDirRight : avoidModule.ConnDirLeft;
          }
          if (absY > absX) {
            const downFlag = getConnDirDown();
            return dy >= 0 ? downFlag : avoidModule.ConnDirUp;
          }
          const downFlag = getConnDirDown();
          return avoidModule.ConnDirLeft | avoidModule.ConnDirRight | avoidModule.ConnDirUp | downFlag;
        };

        const positionToFlag = (pos: Position): number => {
          if (pos === Position.Left) return avoidModule.ConnDirLeft;
          if (pos === Position.Right) return avoidModule.ConnDirRight;
          if (pos === Position.Top) return avoidModule.ConnDirUp;
          // CRITICAL FIX: Never return ConnDirAll - use getConnDirDown() or ConnDirRight as fallback
          // This prevents edges from "sliding" along node faces and passing through nodes
          const downFlag = getConnDirDown();
          return downFlag || (avoidModule.ConnDirRight ?? 0);
        };

        const createConnEndForNode = (nodeId: string, point: Point, preferredDirection?: Position, edgeOffset: number = 0) => {
          const info = shapeMap.get(nodeId);
          if (!info) {
            const pt = register(new avoidModule.Point(point.x, point.y));
            return register(new avoidModule.ConnEnd(pt));
          }

          const { shape, origin, width, height } = info;
          
          // Calculate base offset from node geometry based on preferred direction
          // This ensures pins are always on the correct side of the node, regardless of ReactFlow point coordinates
          let baseOffsetX: number;
          let baseOffsetY: number;
          
          if (preferredDirection) {
            // Use geometry-based positioning: pin is on the edge of the node in the preferred direction
            switch (preferredDirection) {
              case Position.Right:
                baseOffsetX = 1.0; // Right edge
                baseOffsetY = 0.5; // Vertical center
                break;
              case Position.Left:
                baseOffsetX = 0.0; // Left edge
                baseOffsetY = 0.5; // Vertical center
                break;
              case Position.Top:
                baseOffsetX = 0.5; // Horizontal center
                baseOffsetY = 0.0; // Top edge
                break;
              case Position.Bottom:
                baseOffsetX = 0.5; // Horizontal center
                baseOffsetY = 1.0; // Bottom edge
                break;
              default:
                // Fallback to center if unknown direction
                baseOffsetX = 0.5;
                baseOffsetY = 0.5;
            }
          } else {
            // Fallback: calculate from ReactFlow point if no preferred direction
            // Clamp to valid range to avoid invalid coordinates
            baseOffsetX = width === 0 ? 0.5 : Math.max(0, Math.min(1, (point.x - origin.x) / width));
            baseOffsetY = height === 0 ? 0.5 : Math.max(0, Math.min(1, (point.y - origin.y) / height));
            
            // If calculation produces invalid coordinates, default to center
            if (!Number.isFinite(baseOffsetX) || !Number.isFinite(baseOffsetY)) {
              baseOffsetX = 0.5;
              baseOffsetY = 0.5;
            }
          }
          
          // Apply port edge spacing offset perpendicular to connection direction
          let offsetX = baseOffsetX;
          let offsetY = baseOffsetY;
          
          if (edgeOffset !== 0 && portEdgeSpacing > 0 && preferredDirection) {
            // Calculate offset perpendicular to connection direction
            const offsetPixels = edgeOffset * portEdgeSpacing;
            
            if (preferredDirection === Position.Left || preferredDirection === Position.Right) {
              // Horizontal connection - offset vertically
              offsetY += offsetPixels / height;
            } else {
              // Vertical connection - offset horizontally
              offsetX += offsetPixels / width;
            }
          }
          
          const clampedOffsetX = Number.isFinite(offsetX)
            ? Math.min(1, Math.max(0, offsetX))
            : 0.5;
          const clampedOffsetY = Number.isFinite(offsetY)
            ? Math.min(1, Math.max(0, offsetY))
            : 0.5;
          
          // CRITICAL: Always use side-constrained direction flag (Joint.js pattern)
          // Never use ConnDirAll - this prevents edges from "sliding" along node faces
          // and forces proper separation at the port level
          let direction = preferredDirection
            ? positionToFlag(preferredDirection)
            : getConnDirFlag(
                point.x - (origin.x + width / 2),
                point.y - (origin.y + height / 2)
              );
          
          // PREVENTIVE Safety: Validate direction BEFORE creating pin to ensure ConnDirAll is never used
          // This prevents libavoid from processing pins with ConnDirAll, which can cause edges to pass through nodes
          // For center pins (0.5, 0.5), determine direction from which side the connection approaches
          if (!direction || (typeof avoidModule.ConnDirAll === 'number' && direction === avoidModule.ConnDirAll)) {
            // Calculate direction from pin position relative to node center
            const dx = clampedOffsetX - 0.5;
            const dy = clampedOffsetY - 0.5;
            if (Math.abs(dx) > Math.abs(dy)) {
              direction = dx > 0 ? (avoidModule.ConnDirRight ?? 0) : (avoidModule.ConnDirLeft ?? 0);
            } else if (dy !== 0) {
              direction = dy > 0 ? (avoidModule.ConnDirDown ?? getConnDirDown()) : (avoidModule.ConnDirUp ?? 0);
            } else {
              // True center (0.5, 0.5) - use Right as default (most common case)
              direction = avoidModule.ConnDirRight ?? 0;
            }
            // Final safety: ensure we have a valid direction (never ConnDirAll)
            if (!direction || (typeof avoidModule.ConnDirAll === 'number' && direction === avoidModule.ConnDirAll)) {
              direction = (avoidModule.ConnDirRight ?? 0) || (avoidModule.ConnDirLeft ?? 0) || (avoidModule.ConnDirUp ?? 0) || getConnDirDown();
            }
          }
          
          // Include edge offset and portEdgeSpacing in pin key to ensure pins are recreated when spacing changes
          const pinKey = `${nodeId}:${clampedOffsetX.toFixed(4)}:${clampedOffsetY.toFixed(4)}:${edgeOffset}:${portEdgeSpacing}`;
          const pinIdMap = (router as any).__pinIdMap as Map<string, number>;
          let pinId = pinIdMap.get(pinKey);
          
          // No center pin fallback - Joint.js pattern: only create side pins that are actually used
          
          let pinObj;
          if (!pinId) {
            // Atomically reserve a pin ID by incrementing the shared counter
            // Use direct increment on the router property for true atomicity
            pinId = ++(router as any).__nextPinId;
            pinIdMap.set(pinKey, pinId);
            pinObj = register(
              new avoidModule.ShapeConnectionPin(
                shape,
                pinId,
                clampedOffsetX,
                clampedOffsetY,
                true,
                0,
                direction
              )
            );
            pinObj.setExclusive?.(false);
            
            // Store the pin object for reuse
            const pinObjectMap = (router as any).__pinObjectMap as Map<number, any>;
            pinObjectMap.set(pinId, pinObj);
            
            // Debug pin creation for moving edges
            if (id === 'edge-straight' || id.startsWith('edge-port-')) {
              const pixelX = origin.x + clampedOffsetX * width;
              const pixelY = origin.y + clampedOffsetY * height;
              const pinType = nodeId === source ? 'SRC' : nodeId === target ? 'TGT' : 'OTHER';
              console.log(`[STRAIGHT-DEBUG:${id}] 🔌 PIN CREATED [${pinType}]: ${nodeId} pinId=${pinId} norm=(${clampedOffsetX.toFixed(3)},${clampedOffsetY.toFixed(3)}) pixel=(${pixelX.toFixed(1)},${pixelY.toFixed(1)}) dir=${preferredDirection || 'auto'} edgeOffset=${edgeOffset}`);
            }
          } else {
            // Retrieve existing pin object
            const pinObjectMap = (router as any).__pinObjectMap as Map<number, any>;
            pinObj = pinObjectMap.get(pinId);
          }

          // Create ConnEnd using the pin object (not just pinId)
          return register(new avoidModule.ConnEnd(shape, pinId));
        };

        // Use pre-computed offsets (no async delay needed since we computed synchronously above)
        const srcEdgeOffset = preComputedSrcOffset;
        const tgtEdgeOffset = preComputedTgtOffset;

        const sourcePoint: Point = { x: sourceX, y: sourceY };
        const targetPoint: Point = { x: targetX, y: targetY };

        // Use the effective positions from port key calculation for consistency
        const srcEnd = createConnEndForNode(source, sourcePoint, effectiveSourcePosition, srcEdgeOffset);
        const dstEnd = createConnEndForNode(target, targetPoint, effectiveTargetPosition, tgtEdgeOffset);
        const connection = register(new avoidModule.ConnRef(router));
        connection.setSourceEndpoint?.(srcEnd);
        connection.setDestEndpoint?.(dstEnd);
        
        // Always force orthogonal routing (never polyline) to ensure pins are respected
        const hasOrth = typeof avoidModule.ConnType_Orthogonal === 'number';
        const routingType = hasOrth
          ? avoidModule.ConnType_Orthogonal
          : (avoidModule.ConnType_Orthogonal as number);
        connection.setRoutingType?.(routingType);
        
        // Debug: Verify routing type is set correctly
        if (id === 'edge-straight' || id.startsWith('edge-port-')) {
          console.log(`[STRAIGHT-DEBUG:${id}] 🔧 ROUTING TYPE SET: ${routingType} (ConnType_Orthogonal=${avoidModule.ConnType_Orthogonal})`);
        }
        if (typeof connection.setHateCrossings === 'function') {
          connection.setHateCrossings?.(!!libavoidOptions?.hateCrossings);
        }

        // Step 2: Register with batch routing coordinator instead of processing immediately
        // This allows libavoid to see all edges together and properly nudge overlapping segments
        // Reuse coordinatorInstance from above (already initialized)
        
        // Create callback to receive route when batch processing completes
        const onRouteReady = (route: Point[]) => {
          if (!cancelled) {
            setCoordinatorPathPoints(route);
            // State update will trigger re-render, which will call routeWithLibavoid again
            // and this time the route will be available
          }
        };
        coordinatorCallbackRef.current = onRouteReady;
        
        // Register edge with coordinator
        coordinatorInstance.registerEdge(id, connection, source, target, onRouteReady);
        
        // Check if we already have a route from coordinator (either from state or coordinator cache)
        let routeFromCoordinator = coordinatorPathPoints || coordinatorInstance.getRoute(id);
        
        // If route not ready, check if we should force process
        if (!routeFromCoordinator || routeFromCoordinator.length === 0) {
          const status = coordinatorInstance.getStatus();
          if (status.registeredEdgeCount >= status.expectedEdgeCount && status.expectedEdgeCount > 0 && !status.batchProcessed) {
            // All edges registered but batch not processed yet - force it
            console.log(`[StepEdge:${id}] ⚠️ All edges registered but batch not processed, forcing...`);
            coordinatorInstance.forceProcess();
            routeFromCoordinator = coordinatorInstance.getRoute(id);
          }
        }
        
        // If still no route, wait for batch processing
        if (!routeFromCoordinator || routeFromCoordinator.length === 0) {
          console.log(`[StepEdge:${id}] ⏳ Waiting for batch processing to complete...`);
          return; // Exit early, will be called again when route is ready via callback
        }
        
        // Use route from coordinator
        const pathPoints = routeFromCoordinator;
        
        // Log that we've reached the diagnostic section - this confirms routing happened
        console.log(`[DIAG:${id}] ✅ ROUTING COMPLETE (from coordinator) - pathPoints.length=${pathPoints.length}, source=${source}, target=${target}, routerVersion=${routerVersion}`);
        
        // CRITICAL FIX: If we got a routed path (more than 2 points), don't allow it to be overwritten by a straight line
        // This prevents race conditions where a later routing with fewer obstacles overwrites a correct route
        if (pathPoints.length > 2) {
          console.log(`[StepEdge:${id}] 🎯 ROUTED PATH FOUND with ${pathPoints.length} points - marking as stable`);
          (window as any).__stableEdgePaths = (window as any).__stableEdgePaths || {};
          (window as any).__stableEdgePaths[id] = pathPoints;
        } else if ((window as any).__stableEdgePaths?.[id]?.length > 2) {
          // If we have a stable routed path and the new path is a straight line, use the stable path
          console.log(`[StepEdge:${id}] ⚠️ IGNORING STRAIGHT LINE - using stable routed path with ${(window as any).__stableEdgePaths[id].length} points`);
          pathPoints.length = 0;
          pathPoints.push(...(window as any).__stableEdgePaths[id]);
        }
        
        // DIAGNOSTIC: Boundary sanity check for all edges
        // Enable diagnostics for all edges by default (can be disabled via window.__enableEdgeDiagnostics = false)
        const enableDiagnostics = typeof (window as any).__enableEdgeDiagnostics === 'boolean' 
          ? (window as any).__enableEdgeDiagnostics 
          : true; // Enable by default for all edges
        
        console.log(`[DIAG:${id}] 🔧 enableDiagnostics=${enableDiagnostics}, window.__enableEdgeDiagnostics=${typeof (window as any).__enableEdgeDiagnostics}`);
        
        // Initialize diagnostics map if needed
        if (enableDiagnostics && !(window as any).__edgeDiagnostics) {
          (window as any).__edgeDiagnostics = new Map();
        }
        
        if (enableDiagnostics) {
          // Initialize diagnostics map if needed (redundant check but safe)
          if (!(window as any).__edgeDiagnostics) {
            (window as any).__edgeDiagnostics = new Map();
          }
          
          console.log(`[DIAG:${id}] 🔍 Entering diagnostic block, pathPoints.length=${pathPoints.length}`);
          
          if (pathPoints.length >= 2) {
            const srcInfo = shapeMap.get(source);
            const tgtInfo = shapeMap.get(target);
            
            console.log(`[DIAG:${id}] 🔍 pathPoints.length >= 2, srcInfo=${!!srcInfo}, tgtInfo=${!!tgtInfo}`);
            
            // Always store diagnostic data, even if shapeMap entries are missing
            // Initialize diagnostics map if needed
            if (!(window as any).__edgeDiagnostics) {
              (window as any).__edgeDiagnostics = new Map();
            }
            
            if (srcInfo && tgtInfo) {
            // Calculate actual pin positions in pixels
            const srcPinX = srcInfo.origin.x + (effectiveSourcePosition === Position.Right ? srcInfo.width : 
                              effectiveSourcePosition === Position.Left ? 0 : 
                              effectiveSourcePosition === Position.Top || effectiveSourcePosition === Position.Bottom ? srcInfo.width / 2 : srcInfo.width / 2);
            const srcPinY = srcInfo.origin.y + (effectiveSourcePosition === Position.Bottom ? srcInfo.height :
                              effectiveSourcePosition === Position.Top ? 0 :
                              effectiveSourcePosition === Position.Left || effectiveSourcePosition === Position.Right ? srcInfo.height / 2 : srcInfo.height / 2);
            const tgtPinX = tgtInfo.origin.x + (effectiveTargetPosition === Position.Right ? tgtInfo.width :
                              effectiveTargetPosition === Position.Left ? 0 :
                              effectiveTargetPosition === Position.Top || effectiveTargetPosition === Position.Bottom ? tgtInfo.width / 2 : tgtInfo.width / 2);
            const tgtPinY = tgtInfo.origin.y + (effectiveTargetPosition === Position.Bottom ? tgtInfo.height :
                              effectiveTargetPosition === Position.Top ? 0 :
                              effectiveTargetPosition === Position.Left || effectiveTargetPosition === Position.Right ? tgtInfo.height / 2 : tgtInfo.height / 2);
            
            // Check if first point matches source pin (within tolerance)
            const firstPoint = pathPoints[0];
            const pinMatchTolerance = 2.0;
            const srcPinMatches = Math.abs(firstPoint.x - srcPinX) < pinMatchTolerance && 
                                 Math.abs(firstPoint.y - srcPinY) < pinMatchTolerance;
            
            // Check if pin is on the correct boundary
            const srcNodeRect = {
              x: srcInfo.origin.x,
              y: srcInfo.origin.y,
              width: srcInfo.width,
              height: srcInfo.height
            };
            const tgtNodeRect = {
              x: tgtInfo.origin.x,
              y: tgtInfo.origin.y,
              width: tgtInfo.width,
              height: tgtInfo.height
            };
            
            const boundaryTolerance = 1.0;
            let srcPinOnBoundary = false;
            let srcPinBoundaryIssue = '';
            if (effectiveSourcePosition === Position.Left) {
              srcPinOnBoundary = Math.abs(srcPinX - srcNodeRect.x) < boundaryTolerance;
              if (!srcPinOnBoundary) srcPinBoundaryIssue = `Expected X=${srcNodeRect.x}, got ${srcPinX.toFixed(1)}`;
            } else if (effectiveSourcePosition === Position.Right) {
              srcPinOnBoundary = Math.abs(srcPinX - (srcNodeRect.x + srcNodeRect.width)) < boundaryTolerance;
              if (!srcPinOnBoundary) srcPinBoundaryIssue = `Expected X=${(srcNodeRect.x + srcNodeRect.width).toFixed(1)}, got ${srcPinX.toFixed(1)}`;
            } else if (effectiveSourcePosition === Position.Top) {
              srcPinOnBoundary = Math.abs(srcPinY - srcNodeRect.y) < boundaryTolerance;
              if (!srcPinOnBoundary) srcPinBoundaryIssue = `Expected Y=${srcNodeRect.y}, got ${srcPinY.toFixed(1)}`;
            } else if (effectiveSourcePosition === Position.Bottom) {
              srcPinOnBoundary = Math.abs(srcPinY - (srcNodeRect.y + srcNodeRect.height)) < boundaryTolerance;
              if (!srcPinOnBoundary) srcPinBoundaryIssue = `Expected Y=${(srcNodeRect.y + srcNodeRect.height).toFixed(1)}, got ${srcPinY.toFixed(1)}`;
            } else {
              srcPinOnBoundary = false;
              srcPinBoundaryIssue = `Unknown position: ${effectiveSourcePosition}`;
            }
            
            // Check if first segment exits source node
            const secondPoint = pathPoints[1];
            const firstSegmentExits = !(
              secondPoint.x >= srcNodeRect.x && 
              secondPoint.x <= srcNodeRect.x + srcNodeRect.width &&
              secondPoint.y >= srcNodeRect.y && 
              secondPoint.y <= srcNodeRect.y + srcNodeRect.height
            );
            
            console.log(`[DIAG:${id}] 🔍 BOUNDARY SANITY CHECK:`);
            console.log(`  Source: ${source} @ (${srcNodeRect.x},${srcNodeRect.y}) ${srcNodeRect.width}x${srcNodeRect.height}`);
            console.log(`  Target: ${target} @ (${tgtNodeRect.x},${tgtNodeRect.y}) ${tgtNodeRect.width}x${tgtNodeRect.height}`);
            console.log(`  Effective positions: src=${effectiveSourcePosition}, tgt=${effectiveTargetPosition}`);
            console.log(`  Source pin: (${srcPinX.toFixed(1)},${srcPinY.toFixed(1)}) [${srcPinOnBoundary ? '✅ ON BOUNDARY' : '❌ NOT ON BOUNDARY: ' + srcPinBoundaryIssue}]`);
            console.log(`  Target pin: (${tgtPinX.toFixed(1)},${tgtPinY.toFixed(1)})`);
            console.log(`  Route first point: (${firstPoint.x.toFixed(1)},${firstPoint.y.toFixed(1)}) [${srcPinMatches ? '✅ MATCHES PIN' : '❌ DOES NOT MATCH PIN'}]`);
            console.log(`  Route second point: (${secondPoint.x.toFixed(1)},${secondPoint.y.toFixed(1)}) [${firstSegmentExits ? '✅ EXITS SOURCE' : '❌ STAYS INSIDE SOURCE'}]`);
            
            // Store diagnostic data for window.__edgeSanity()
            if (!(window as any).__edgeDiagnostics) {
              (window as any).__edgeDiagnostics = new Map();
            }
            (window as any).__edgeDiagnostics.set(id, {
              source, target,
              srcNodeRect, tgtNodeRect,
              effectiveSourcePosition, effectiveTargetPosition,
              srcPin: { x: srcPinX, y: srcPinY },
              tgtPin: { x: tgtPinX, y: tgtPinY },
              routePoints: pathPoints,
              srcPinOnBoundary,
              srcPinMatches,
              firstSegmentExits,
              issues: [
                !srcPinOnBoundary && `Source pin not on boundary: ${srcPinBoundaryIssue}`,
                !srcPinMatches && `First route point doesn't match source pin`,
                !firstSegmentExits && `First segment stays inside source node`
              ].filter(Boolean)
            });
          } else {
            // Store basic diagnostic data even when shapeMap entries are missing
            (window as any).__edgeDiagnostics.set(id, {
              source, target,
              srcNodeRect: srcInfo ? { x: srcInfo.origin.x, y: srcInfo.origin.y, width: srcInfo.width, height: srcInfo.height } : null,
              tgtNodeRect: tgtInfo ? { x: tgtInfo.origin.x, y: tgtInfo.origin.y, width: tgtInfo.width, height: tgtInfo.height } : null,
              effectiveSourcePosition, effectiveTargetPosition,
              srcPin: null,
              tgtPin: null,
              routePoints: pathPoints,
              srcPinOnBoundary: false,
              srcPinMatches: false,
              firstSegmentExits: false,
              issues: [
                !srcInfo && `Source node info missing from shapeMap`,
                !tgtInfo && `Target node info missing from shapeMap`
              ].filter(Boolean)
            });
          }
          } else {
            // Store basic diagnostic data for edges with insufficient route points
            const srcInfo = shapeMap.get(source);
            const tgtInfo = shapeMap.get(target);
            if (!(window as any).__edgeDiagnostics) {
              (window as any).__edgeDiagnostics = new Map();
            }
            (window as any).__edgeDiagnostics.set(id, {
              source, target,
              srcNodeRect: srcInfo ? { x: srcInfo.origin.x, y: srcInfo.origin.y, width: srcInfo.width, height: srcInfo.height } : null,
              tgtNodeRect: tgtInfo ? { x: tgtInfo.origin.x, y: tgtInfo.origin.y, width: tgtInfo.width, height: tgtInfo.height } : null,
              effectiveSourcePosition, effectiveTargetPosition,
              srcPin: null,
              tgtPin: null,
              routePoints: pathPoints,
              srcPinOnBoundary: false,
              srcPinMatches: false,
              firstSegmentExits: false,
              issues: [
                `Insufficient route points: ${pathPoints.length} (need at least 2)`
              ]
            });
          }
        }
        
        // Debug logs for moving edges (straight and port edges)
        const isMovingEdge = id === 'edge-straight' || id.startsWith('edge-port-');
        console.log(`[STRAIGHT-DEBUG:${id}] 🔍 CHECKING: id="${id}", isMovingEdge=${isMovingEdge}, source=${source}, target=${target}`);
        if (isMovingEdge) {
          const libavoidSegs = pathPoints.length - 1;
          console.log(`[STRAIGHT-DEBUG:${id}] 📍 LIBAVOID: ${pathPoints.length} points, ${libavoidSegs} segments`);
          if (pathPoints.length > 0 && pathPoints.length <= 3) {
            console.log(`[STRAIGHT-DEBUG:${id}]   Points:`, pathPoints.map(p => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' → '));
          }
          
          // Log pin positions in actual pixels
          const srcInfo = shapeMap.get(source);
          const tgtInfo = shapeMap.get(target);
          if (srcInfo && tgtInfo) {
            const srcPinX = srcInfo.origin.x + (effectiveSourcePosition === Position.Right ? srcInfo.width : 
                              effectiveSourcePosition === Position.Left ? 0 : srcInfo.width / 2);
            const srcPinY = srcInfo.origin.y + (effectiveSourcePosition === Position.Bottom ? srcInfo.height :
                              effectiveSourcePosition === Position.Top ? 0 : srcInfo.height / 2);
            const tgtPinX = tgtInfo.origin.x + (effectiveTargetPosition === Position.Right ? tgtInfo.width :
                              effectiveTargetPosition === Position.Left ? 0 : tgtInfo.width / 2);
            const tgtPinY = tgtInfo.origin.y + (effectiveTargetPosition === Position.Bottom ? tgtInfo.height :
                              effectiveTargetPosition === Position.Top ? 0 : tgtInfo.height / 2);
            
            console.log(`[STRAIGHT-DEBUG:${id}] 📌 PINS: src=(${srcPinX.toFixed(1)},${srcPinY.toFixed(1)}) [${effectiveSourcePosition}] tgt=(${tgtPinX.toFixed(1)},${tgtPinY.toFixed(1)}) [${effectiveTargetPosition}]`);
            console.log(`[STRAIGHT-DEBUG:${id}] 📌 SRC NODE: pos=(${srcInfo.origin.x},${srcInfo.origin.y}) size=${srcInfo.width}x${srcInfo.height}`);
            console.log(`[STRAIGHT-DEBUG:${id}] 📌 TGT NODE: pos=(${tgtInfo.origin.x},${tgtInfo.origin.y}) size=${tgtInfo.width}x${tgtInfo.height}`);
          }
          
          // Log obstacles
          const otherObstacles = obstacleRects.filter(n => n.id !== source && n.id !== target);
          console.log(`[STRAIGHT-DEBUG:${id}] 🚧 OBSTACLES: ${otherObstacles.length} registered`);
          if (otherObstacles.length > 0) {
            otherObstacles.forEach(obs => {
              console.log(`[STRAIGHT-DEBUG:${id}]   ${obs.id}: (${obs.x},${obs.y}) ${obs.width}x${obs.height}`);
            });
          }
          
          // Check if straight line would intersect obstacles
          if (pathPoints.length === 2 && otherObstacles.length > 0) {
            const start = pathPoints[0];
            const end = pathPoints[pathPoints.length - 1];
            const intersections = otherObstacles.filter(obs => {
              // Simple line-rectangle intersection
              const minX = Math.min(start.x, end.x);
              const maxX = Math.max(start.x, end.x);
              const minY = Math.min(start.y, end.y);
              const maxY = Math.max(start.y, end.y);
              const obsMaxX = obs.x + obs.width;
              const obsMaxY = obs.y + obs.height;
              return !(maxX < obs.x || minX > obsMaxX || maxY < obs.y || minY > obsMaxY);
            });
            if (intersections.length > 0) {
              console.log(`[STRAIGHT-DEBUG:${id}] ⚠️  STRAIGHT LINE INTERSECTS ${intersections.length} obstacle(s):`, intersections.map(o => o.id));
            } else {
              console.log(`[STRAIGHT-DEBUG:${id}] ✅ Straight line does NOT intersect obstacles (libavoid thinks it's valid)`);
            }
          }
          
          // Log routing options
          console.log(`[STRAIGHT-DEBUG:${id}] ⚙️  ROUTING: type=orthogonal (forced), buffer=${spacing.toFixed(1)}px, hateCrossings=${!!libavoidOptions?.hateCrossings}, nudgeOrth=${!!libavoidOptions?.nudgeOrthSegments}, nudgeShared=${!!libavoidOptions?.nudgeSharedPaths}, nudgeColinear=${!!libavoidOptions?.nudgeTouchingColinear}, sharedPathPenalty=${safeNumber(libavoidOptions?.sharedPathPenalty, 200)}`);
        }

        const rawPathForLog = pathPoints.map((point) => ({
          x: Math.round(point.x * 100) / 100,
          y: Math.round(point.y * 100) / 100,
        }));

        let roundedPoints = pathPoints.map((point) => ({
          x: Math.round(point.x * 100) / 100,
          y: Math.round(point.y * 100) / 100,
        }));

        if (roundedPoints.length === 0) {
          roundedPoints = [sourcePoint, targetPoint];
        }
        // DO NOT overwrite first/last points - libavoid's routing includes the pin offsets!
        // Overwriting would discard the port spacing offsets we just applied

        const finalPoints: Point[] = [];
        roundedPoints.forEach((point) => {
          const last = finalPoints[finalPoints.length - 1];
          if (!last || Math.abs(last.x - point.x) > 0.01 || Math.abs(last.y - point.y) > 0.01) {
            finalPoints.push(point);
          }
        });

        if (finalPoints.length === 1) {
          finalPoints.push(targetPoint);
        }
        
        // Debug comparison for moving edges
        if (isMovingEdge) {
          const renderedSegs = finalPoints.length - 1;
          const libavoidSegs = pathPoints.length - 1;
          console.log(`[STRAIGHT-DEBUG:${id}] 🎨 RENDERED: ${finalPoints.length} points, ${renderedSegs} segments`);
          if (finalPoints.length > 0 && finalPoints.length <= 3) {
            console.log(`[STRAIGHT-DEBUG:${id}]   Points:`, finalPoints.map(p => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' → '));
          }
          if (libavoidSegs > renderedSegs) {
            console.log(`[STRAIGHT-DEBUG:${id}] ⚠️  SIMPLIFICATION: ${libavoidSegs} → ${renderedSegs} segments (lost ${libavoidSegs - renderedSegs})`);
          } else if (libavoidSegs === renderedSegs) {
            console.log(`[STRAIGHT-DEBUG:${id}] ✅ No simplification: ${renderedSegs} segments`);
          }
        }
        
        // Store libavoid path in window for console comparison (for ALL edges)
        if (typeof window !== 'undefined') {
          if (!(window as any).__edgeLibavoidPaths) {
            (window as any).__edgeLibavoidPaths = new Map();
          }
          (window as any).__edgeLibavoidPaths.set(id, {
            libavoid: pathPoints,
            rendered: finalPoints,
            source,
            target,
            timestamp: Date.now()
          });
        }

        const obstacles = obstacleRects
          .filter((node) => node.id !== source && node.id !== target)
          .map(({ x, y, width, height }) => ({
            x,
            y,
            width: safeNumber(width, DEFAULT_NODE_WIDTH),
            height: safeNumber(height, DEFAULT_NODE_HEIGHT),
          }));

        const collision =
          finalPoints.length >= 2
            ? testEdgeCollision(
                finalPoints[0],
                finalPoints[finalPoints.length - 1],
                finalPoints.slice(1, -1),
                obstacles
              )
            : { collides: false, details: ['⚠️ libavoid returned an empty path'] };

        const missingAvoidPath = rawPathForLog.length === 0;
        let nextStatus: RoutingStatus = 'ok';
        let nextMessage = '';
        let fallbackApplied = false;

        if (collision.collides) {
          nextStatus = 'error';
          nextMessage = collision.details?.[0] ?? 'Path intersects an obstacle';
          fallbackApplied = true;
        } else if (missingAvoidPath) {
          nextStatus = 'degraded';
          nextMessage = 'Libavoid returned an empty route';
          fallbackApplied = true;
        }

        if (!cancelled) {
          const bendPoints = finalPoints.slice(1, -1);
          const debugPayload = {
            router: 'libavoid-js',
            rawPath: pathPoints, // Original libavoid path before any processing
            rawPolyline: rawPathForLog,
            pathPoints: finalPoints,
            obstacles,
            collision,
            fallbackApplied,
            status: nextStatus,
            message: nextMessage,
          };

          setRoutingStatus(nextStatus);
          setRoutingMessage(nextMessage);

          if (typeof window !== 'undefined') {
            window.__edgeDebug = window.__edgeDebug ?? {};
            window.__edgeDebug[id] = {
              rawPolyline: rawPathForLog,
              snappedPoints: finalPoints,
              collision,
              fallbackApplied,
              status: nextStatus,
              message: nextMessage,
              sourcePosition,
              targetPosition,
            };
          }
          setDebugInfo(debugPayload);
          const nextPath = pointsToPath(finalPoints);
          setEdgePath((prevPath) => (prevPath === nextPath ? prevPath : nextPath));
          setComputedBendPoints((prevPoints) =>
            arePointArraysEqual(prevPoints, bendPoints) ? prevPoints : bendPoints
          );

          if (edgeData) {
            edgeData.bendPoints = bendPoints;
            edgeData._elkDebug = debugPayload;
            edgeData.routingStatus = nextStatus;
            edgeData.routingMessage = nextMessage;
          }

          if (edgeData && debugInfo) {
            edgeData._elkDebug = debugInfo;
          }
        }
      } catch (error) {
        console.error(`[StepEdge:${id}] routing error`, error);
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setRoutingStatus('error');
          setRoutingMessage(message);
          setComputedBendPoints([]);
          setDebugInfo({
            router: 'libavoid-js',
            error: message,
            fallbackApplied: true,
            status: 'error',
            message,
          });
          const fallbackLine = pointsToPath([
            { x: sourceX, y: sourceY },
            { x: targetX, y: targetY },
          ]);
          setEdgePath((prevPath) => (prevPath === fallbackLine ? prevPath : fallbackLine));
          if (typeof window !== 'undefined') {
            window.__edgeDebug = window.__edgeDebug ?? {};
            window.__edgeDebug[id] = {
              rawPolyline: [],
              snappedPoints: [
                { x: sourceX, y: sourceY },
                { x: targetX, y: targetY },
              ],
              collision: {
                collides: true,
                details: [message || 'Libavoid routing failed'],
              },
              fallbackApplied: true,
              status: 'error',
              message,
              sourcePosition,
              targetPosition,
            };
          }
          if (edgeData) {
            edgeData.routingStatus = 'error';
            edgeData.routingMessage = message;
            edgeData.bendPoints = [];
          }
        }
      } finally {
        resources.reverse().forEach((resource) => {
          try {
            if (resource && typeof resource.delete === 'function') {
              resource.delete();
            } else if (resource && typeof resource.destroy === 'function') {
              resource.destroy();
            }
          } catch (destroyError) {
            // ignore cleanup failures
          }
        });
      }
    };

    routeWithLibavoid();

    return () => {
      cancelled = true;
      // Clean up coordinator callback
      if (coordinatorCallbackRef.current) {
        coordinatorCallbackRef.current = null;
      }
    };
  }, [
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    coordinatorPathPoints, // Re-run when route from coordinator is ready
    edgeData?.obstacleMargin,
    edgeData?.rerouteKey,
    edgeData?.staticObstacleIds, // Re-route when obstacles are first configured
    edgeData?.staticObstacles, // Re-route when obstacle positions change
    obstacleSignature,
    sourcePosition,
    targetPosition,
    optionsVersion,
    libavoidOptions,
    portEdgeSpacing, // Explicitly include to ensure re-routing when spacing changes
    nodeCount, // Re-route when nodes are added/removed (for port spacing)
    edgeCount, // Re-route when edges are added/removed (for port spacing)
  ]);

  // Step 4: Check for routes when batch completes (deferred route application)
  // This is a separate useEffect at component level (not nested)
  useEffect(() => {
    const coordinator = getBatchRoutingCoordinator();
    if (coordinator.isBatchComplete()) {
      const route = coordinator.getRoute(id);
      if (route && route.length > 0 && !coordinatorPathPoints) {
        setCoordinatorPathPoints(route);
      }
    }
  }, [id, coordinatorPathPoints]);

  useEffect(() => {
    if (edgeData && debugInfo) {
      edgeData._elkDebug = debugInfo;
      edgeData.debugInfo = debugInfo; // Also store as debugInfo for browser console access
    }
  }, [edgeData, debugInfo]);

  // Set up console function for comparing edges when they line up
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).compareEdges = function(edgeId1: string, edgeId2: string) {
        console.log(`\n🔍 COMPARING EDGES: ${edgeId1} vs ${edgeId2}`);
        console.log('═'.repeat(80));
        
        const paths = (window as any).__edgeLibavoidPaths;
        if (!paths) {
          console.log('❌ No edge paths stored. Edges may not have routed yet.');
          return;
        }
        
        const edge1 = paths.get(edgeId1);
        const edge2 = paths.get(edgeId2);
        
        if (!edge1 || !edge2) {
          console.log(`❌ One or both edges not found. Available:`, Array.from(paths.keys()));
          return;
        }
        
        console.log(`\n📊 EDGE 1 (${edgeId1}):`);
        console.log(`  Source: ${edge1.source} → Target: ${edge1.target}`);
        console.log(`  Libavoid points: ${edge1.libavoid.length}`);
        console.log(`  Libavoid path:`, edge1.libavoid.map((p: Point) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' → '));
        console.log(`  Rendered points: ${edge1.rendered.length}`);
        console.log(`  Rendered path:`, edge1.rendered.map((p: Point) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' → '));
        
        console.log(`\n📊 EDGE 2 (${edgeId2}):`);
        console.log(`  Source: ${edge2.source} → Target: ${edge2.target}`);
        console.log(`  Libavoid points: ${edge2.libavoid.length}`);
        console.log(`  Libavoid path:`, edge2.libavoid.map((p: Point) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' → '));
        console.log(`  Rendered points: ${edge2.rendered.length}`);
        console.log(`  Rendered path:`, edge2.rendered.map((p: Point) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' → '));
        
        // Check if paths are identical or overlapping
        console.log(`\n⚖️  COMPARISON:`);
        
        // Compare libavoid paths
        const libavoidSame = edge1.libavoid.length === edge2.libavoid.length &&
          edge1.libavoid.every((p: Point, i: number) => {
            const p2 = edge2.libavoid[i];
            return p2 && Math.abs(p.x - p2.x) < 0.1 && Math.abs(p.y - p2.y) < 0.1;
          });
        
        // Compare rendered paths
        const renderedSame = edge1.rendered.length === edge2.rendered.length &&
          edge1.rendered.every((p: Point, i: number) => {
            const p2 = edge2.rendered[i];
            return p2 && Math.abs(p.x - p2.x) < 0.1 && Math.abs(p.y - p2.y) < 0.1;
          });
        
        // Check for parallel segments (same Y for horizontal, same X for vertical)
        const parallelSegments: Array<{edge: string, seg: number, type: string, coord: number}> = [];
        edge1.rendered.forEach((p: Point, i: number) => {
          if (i < edge1.rendered.length - 1) {
            const next = edge1.rendered[i + 1];
            const isHorizontal = Math.abs(p.y - next.y) < 0.1;
            const isVertical = Math.abs(p.x - next.x) < 0.1;
            if (isHorizontal) parallelSegments.push({edge: edgeId1, seg: i, type: 'H', coord: p.y});
            if (isVertical) parallelSegments.push({edge: edgeId1, seg: i, type: 'V', coord: p.x});
          }
        });
        edge2.rendered.forEach((p: Point, i: number) => {
          if (i < edge2.rendered.length - 1) {
            const next = edge2.rendered[i + 1];
            const isHorizontal = Math.abs(p.y - next.y) < 0.1;
            const isVertical = Math.abs(p.x - next.x) < 0.1;
            if (isHorizontal) parallelSegments.push({edge: edgeId2, seg: i, type: 'H', coord: p.y});
            if (isVertical) parallelSegments.push({edge: edgeId2, seg: i, type: 'V', coord: p.x});
          }
        });
        
        // Find overlapping parallel segments
        const overlapping: Array<{type: string, coord: number, edges: string[]}> = [];
        parallelSegments.forEach(seg1 => {
          parallelSegments.forEach(seg2 => {
            if (seg1.edge !== seg2.edge && seg1.type === seg2.type && Math.abs(seg1.coord - seg2.coord) < 0.1) {
              const existing = overlapping.find(o => o.type === seg1.type && Math.abs(o.coord - seg1.coord) < 0.1);
              if (existing) {
                if (!existing.edges.includes(seg1.edge)) existing.edges.push(seg1.edge);
                if (!existing.edges.includes(seg2.edge)) existing.edges.push(seg2.edge);
              } else {
                overlapping.push({type: seg1.type, coord: seg1.coord, edges: [seg1.edge, seg2.edge]});
              }
            }
          });
        });
        
        if (libavoidSame) {
          console.log(`  🔥 ROUTING PROBLEM: Libavoid returned IDENTICAL paths for both edges!`);
        } else {
          console.log(`  ✅ Libavoid paths are different`);
        }
        
        if (renderedSame) {
          console.log(`  🔥 RENDERING PROBLEM: Rendered paths are IDENTICAL (but libavoid was different)`);
        } else {
          console.log(`  ✅ Rendered paths are different`);
        }
        
        if (overlapping.length > 0) {
          console.log(`  ⚠️  PARALLEL OVERLAP DETECTED: ${overlapping.length} segment(s) at same coordinates:`);
          overlapping.forEach(overlap => {
            console.log(`    ${overlap.type} segment at ${overlap.coord.toFixed(1)}: edges ${overlap.edges.join(', ')}`);
          });
          console.log(`  💡 This is a ROUTING problem - libavoid should space these apart`);
        } else if (!libavoidSame && !renderedSame) {
          console.log(`  ✅ No overlapping segments detected`);
        }
        
        console.log('\n' + '═'.repeat(80));
        
        return {
          libavoidSame,
          renderedSame,
          overlapping,
          edge1,
          edge2
        };
      };
      
      (window as any).listAllEdgePaths = function() {
        const paths = (window as any).__edgeLibavoidPaths;
        if (!paths) {
          console.log('No edge paths stored');
          return;
        }
        console.log(`\n📋 ALL STORED EDGE PATHS (${paths.size} edges):`);
        paths.forEach((data: any, id: string) => {
          console.log(`  ${id}: ${data.source} → ${data.target} (${data.libavoid.length} libavoid points, ${data.rendered.length} rendered points)`);
        });
      };
      
      (window as any).__edgeSanity = function(edgeId: string) {
        const diagnostics = (window as any).__edgeDiagnostics;
        if (!diagnostics) {
          console.log('❌ No edge diagnostics available. Edges may not have routed yet.');
          return null;
        }
        
        const diag = diagnostics.get(edgeId);
        if (!diag) {
          console.log(`❌ Edge ${edgeId} not found in diagnostics. Available:`, Array.from(diagnostics.keys()));
          return null;
        }
        
        console.log(`\n🔍 EDGE SANITY CHECK: ${edgeId}`);
        console.log('═'.repeat(80));
        console.log(`Source: ${diag.source} @ (${diag.srcNodeRect.x},${diag.srcNodeRect.y}) ${diag.srcNodeRect.width}x${diag.srcNodeRect.height}`);
        console.log(`Target: ${diag.target} @ (${diag.tgtNodeRect.x},${diag.tgtNodeRect.y}) ${diag.tgtNodeRect.width}x${diag.tgtNodeRect.height}`);
        console.log(`Effective positions: src=${diag.effectiveSourcePosition}, tgt=${diag.effectiveTargetPosition}`);
        console.log(`\n📍 PINS:`);
        console.log(`  Source pin: (${diag.srcPin.x.toFixed(1)},${diag.srcPin.y.toFixed(1)}) [${diag.srcPinOnBoundary ? '✅ ON BOUNDARY' : '❌ NOT ON BOUNDARY'}]`);
        console.log(`  Target pin: (${diag.tgtPin.x.toFixed(1)},${diag.tgtPin.y.toFixed(1)})`);
        console.log(`\n🛤️  ROUTE (${diag.routePoints.length} points):`);
        diag.routePoints.forEach((p: Point, i: number) => {
          console.log(`  [${i}] (${p.x.toFixed(1)},${p.y.toFixed(1)})`);
        });
        console.log(`\n✅ CHECKS:`);
        console.log(`  Source pin on boundary: ${diag.srcPinOnBoundary ? '✅ YES' : '❌ NO'}`);
        console.log(`  First point matches pin: ${diag.srcPinMatches ? '✅ YES' : '❌ NO'}`);
        console.log(`  First segment exits source: ${diag.firstSegmentExits ? '✅ YES' : '❌ NO'}`);
        if (diag.issues.length > 0) {
          console.log(`\n⚠️  ISSUES DETECTED:`);
          diag.issues.forEach((issue: string) => console.log(`  - ${issue}`));
    } else {
          console.log(`\n✅ All checks passed!`);
        }
        console.log('═'.repeat(80));
        
        return diag;
      };
      
      // Enable diagnostics for all edges (can be toggled)
      (window as any).__enableEdgeDiagnostics = true;
    }
  }, []);

  const edgeLabel = edgeData?.label;
  const hasRoutingIssue = routingStatus !== 'ok';
  const indicatorColor = routingStatus === 'error' ? '#ff4d4f' : '#faad14';
  const indicatorText =
    routingMessage ||
    (routingStatus === 'error' ? 'Routing error' : routingStatus === 'degraded' ? 'Routing degraded' : '');
  const baseEdgeStyle = {
    ...getEdgeStyle(selected, false),
    ...style,
  };
  const baseStrokeWidth = Number(baseEdgeStyle.strokeWidth ?? 2);
  const warningStrokeWidth = Number.isFinite(baseStrokeWidth) ? baseStrokeWidth + 1 : 3;
  const warningStyle = hasRoutingIssue
    ? {
        stroke: indicatorColor,
        strokeDasharray: routingStatus === 'error' ? '4 4' : '8 4',
        strokeWidth: warningStrokeWidth,
      }
    : {};
  const edgeStyleWithStatus = {
    ...baseEdgeStyle,
    ...warningStyle,
  };
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={edgeStyleWithStatus}
        markerEnd={markerEnd}
      />

      {hasRoutingIssue && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${midX}px, ${midY - 24}px)`,
              backgroundColor: indicatorColor,
              color: '#ffffff',
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              pointerEvents: 'none',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
            className="nodrag nopan"
          >
            {indicatorText}
          </div>
        </EdgeLabelRenderer>
      )}
      
      {edgeLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${midX}px, ${midY + (hasRoutingIssue ? 18 : 0)}px)`,
              fontSize: 12,
              pointerEvents: 'all',
              ...CANVAS_STYLES.edgeLabel,
            }}
            className="nodrag nopan"
          >
            {edgeLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default StepEdge; 