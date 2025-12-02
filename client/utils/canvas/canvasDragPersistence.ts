/**
 * Canvas Drag Persistence
 * 
 * Handles persisting ViewState changes after drag operations.
 * Follows FIGJAM_REFACTOR.md: FREE mode updates ViewState directly, no ELK.
 */

import { saveCanvasSnapshot } from '../canvasPersistence';
import type { ViewState } from '../../core/viewstate/ViewState';
import type { RawGraph } from '../../components/graph/types';

/**
 * Persists ViewState after a drag operation completes.
 * Called when drag ends (dragging: false) to save position changes.
 */
export function persistViewStateAfterDrag(
  viewState: ViewState,
  rawGraph: RawGraph | null,
  selectedArchitectureId: string | undefined
): void {
  if (selectedArchitectureId && rawGraph) {
    saveCanvasSnapshot(rawGraph, viewState, selectedArchitectureId);
  }
}





