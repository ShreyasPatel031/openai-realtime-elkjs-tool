import { Node } from "reactflow";

export type NodeID = string;
export type EdgeID = string;

export const createNodeID = (name: string): NodeID => {
  if (typeof name !== 'string' || name === undefined || name === null) {
    throw new Error(`createNodeID requires a valid string, got: ${typeof name} - ${JSON.stringify(name)}`);
  }
  return name.toLowerCase().replace(/\s+/g, '_');
};

export const createEdgeID = (source: NodeID, target: NodeID): EdgeID => `edge_${source}_to_${target}`;

export interface CustomNode extends Node {
  parentId?: string;
}

export interface NodeData {
  label: string;
  width?: number;
  height?: number;
  isParent?: boolean;
  leftHandles?: string[];
  rightHandles?: string[];
  position?: { x: number; y: number };
}

export interface EdgeData {
  bendPoints?: { x: number; y: number }[];
}

export interface ElkGraphNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  labels?: { text: string }[];
  children?: ElkGraphNode[];
  edges?: ElkGraphEdge[];
  mode?: 'FREE' | 'LOCK';  // default FREE - controls auto-layout behavior
  data?: {
    label?: string;
    icon?: string;
    [key: string]: any;
  };
}

export interface ElkGraphEdge {
  id: string;
  sources: string[];
  targets: string[];
  labels?: { text: string }[];
  sections?: {
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: { x: number; y: number }[];
  }[];
  data?: {
    sourceHandle?: string;
    targetHandle?: string;
    [key: string]: any;
  };
}

export interface ElkGraph {
  id: string;
  children?: ElkGraphNode[];
  edges?: ElkGraphEdge[];
} 