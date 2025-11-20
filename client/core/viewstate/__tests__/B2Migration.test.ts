/**
 * B2 Migration Test - ViewState Migration
 * 
 * Verifies that all ViewState imports use core/viewstate/ViewState
 * and that no imports remain from utils/canvasLayout for ViewState types.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('B2 ViewState Migration', () => {
  it('all ViewState imports use core/viewstate', () => {
    const filesToCheck = [
      'client/components/ui/InteractiveCanvas.tsx',
      'client/state/viewStateOrchestrator.ts',
    ];

    const violations: string[] = [];

    for (const filePath of filesToCheck) {
      const fullPath = join(process.cwd(), filePath);
      const content = readFileSync(fullPath, 'utf-8');

      // Check for old imports from utils/canvasLayout for ViewState type or createEmptyViewState function
      // Note: sanitizeStoredViewState and restoreNodeVisuals are utility functions that should stay in utils
      const importLines = content.match(/import\s+.*from\s+['"]\.\.?\/.*utils\/canvasLayout['"]/g) || [];
      
      for (const importLine of importLines) {
        // Only flag if importing ViewState type (as type or standalone) or createEmptyViewState function
        // Use word boundaries to avoid matching sanitizeStoredViewState
        const importsViewStateType = /\bViewState\b/.test(importLine) && 
          (importLine.includes('type ViewState') || importLine.includes('{ ViewState') || importLine.includes('ViewState }'));
        const importsCreateEmpty = /\bcreateEmptyViewState\b/.test(importLine);
        
        if (importsViewStateType || importsCreateEmpty) {
          violations.push(`${filePath}: ${importLine}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('InteractiveCanvas.tsx imports createEmptyViewState from core/viewstate', () => {
    const filePath = join(process.cwd(), 'client/components/ui/InteractiveCanvas.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    expect(content).toMatch(/import.*createEmptyViewState.*from.*core\/viewstate\/ViewState/);
  });

  it('viewStateOrchestrator.ts imports ViewState and createEmptyViewState from core/viewstate', () => {
    const filePath = join(process.cwd(), 'client/state/viewStateOrchestrator.ts');
    const content = readFileSync(filePath, 'utf-8');
    
    expect(content).toMatch(/import.*ViewState.*from.*core\/viewstate\/ViewState/);
    expect(content).toMatch(/import.*createEmptyViewState.*from.*core\/viewstate\/ViewState/);
  });

  it('utils/canvasLayout.ts re-exports ViewState from core/viewstate', () => {
    const filePath = join(process.cwd(), 'client/utils/canvasLayout.ts');
    const content = readFileSync(filePath, 'utf-8');
    
    expect(content).toMatch(/import.*ViewState.*from.*core\/viewstate\/ViewState/);
    expect(content).toMatch(/export type.*ViewState/);
  });
});

