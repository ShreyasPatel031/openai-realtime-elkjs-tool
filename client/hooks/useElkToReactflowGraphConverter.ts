/**
 *  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 *  ┃  **DATA LAYERS – READ ME BEFORE EDITING**                    ┃
 *  ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 *  ┃  1. domain-graph (graph/*)                                   ┃
 *  ┃     - pure ELK JSON                                           ┃
 *  ┃     - NO x/y/sections/width/height/etc                        ┃
 *  ┃                                                               ┃
 *  ┃  2. processed-graph (ensureIds + elkOptions)                  ┃
 *  ┃     - lives only inside hooks/layout funcs                    ┃
 *  ┃     - generated, never mutated manually                       ┃
 *  ┃                                                               ┃
 *  ┃  3. view-graph (ReactFlow nodes/edges)                        ┃
 *  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  Node, Edge,
  applyNodeChanges, applyEdgeChanges,
  NodeChange, EdgeChange,
  Connection, OnConnect
} from "reactflow";

import { RawGraph, LayoutGraph } from "../components/graph/types/index";
import { ensureIds } from "../components/graph/utils/elk/ids";
import { structuralHash } from "../components/graph/utils/elk/structuralHash";
import { toReactFlowWithViewState } from "../core/renderer/ReactFlowAdapter";
// Rendering is handled by client/core modules, not hooks
import type { ViewState } from "../core/viewstate/ViewState";
import { triggerRestorationRender } from "../core/orchestration/Orchestrator";
import { migrateModeDomainToViewState, syncViewStateLayoutWithGraph } from "../core/viewstate/modeHelpers";

import {
  addNode, deleteNode, moveNode,
  addEdge, deleteEdge,
  groupNodes, removeGroup,
  batchUpdate,
  edgeIdExists
} from "../components/graph/mutations";

import { CANVAS_STYLES } from "../components/graph/styles/canvasStyles";

import {
  NON_ROOT_DEFAULT_OPTIONS   // ← 1️⃣ single source-of-truth sizes
} from "../components/graph/utils/elk/elkOptions";

/* -------------------------------------------------- */
/* 🔹 1.  ELK instance                                */
/* -------------------------------------------------- */
const elk = new ELK();

