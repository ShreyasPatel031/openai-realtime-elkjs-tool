import type { MouseEvent as ReactMouseEvent } from "react";
import type { MutableRefObject } from "react";
import type { Node, ReactFlowInstance } from "reactflow";

import { createNodeID } from "../../types/graph";
import type { ViewState } from "../../utils/canvasPersistence";

const GROUP_WIDTH = 480;
const GROUP_HEIGHT = 320;
const GRID_SIZE = 16;

const snapToGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

type SetNodes = React.Dispatch<React.SetStateAction<Node[]>>;

export interface GroupToolPaneClickParams {
  event: ReactMouseEvent<HTMLDivElement, MouseEvent>;
  selectedNodes: Node[];
  reactFlowRef: MutableRefObject<ReactFlowInstance | null>;
  handleGroupNodes: (nodeIds: string[], parentId: string, groupId: string, options?: unknown) => void;
  handleBatchUpdate: (mutations: Array<Record<string, unknown>>) => void;
  setNodes: SetNodes;
  setSelectedNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setSelectedTool: (tool: string) => void;
  viewStateRef: MutableRefObject<ViewState | undefined>;
  pendingSelectionRef: MutableRefObject<{ id: string; size?: { width: number; height: number } } | null>;
  shouldSkipFitViewRef?: MutableRefObject<boolean | undefined>;
}

const groupSelectedNodes = ({
  selectedNodes,
  handleGroupNodes,
  setNodes,
  setSelectedNodes,
  setSelectedTool,
}: GroupToolPaneClickParams): boolean => {
  if (selectedNodes.length === 0) {
    return false;
  }

  const nodeIds = selectedNodes.map((node) => node.id);
  const groupId = `group-${Date.now()}`;
  const parentId = "root";

  try {
    handleGroupNodes(nodeIds, parentId, groupId, undefined);
  } catch (error) {
    console.error("[GroupTool] Failed to create group from selection:", error);
    return false;
  }

  setNodes((nodes) => nodes.map((node) => ({ ...node, selected: false })));
  setSelectedNodes([]);
  setSelectedTool("arrow");

  return true;
};

const createEmptyGroupAtPoint = ({
  event,
  reactFlowRef,
  viewStateRef,
  shouldSkipFitViewRef,
  handleBatchUpdate,
  pendingSelectionRef,
  setNodes,
  setSelectedTool,
}: GroupToolPaneClickParams): boolean => {
  const reactFlow = reactFlowRef.current;
  if (!reactFlow) {
    console.warn("[GroupTool] ReactFlow instance unavailable; aborting empty group creation");
    return false;
  }

  const screenPoint = { x: event.clientX, y: event.clientY };
  const flowPoint = reactFlow.screenToFlowPosition
    ? reactFlow.screenToFlowPosition(screenPoint)
    : reactFlow.project(screenPoint);

  const topLeft = {
    x: snapToGrid(flowPoint.x - GROUP_WIDTH / 2),
    y: snapToGrid(flowPoint.y - GROUP_HEIGHT / 2),
  };

  if (process.env.NODE_ENV !== "production") {
    console.debug("[GroupTool] Creating draft group", {
      screenPoint,
      flowPoint,
      topLeft,
    });
  }

  const rawGroupName = `Draft group ${Date.now()}`;
  const normalizedId = createNodeID(rawGroupName);

  const view = viewStateRef.current ?? { node: {}, group: {}, edge: {} };
  view.node = view.node || {};
  view.group = view.group || {};
  const groupGeometry = { x: topLeft.x, y: topLeft.y, w: GROUP_WIDTH, h: GROUP_HEIGHT };
  view.node[normalizedId] = groupGeometry;
  view.group[normalizedId] = groupGeometry;
  viewStateRef.current = view;
  if (process.env.NODE_ENV !== "production") {
    console.debug("[GroupTool] Wrote group viewState", {
      groupId: normalizedId,
      geometry: groupGeometry,
      nodeKeys: Object.keys(view.node),
      groupKeys: Object.keys(view.group),
    });
  }

  if (shouldSkipFitViewRef?.current !== undefined) {
    shouldSkipFitViewRef.current = true;
  }

  try {
    handleBatchUpdate([
      {
        name: "add_node",
        nodename: normalizedId,
        parentId: "root",
        data: {
          label: "Group",
          isGroup: true,
          originalName: rawGroupName,
        },
      },
    ]);
  } catch (error) {
    console.error("[GroupTool] Failed to add draft group node:", error);
    return false;
  }

  pendingSelectionRef.current = {
    id: normalizedId,
    size: { width: GROUP_WIDTH, height: GROUP_HEIGHT },
  };

  setSelectedTool("arrow");

  setTimeout(() => {
    setNodes((nodes) => {
      let found = false;
      const updated = nodes.map((node) => {
        if (node.id !== normalizedId) {
          return node;
        }
        found = true;
        return {
          ...node,
          selected: true,
          position: topLeft,
          data: {
            ...node.data,
            width: GROUP_WIDTH,
            height: GROUP_HEIGHT,
            isGroup: true,
          },
          style: {
            ...(node.style || {}),
            width: GROUP_WIDTH,
            height: GROUP_HEIGHT,
          },
        };
      });

      if (found) {
        return updated;
      }

      const placeholder: Node = {
        id: normalizedId,
        type: "group",
        position: topLeft,
        data: {
          label: "Group",
          width: GROUP_WIDTH,
          height: GROUP_HEIGHT,
          isGroup: true,
        },
        style: {
          width: GROUP_WIDTH,
          height: GROUP_HEIGHT,
        },
        selected: true,
      };

      return [...updated, placeholder];
    });
  }, 0);

  return true;
};

export const handleGroupToolPaneClick = (params: GroupToolPaneClickParams): boolean => {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[GroupTool] handleGroupToolPaneClick invoked", {
      selectedNodes: params.selectedNodes.length,
      hasReactFlow: !!params.reactFlowRef.current,
    });
  }
  return groupSelectedNodes(params) || createEmptyGroupAtPoint(params);
};

