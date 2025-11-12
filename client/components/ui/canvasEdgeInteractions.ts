import { useCallback, useMemo } from "react";
import type { Connection, Node, OnConnectStartParams, ReactFlowInstance } from "reactflow";
import { EdgeLabelRenderer } from "reactflow";
import type { MutableRefObject } from "react";

interface Coordinate {
  x: number;
  y: number;
}

export interface EdgeInteractionParams {
  selectedTool: string;
  setSelectedTool: (tool: string) => void;
  selectedNodes: Node[];
  setSelectedNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  connectingFrom: string | null;
  connectingFromHandle: string | null;
  setConnectingFrom: React.Dispatch<React.SetStateAction<string | null>>;
  setConnectingFromHandle: React.Dispatch<React.SetStateAction<string | null>>;
  connectionMousePos: Coordinate | null;
  setConnectionMousePos: React.Dispatch<React.SetStateAction<Coordinate | null>>;
  reactFlowRef: MutableRefObject<ReactFlowInstance | null>;
  onConnect: (connection: Connection) => void;
  nodes: Node[];
}

export const useCanvasEdgeInteractions = ({
  selectedTool,
  setSelectedTool,
  selectedNodes,
  setSelectedNodes,
  connectingFrom,
  connectingFromHandle,
  setConnectingFrom,
  setConnectingFromHandle,
  connectionMousePos,
  setConnectionMousePos,
  reactFlowRef,
  onConnect,
  nodes,
}: EdgeInteractionParams) => {
  const handleConnectStart = useCallback(
    (_event: any, params: OnConnectStartParams) => {
      setConnectingFrom(params.nodeId ?? null);
      setConnectingFromHandle(params.handleId ?? null);
    },
    [setConnectingFrom, setConnectingFromHandle]
  );

  const handleConnectEnd = useCallback(() => {
    setConnectingFrom(null);
    setConnectingFromHandle(null);
    setConnectionMousePos(null);
  }, [setConnectingFrom, setConnectingFromHandle, setConnectionMousePos]);

  const handleConnectorDotClick = useCallback(
    (nodeId: string, handleId: string) => {
      if (selectedTool !== "connector") {
        setSelectedTool("connector");
      }

      if (reactFlowRef.current) {
        reactFlowRef.current.setNodes((nds) => nds.map((node) => ({ ...node, selected: false })));
      }
      setSelectedNodes([]);

      if (handleId.includes("target") && connectingFrom && connectingFrom !== nodeId) {
        const connection: Connection = {
          source: connectingFrom,
          sourceHandle: connectingFromHandle || undefined,
          target: nodeId,
          targetHandle: handleId || undefined,
        };

        onConnect(connection);
        setConnectingFrom(null);
        setConnectingFromHandle(null);
        setConnectionMousePos(null);
        setSelectedTool("arrow");
        return;
      }

      const sourceHandleId = handleId.includes("target")
        ? handleId.replace("target", "source")
        : handleId;

      setConnectingFrom(nodeId);
      setConnectingFromHandle(sourceHandleId);

      const handleMouseMove = (e: MouseEvent) => {
        if (!reactFlowRef.current) return;
        const rf = reactFlowRef.current as ReactFlowInstance & {
          screenToFlowPosition?: (pos: Coordinate) => Coordinate;
          project: (pos: Coordinate) => Coordinate;
        };

        const flowPos = rf.screenToFlowPosition
          ? rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
          : rf.project({ x: e.clientX, y: e.clientY });

        setConnectionMousePos(flowPos);
      };

      const handleMouseUp = (e: MouseEvent) => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.removeEventListener("click", handleClick);

        const currentConnectingFrom = connectingFrom;
        const currentConnectingFromHandle = connectingFromHandle;

        if (!currentConnectingFrom) {
          setConnectionMousePos(null);
          return;
        }

        const targetElement = e.target as HTMLElement;
        const targetHandle = targetElement.closest(".react-flow__handle") as HTMLElement | null;

        if (targetHandle) {
          const handleType = targetHandle.getAttribute("data-handletype");
          const targetHandleId = targetHandle.getAttribute("data-id") || targetHandle.id;
          const nodeElement = targetHandle.closest(".react-flow__node") as HTMLElement | null;
          const targetNodeId = nodeElement?.getAttribute("data-id") || nodeElement?.id || null;

          if (
            targetNodeId &&
            targetHandleId &&
            (handleType === "target" || targetHandleId.includes("target")) &&
            targetNodeId !== currentConnectingFrom
          ) {
            onConnect({
              source: currentConnectingFrom,
              sourceHandle: currentConnectingFromHandle || undefined,
              target: targetNodeId,
              targetHandle: targetHandleId || undefined,
            });
            setConnectingFrom(null);
            setConnectingFromHandle(null);
            setConnectionMousePos(null);
            return;
          }
        }

        const connectorDot = targetElement.closest("[data-connector-dot]") as HTMLElement | null;
        if (connectorDot) {
          const targetNodeId = connectorDot.getAttribute("data-node-id");
          const targetHandleId = connectorDot.getAttribute("data-handle-id");
          if (targetNodeId && targetHandleId && targetNodeId !== currentConnectingFrom) {
            onConnect({
              source: currentConnectingFrom,
              sourceHandle: currentConnectingFromHandle || undefined,
              target: targetNodeId,
              targetHandle: targetHandleId || undefined,
            });
            setConnectingFrom(null);
            setConnectingFromHandle(null);
            setConnectionMousePos(null);
            return;
          }
        }

        setConnectingFrom(null);
        setConnectingFromHandle(null);
        setConnectionMousePos(null);
      };

      const handleClick = (e: MouseEvent) => {
        const targetElement = e.target as HTMLElement;
        const isConnectorPortClick =
          targetElement.closest("[data-connector-dot]") ||
          targetElement.closest('[style*="rgba(0, 255, 0"]') ||
          targetElement.closest('.react-flow__handle[id*="connector"]');

        const isToolbarClick =
          targetElement.closest('.absolute.bottom-8.left-1\/2.-translate-x-1\/2.z-\\[8000\\]') ||
          targetElement.closest('[aria-label="Select (V)"]') ||
          targetElement.closest('[aria-label="Add box (R)"]') ||
          targetElement.closest('[aria-label="Add connector (C)"]') ||
          targetElement.closest('[aria-label="Create group (G)"]');

        if (isToolbarClick) {
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);
          document.removeEventListener("click", handleClick);
          return;
        }

        if (!isConnectorPortClick) {
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);
          document.removeEventListener("click", handleClick);
          setConnectingFrom(null);
          setConnectingFromHandle(null);
          setConnectionMousePos(null);
        } else {
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);
          document.removeEventListener("click", handleClick);
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp, { once: true });
      document.addEventListener("click", handleClick, { once: true, capture: true });
    },
    [
      connectingFrom,
      connectingFromHandle,
      onConnect,
      reactFlowRef,
      selectedNodes,
      selectedTool,
      setConnectingFrom,
      setConnectingFromHandle,
      setConnectionMousePos,
      setSelectedNodes,
      setSelectedTool,
    ]
  );

  const edgePreview = useMemo(() => {
    if (!connectingFrom || !connectionMousePos || !reactFlowRef.current) {
      return null;
    }

    const sourceNode = nodes.find((node) => node.id === connectingFrom);
    if (!sourceNode) {
      return null;
    }

    const nodeElement = document.querySelector(`[data-id="${connectingFrom}"]`) as HTMLElement | null;
    const paneRect = document.querySelector(".react-flow__pane")?.getBoundingClientRect();
    if (!nodeElement || !paneRect) {
      return null;
    }

    const nodeWidth = (sourceNode.data as any)?.width || 96;
    const nodeCenterX = sourceNode.position.x + nodeWidth / 2;
    const nodeCenterY = sourceNode.position.y + nodeWidth / 2;

    const handleSide = connectingFromHandle?.includes("top")
      ? "top"
      : connectingFromHandle?.includes("right")
        ? "right"
        : connectingFromHandle?.includes("bottom")
          ? "bottom"
          : "left";

    let sourceX: number;
    let sourceY: number;
    if (handleSide === "top") {
      sourceX = nodeCenterX;
      sourceY = sourceNode.position.y;
    } else if (handleSide === "bottom") {
      sourceX = nodeCenterX;
      sourceY = sourceNode.position.y + nodeWidth;
    } else if (handleSide === "left") {
      sourceX = sourceNode.position.x;
      sourceY = nodeCenterY;
    } else {
      sourceX = sourceNode.position.x + nodeWidth;
      sourceY = nodeCenterY;
    }

    const targetX = connectionMousePos.x;
    const targetY = connectionMousePos.y;
    const midX = sourceX + (targetX - sourceX) / 2;
    const edgePath = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;

    return (
      <EdgeLabelRenderer>
        <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 10000 }}>
          <path d={edgePath} stroke="#b1b1b7" strokeWidth={2} fill="none" strokeDasharray="5 5" />
        </svg>
      </EdgeLabelRenderer>
    );
  }, [connectingFrom, connectingFromHandle, connectionMousePos, nodes, reactFlowRef]);

  return {
    handleConnectStart,
    handleConnectEnd,
    handleConnectorDotClick,
    edgePreview,
  } as const;
};