/* -------------------------------------------------- */
/* 🔹 2.  hook                                         */
/* -------------------------------------------------- */
export function useElkToReactflowGraphConverter(initialRaw: RawGraph, selectedTool: string = 'arrow') {
  /* 1) raw‐graph state */
  const [rawGraph, setRawGraphState] = useState<RawGraph>(initialRaw);
  const rawGraphRef = useRef<RawGraph>(initialRaw);
  
  /* 2) layouted‐graph state */
  const [layoutGraph, setLayoutGraph] = useState<LayoutGraph|null>(null);
  
  /* 3) layout error state */
  const [layoutError, setLayoutError] = useState<string | null>(null);
  
  /* refs that NEVER cause re-render */
  const hashRef = useRef<string>(structuralHash(initialRaw));
  const abortRef = useRef<AbortController | null>(null);
  const lastMutationRef = useRef<{ source: 'ai' | 'user'; scopeId: string; timestamp: number } | null>(null);
  const previousHashRef = useRef<string>(structuralHash(initialRaw));
  
  // Track if we should skip fitView (for user mutations in FREE mode)
  const shouldSkipFitViewRef = useRef<boolean>(false);
  
  /* react-flow state */
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [layoutVersion, incLayoutVersion] = useState(0);
  
  /* 4) view-state (authoritative geometry, prep for future phases) */
  const viewStateRef = useRef<ViewState>({
    node: {},
    group: {},
    edge: {},
  });
  const lastElkReasonRef = useRef<string | null>(null);
  const cloneViewState = (value: any) => {
    if (!value) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      console.warn('⚠️ [useElkToReactflow] Failed to clone viewState snapshot:', error);
      return value;
    }
  };
  
  /* -------------------------------------------------- */
  /* 🔹 3. mutate helper (sync hash update)              */
  /* -------------------------------------------------- */
  type MutFn = (...a: any[]) => any;
  type MutateOptions = { source?: 'ai' | 'user'; scopeId?: string };
  
  // Pass-through mutate wrapper that accepts optional options as the first arg.
  // Phase 1: Add conditional ELK triggering based on source and mode
  const mutate = useCallback((...args: any[]) => {
    let fn: MutFn;
    let rest: any[];
    let options: MutateOptions = { source: 'user' }; // Default to user
    
    if (typeof args[0] === 'function') {
      fn = args[0] as MutFn;
      rest = args.slice(1);
    } else {
      // args[0] is options
      options = { ...options, ...args[0] };
      fn = args[1] as MutFn;
      rest = args.slice(2);
    }
    
    setRawGraphState(prev => {
      if (!prev) {
        throw new Error(`Cannot mutate graph: graph state is null or undefined`);
      }
      const next = fn(...rest, prev) as RawGraph;

      let nextViewState = next?.viewState ? cloneViewState(next.viewState) : undefined;
      if (!nextViewState && viewStateRef.current && (Object.keys(viewStateRef.current.node || {}).length || Object.keys(viewStateRef.current.group || {}).length)) {
        nextViewState = cloneViewState(viewStateRef.current);
      }

      if (nextViewState) {
        viewStateRef.current = nextViewState ?? { node: {}, group: {}, edge: {} };
      }

      const nextWithViewState = nextViewState ? { ...next, viewState: nextViewState } : next;
      
      // Store mutation context for the layout effect to use
      lastMutationRef.current = {
        source: options.source || 'user',
        scopeId: options.scopeId || 'root',
        timestamp: Date.now()
      };
      
      hashRef.current = structuralHash(nextWithViewState);
      return nextWithViewState;
    });
  }, []);
  
  /* -------------------------------------------------- */
  /* 🔹 4.  mutation wrappers for mutate pattern       */
  /* -------------------------------------------------- */
  // The mutate function appends the current graph as the LAST parameter,
  // but mutations expect graph in different positions. Create wrappers:
  
  // addNode expects: (nodeName, parentId, graph, data?)
  // mutate calls: (nodeName, parentId, data?, graph)
  const addNodeWrapper = (nodeName: string, parentId: string, data: any, graph: RawGraph) => {
    return addNode(nodeName, parentId, graph, data);
  };
  
  // groupNodes expects: (nodeIds, parentId, groupId, graph, style?)
  // mutate calls: (nodeIds, parentId, groupId, style?, graph)
  const groupNodesWrapper = (nodeIds: any[], parentId: string, groupId: string, style: any, graph: RawGraph) => {
    // Filter out null/undefined/invalid node IDs
    const validNodeIds = nodeIds.filter((id): id is string => {
      if (!id || typeof id !== 'string') {
        console.warn('[groupNodesWrapper] Filtering out invalid node ID:', id);
        return false;
      }
      return true;
    });
    
    if (validNodeIds.length === 0) {
      throw new Error('Cannot create group: no valid node IDs provided');
    }
    
    // Ensure groupId is valid
    const validGroupId = groupId || `group-${Date.now()}`;
    
    return groupNodes(validNodeIds, parentId, validGroupId, graph, style);
  };
  
  // deleteNode expects: (nodeId, graph)
  // mutate calls: (nodeId, graph) - already correct
  
  // addEdge expects: (edgeId, sourceId, targetId, labelOrGraph?, sourceHandle?, targetHandle?, graph?)
  // mutate calls: (edgeId, sourceId, targetId, label?, sourceHandle?, targetHandle?, graph)
  // Create a wrapper that checks for duplicate edge IDs before calling addEdge
