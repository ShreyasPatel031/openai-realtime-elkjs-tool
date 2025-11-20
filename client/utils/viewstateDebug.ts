/**
 * Debugging utilities for viewstate persistence
 * Extracted from InteractiveCanvas.tsx to keep it thin
 */

/**
 * Helper to extract all group IDs from the graph
 */
export function extractGroupIdsFromGraph(graph: any): string[] {
  const groupIds: string[] = [];
  if (!graph) return groupIds;
  
  const traverse = (node: any) => {
    if (node.type === 'group' || node.data?.isGroup || node.mode) {
      groupIds.push(node.id);
    }
    if (node.children) {
      node.children.forEach((child: any) => traverse(child));
    }
  };
  
  if (graph.children) {
    graph.children.forEach((child: any) => traverse(child));
  }
  
  return groupIds;
}

/**
 * Logs when groups/nodes are deleted and what gets saved
 */
export function logDeletionAndSave(
  deletedNodeIds: string[],
  graphBefore: any,
  graphAfter: any,
  selectedArchitectureId: string | null
): void {
  const groupsBefore = extractGroupIdsFromGraph(graphBefore);
  const groupsAfter = extractGroupIdsFromGraph(graphAfter);
  const deletedGroups = groupsBefore.filter(id => !groupsAfter.includes(id));
  
  
  // Check what's in localStorage before save
  try {
    const stored = localStorage.getItem('atelier_canvas_last_snapshot_v1');
    if (stored) {
      const parsed = JSON.parse(stored);
      const storedGroups = extractGroupIdsFromGraph(parsed?.rawGraph);
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Logs what gets loaded on page refresh
 */
export function logPageLoad(
  source: 'localStorage' | 'URL' | 'Firebase' | 'other',
  graph: any,
  selectedArchitectureId: string | null
): void {
  const groups = extractGroupIdsFromGraph(graph);
}

/**
 * Logs URL architecture load check against localStorage
 */
export function logUrlArchCheck(
  hasStored: boolean,
  storedArchitectureId: string | null,
  urlArchitectureId: string,
  isSameArchitecture: boolean,
  isRecent: boolean,
  storedAgeSeconds: number,
  hasContent: boolean,
  storedGroups: number,
  urlGroups: number,
  storedTimestamp?: number
): void {
  const now = Date.now();
  const ageMs = storedTimestamp ? now - storedTimestamp : storedAgeSeconds * 1000;
  const ageMinutes = ageMs / (1000 * 60);
  const recentThresholdMinutes = 5;
  
}

