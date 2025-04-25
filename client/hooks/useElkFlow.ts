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

import { ensureIds, processLayoutedGraph } from "../components/graph/utils";
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
  const handleAddNode = useCallback((nodeName: string, parentId: string) => {
    try {
      console.log(`🔧 Adding node ${nodeName} under parent ${parentId}`);
      const updatedGraph = addNode(nodeName, parentId, elkGraph);
      setElkGraph(updatedGraph);
      console.log(`✅ Node added successfully`);
      return updatedGraph;
    } catch (error) {
      console.error(`❌ Error adding node:`, error);
      throw error;
    }
  }, [elkGraph]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    try {
      console.log(`🔧 Deleting node ${nodeId}`);
      const updatedGraph = deleteNode(nodeId, elkGraph);
      setElkGraph(updatedGraph);
      console.log(`✅ Node deleted successfully`);
      return updatedGraph;
    } catch (error) {
      console.error(`❌ Error deleting node:`, error);
      throw error;
    }
  }, [elkGraph]);

  const handleMoveNode = useCallback((nodeId: string, newParentId: string) => {
    try {
      console.log(`🔧 Moving node ${nodeId} to parent ${newParentId}`);
      const updatedGraph = moveNode(nodeId, newParentId, elkGraph);
      setElkGraph(updatedGraph);
      console.log(`✅ Node moved successfully`);
      return updatedGraph;
    } catch (error) {
      console.error(`❌ Error moving node:`, error);
      throw error;
    }
  }, [elkGraph]);

  const handleAddEdge = useCallback((edgeId: string, sourceId: string, targetId: string) => {
    try {
      console.log(`🔧 Adding edge ${edgeId} from ${sourceId} to ${targetId}`);
      const updatedGraph = addEdge(edgeId, null, sourceId, targetId, elkGraph);
      setElkGraph(updatedGraph);
      console.log(`✅ Edge added successfully`);
      return updatedGraph;
    } catch (error) {
      console.error(`❌ Error adding edge:`, error);
      throw error;
    }
  }, [elkGraph]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    try {
      console.log(`🔧 Deleting edge ${edgeId}`);
      const updatedGraph = deleteEdge(edgeId, elkGraph);
      setElkGraph(updatedGraph);
      console.log(`✅ Edge deleted successfully`);
      return updatedGraph;
    } catch (error) {
      console.error(`❌ Error deleting edge:`, error);
      throw error;
    }
  }, [elkGraph]);

  const handleGroupNodes = useCallback((nodeIds: string[], parentId: string, groupId: string) => {
    try {
      console.log(`🔧 Grouping nodes ${nodeIds.join(', ')} under ${parentId} as ${groupId}`);
      const updatedGraph = groupNodes(nodeIds, parentId, groupId, elkGraph);
      setElkGraph(updatedGraph);
      console.log(`✅ Nodes grouped successfully`);
      return updatedGraph;
    } catch (error) {
      console.error(`❌ Error grouping nodes:`, error);
      throw error;
    }
  }, [elkGraph]);

  const handleRemoveGroup = useCallback((groupId: string) => {
    try {
      console.log(`🔧 Removing group ${groupId}`);
      const updatedGraph = removeGroup(groupId, elkGraph);
      setElkGraph(updatedGraph);
      console.log(`✅ Group removed successfully`);
      return updatedGraph;
    } catch (error) {
      console.error(`❌ Error removing group:`, error);
      throw error;
    }
  }, [elkGraph]);

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
        const graphCopy = JSON.parse(JSON.stringify(elkGraph));
        const graphWithOptions = ensureIds(graphCopy);

        // Skip layout if structural hash unchanged
        const hash = JSON.stringify(graphWithOptions);
        if (hash === prevElkGraphRef.current) return;
        prevElkGraphRef.current = hash;

        const layoutResult = await elk.layout(graphWithOptions);
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