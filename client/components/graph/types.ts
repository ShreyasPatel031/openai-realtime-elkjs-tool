import { Node } from 'reactflow';

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
  layoutOptions?: Record<string, any>;
  container?: string;
  absoluteBendPoints?: Array<{
    index: number;
    x: number;
    y: number;
    originalX: number;
    originalY: number;
  }>;
}

export interface ElkGraphEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: {
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: { x: number; y: number }[];
  }[];
  container?: string;
  absoluteBendPoints?: Array<{
    index: number;
    x: number;
    y: number;
    originalX: number;
    originalY: number;
  }>;
}

export interface ElkGraph {
  id: string;
  children?: ElkGraphNode[];
  edges?: ElkGraphEdge[];
  layoutOptions?: Record<string, any>;
} 