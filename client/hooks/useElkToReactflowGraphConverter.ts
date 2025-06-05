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
  batchUpdate
} from "../components/graph/mutations";

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
export function useElkToReactflowGraphConverter(initialRaw: RawGraph) {
  /* 1) raw‐graph state
   *    Load from localStorage if available so the canvas persists
   *    between session restarts. Fallback to the provided initial graph.
   */
  const [rawGraph, setRawGraph] = useState<RawGraph>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('elkGraph');
      if (stored) {
        try {
          return JSON.parse(stored) as RawGraph;
        } catch (e) {
          console.warn('Failed to parse stored graph, using initialRaw');
        }
      }
    }
    return initialRaw;
  });
  
  /* 2) layouted‐graph state */
  const [layoutGraph, setLayoutGraph] = useState<LayoutGraph|null>(null);
  
  /* refs that NEVER cause re-render */
  const hashRef = useRef<string>(structuralHash(initialRaw));
  const abortRef = useRef<AbortController | null>(null);
  
  /* react-flow state */
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [layoutVersion, incLayoutVersion] = useState(0);
  
  /* -------------------------------------------------- */
  /* 🔹 3. mutate helper (sync hash update)              */
  /* -------------------------------------------------- */
  type MutFn = (...a: any[]) => any;
  
  const mutate = useCallback((fn: MutFn, ...a: any[]) => {
    setRawGraph(prev => {
      const next = fn(...a, prev) as RawGraph;
      hashRef.current = structuralHash(next);       // hash before layout
      return next;                                  // triggers useEffect
    });
  }, []);

  /* Persist rawGraph to localStorage whenever it changes so that
   * the latest graph is restored on the next session start.
   */
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('elkGraph', JSON.stringify(rawGraph));
      } catch (e) {
        console.warn('Failed to store graph in localStorage');
      }
    }
  }, [rawGraph]);
  
  /* -------------------------------------------------- */
  /* 🔹 4.  exposed handlers                            */
  /* -------------------------------------------------- */
  const handlers = useMemo(() => ({
    handleAddNode     : (...a: any[]) => mutate(addNode,      ...a),
    handleDeleteNode  : (...a: any[]) => mutate(deleteNode,   ...a),
    handleMoveNode    : (...a: any[]) => mutate(moveNode,     ...a),
    handleAddEdge     : (...a: any[]) => mutate(addEdge,      ...a),
    handleDeleteEdge  : (...a: any[]) => mutate(deleteEdge,   ...a),
    handleGroupNodes  : (...a: any[]) => mutate(groupNodes,   ...a),
    handleRemoveGroup : (...a: any[]) => mutate(removeGroup,  ...a),
    handleBatchUpdate : (...a: any[]) => mutate(batchUpdate,  ...a),
  }), [mutate]);
  
  /* -------------------------------------------------- */
  /* 🔹 5. layout side-effect                           */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!rawGraph) return;
    
    /* cancel any in-flight run */
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    
    const hashAtStart = hashRef.current;
    
    (async () => {
      try {
        // 1) inject IDs + elkOptions onto a clone of rawGraph
        const prepared = ensureIds(structuredClone(rawGraph));
        
        // 2) run ELK
        const layout = await elk.layout(prepared);
        console.groupCollapsed(`[ELK] layout OK   (nodes ${layout.children?.length ?? 0}, edges ${layout.edges?.length ?? 0})`);
        console.log(layout);
        console.groupEnd();
        
        /* stale result? – ignore */
        if (hashAtStart !== hashRef.current) return;
        
        // 3) store for SVG & RF conversion
        setLayoutGraph(layout as LayoutGraph);
        
        // 4) convert to ReactFlow nodes/edges
        const { nodes: rfNodes, edges: rfEdges } =
          processLayoutedGraph(layout, {
            width      : NON_ROOT_DEFAULT_OPTIONS.width,
            height     : NON_ROOT_DEFAULT_OPTIONS.height,
            groupWidth : NON_ROOT_DEFAULT_OPTIONS.width  * 3,
            groupHeight: NON_ROOT_DEFAULT_OPTIONS.height * 3,
            padding    : 10
          });
        
        setNodes(rfNodes);
        setEdges(rfEdges);
        incLayoutVersion(v => v + 1);
      } catch (e: any) {
        if (e.name !== "AbortError")
          console.error("[ELK] layout failed", e);
      }
    })();
    
    return () => ac.abort();
  }, [rawGraph]);
  
  /* -------------------------------------------------- */
  /* 🔹 6. react-flow helpers                           */
  /* -------------------------------------------------- */
  const onNodesChange = useCallback(
    (c: NodeChange[]) => setNodes(n => applyNodeChanges(c, n)), []);
  
  const onEdgesChange = useCallback(
    (c: EdgeChange[]) => setEdges(e => applyEdgeChanges(c, e)), []);
  
  const onConnect: OnConnect = useCallback(({ source, target }: Connection) => {
    if (!source || !target) return;
    const id = `edge-${Math.random().toString(36).slice(2, 9)}`;
    handlers.handleAddEdge(id, source, target);
  }, [handlers]);
  
  /* -------------------------------------------------- */
  /* 🔹 7. public API                                   */
  /* -------------------------------------------------- */
  return {
    rawGraph, layoutGraph, nodes, edges, layoutVersion,
    setRawGraph, setNodes, setEdges,
    ...handlers,
    onNodesChange, onEdgesChange, onConnect
  } as const;
}
