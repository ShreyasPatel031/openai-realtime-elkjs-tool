import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import type { Connection, Node, OnConnectStartParams, ReactFlowInstance } from "reactflow";
import type { MutableRefObject } from "react";
import { CANVAS_STYLES } from "../../components/graph/styles/canvasStyles";

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
  const sourceScreenPosRef = useRef<Coordinate | null>(null);
  const sourceElementRef = useRef<HTMLElement | null>(null);
  const [previewTick, setPreviewTick] = useState(0);

  useEffect(() => {
    if (!connectingFrom) {
      return;
    }

    let rafId: number | null = null;
    const tick = () => {
      setPreviewTick((prev) => (prev + 1) % Number.MAX_SAFE_INTEGER);
      rafId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [connectingFrom]);

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

      const startNodeId = nodeId;
      const startHandleId = sourceHandleId;

      if (process.env.NODE_ENV !== "production") {
        console.debug("[EdgeInteractions] Start connector drag", {
          nodeId: startNodeId,
          handleId: startHandleId,
        });
      }

      setConnectingFrom(startNodeId);
      setConnectingFromHandle(startHandleId);

      // Capture the actual screen position of the handle element
      const connectorSelector = `[data-connector-dot][data-node-id="${startNodeId}"][data-handle-id="${startHandleId}"]`;
      const handleSelector = `.react-flow__handle[data-nodeid="${startNodeId}"][data-handleid="${startHandleId}"]`;
      const connectorElement = document.querySelector(connectorSelector) as HTMLElement | null;
      const handleElement = document.querySelector(handleSelector) as HTMLElement | null;
      const sourceElement = connectorElement || handleElement;
      sourceElementRef.current = sourceElement;

      if (sourceElement) {
        const rect = sourceElement.getBoundingClientRect();
        const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        sourceScreenPosRef.current = center;
        // Set initial mouse position to the handle center (in SCREEN coordinates)
        setConnectionMousePos(center);
      } else {
        // Fallback: calculate from node position in flow coordinates and convert to screen
        sourceScreenPosRef.current = null;
      }

      const handleMouseMove = (e: MouseEvent) => {
        if (!reactFlowRef.current) return;
        setConnectionMousePos({ x: e.clientX, y: e.clientY });
      };

      const handleMouseUp = (e: MouseEvent) => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.removeEventListener("click", handleClick);

        if (!startNodeId) {
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
            targetNodeId !== startNodeId
          ) {
            if (process.env.NODE_ENV !== "production") {
              console.debug("[EdgeInteractions] Completing connection via handle", {
                source: startNodeId,
                target: targetNodeId,
                sourceHandle: startHandleId,
                targetHandle: targetHandleId,
              });
            }
            onConnect({
              source: startNodeId,
              sourceHandle: startHandleId || undefined,
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
          if (targetNodeId && targetHandleId && targetNodeId !== startNodeId) {
            if (process.env.NODE_ENV !== "production") {
              console.debug("[EdgeInteractions] Completing connection via connector dot", {
                source: startNodeId,
                target: targetNodeId,
                sourceHandle: startHandleId,
                targetHandle: targetHandleId,
              });
            }
            onConnect({
              source: startNodeId,
              sourceHandle: startHandleId || undefined,
              target: targetNodeId,
              targetHandle: targetHandleId || undefined,
            });
            setConnectingFrom(null);
            setConnectingFromHandle(null);
            setConnectionMousePos(null);
            return;
          }
        }

        if (process.env.NODE_ENV !== "production") {
          console.debug("[EdgeInteractions] Connection cancelled", { startNodeId, startHandleId });
        }

        setConnectingFrom(null);
        setConnectingFromHandle(null);
        setConnectionMousePos(null);
      };

      const handleClick = (e: MouseEvent) => {
        const targetElement = e.target as HTMLElement;
        
        // Check if click is on a connector port - check computed style for connector dot colors
        // Connector dots can be: green (hover area), blue (selected), or white (default)
        const isConnectorDotByStyle = (() => {
          let el: HTMLElement | null = targetElement;
          while (el) {
            const style = window.getComputedStyle(el);
            const bg = style.backgroundColor;
            const cursor = style.cursor;
            // Green hover area, blue selected dot, or white default dot with pointer cursor
            const isGreen = bg.includes('rgb(0, 255, 0)') || bg.includes('rgba(0, 255, 0');
            const isBlue = bg.includes('rgb(66, 133, 244)') || bg.includes('rgba(66, 133, 244');
            // Small white dot (8px) with pointer cursor is a connector dot
            const isSmallWhiteDot = bg.includes('rgb(255, 255, 255)') && cursor === 'pointer' && 
                                    el.offsetWidth <= 16 && el.offsetHeight <= 16;
            if (isGreen || isBlue || isSmallWhiteDot) {
              return true;
            }
            el = el.parentElement;
          }
          return false;
        })();
        
        const isConnectorPortClick =
          targetElement.closest("[data-connector-dot]") ||
          targetElement.closest('.react-flow__handle[id*="connector"]') ||
          isConnectorDotByStyle;

        const isToolbarClick = (() => {
          const toolbarButton = targetElement.closest('[aria-label="Select (V)"]') ||
            targetElement.closest('[aria-label="Add box (R)"]') ||
            targetElement.closest('[aria-label="Add connector (C)"]') ||
            targetElement.closest('[aria-label="Create group (G)"]');

          const toolbarContainer = targetElement.closest('[data-canvas-toolbar]');

          const result = Boolean(toolbarButton || toolbarContainer);

          if (result) {
            console.log('🛠️ [DEBUG] Toolbar click detected, cancelling connection.');
          }

          return result;
        })();

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
      nodes,
    ]
  );

  const edgePreview = useMemo(() => {
    if (!connectingFrom || !connectionMousePos || !reactFlowRef.current) {
      return null;
    }

    // Convert screen coordinates to flow coordinates, then apply viewport transform
    if (!reactFlowRef.current) {
      console.warn('❌ [DEBUG] ReactFlow instance unavailable for edge preview');
      return null;
    }

    let sourceScreen = sourceScreenPosRef.current;

    let sourceElement = sourceElementRef.current;
    if (!sourceElement || !document.contains(sourceElement)) {
      const connectorSelector = `[data-connector-dot][data-node-id="${connectingFrom}"][data-handle-id="${connectingFromHandle}"]`;
      const handleSelector = `.react-flow__handle[data-nodeid="${connectingFrom}"][data-handleid="${connectingFromHandle}"]`;
      sourceElement = (document.querySelector(connectorSelector) as HTMLElement | null) ||
        (document.querySelector(handleSelector) as HTMLElement | null) ||
        null;
      sourceElementRef.current = sourceElement;
    }

    if (sourceElement) {
      const rect = sourceElement.getBoundingClientRect();
      sourceScreen = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      sourceScreenPosRef.current = sourceScreen;
    }

    if (!sourceScreen) {
      return null;
    }

    const sourceX = sourceScreen.x;
    const sourceY = sourceScreen.y;
    const targetX = connectionMousePos.x;
    const targetY = connectionMousePos.y;
    const midX = sourceX + (targetX - sourceX) / 2;
    const edgePath = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;

    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          zIndex: 10000,
        }}
      >
        <svg style={{ width: "100%", height: "100%", overflow: "visible" }}>
          <path
            d={edgePath}
            stroke={CANVAS_STYLES.edges.default.stroke}
            strokeWidth={CANVAS_STYLES.edges.default.strokeWidth}
            fill="none"
            strokeDasharray={CANVAS_STYLES.edges.selected.strokeDasharray}
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }, [connectingFrom, connectingFromHandle, connectionMousePos, nodes, previewTick]);

  return {
    handleConnectStart,
    handleConnectEnd,
    handleConnectorDotClick,
    edgePreview,
  } as const;
};
