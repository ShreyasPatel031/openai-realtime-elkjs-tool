import { Node } from 'reactflow';

export interface CustomNode extends Node {
  parentId?: string;
}

// Branded types for type safety
export type NodeID = string & { __brand: "NodeID" };
export type EdgeID = string & { __brand: "EdgeID" };

// Helper functions to create branded IDs
export function createNodeID(id: string): NodeID {
  return id as NodeID;
}

export function createEdgeID(id: string): EdgeID {
  return id as EdgeID;
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
  id: NodeID;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  labels?: { text: string }[];
  children?: ElkGraphNode[];
  edges?: ElkGraphEdge[];
  layoutOptions?: Record<string, any>;
  container?: NodeID;
  absoluteBendPoints?: Array<{
    index: number;
    x: number;
    y: number;
    originalX: number;
    originalY: number;
  }>;
}

export interface ElkGraphEdge {
  id: EdgeID;
  sources: NodeID[];
  targets: NodeID[];
  sections?: {
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: { x: number; y: number }[];
  }[];
  container?: NodeID;
  absoluteBendPoints?: Array<{
    index: number;
    x: number;
    y: number;
    originalX: number;
    originalY: number;
  }>;
}

export interface ElkGraph {
  id: NodeID;
  children?: ElkGraphNode[];
  edges?: ElkGraphEdge[];
  layoutOptions?: Record<string, any>;
}

export interface InputAudioTranscription {
  /**
   * The language of the input audio. Supplying the input language in ISO-639-1 (e.g. en) 
   * format will improve accuracy and latency.
   */
  language?: string;
  
  /**
   * The model to use for transcription, current options are gpt-4o-transcribe, 
   * gpt-4o-mini-transcribe, and whisper-1.
   */
  model?: string;
  
  /**
   * An optional text to guide the model's style or continue a previous audio segment. 
   * For whisper-1, the prompt is a list of keywords. For gpt-4o-transcribe models, 
   * the prompt is a free text string, for example "expect words related to technology".
   */
  prompt?: string;
} 