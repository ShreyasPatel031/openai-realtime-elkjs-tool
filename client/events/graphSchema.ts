/**
 * Graph validation schema - catches malformed graphs early
 * Prevents silent failures when graph structure changes
 */

import { RawGraph } from '../components/graph/types';

/**
 * Minimal schema validation for RawGraph
 * Validates the core structure without being too strict
 */
export function validateRawGraph(graph: unknown): RawGraph {
  if (!graph || typeof graph !== 'object') {
    throw new Error('Graph must be an object');
  }

  const g = graph as Record<string, unknown>;

  // Check required fields
  if (typeof g.id !== 'string') {
    throw new Error('Graph.id must be a string');
  }

  if (!Array.isArray(g.children)) {
    throw new Error('Graph.children must be an array');
  }

  if (!Array.isArray(g.edges)) {
    throw new Error('Graph.edges must be an array');
  }

  // Validate children structure (basic checks)
  for (let i = 0; i < g.children.length; i++) {
    const child = g.children[i];
    if (!child || typeof child !== 'object') {
      throw new Error(`Graph.children[${i}] must be an object`);
    }
    const childObj = child as Record<string, unknown>;
    if (typeof childObj.id !== 'string') {
      throw new Error(`Graph.children[${i}].id must be a string`);
    }
  }

  // Validate edges structure (basic checks)
  for (let i = 0; i < g.edges.length; i++) {
    const edge = g.edges[i];
    if (!edge || typeof edge !== 'object') {
      throw new Error(`Graph.edges[${i}] must be an object`);
    }
    const edgeObj = edge as Record<string, unknown>;
    if (typeof edgeObj.id !== 'string') {
      throw new Error(`Graph.edges[${i}].id must be a string`);
    }
  }

  return g as RawGraph;
}

/**
 * Assert that a graph is valid, throw descriptive error if not
 * Use this at emit time to catch bad graphs before they propagate
 */
export function assertRawGraph(graph: unknown, context?: string): RawGraph {
  try {
    return validateRawGraph(graph);
  } catch (error) {
    const contextMsg = context ? ` (context: ${context})` : '';
    console.error(`❌ Invalid RawGraph${contextMsg}:`, error);
    console.error('Graph data:', graph);
    throw new Error(`Invalid RawGraph${contextMsg}: ${error}`);
  }
}

/**
 * Safe validation that returns validation result instead of throwing
 * Use this when you want to handle validation errors gracefully
 */
export function safeValidateRawGraph(graph: unknown): { 
  success: true; 
  data: RawGraph; 
} | { 
  success: false; 
  error: string; 
} {
  try {
    const validGraph = validateRawGraph(graph);
    return { success: true, data: validGraph };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
