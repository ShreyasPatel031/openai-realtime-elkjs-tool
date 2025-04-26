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