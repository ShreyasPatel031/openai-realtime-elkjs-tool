import { Node } from "reactflow";

export type NodeID = string;
export type EdgeID = string;

export const createNodeID = (name: string): NodeID => name.toLowerCase().replace(/\s+/g, '_');
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
}

export interface ElkGraph {
  id: string;
  children?: ElkGraphNode[];
  edges?: ElkGraphEdge[];
} 