import { jest } from "@jest/globals";
import React, { useEffect } from "react";
import { render, act, cleanup } from "@testing-library/react";
import type { Node, ReactFlowInstance } from "reactflow";
import { useCanvasEdgeInteractions } from "../client/components/ui/canvasEdgeInteractions";

type EdgeInteractionProps = Parameters<typeof useCanvasEdgeInteractions>[0];

type EdgeInteractionResult = ReturnType<typeof useCanvasEdgeInteractions>;

const HookHarness: React.FC<{
  props: EdgeInteractionProps;
  onReady: (result: EdgeInteractionResult) => void;
}> = ({ props, onReady }) => {
  const result = useCanvasEdgeInteractions(props);
  useEffect(() => {
    onReady(result);
  }, [result, onReady]);
  return null;
};

function renderHookWithProps(initialProps: EdgeInteractionProps) {
  let latest: EdgeInteractionResult;
  const onReady = (value: EdgeInteractionResult) => {
    latest = value;
  };

  const Wrapper: React.FC<{ props: EdgeInteractionProps }> = ({ props }) => (
    <HookHarness props={props} onReady={onReady} />
  );

  const utils = render(<Wrapper props={initialProps} />);
  return {
    ...utils,
    latest: () => latest,
    rerenderWithProps: (nextProps: EdgeInteractionProps) => utils.rerender(<Wrapper props={nextProps} />),
  };
}

describe("useCanvasEdgeInteractions", () => {
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
    document.body.innerHTML = "";
  });

  const baseNode: Node = {
    id: "node-1",
    position: { x: 20, y: 30 },
    data: { width: 100 },
    type: "custom",
  } as Node;

  it("enters connector mode and tracks drag when starting a connection", () => {
    const setSelectedTool = jest.fn();
    const setSelectedNodes = jest.fn();
    const setConnectingFrom = jest.fn();
    const setConnectingFromHandle = jest.fn();
    const setConnectionMousePos = jest.fn();
    const onConnect = jest.fn();
    const reactFlowRef = {
      current: {
        setNodes: jest.fn(),
        screenToFlowPosition: jest.fn(() => ({ x: 400, y: 220 })),
      },
    } as unknown as { current: ReactFlowInstance };

    const { latest } = renderHookWithProps({
      selectedTool: "box",
      setSelectedTool,
      selectedNodes: [baseNode],
      setSelectedNodes,
      connectingFrom: null,
      connectingFromHandle: null,
      setConnectingFrom,
      setConnectingFromHandle,
      connectionMousePos: null,
      setConnectionMousePos,
      reactFlowRef,
      onConnect,
      nodes: [baseNode],
    });

    act(() => {
      latest().handleConnectorDotClick("node-1", "source-top");
    });

    expect(setSelectedTool).toHaveBeenCalledWith("connector");
    expect(reactFlowRef.current.setNodes).toHaveBeenCalledWith(expect.any(Function));
    expect(setSelectedNodes).toHaveBeenCalledWith([]);
    expect(setConnectingFrom).toHaveBeenCalledWith("node-1");
    expect(setConnectingFromHandle).toHaveBeenCalledWith("source-top");

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 10, clientY: 20 }));
      document.dispatchEvent(new MouseEvent("mouseup", { clientX: 10, clientY: 20 }));
    });

    expect(setConnectionMousePos).toHaveBeenCalledWith({ x: 400, y: 220 });
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("completes a connection when clicking a target handle", () => {
    const setSelectedTool = jest.fn();
    const setSelectedNodes = jest.fn();
    const setConnectingFrom = jest.fn();
    const setConnectingFromHandle = jest.fn();
    const setConnectionMousePos = jest.fn();
    const onConnect = jest.fn();

    const { latest } = renderHookWithProps({
      selectedTool: "connector",
      setSelectedTool,
      selectedNodes: [baseNode],
      setSelectedNodes,
      connectingFrom: "node-1",
      connectingFromHandle: "source-right",
      setConnectingFrom,
      setConnectingFromHandle,
      connectionMousePos: null,
      setConnectionMousePos,
      reactFlowRef: { current: { setNodes: jest.fn() } } as any,
      onConnect,
      nodes: [baseNode],
    });

    act(() => {
      latest().handleConnectorDotClick("node-2", "target-bottom");
    });

    expect(onConnect).toHaveBeenCalledWith({
      source: "node-1",
      sourceHandle: "source-right",
      target: "node-2",
      targetHandle: "target-bottom",
    });
    expect(setConnectingFrom).toHaveBeenCalledWith(null);
    expect(setConnectingFromHandle).toHaveBeenCalledWith(null);
    expect(setConnectionMousePos).toHaveBeenCalledWith(null);
    expect(setSelectedTool).toHaveBeenCalledWith("arrow");
  });

  it("produces a preview path that snaps to the cursor", () => {
    const pane = document.createElement("div");
    pane.className = "react-flow__pane";
    document.body.appendChild(pane);

    const nodeElement = document.createElement("div");
    nodeElement.setAttribute("data-id", "node-1");
    nodeElement.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      toJSON: () => ({}),
    });
    document.body.appendChild(nodeElement);

    const reactFlowRef = { current: {} } as any;

    const { latest } = renderHookWithProps({
      selectedTool: "connector",
      setSelectedTool: jest.fn(),
      selectedNodes: [baseNode],
      setSelectedNodes: jest.fn(),
      connectingFrom: "node-1",
      connectingFromHandle: "source-right",
      setConnectingFrom: jest.fn(),
      setConnectingFromHandle: jest.fn(),
      connectionMousePos: { x: 260, y: 180 },
      setConnectionMousePos: jest.fn(),
      reactFlowRef,
      onConnect: jest.fn(),
      nodes: [baseNode],
    });

    const preview = latest().edgePreview;
    expect(preview).toBeTruthy();

    const { container } = render(<>{preview}</>);
    const path = container.querySelector("path");
    expect(path).not.toBeNull();
    expect(path?.getAttribute("stroke-dasharray")).toBe("5 5");
    expect(path?.getAttribute("d")).toBe("M 120 80 L 190 80 L 190 180 L 260 180");
  });
});
