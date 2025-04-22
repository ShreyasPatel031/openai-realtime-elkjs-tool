import { Node, Edge } from 'reactflow'

export interface CustomNode extends Node { 
  parentId?: string 
} 