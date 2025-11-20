/**
 * Migration Test Helpers
 * 
 * Use these in the browser console to verify mode migration:
 * 
 * 1. Get ViewState: `window.getViewState()`
 * 2. Get Domain Graph: `window.getDomainGraph()`
 * 3. Check mode locations: `window.checkModeAlignment()`
 * 4. Full report: `window.migrationReport()`
 */

import type { ViewState } from '../core/viewstate/ViewState';
import type { ElkGraphNode } from '../types/graph';

/**
 * Extract mode from Domain Graph (should be empty after migration)
 */
function extractModesFromDomain(graph: ElkGraphNode): Record<string, 'FREE' | 'LOCK'> {
  const modes: Record<string, 'FREE' | 'LOCK'> = {};
  
  const traverse = (node: any) => {
    if (node.mode) {
      modes[node.id] = node.mode;
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  };
  
  traverse(graph);
  return modes;
}

/**
 * Extract modes from ViewState.layout (should have all modes)
 */
function extractModesFromViewState(viewState: ViewState): Record<string, 'FREE' | 'LOCK'> {
  const modes: Record<string, 'FREE' | 'LOCK'> = {};
  
  if (viewState.layout) {
    for (const [groupId, { mode }] of Object.entries(viewState.layout)) {
      modes[groupId] = mode;
    }
  }
  
  return modes;
}

/**
 * Check if mode alignment is correct
 */
export function checkModeAlignment(viewState: ViewState, domainGraph: ElkGraphNode): {
  correct: boolean;
  issues: string[];
  domainModes: Record<string, 'FREE' | 'LOCK'>;
  viewStateModes: Record<string, 'FREE' | 'LOCK'>;
} {
  const domainModes = extractModesFromDomain(domainGraph);
  const viewStateModes = extractModesFromViewState(viewState);
  
  const issues: string[] = [];
  
  // Check 1: Domain should have NO modes (after migration)
  if (Object.keys(domainModes).length > 0) {
    issues.push(`❌ Domain Graph still has modes: ${Object.keys(domainModes).join(', ')}`);
  }
  
  // Check 2: ViewState should have modes for all groups
  const allGroupIds = new Set<string>();
  const collectGroupIds = (node: any) => {
    if (node.children && node.children.length > 0) {
      allGroupIds.add(node.id);
    }
    if (node.children) {
      node.children.forEach(collectGroupIds);
    }
  };
  collectGroupIds(domainGraph);
  
  for (const groupId of allGroupIds) {
    if (!viewStateModes[groupId]) {
      issues.push(`⚠️ Group "${groupId}" missing from ViewState.layout (will default to FREE)`);
    }
  }
  
  // Check 3: ViewState should not have modes for non-existent groups
  for (const groupId of Object.keys(viewStateModes)) {
    if (!allGroupIds.has(groupId)) {
      issues.push(`⚠️ ViewState.layout has mode for non-existent group: "${groupId}"`);
    }
  }
  
  return {
    correct: issues.length === 0,
    issues,
    domainModes,
    viewStateModes
  };
}

/**
 * Generate full migration report
 */
export function migrationReport(viewState: ViewState, domainGraph: ElkGraphNode): string {
  const alignment = checkModeAlignment(viewState, domainGraph);
  
  let report = '\n📊 MODE MIGRATION REPORT\n';
  report += '='.repeat(50) + '\n\n';
  
  report += '✅ EXPECTED:\n';
  report += '  - Domain Graph: NO modes (pure structure only)\n';
  report += '  - ViewState.layout: All group modes\n\n';
  
  report += '📋 ACTUAL:\n';
  report += `  - Domain Graph modes: ${Object.keys(alignment.domainModes).length}\n`;
  if (Object.keys(alignment.domainModes).length > 0) {
    report += `    ${JSON.stringify(alignment.domainModes, null, 2)}\n`;
  } else {
    report += '    ✅ None (correct!)\n';
  }
  
  report += `  - ViewState.layout modes: ${Object.keys(alignment.viewStateModes).length}\n`;
  if (Object.keys(alignment.viewStateModes).length > 0) {
    report += `    ${JSON.stringify(alignment.viewStateModes, null, 2)}\n`;
  } else {
    report += '    ⚠️ None (may need migration)\n';
  }
  
  report += '\n🔍 ALIGNMENT CHECK:\n';
  if (alignment.correct) {
    report += '  ✅ Alignment is CORRECT!\n';
  } else {
    report += '  ❌ Issues found:\n';
    alignment.issues.forEach(issue => {
      report += `    ${issue}\n`;
    });
  }
  
  report += '\n' + '='.repeat(50) + '\n';
  
  return report;
}

/**
 * Setup window helpers for browser console
 */
export function setupWindowHelpers(getViewState: () => ViewState, getDomainGraph: () => ElkGraphNode) {
  if (typeof window !== 'undefined') {
    (window as any).getViewState = () => {
      const vs = getViewState();
      console.log('📦 ViewState:', vs);
      console.log('📦 ViewState.layout:', vs.layout);
      return vs;
    };
    
    (window as any).getDomainGraph = () => {
      const graph = getDomainGraph();
      console.log('🌳 Domain Graph:', graph);
      return graph;
    };
    
    (window as any).checkModeAlignment = () => {
      const viewState = getViewState();
      const domainGraph = getDomainGraph();
      const result = checkModeAlignment(viewState, domainGraph);
      console.log('🔍 Alignment Check:', result);
      return result;
    };
    
    (window as any).migrationReport = () => {
      const viewState = getViewState();
      const domainGraph = getDomainGraph();
      const report = migrationReport(viewState, domainGraph);
      console.log(report);
      return report;
    };
    
    console.log('✅ Migration test helpers loaded!');
    console.log('Available commands:');
    console.log('  - window.getViewState() - Get current ViewState');
    console.log('  - window.getDomainGraph() - Get current Domain Graph');
    console.log('  - window.checkModeAlignment() - Check if modes are in correct locations');
    console.log('  - window.migrationReport() - Full migration report');
  }
}


