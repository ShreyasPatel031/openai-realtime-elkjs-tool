import { jest } from "@jest/globals";
import type React from "react";
import type { Node } from "reactflow";
import { handleGroupToolPaneClick } from "../client/utils/canvas/canvasGroupInteractions";

describe("handleGroupToolPaneClick", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("groups selected nodes and clears selection", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1700000000000);
    const handleGroupNodes = jest.fn();
    const handleBatchUpdate = jest.fn();
    const setNodes = jest.fn();
    const setSelectedNodes = jest.fn();
    const setSelectedTool = jest.fn();

    const selectedNodes: Node[] = [
      { id: "node-1", position: { x: 0, y: 0 }, data: {}, type: "custom" },
      { id: "node-2", position: { x: 10, y: 10 }, data: {}, type: "custom" },
    ] as Node[];

    const result = handleGroupToolPaneClick({
      event: {} as React.MouseEvent<HTMLDivElement, MouseEvent>,
      selectedNodes,
      reactFlowRef: { current: null } as any,
      handleGroupNodes,
      handleBatchUpdate,
      setNodes,
      setSelectedNodes,
      setSelectedTool,
      viewStateRef: { current: undefined },
      pendingSelectionRef: { current: null },
      shouldSkipFitViewRef: { current: false },
    });

    expect(result).toBe(true);
    expect(handleGroupNodes).toHaveBeenCalledWith(
      ["node-1", "node-2"],
      "root",
      "group-1700000000000",
      undefined,
    );
    expect(handleBatchUpdate).not.toHaveBeenCalled();
    expect(setNodes).toHaveBeenCalledWith(expect.any(Function));
    expect(setSelectedNodes).toHaveBeenCalledWith([]);
    expect(setSelectedTool).toHaveBeenCalledWith("arrow");
    nowSpy.mockRestore();
  });

  it("creates an empty draft group at the drop point when no nodes are selected", () => {
    jest.useFakeTimers();
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1700000001234);
    const handleGroupNodes = jest.fn();
    const handleBatchUpdate = jest.fn();
    let capturedNodesUpdater: ((nodes: Node[]) => Node[]) | undefined;
    const setNodes = jest.fn((updater: ((nodes: Node[]) => Node[]) | Node[]) => {
      if (typeof updater === "function") {
        capturedNodesUpdater = updater;
        return updater([] as Node[]);
      }
      return updater;
    });
    const setSelectedNodes = jest.fn();
    const setSelectedTool = jest.fn();

    const viewStateRef = { current: { node: {}, group: {}, edge: {} } as any };
    const pendingSelectionRef = { current: null as any };
    const shouldSkipFitViewRef = { current: false };

    const reactFlowRef = {
      current: {
        screenToFlowPosition: jest.fn(() => ({ x: 512, y: 384 })),
      },
    } as any;

    const mouseEvent = {
      clientX: 100,
      clientY: 200,
    } as React.MouseEvent<HTMLDivElement, MouseEvent>;

    const result = handleGroupToolPaneClick({
      event: mouseEvent,
      selectedNodes: [],
      reactFlowRef,
      handleGroupNodes,
      handleBatchUpdate,
      setNodes,
      setSelectedNodes,
      setSelectedTool,
      viewStateRef,
      pendingSelectionRef,
      shouldSkipFitViewRef,
    });

    expect(result).toBe(true);
    expect(handleGroupNodes).not.toHaveBeenCalled();
    expect(handleBatchUpdate).toHaveBeenCalledTimes(1);
    const batchPayload = handleBatchUpdate.mock.calls[0][0];
    expect(Array.isArray(batchPayload)).toBe(true);
    expect(batchPayload[0]).toMatchObject({
      name: "add_node",
      parentId: "root",
      data: { label: "Group", isGroup: true },
    });

    expect(viewStateRef.current.node).toBeDefined();
    // Get the actual ID from batchPayload
    const actualDraftId = batchPayload[0]?.nodename || "Draft group 1700000001234";
    expect(viewStateRef.current.node[actualDraftId]).toEqual({ x: 272, y: 224, w: 480, h: 320 });
    expect(pendingSelectionRef.current).toEqual({ id: actualDraftId, size: { width: 480, height: 320 } });
    expect(shouldSkipFitViewRef.current).toBe(true);
    expect(setSelectedTool).toHaveBeenCalledWith("arrow");

    jest.runAllTimers();
    expect(setNodes).toHaveBeenCalled();
    expect(typeof capturedNodesUpdater).toBe("function");
    const updatedNodes = capturedNodesUpdater?.([] as Node[]);
    const createdNode = updatedNodes?.find((node) => node.id === actualDraftId);
    expect(createdNode).toBeDefined();
    expect(createdNode?.selected).toBe(true);
    expect(createdNode?.data).toMatchObject({
      label: "Group",
      width: 480,
      height: 320,
      isGroup: true,
    });

    nowSpy.mockRestore();
    jest.useRealTimers();
  });
});
