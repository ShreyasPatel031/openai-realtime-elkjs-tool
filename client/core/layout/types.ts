/**
 * Layout types for scoped ELK execution
 * Part of Agent B Inter Plan - B3
 */

import type { ViewState } from '../viewstate/ViewState';

/**
 * Delta of ViewState changes produced by a layout run.
 * Contains only the geometry that changed (partial ViewState).
 */
export type ViewStateDelta = Partial<ViewState>;

/**
 * Options for scoped layout execution
 */
export interface LayoutOptions {
  /**
   * ID of node/group to anchor (preserve its top-left position)
   * If provided, layout output will be translated to keep this entity's top-left fixed.
   */
  anchorId?: string;
}

