/**
 * Orchestrator facade - coordinates Domain, Layout, ViewState, Renderer
 * Part of Agent B Inter Plan - B5
 * 
 * This is the central coordinator that:
 * - Routes edit intents to the correct sequence of operations
 * - Ensures proper ordering: Domain → Layout → ViewState → Render
 * - Never directly mutates; delegates to Domain/Layout/ViewState modules
 * 
 * Current implementation is a stub with routing placeholders.
 */

import type { EditIntent } from './types';
import { decideLayout } from './Policy';
// TODO: Import when available:
// import { runScopeLayout } from '../layout/ScopedLayoutRunner';
// import { adjustForReparent } from '../viewstate/adjust';
// import * as Domain from '../domain';

/**
 * Applies an edit intent by routing to the correct sequence of operations.
 * 
 * Routing:
 * - FREE geo-only: ViewState.write → emit render
 * - FREE structural: Domain.mutate → ViewState.adjust → emit render
 * - AI/LOCK structural: Domain.mutate → Layout.run → merge ViewStateDelta → emit render
 * 
 * @param intent - Edit intent to apply
 * @returns Promise that resolves when edit is complete
 */
export async function apply(intent: EditIntent): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Orchestrator] apply called', intent);
  }

  switch (intent.kind) {
    case 'geo-only': {
      // FREE geo-only: ViewState.write → emit render
      // TODO: Implement when ViewState.write helpers are available
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Orchestrator] geo-only path not yet implemented');
      }
      // Placeholder: would call ViewState.write, then trigger render
      break;
    }

    case 'free-structural': {
      // FREE structural: Domain.mutate → ViewState.adjust → emit render
      // TODO: Implement when Domain mutations and ViewState.adjust are available
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Orchestrator] free-structural path not yet implemented');
      }
      // Placeholder:
      // 1. Domain.mutate(intent.payload)
      // 2. ViewState.adjustForReparent(...)
      // 3. Emit render
      break;
    }

    case 'ai-lock-structural': {
      // AI/LOCK structural: Domain.mutate → Layout.run → merge ViewStateDelta → emit render
      // TODO: Implement when Domain mutations and Layout.run are available
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Orchestrator] ai-lock-structural path not yet implemented');
      }
      // Placeholder:
      // 1. Domain.mutate(intent.payload)
      // 2. const delta = await runScopeLayout(intent.scopeId, { anchorId: ... })
      // 3. Merge delta into ViewState
      // 4. Emit render
      break;
    }

    default: {
      const _exhaustive: never = intent;
      throw new Error(`[Orchestrator] Unknown edit kind: ${(intent as any).kind}`);
    }
  }
}




