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
  /* 1) raw‐graph state */
  const [rawGraph, setRawGraph] = useState<RawGraph>(initialRaw);
  
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
  
  const handleAddNode = useCallback(
    (groupId: string) => {
      const newNodeId = `new-node-${Date.now()}`;
      const newNode = {
        id: newNodeId,
        data: { label: 'New Node', isEditing: true },
        position: { x: 20, y: 20 },
        type: 'custom',
        parentNode: groupId,
        extent: 'parent',
      };
      setNodes((nds) => nds.concat(newNode));
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
    onNodesChange, onEdgesChange, onConnect,
    handleAddNode,
    handleLabelChange,
  } as const;
}
