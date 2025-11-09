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
import { processLayoutedGraph } from "../components/graph/utils/toReactFlow";

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
  const viewStateRef = useRef<{ node: Record<string, { x: number; y: number; w: number; h: number }>; group: Record<string, { x: number; y: number; w: number; h: number }>; edge: Record<string, { waypoints?: Array<{ x: number; y: number }> }> }>({
    node: {},
    group: {},
    edge: {},
  });
  
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
      const next = fn(...rest, prev) as RawGraph;
      
      // Store mutation context for the layout effect to use
      lastMutationRef.current = {
        source: options.source || 'user',
        scopeId: options.scopeId || 'root',
        timestamp: Date.now()
      };
      
      hashRef.current = structuralHash(next);
      return next;
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
  
  // deleteNode expects: (nodeId, graph)
  // mutate calls: (nodeId, graph) - already correct
  
  // addEdge expects: (edgeId, sourceId, targetId, labelOrGraph?, sourceHandle?, targetHandle?, graph?)
  // mutate calls: (edgeId, sourceId, targetId, label?, sourceHandle?, targetHandle?, graph)
  // Create a wrapper that checks for duplicate edge IDs before calling addEdge
  const addEdgeWrapper = (edgeId: string, sourceId: string, targetId: string, label: any, sourceHandle: any, targetHandle: any, graph: RawGraph) => {
    console.log('📦 [addEdgeWrapper] Called with:', { edgeId, sourceId, targetId, label, sourceHandle, targetHandle, graphChildren: graph.children?.length || 0, graphEdges: graph.edges?.length || 0 });
    
    // Check if edge already exists BEFORE calling addEdge
    // This prevents duplicate edge creation even if mutate is called multiple times
    const exists = edgeIdExists(graph, edgeId);
    console.log('🔍 [addEdgeWrapper] Edge exists check:', { edgeId, exists });
    
    if (exists) {
      // Edge already exists, return graph unchanged (idempotent)
      console.log('⚠️ [addEdgeWrapper] Edge already exists, returning graph unchanged');
      return graph;
    }
    
    console.log('✅ [addEdgeWrapper] Edge does not exist, calling addEdge');
    const result = addEdge(edgeId, sourceId, targetId, label, sourceHandle, targetHandle, graph);
    console.log('✅ [addEdgeWrapper] addEdge returned, new graph has', result.children?.length || 0, 'children,', result.edges?.length || 0, 'edges');
    console.log('📊 [addEdgeWrapper] Graph edges:', result.edges?.map(e => ({ id: e.id, sources: e.sources, targets: e.targets })) || []);
    return result;
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
    handleGroupNodes  : (...a: any[]) => mutate(groupNodes,    ...a),
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
  const setRawGraph = useCallback((next: RawGraph | ((prev: RawGraph) => RawGraph)) => {
    setRawGraphState(prev => {
      const resolved = typeof next === 'function'
        ? (next as (p: RawGraph) => RawGraph)(prev)
        : next;

      // Treat external setRawGraph calls as AI-sourced updates so ELK runs
      lastMutationRef.current = {
        source: 'ai',
        scopeId: 'external-setRawGraph',
        timestamp: Date.now(),
      };

      hashRef.current = structuralHash(resolved);
      return resolved;
    });
  }, []);

  /* -------------------------------------------------- */
  /* 🔹 5. layout side-effect                           */
  /* -------------------------------------------------- */
  useEffect(() => {
    const mutation = lastMutationRef.current;
    const currentHash = hashRef.current;
    
    console.log('🔄 [useEffect] Triggered:', { 
      hasRawGraph: !!rawGraph, 
      currentHash, 
      previousHash: previousHashRef.current,
      hashChanged: currentHash !== previousHashRef.current
    });
    
    if (!rawGraph) return;
    
    // Skip processing if rawGraph hash hasn't changed
    // Only process when the graph structure actually changes, not when selectedTool changes
    if (currentHash === previousHashRef.current) {
      console.log('⏭️ [useEffect] Skipping - graph unchanged');
      return;
    }
    
    console.log('✅ [useEffect] Processing graph - hash changed');
    // Update ref to track current hash
    previousHashRef.current = currentHash;
    
    // 🔥 POLICY GATE: Decide if ELK should run based on source and mode
    const shouldRunELK = (() => {
      if (!mutation) {
        return true; // Initial load or unknown trigger
      }
      
      if (mutation.source === 'ai') {
        return true; // AI always triggers ELK
      }
      
      if (mutation.source === 'user') {
        return false; // User edits in FREE mode = no ELK
      }
      
      return false;
    })();
    
    
    if (!shouldRunELK) {
      // User drew a node in FREE mode - create ReactFlow nodes directly from domain + ViewState
      try {
        // Create ReactFlow nodes from domain graph children using ViewState positions
        const rfNodes: Node[] = [];
        const rfEdges: Edge[] = [];
        
        // Determine which node is newly created by finding the node ID that matches the mutation pattern
        let newlyCreatedNodeId: string | null = null;
        
        if (mutation && Date.now() - mutation.timestamp < 100) {
          // Extract timestamp from the node ID that was just created
          const mutationTime = mutation.timestamp;
          newlyCreatedNodeId = (rawGraph.children || []).find(node => {
            // Node IDs are in format: user-node-{timestamp}
            const idTimestamp = parseInt(node.id.split('-').pop() || '0');
            return Math.abs(idTimestamp - mutationTime) < 10; // Allow small timing difference
          })?.id || null;
        }
          

        // Process nodes from domain graph
        (rawGraph.children || []).forEach((domainNode: any) => {
          const viewState = viewStateRef.current?.node?.[domainNode.id];
          const position = viewState ? { x: viewState.x, y: viewState.y } : { x: 0, y: 0 };
          const widthFromView = viewState?.w;
          const heightFromView = viewState?.h;
          const isGroupNode = domainNode.data?.isGroup === true;
          const nodeWidth = widthFromView ?? (isGroupNode ? 480 : 96);
          const nodeHeight = heightFromView ?? (isGroupNode ? 320 : 96);

          // Always select newly created nodes (tool will switch to 'arrow' after creation)
          const isNewlyCreated = domainNode.id === newlyCreatedNodeId;
          const shouldSelect = isNewlyCreated;

          const baseStyle =
            isGroupNode
              ? {
                  width: nodeWidth,
                  height: nodeHeight,
                  backgroundColor: 'transparent',
                  border: 'none',
                  display: 'flex',
                  justifyContent: 'flex-start',
                  alignItems: 'flex-start',
                  padding: '0px',
                  pointerEvents: 'auto' as const,
                }
              : {
                  pointerEvents: 'auto' as const,
                };

          const rfNode: Node = {
            id: domainNode.id,
            type: isGroupNode ? 'group' : 'custom',
            position,
            data: {
              label: domainNode.labels?.[0]?.text || domainNode.id,
              width: nodeWidth,
              height: nodeHeight,
              isEditing: domainNode.data?.label === '', // Auto-edit if empty label
              ...domainNode.data,
            },
            zIndex: isGroupNode ? CANVAS_STYLES.zIndex.groups : CANVAS_STYLES.zIndex.nodes,
            selected: shouldSelect, // Only select if tool allows it
            draggable: true,
            style: baseStyle,
          };

          rfNodes.push(rfNode);
        });
        
        // Process edges from domain graph
        console.log('🔗 [FREE Mode] Processing edges from domain graph:', rawGraph.edges?.length || 0);
        console.log('🔗 [FREE Mode] rawGraph.edges:', rawGraph.edges);
        console.log('🔗 [FREE Mode] rawGraph hash:', JSON.stringify(rawGraph).substring(0, 200));
        
        if (rawGraph.edges && rawGraph.edges.length > 0) {
          rawGraph.edges.forEach((edge: any) => {
            console.log('🔗 [FREE Mode] Processing edge:', { id: edge.id, sources: edge.sources, targets: edge.targets, data: edge.data });
            
            // Create ReactFlow edge
            edge.sources?.forEach((sourceId: string) => {
              edge.targets?.forEach((targetId: string) => {
                const rfEdge: Edge = {
                  id: edge.id,
                  source: sourceId,
                  target: targetId,
                  sourceHandle: edge.data?.sourceHandle,
                  targetHandle: edge.data?.targetHandle,
                  type: 'step',
                  zIndex: CANVAS_STYLES.zIndex.edges,
                };
                rfEdges.push(rfEdge);
                console.log('✅ [FREE Mode] Created ReactFlow edge:', rfEdge);
              });
            });
          });
        } else {
          console.warn('⚠️ [FREE Mode] No edges in rawGraph.edges! rawGraph:', JSON.stringify(rawGraph).substring(0, 500));
        }
        
        console.log('✅ [FREE Mode] Created ReactFlow elements:', { nodes: rfNodes.length, edges: rfEdges.length });
        
        setNodes(rfNodes);
        // CRITICAL: Preserve existing edges when updating - merge with existing edges
        // This prevents edges from being lost when onSelectionChange updates styling
        setEdges((currentEdges) => {
          console.log('🔀 [FREE Mode] setEdges called - currentEdges:', currentEdges.length, 'rfEdges:', rfEdges.length);
          console.log('🔀 [FREE Mode] Current edge IDs:', currentEdges.map(e => e.id));
          console.log('🔀 [FREE Mode] Graph edge IDs:', rfEdges.map(e => e.id));
          
          // Create a map of edges from the graph (source of truth)
          const graphEdgeMap = new Map(rfEdges.map(e => [e.id, e]));
          
          // Merge existing edges with graph edges, preserving styling
          const existingEdgeMap = new Map(currentEdges.map(e => [e.id, e]));
          const mergedEdges = rfEdges.map(newEdge => {
            const existingEdge = existingEdgeMap.get(newEdge.id);
            if (existingEdge) {
              // Preserve styling from existing edge, but update source/target/handles
              console.log('🔀 [FREE Mode] Merging existing edge:', newEdge.id);
              return {
                ...existingEdge,
                ...newEdge,
                style: existingEdge.style, // Preserve styling
              };
            }
            console.log('🔀 [FREE Mode] Adding new edge:', newEdge.id);
            return newEdge;
          });
          
          // Also keep edges that exist in ReactFlow but not in graph (they might have been removed)
          // Actually, we should remove edges that aren't in the graph anymore
          // But preserve edges that are in the graph
          console.log('🔀 [FREE Mode] Merged edges result:', { existing: currentEdges.length, new: rfEdges.length, merged: mergedEdges.length });
          console.log('🔀 [FREE Mode] Merged edge IDs:', mergedEdges.map(e => e.id));
          return mergedEdges;
        });
        
        // Skip fitView for user-created nodes in FREE mode (they're placed at cursor)
        shouldSkipFitViewRef.current = true;
        
        incLayoutVersion(v => v + 1);
        
      } catch (error) {
        console.error('[FREE Mode] Failed to create ReactFlow elements:', error);
      }
      
      return;
    }
    
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
        
        // 1) inject IDs + elkOptions onto a clone of rawGraph
        const prepared = ensureIds(structuredClone(rawGraph));
        
        
        // 2) run ELK
        const layout = await elk.layout(prepared);
        
        
        /* stale result? – ignore */
        if (hashAtStart !== hashRef.current) return;
        
        // 3) store for SVG & RF conversion
        setLayoutGraph(layout as LayoutGraph);
        
        // 4) convert to ReactFlow nodes/edges
        const { nodes: rfNodes, edges: rfEdges } =
          processLayoutedGraph(layout, {
            width      : NON_ROOT_DEFAULT_OPTIONS.width,
            height     : 96, // Default node height since NON_ROOT_DEFAULT_OPTIONS.height was removed
            groupWidth : NON_ROOT_DEFAULT_OPTIONS.width  * 3,
            groupHeight: 96 * 3, // Use default height * 3
            padding    : 10
          });
        

        setNodes(rfNodes);
        setEdges(rfEdges);

        // Populate viewStateRef from ELK output (no behavior change)
        const nextNodeState: Record<string, { x: number; y: number; w: number; h: number }> = {};
        const nextGroupState: Record<string, { x: number; y: number; w: number; h: number }> = {};
        for (const n of rfNodes) {
          const geom = { x: n.position.x, y: n.position.y, w: (n as any).width ?? 0, h: (n as any).height ?? 0 };
          // Heuristic: treat nodes with type 'group' as groups; others as nodes
          if ((n as any).type === 'group') {
            nextGroupState[n.id] = geom;
          } else {
            nextNodeState[n.id] = geom;
          }
        }
        viewStateRef.current = { node: nextNodeState, group: nextGroupState, edge: {} };
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
          return { ...ch, position: snapPos(pos) } as NodeChange;
        }
        return ch;
      });

      setNodes((nodesState) => applyNodeChanges(snappedChanges, nodesState));
    },
    []
  );
  
  const onEdgesChange = useCallback(
    (c: EdgeChange[]) => setEdges(e => applyEdgeChanges(c, e)), []);
  
  // Track pending connections to prevent duplicates
  const pendingConnectionsRef = useRef<Set<string>>(new Set());
  // Track pending edge IDs to prevent duplicate edge creation
  const pendingEdgeIdsRef = useRef<Set<string>>(new Set());
  
  const onConnect: OnConnect = useCallback(({ source, target, sourceHandle, targetHandle }: Connection) => {
    console.log('🔗 [onConnect] Called:', { source, target, sourceHandle, targetHandle });
    
    if (!source || !target) {
      console.log('❌ [onConnect] Missing source or target, returning');
      return;
    }
    
    // Create a unique key for this connection attempt
    const connectionKey = `${source}:${sourceHandle || ''}->${target}:${targetHandle || ''}`;
    console.log('🔑 [onConnect] Connection key:', connectionKey);
    
    // Check if this connection is already pending
    if (pendingConnectionsRef.current.has(connectionKey)) {
      console.log('⚠️ [onConnect] Duplicate connection attempt ignored (pending):', connectionKey);
      return;
    }
    
    // Mark as pending
    pendingConnectionsRef.current.add(connectionKey);
    console.log('✅ [onConnect] Marked connection as pending:', connectionKey);
    
    // Generate unique edge ID with timestamp and counter to avoid collisions
    const counter = Date.now();
    const random = Math.random().toString(36).slice(2, 11);
    const id = `edge-${counter}-${random}`;
    console.log('🆔 [onConnect] Generated edge ID:', id);
    
    // Check if this edge ID is already being created
    if (pendingEdgeIdsRef.current.has(id)) {
      console.log('⚠️ [onConnect] Edge ID already pending, removing from pending connections');
      pendingConnectionsRef.current.delete(connectionKey);
      return;
    }
    
    // Mark edge ID as pending
    pendingEdgeIdsRef.current.add(id);
    console.log('✅ [onConnect] Marked edge ID as pending:', id);
    
    try {
      // Pass handle IDs to addEdge if they're connector handles
      // Note: mutate automatically passes graph as the last parameter, so we pass: edgeId, sourceId, targetId, label?, sourceHandle?, targetHandle?
      console.log('🚀 [onConnect] Calling handleAddEdge with:', { id, source, target, sourceHandle, targetHandle });
      handlers.handleAddEdge(id, source, target, undefined, sourceHandle || undefined, targetHandle || undefined);
      console.log('✅ [onConnect] handleAddEdge called successfully');
    } catch (error) {
      // If edge creation fails (e.g., duplicate), remove from pending
      console.error('❌ [onConnect] Failed to create edge:', error);
      pendingConnectionsRef.current.delete(connectionKey);
      pendingEdgeIdsRef.current.delete(id);
      throw error;
    }
    
    // Remove from pending after a short delay (edge should be created by then)
    setTimeout(() => {
      pendingConnectionsRef.current.delete(connectionKey);
      pendingEdgeIdsRef.current.delete(id);
      console.log('🧹 [onConnect] Cleaned up pending refs for:', { connectionKey, id });
    }, 100);
  }, [handlers]);
  
  /* -------------------------------------------------- */
  /* 🔹 7. public API                                   */
  /* -------------------------------------------------- */
  return {
    rawGraph, layoutGraph, layoutError, nodes, edges, layoutVersion,
    setRawGraph, setNodes, setEdges,
    viewStateRef,
    shouldSkipFitViewRef,  // Expose ref so InteractiveCanvas can check if fitView should be skipped
    ...handlers,
    onNodesChange, onEdgesChange, onConnect,
    handleAddNodeLegacy: handleAddNodeLegacy,
    handleLabelChange,
  } as const;
}