const addEdgeWrapper = (edgeId: string, sourceId: string, targetId: string, label: any, sourceHandle: any, targetHandle: any, graph: RawGraph) => {
    if (edgeIdExists(graph, edgeId)) {
      return graph;
    }
    return addEdge(edgeId, sourceId, targetId, label, sourceHandle, targetHandle, graph);
  };
  
  /* -------------------------------------------------- */
  /* 🔹 5.  exposed handlers                            */
  /* -------------------------------------------------- */
  const handlers = useMemo(() => ({
    // Backward compatible variants (no options) - using wrappers where needed
    handleAddNode     : (...a: any[]) => mutate(addNodeWrapper, ...a),
    handleDeleteNode  : (...a: any[]) => mutate(deleteNode,    ...a),
    handleMoveNode    : (...a: any[]) => mutate(moveNode,      ...a),
    handleAddEdge     : (...a: any[]) => mutate(addEdgeWrapper, ...a), // Use wrapper to prevent duplicates
    handleDeleteEdge  : (...a: any[]) => mutate(deleteEdge,    ...a),
    handleGroupNodes  : (...a: any[]) => mutate(groupNodesWrapper,    ...a),
    handleRemoveGroup : (...a: any[]) => mutate(removeGroup,   ...a),
    handleBatchUpdate : (...a: any[]) => mutate(batchUpdate,   ...a),
    // New option-aware variants (ignored for now)
    addNodeWith       : (opts: MutateOptions, ...a: any[]) => mutate(opts, addNodeWrapper, ...a),
    deleteNodeWith    : (opts: MutateOptions, ...a: any[]) => mutate(opts, deleteNode,     ...a),
    moveNodeWith      : (opts: MutateOptions, ...a: any[]) => mutate(opts, moveNode,       ...a),
    addEdgeWith       : (opts: MutateOptions, ...a: any[]) => mutate(opts, addEdge,        ...a),
    deleteEdgeWith    : (opts: MutateOptions, ...a: any[]) => mutate(opts, deleteEdge,     ...a),
    groupNodesWith    : (opts: MutateOptions, ...a: any[]) => mutate(opts, groupNodes,     ...a),
    removeGroupWith   : (opts: MutateOptions, ...a: any[]) => mutate(opts, removeGroup,    ...a),
    batchUpdateWith   : (opts: MutateOptions, ...a: any[]) => mutate(opts, batchUpdate,    ...a),
  }), [mutate]);
  
  const handleAddNodeLegacy = useCallback(
    (groupId: string) => {
      const newNodeId = `new-node-${Date.now()}`;
      const newNode: Node = {
        id: newNodeId,
        data: { label: 'New Node', isEditing: true },
        position: { x: 20, y: 20 },
        type: 'custom',
        parentNode: groupId,
        extent: 'parent' as const,
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  const handleLabelChange = useCallback(
    (id: string, label: string) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === id) {
            node.data = { ...node.data, label, isEditing: false };
          }
          return node;
        })
      );
    },
    [setNodes]
  );
  
  /* -------------------------------------------------- */
  /* 🔹 2b. safe raw graph setter                        */
  /* -------------------------------------------------- */
  const setRawGraph = useCallback((
    next: RawGraph | ((prev: RawGraph) => RawGraph),
    overrideSource?: 'ai' | 'user'
  ) => {
    setRawGraphState(prev => {
      let resolved = typeof next === 'function'
        ? (next as (p: RawGraph) => RawGraph)(prev)
        : next;

      // CRITICAL: For AI-generated graphs, don't attach viewState even if it exists in ref
      // This ensures ELK runs for AI architectures
      if (overrideSource !== 'ai') {
        if (resolved && typeof resolved === 'object' && 'viewState' in resolved && resolved.viewState) {
          const incomingViewState = resolved.viewState;
          const prevViewState = viewStateRef.current;
          // CRITICAL BUG FIX: Don't reset to empty ViewState if clone fails!
          // Fallback to existing ViewState to prevent corruption
          viewStateRef.current = cloneViewState(incomingViewState) ?? prevViewState ?? { node: {}, group: {}, edge: {} };
          
          // Only log if ViewState changed significantly (for refresh debugging)
          const prevNodeCount = Object.keys(prevViewState?.node || {}).length;
          const newNodeCount = Object.keys(incomingViewState.node || {}).length;
          // ViewState changed - no logging needed
        } else if (viewStateRef.current && Object.keys(viewStateRef.current.node || {}).length > 0) {
          // CRITICAL: Use deep copy to preserve nested modes (shallow copy loses them!)
          const deepCopy = JSON.parse(JSON.stringify(resolved));
          deepCopy.viewState = cloneViewState(viewStateRef.current);
          resolved = deepCopy;
          
        }
      } else {
        // For AI graphs, ensure viewState is removed
        if (resolved && typeof resolved === 'object' && 'viewState' in resolved) {
          delete (resolved as any).viewState;
        }
      }

      const viewStateNodeCount = resolved?.viewState?.node ? Object.keys(resolved.viewState.node).length : 0;
      const viewStateGroupCount = resolved?.viewState?.group ? Object.keys(resolved.viewState.group).length : 0;
      const hasViewStateGeometry = (viewStateNodeCount + viewStateGroupCount) > 0;

      // If overrideSource is provided, use it (this is the authoritative source)
      // Otherwise, infer from viewState: if viewState exists, it's user-authored; if not, it's AI-generated
      const inferredSource = hasViewStateGeometry ? 'user' : 'ai';
      const finalSource = overrideSource ?? inferredSource;


      lastMutationRef.current = {
        source: finalSource,
        scopeId: 'external-setRawGraph',
        timestamp: Date.now(),
      };

      hashRef.current = structuralHash(resolved);
      
      // 🔧 FIX: If this is restored FREE mode data, trigger rendering
      if (overrideSource === 'user' && resolved && typeof resolved === 'object' && 'viewState' in resolved && resolved.viewState) {
        // This is restoration data - trigger rendering
        setTimeout(() => {
          triggerRestorationRender({ current: resolved }, { current: resolved.viewState });
        }, 0);
      }
      
      return resolved;
    });
  }, []);

  /* -------------------------------------------------- */
  /* 🔹 4.5 ELK-only trigger (no orchestration)        */
  /* -------------------------------------------------- */
  const triggerRender = useCallback(() => {
    // This trigger is ONLY for AI/LOCK mode that needs ELK
    // FREE mode should NEVER use this trigger
    incLayoutVersion(v => v + 1);
  }, []);
  
  // Keep rawGraphRef in sync
  useEffect(() => {
    console.log('[🔄 ELK-HOOK] Syncing rawGraphRef:', {
      oldChildrenCount: rawGraphRef.current?.children?.length || 0,
      newChildrenCount: rawGraph?.children?.length || 0,
    });
    rawGraphRef.current = rawGraph;
  }, [rawGraph]);

  /* -------------------------------------------------- */
  /* 🔹 5. layout side-effect                           */
  /* -------------------------------------------------- */
  useEffect(() => {
    const mutation = lastMutationRef.current;
    const currentHash = hashRef.current;

    if (!rawGraph) {
      return;
    }
    
    // For AI mutations, always run ELK even if hash hasn't changed (AI might generate same structure)
    // For user mutations, skip if hash unchanged (prevents unnecessary ELK runs)
    const isAIMutation = mutation?.source === 'ai';
    const hashUnchanged = currentHash === previousHashRef.current;
    
    
    if (!isAIMutation && hashUnchanged) {
      return;
    }
    
    // Update ref to track current hash
    const previousHash = previousHashRef.current;
    previousHashRef.current = currentHash;
    
    // **THIS HOOK IS ONLY FOR AI/LOCK MODE WITH ELK**
    // FREE mode and restoration should NEVER reach this hook
    
    if (mutation?.source === 'user') {
      // FREE mode - should not be here, return immediately
      console.log('🔍 [ELK] FREE mode detected - should not be in ELK hook, skipping entirely');
      return;
    }
    
    // Only AI-generated graphs without ViewState should reach here
    const hasViewStateGeometry = 
      (Object.keys(viewStateRef.current?.node || {}).length > 0) ||
      (Object.keys(viewStateRef.current?.group || {}).length > 0);
    
    if (hasViewStateGeometry && !mutation) {
      // ViewState exists on initial load - skip ELK
      console.log('🔍 [ELK] Skipping - ViewState exists (FREE mode)');
      return;
    }
    
    console.log('🔍 [ELK] Running layout for AI-generated graph');
    
    /* cancel any in-flight run */
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    
    const hashAtStart = hashRef.current;
    
    (async () => {
      try {
        
        // Clear any previous layout errors
        setLayoutError(null);
        
        // Validate graph structure before processing
        const validateGraph = (node: any, visited = new Set()): boolean => {
          if (!node || typeof node !== 'object') return false;
          if (visited.has(node)) return false; // Prevent cycles
          visited.add(node);
          
          if (!node.id || typeof node.id !== 'string') {
            console.error("[ELK] Invalid node - missing or invalid ID:", node);
            return false;
          }
          
          // Validate children
          if (node.children) {
            if (!Array.isArray(node.children)) {
              console.error("[ELK] Invalid node - children is not an array:", node);
              return false;
            }
            for (const child of node.children) {
              if (!validateGraph(child, visited)) return false;
            }
          }
          
          // Validate edges
          if (node.edges) {
            if (!Array.isArray(node.edges)) {
              console.error("[ELK] Invalid node - edges is not an array:", node);
              return false;
            }
            for (const edge of node.edges) {
              if (!edge.id || !edge.sources || !edge.targets) {
                console.error("[ELK] Invalid edge:", edge);
                return false;
              }
            }
          }
          
          return true;
        };
        
        if (!validateGraph(rawGraph)) {
          throw new Error("Graph validation failed - invalid structure detected");
        }
        
        // 1) Extract mode map from rawGraph BEFORE ELK (preserve mode field)
        // Phase 4: Migrate and sync ViewState.layout with graph structure
        if (!viewStateRef.current.layout || Object.keys(viewStateRef.current.layout).length === 0) {
          console.log('[🔀 MODE MIGRATION] Migrating modes from Domain to ViewState');
          viewStateRef.current = migrateModeDomainToViewState(rawGraph, viewStateRef.current);
        } else {
          // Sync to ensure all groups have modes (for newly created groups)
          viewStateRef.current = syncViewStateLayoutWithGraph(rawGraph, viewStateRef.current);
        }
        
        // 2) inject IDs + elkOptions onto a clone of rawGraph
        const prepared = ensureIds(structuredClone(rawGraph));
        
        // 3) run ELK (mode no longer in ELK input/output - stays in ViewState)
        const layout = await elk.layout(prepared);
        
        // Critical: Check if ELK returned zero positions - this indicates a layout failure
        const zeroPosChildren = (layout.children || []).filter((c: any) => (c.x === 0 && c.y === 0));
        if (zeroPosChildren.length > 0 && zeroPosChildren.length === (layout.children || []).length) {
          // All nodes at 0,0 - ELK layout failed
          throw new Error(`ELK layout failed: all ${zeroPosChildren.length} nodes positioned at (0,0). Graph structure may be invalid.`);
        }
        
        /* stale result? – ignore */
        if (hashAtStart !== hashRef.current) return;
        
        // 3) store for SVG & RF conversion
        setLayoutGraph(layout as LayoutGraph);
        
        // 4) Ensure ViewState exists - initialize from ELK output ONCE if empty
        const currentViewState = viewStateRef.current;
        const hasViewStateGeometry = 
          (Object.keys(currentViewState?.node || {}).length > 0) ||
          (Object.keys(currentViewState?.group || {}).length > 0);
        
        if (!hasViewStateGeometry) {
          // Initialize ViewState from ELK output ONCE
          // This is the only time we populate ViewState from ELK
          const nextNodeState: Record<string, { x: number; y: number; w: number; h: number }> = {};
          const nextGroupState: Record<string, { x: number; y: number; w: number; h: number }> = {};
          
          // Helper to recursively extract geometry from ELK layout
          const extractGeometry = (elkNode: any, parentX = 0, parentY = 0) => {
            // Detect groups: has children array (even if empty), has edges array, or has isGroup flag
            const isGroup = 
              elkNode.data?.isGroup === true || 
              Array.isArray(elkNode.children) ||  // Groups have children array (even if empty)
              Array.isArray(elkNode.edges);       // Groups have edges array (even if empty)
            const absoluteX = elkNode.x ?? 0;
            const absoluteY = elkNode.y ?? 0;
            const width = elkNode.width ?? (isGroup ? NON_ROOT_DEFAULT_OPTIONS.width * 3 : NON_ROOT_DEFAULT_OPTIONS.width);
            const height = elkNode.height ?? (isGroup ? 96 * 3 : 96);
            
            const geom = { 
              x: absoluteX, 
              y: absoluteY, 
              w: width, 
              h: height 
            };
            
            if (isGroup) {
              nextGroupState[elkNode.id] = geom;
            } else {
              nextNodeState[elkNode.id] = geom;
            }
            
            // Recursively process children
            if (elkNode.children) {
              elkNode.children.forEach((child: any) => {
                extractGeometry(child, absoluteX, absoluteY);
              });
            }
          };
          
          // Extract geometry from ELK layout
          if (layout.children) {
            layout.children.forEach((child: any) => {
              extractGeometry(child);
            });
          }
          
          viewStateRef.current = { 
            node: nextNodeState, 
            group: nextGroupState, 
            edge: {} 
          };
          
          if (process.env.NODE_ENV !== 'production') {
            console.log('🔍 [ViewState] Initialized from ELK output:', {
              nodeCount: Object.keys(nextNodeState).length,
              groupCount: Object.keys(nextGroupState).length
            });
          }
        }
        
        // 5) Convert to ReactFlow using adapter (reads from ViewState, not ELK)
        const dimensions = {
          width: NON_ROOT_DEFAULT_OPTIONS.width,
          height: 96,
          groupWidth: NON_ROOT_DEFAULT_OPTIONS.width * 3,
          groupHeight: 96 * 3,
          padding: 10
        };
        
        const { nodes: rfNodes, edges: rfEdges } = toReactFlowWithViewState(
          layout,
          dimensions,
          viewStateRef.current,
          { strictGeometry: true }
        );
        
        // Critical: Check if ReactFlow nodes have zero positions after conversion
        const zeroPosNodes = rfNodes.filter(n => n.position.x === 0 && n.position.y === 0);
        if (zeroPosNodes.length > 0 && zeroPosNodes.length === rfNodes.length) {
          // All nodes at 0,0 - conversion failed
          throw new Error(`Position conversion failed: all ${zeroPosNodes.length} ReactFlow nodes positioned at (0,0). ELK layout may have failed.`);
        }

        // 🔍 Minimal debug: ReactFlow positions
        console.log('🔍 [RF] Converted nodes (ViewState-first):', {
          total: rfNodes.length,
          withParent: rfNodes.filter(n => (n as any).parentId).length,
          sample: rfNodes.slice(0, 3).map(n => ({
            id: n.id,
            pos: n.position,
            parent: (n as any).parentId || 'none',
            fromViewState: viewStateRef.current.node?.[n.id] || viewStateRef.current.group?.[n.id]
          }))
        });

        setNodes(rfNodes);
        setEdges(rfEdges);
        
        // ViewState is now the source of truth - no backwards population needed
        incLayoutVersion(v => v + 1);
      } catch (e: any) {
        if (e.name !== "AbortError") {
          console.error("[ELK] layout failed", e);
          console.error("[ELK] Raw graph that caused failure:", JSON.stringify(rawGraph, null, 2));
          
          // Set the error state so it can be accessed by components
          setLayoutError(e.message || e.toString());
          
          // NO FALLBACK - Let it fail loudly so we can fix the actual issue
          throw new Error(`ELK layout failed: ${e.message}. Fix the graph structure instead of using fallbacks.`);
        }
      }
    })();
    
    return () => ac.abort();
  }, [rawGraph]); // Only depend on rawGraph, not selectedTool - tool changes shouldn't trigger graph processing
  
  /* -------------------------------------------------- */
  /* 🔹 6. react-flow helpers                           */
  /* -------------------------------------------------- */
  // Snap-to-grid for interactive moves (dragging etc.)
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      
      const GRID_SIZE = 16;
      const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;
      const snapPos = (p: { x: number; y: number }) => ({ x: snap(p.x), y: snap(p.y) });

      const snappedChanges = changes.map((ch) => {
        if (ch.type === 'position' && (ch as any).position) {
          const pos = (ch as any).position as { x: number; y: number };
          const snapped = snapPos(pos);
          return { ...ch, position: snapped } as NodeChange;
        }
        return ch;
      });

      setNodes((nodesState) => {
        const updated = applyNodeChanges(snappedChanges, nodesState);

        const nextViewState = viewStateRef.current
          ? {
              node: { ...(viewStateRef.current.node || {}) },
              group: { ...(viewStateRef.current.group || {}) },
              edge: { ...(viewStateRef.current.edge || {}) },
            }
          : { node: {}, group: {}, edge: {} };
        

        updated.forEach((node) => {
          // CRITICAL: Only update ViewState positions for actual position changes (user dragging)
          // NOT for structural changes (parent changes, re-renders, etc.)
          
          // Check both snapped changes AND original changes for position updates
          // Child nodes might not appear in snappedChanges but could be in original changes
          const isPositionChangeInSnapped = snappedChanges.some(
            (ch) => ch.type === 'position' && (ch as any).id === node.id
          );
          const isPositionChangeInOriginal = changes.some(
            (ch) => ch.type === 'position' && (ch as any).id === node.id
          );
          const isPositionChange = isPositionChangeInSnapped || isPositionChangeInOriginal;
          
          
          // Check if parent changed - if so, preserve existing ViewState position
          const previousNode = nodesState.find(n => n.id === node.id);
          const parentChanged = previousNode && (previousNode as any).parentId !== (node as any).parentId;
          
          // If this is a position change (user dragged), calculate absolute position
          // Otherwise, preserve existing ViewState position (especially if parent changed)
          // 
          // CRITICAL FIX: Don't update ViewState positions during user drags - let InteractiveCanvas 
          // containment detection handle it. This prevents the position from being recalculated
          // before containment logic can preserve the absolute coordinates.
          let geometry;
          const isChildNode = !!(node as any).parentId;
          
          // CRITICAL FIX: Handle position changes differently for root nodes vs child nodes
          if (isPositionChange && !parentChanged && !isChildNode) {
            // ROOT NODE being dragged - skip ViewState update, let containment detection handle it
            
            // CRITICAL: Read dimensions from viewStateRef.current (live), not nextViewState (snapshot)
            // This ensures we get the latest dimensions if they were updated by handleGroupResize
            const liveGeom = viewStateRef.current?.node?.[node.id] || viewStateRef.current?.group?.[node.id];
            const existingGeom = nextViewState.node[node.id] || nextViewState.group?.[node.id];
            
            // Use live dimensions if available, otherwise fall back to snapshot
            const finalW = liveGeom?.w ?? existingGeom?.w ?? (node.data as any)?.width ?? (node.style as any)?.width ?? 96;
            const finalH = liveGeom?.h ?? existingGeom?.h ?? (node.data as any)?.height ?? (node.style as any)?.height ?? 96;
            
            // CRITICAL: Preserve dimensions from ReactFlow node (which has the resized dimensions)
            // The node.style.width/height are updated by the resize handler
            const rfWidth = (node.style as any)?.width ?? (node.data as any)?.width;
            const rfHeight = (node.style as any)?.height ?? (node.data as any)?.height;
            
            // Use ReactFlow dimensions if they're larger than defaults (indicates resize happened)
            const preservedW = (rfWidth && rfWidth > 200) ? rfWidth : finalW;
            const preservedH = (rfHeight && rfHeight > 150) ? rfHeight : finalH;
            
            if (node.type === 'group' && nextViewState.group[node.id]) {
              nextViewState.group[node.id].w = preservedW;
              nextViewState.group[node.id].h = preservedH;
            }
            if (nextViewState.node[node.id]) {
              nextViewState.node[node.id].w = preservedW;
              nextViewState.node[node.id].h = preservedH;
            }
            
            if (existingGeom) {
              geometry = {
                ...existingGeom,
                w: finalW,
                h: finalH,
              };
            } else {
              // Fallback for new nodes
              geometry = {
                x: node.position?.x ?? 0,
                y: node.position?.y ?? 0,
                w: (node.data as any)?.width ?? (node.style as any)?.width ?? 96,
                h: (node.data as any)?.height ?? (node.style as any)?.height ?? 96,
              };
            }
          } else if (isPositionChange && !parentChanged && isChildNode) {
            // CHILD NODE being dragged - convert relative position to absolute
            let absoluteX = node.position?.x ?? 0;
            let absoluteY = node.position?.y ?? 0;
            
            if ((node as any).parentId) {
              const parentGeom = nextViewState.group?.[(node as any).parentId];
              if (parentGeom) {
                absoluteX += parentGeom.x;
                absoluteY += parentGeom.y;
              }
            }
            
            // Check both node and group stores for existing geometry (groups are stored in group store)
            // CRITICAL: Read dimensions from viewStateRef.current (live), not nextViewState (snapshot)
            const liveGeom = viewStateRef.current?.node?.[node.id] || viewStateRef.current?.group?.[node.id];
            const existingGeom = nextViewState.node[node.id] || nextViewState.group?.[node.id];
            
            // Use live dimensions if available, otherwise fall back to snapshot
            const finalW = liveGeom?.w ?? existingGeom?.w ?? (node.data as any)?.width ?? (node.style as any)?.width ?? 96;
            const finalH = liveGeom?.h ?? existingGeom?.h ?? (node.data as any)?.height ?? (node.style as any)?.height ?? 96;
            
            geometry = {
              x: absoluteX,
              y: absoluteY,
              w: finalW,
              h: finalH,
            };
          } else {
            // Not a position change OR parent changed - preserve existing ViewState position
            const existingGeom = nextViewState.node[node.id] || nextViewState.group?.[node.id];
            
            if (existingGeom) {
              // Preserve absolute position from ViewState
              geometry = {
                ...existingGeom,
                w: existingGeom.w ?? (node.data as any)?.width ?? (node.style as any)?.width ?? 96,
                h: existingGeom.h ?? (node.data as any)?.height ?? (node.style as any)?.height ?? 96,
              };
              
              if (parentChanged) {
              }
            } else {
              // New node - calculate absolute position
              let absoluteX = node.position?.x ?? 0;
              let absoluteY = node.position?.y ?? 0;
              
              if ((node as any).parentId) {
                const parentGeom = nextViewState.group?.[(node as any).parentId];
                if (parentGeom) {
                  absoluteX += parentGeom.x;
                  absoluteY += parentGeom.y;
                }
              }
              
              geometry = {
                x: absoluteX,
                y: absoluteY,
                w: (node.data as any)?.width ?? (node.style as any)?.width ?? 96,
                h: (node.data as any)?.height ?? (node.style as any)?.height ?? 96,
              };
            }
          }

          nextViewState.node[node.id] = geometry;

          if (node.type === 'group') {
            nextViewState.group[node.id] = geometry;
          }
        });

        viewStateRef.current = nextViewState;

        if (process.env.NODE_ENV !== 'production') {
          const movedIds = snappedChanges
            .filter((ch) => ch.type === 'position' && (ch as any).id)
            .map((ch: any) => ch.id);
          if (movedIds.length > 0) {
            console.debug('[FREE Mode] Updated viewState from node move', {
              movedIds,
              snapshot: movedIds.slice(0, 3).map((id) => nextViewState.node[id]),
            });
          }
        }

        return updated;
      });
    },
    []
  );
  
  const onEdgesChange = useCallback(
    (c: EdgeChange[]) => setEdges(e => applyEdgeChanges(c, e)), []);
  
  // Track pending connections to prevent duplicates
  const pendingConnectionsRef = useRef<Set<string>>(new Set());
  // Track pending edge IDs to prevent duplicate edge creation
  const pendingEdgeIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__elkState = {
        rawGraph,
        layoutGraph,
        nodes,
        edges,
        viewStateRef,
      };
    }
  }, [rawGraph, layoutGraph, nodes, edges]);
  
  const onConnect: OnConnect = useCallback(({ source, target, sourceHandle, targetHandle }: Connection) => {
    if (!source || !target) {
      return;
    }

    const connectionKey = `${source}:${sourceHandle || ''}->${target}:${targetHandle || ''}`;
    if (pendingConnectionsRef.current.has(connectionKey)) {
      return;
    }

    pendingConnectionsRef.current.add(connectionKey);

    const counter = Date.now();
    const random = Math.random().toString(36).slice(2, 11);
    const id = `edge-${counter}-${random}`;

    if (pendingEdgeIdsRef.current.has(id)) {
      pendingConnectionsRef.current.delete(connectionKey);
      return;
    }

    pendingEdgeIdsRef.current.add(id);

    try {
      handlers.handleAddEdge(id, source, target, undefined, sourceHandle || undefined, targetHandle || undefined);
      
      // Also update React Flow edges directly for FREE mode (ELK hook skips user mutations)
      const newEdge: Edge = {
        id,
        source,
        target,
        sourceHandle: sourceHandle || undefined,
        targetHandle: targetHandle || undefined,
        type: 'step',
        data: {
          sourcePosition: sourceHandle?.includes('top') ? 'top' : 
                          sourceHandle?.includes('bottom') ? 'bottom' :
                          sourceHandle?.includes('left') ? 'left' : 'right',
          targetPosition: targetHandle?.includes('top') ? 'top' :
                          targetHandle?.includes('bottom') ? 'bottom' :
                          targetHandle?.includes('left') ? 'left' : 'right',
        },
      };
      setEdges((eds) => [...eds, newEdge]);
    } catch (error) {
      console.error('❌ [onConnect] Failed to create edge:', error);
      pendingConnectionsRef.current.delete(connectionKey);
      pendingEdgeIdsRef.current.delete(id);
      throw error;
    }

    setTimeout(() => {
      pendingConnectionsRef.current.delete(connectionKey);
      pendingEdgeIdsRef.current.delete(id);
    }, 100);
  }, [handlers]);
  
  /* -------------------------------------------------- */
  /* 🔹 7. public API                                   */
  /* -------------------------------------------------- */
  return {
    rawGraph, layoutGraph, layoutError, nodes, edges, layoutVersion,
    setRawGraph, setNodes, setEdges,
    viewStateRef, rawGraphRef,
    shouldSkipFitViewRef,  // Expose ref so InteractiveCanvas can check if fitView should be skipped
    ...handlers,
    onNodesChange, onEdgesChange, onConnect,
    handleAddNodeLegacy: handleAddNodeLegacy,
    handleLabelChange,
  } as const;
}
