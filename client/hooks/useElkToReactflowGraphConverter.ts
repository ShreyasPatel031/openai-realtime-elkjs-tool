import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  Node, Edge,
  applyNodeChanges, applyEdgeChanges,
  NodeChange, EdgeChange,
  Connection, OnConnect
} from "reactflow";

import { ensureIds } from "../components/graph/utils/elk/ids";
import { processLayoutedGraph } from "../components/graph/utils/elk/toReactFlow";
import { structuralHash } from "../components/graph/utils/elk/structuralHash";

import {
  addNode, deleteNode, moveNode,
  addEdge, deleteEdge,
  groupNodes, removeGroup,
  batchUpdate
} from "../components/graph/elk/mutations";

import {
  NON_ROOT_DEFAULT_OPTIONS   // ← 1️⃣ single source-of-truth sizes
} from "../components/graph/elk/elkOptions";

/* -------------------------------------------------- */
/* 🔹 1.  one global ELK instance                      */
/* -------------------------------------------------- */
const elk = new ELK();

/* -------------------------------------------------- */
/* 🔹 2.  hook                                         */
/* -------------------------------------------------- */
export function useElkToReactflowGraphConverter(initialRaw: any) {
  /* normalise once so EVERY node has width/height */
  // const initial = useMemo(
  //   () => ensureIds(structuredClone(initialRaw)),
  //   []
  // );

  // const [elkGraph, setElkGraph] = useState(initial);

  const [elkGraph, setElkGraph] = useState(
    structuredClone(initialRaw)           // <- NO ensureIds, NO x/y
  );

  /* refs that NEVER cause re-render */
  const hashRef   = useRef<string>(structuralHash(initialRaw));
  const abortRef  = useRef<AbortController | null>(null);

  /* react-flow state */
  const [nodes, setNodes]   = useState<Node[]>([]);
  const [edges, setEdges]   = useState<Edge[]>([]);
  const [layoutVersion, incLayoutVersion] = useState(0);

  /* -------------------------------------------------- */
  /* 🔹 3. mutate helper (sync hash update)              */
  /* -------------------------------------------------- */
  type MutFn = (...a: any[]) => any;

  // const mutate = useCallback((fn: MutFn, ...a: any[]) => {
  //   setElkGraph((prev: any) => {
  //     const next = ensureIds(structuredClone(fn(...a, prev)));
  //     hashRef.current = structuralHash(next);   // ← **sync** update
  //     return next;                              // triggers useEffect
  //   });
  // }, []);

  const mutate = useCallback((fn: MutFn, ...a: any[]) => {
    setElkGraph((prev: any) => {
      const next = structuredClone(fn(...a, prev)); // still *minimal*
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

  

  /* -------------------------------------------------- */
  /* 🔹 5. layout side-effect                           */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!elkGraph) return;

    /* cancel any in-flight run */
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const hashAtStart = hashRef.current;

    (async () => {
      try {
        console.group(`[ELK Hook] layoutVersion ${layoutVersion}`);
        const layoutInput = ensureIds(structuredClone(elkGraph));
        console.log('elkGraph ➜ layout IN:', layoutInput);
        const layout = await elk.layout(layoutInput);
        console.log('elk.layout OUT:', layout);

        /* stale result? – ignore */
        if (hashAtStart !== hashRef.current) return;

        const { nodes: rfNodes, edges: rfEdges } =
          processLayoutedGraph(layout, {
            width      : NON_ROOT_DEFAULT_OPTIONS.width,
            height     : NON_ROOT_DEFAULT_OPTIONS.height,
            groupWidth : NON_ROOT_DEFAULT_OPTIONS.width  * 3,
            groupHeight: NON_ROOT_DEFAULT_OPTIONS.height * 3,
            padding    : 10
          });
        console.log('→ converted to RF nodes/edges:', rfNodes, rfEdges);

        setNodes(rfNodes);
        setEdges(rfEdges);
        incLayoutVersion(v => v + 1);
        console.groupEnd();
      } catch (e: any) {
        if (e.name !== "AbortError")
          console.error("[ELK] layout failed", e);
      }
    })();

    return () => ac.abort();
  }, [elkGraph]);

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
    elkGraph, nodes, edges, layoutVersion,
    setElkGraph, setNodes, setEdges,
    ...handlers,
    onNodesChange, onEdgesChange, onConnect
  } as const;
  
}
