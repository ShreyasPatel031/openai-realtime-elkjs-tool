# Draft Group Node Integration Plan

## Scope
Integrate the new `DraftGroupNode` and `GroupHoverPreview` from `origin/2025-11-04-iylh-vRFcS` into the current arrow/hand-enabled canvas without regressing recent layout, connector, or tool-mode improvements.

## Tasks
1. **Bring in new components**
   - Add `DraftGroupNode.tsx` and `GroupHoverPreview.tsx`.
   - Register `DraftGroupNode` in existing `nodeTypes`; ensure layout metadata (width/height) persists via `viewStateRef` so legacy graphs stay positioned.

2. **Canvas scaffolding alignment**
   - Fold the toolbar/container layout changes we need from the feature branch into `InteractiveCanvas.tsx` (top/side toolbars) while keeping our current arrow/hand defaults, ELK-skip logic, and connector dedupe.
   - Reuse useful helpers from the branch (`useCanvasInteractions`, `useToolSelection`, etc.) by merging behaviour rather than overwriting files.

3. **Hover preview wiring**
   - Mount `GroupHoverPreview` alongside `NodeHoverPreview`; toggle on group tool activation and keep positioning in sync with viewport + grid.

4. **Data/model updates**
   - Merge additions to `graph/mutations.ts`, `toReactFlow.ts`, `types/graph.ts`, and `docs/DATA_MODEL.md` so new group state fields save & reload safely.
   - Retain our arrow/hand, skip-ELK, and onConnect changes while layering in any complementary logic from the branch.

5. **Regression checklist**
   - Load legacy architectures with groups — verify no layout drift.
   - Create & resize new groups; confirm hover preview, handles, and top/side toolbars behave as per Figma spec.
   - Check arrow/hand toggles, connector creation, and group tool interactions.
   - Run Playwright canvas tests and expand coverage if necessary.

## Notes
- Avoid merging the feature branch wholesale; it lacks recent arrow/hand and ELK fixes.
- Large generated asset diffs (embedding/icon JSON) appear unrelated — keep current versions unless we specifically need the updates.
- Remove this `docs/tmp-plan` folder once integration is complete.
