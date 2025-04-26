import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  Node,
  Edge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  MarkerType,
  Connection,
  OnConnect
} from "reactflow";

import { ensureIds, processLayoutedGraph, structuralHash } from "../components/graph/utils";
import {
  addNode,
  deleteNode,
  moveNode,
  addEdge,
  deleteEdge,
  groupNodes,
  removeGroup,
} from "../components/graph/elk/mutations";

/**
 * React hook that wires ELK.js layout with React‑Flow.
 * It holds the ELK engine instance and manages graph state, layout, nodes & edges.
 */
export function useElkFlow(initialGraph: any) {
  /* ------------------------------------------------------------------
   * State – ELK graph, layout, react‑flow nodes/edges, layout version
   * ------------------------------------------------------------------ */
  const [elkGraph, setElkGraph] = useState<any>(initialGraph);
  const [layoutedElkGraph, setLayoutedElkGraph] = useState<any>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [layoutVersion, setLayoutVersion] = useState(0);

  /* ------------------------------------------------------------------
   * Stable ELK instance + prev refs for memoized comparisons
   * ------------------------------------------------------------------ */
  const elk = useMemo(() => new ELK(), []);
  const prevElkGraphRef = useRef<string>("");
  const prevLayoutResultRef = useRef<any>(null);

  /* ------------------------------------------------------------------
   * Graph Operation Handlers
   * ------------------------------------------------------------------ */
  type MutFn = (...a: any[]) => any;

  const mutate = useCallback(
    (label: string, fn: MutFn, ...args: any[]) => {
      try {
        console.log(`🔧 ${label}`, ...args);
        setElkGraph((g0: any) => {
          const g1 = fn(...args, g0);      // call the real mutation
          return structuredClone(g1);      // cheap deep-clone (browser native)
        });
      } catch (err) {
        console.error(`❌ ${label}`, err);
      }
    }, []);

  const handleAddNode = useCallback((nodeName: string, parentId: string) => {
    return mutate("Adding node", addNode, nodeName, parentId);
  }, [mutate]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    return mutate("Deleting node", deleteNode, nodeId);
  }, [mutate]);

  const handleMoveNode = useCallback((nodeId: string, newParentId: string) => {
    return mutate("Moving node", moveNode, nodeId, newParentId);
  }, [mutate]);

  const handleAddEdge = useCallback((edgeId: string, sourceId: string, targetId: string) => {
    return mutate("Adding edge", addEdge, edgeId, null, sourceId, targetId);
  }, [mutate]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    return mutate("Deleting edge", deleteEdge, edgeId);
  }, [mutate]);

  const handleGroupNodes = useCallback((nodeIds: string[], parentId: string, groupId: string) => {
    return mutate("Grouping nodes", groupNodes, nodeIds, parentId, groupId);
  }, [mutate]);

  const handleRemoveGroup = useCallback((groupId: string) => {
    return mutate("Removing group", removeGroup, groupId);
  }, [mutate]);

  /* ------------------------------------------------------------------
   * Node / Edge change handlers for React‑Flow
   * ------------------------------------------------------------------ */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    []
  );

  /* ------------------------------------------------------------------
   * React‑Flow onConnect handler – creates an ELK edge then triggers layout
   * ------------------------------------------------------------------ */
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      // Skip if source or target is null
      if (!connection.source || !connection.target) return;
      
      const newEdgeId = `edge-${Math.random().toString(36).substr(2, 9)}`;
      const source = connection.source as string;
      const target = connection.target as string;
      
      handleAddEdge(newEdgeId, source, target);
    },
    [handleAddEdge]
  );

  /* ------------------------------------------------------------------
   * Layout effect – whenever elkGraph changes, run ELK layout then convert
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (!elkGraph) return;

    const runLayout = async () => {
      try {
        const graphCopy = structuredClone(elkGraph);
        
        // 1. Apply ensureIds to guarantee all arrays exist for proper hash comparison
        const graphWithOptions = ensureIds(graphCopy);
        
        // 2. Compute hash AFTER structure is guaranteed by ensureIds
        const hash = structuralHash(graphWithOptions);
        if (hash === prevElkGraphRef.current) return;
        prevElkGraphRef.current = hash;

        const layoutResult = await elk.layout(graphWithOptions);
        console.log('ELK Layout Result:', layoutResult);
        prevLayoutResultRef.current = layoutResult;
        setLayoutedElkGraph(layoutResult);
        setLayoutVersion((v) => v + 1);

        const { nodes: rfNodes, edges: rfEdges } = processLayoutedGraph(layoutResult);
        setNodes(rfNodes);
        setEdges(rfEdges);
      } catch (err) {
        console.error("ELK layout error", err);
      }
    };

    runLayout();
  }, [elkGraph, elk]);

  /* ------------------------------------------------------------------
   * Public API returned by the hook
   * ------------------------------------------------------------------ */
  return {
    /* state */
    elkGraph,
    nodes,
    edges,
    layoutVersion,

    /* setters */
    setEdges,
    setNodes,
    setElkGraph,

    /* graph operations */
    handleAddNode,
    handleDeleteNode,
    handleMoveNode,
    handleAddEdge,
    handleDeleteEdge,
    handleGroupNodes,
    handleRemoveGroup,

    /* react‑flow handlers */
    onConnect,
    onNodesChange,
    onEdgesChange,
  } as const;
} 