<!-- 518c3613-8505-4fa7-9237-2b2968aabbbf 518af947-ecaa-4cf8-afc4-d62d5260499d -->
# Wave 2 Alignment Checkpoints (Coordinates × FREE/LOCK)

## CP1 — Adapter skeleton (no behavior change)

- Scope
- Introduce library-agnostic coordinate layer without changing behavior.
- Ships (Coordinate plan)
- CoordinateService: world↔relative, ELK↔world, snap helpers
- CanvasAdapter interface + provider
- ReactFlowAdapterV2 implementing CanvasAdapter (delegates only)
- Renderer continues ViewState-first
- Ships (Wave 2)
- Wrapper Section creation (domain reparent + single explicit ELK when arranged)
- LOCK gesture routing (highest locked ancestor) and policy wiring
- LOCK UI/Restrictions: block resize in LOCK, hide arrange in LOCK (prep explicit drop-target UX)
- Stop lines after CP1
- Do not implement adopt/eject; do not implement rubber-band; do not rely on RF positions for containment
- Exit checks
- All tests green; rendering unchanged
- Wrapper Section creates correctly; LOCK policy routes without coordinate regressions

## CP2 — Containment on world (adopt/eject ready)

- Scope
- Move all hit-testing/containment to world coordinates via adapter.
- Ships (Coordinate plan)
- Containment uses `CanvasAdapter.getWorldNodeBounds/getWorldPositions` only
- FREE commit-on-drop: write world x,y to ViewState; if parent changed → Domain.reparent + ViewState.adjust (preserve world x,y)
- Ships (Wave 2)
- Adopt/Eject on move/resize: full-containment rules using world bounds; recompute edge parentage (LCG) after reparent
- Complete Wrapper behaviors that require precise containment
- Stop lines after CP2
- Do not ship rubber-band connectors; defer hover drop-target logic that needs live temp positions to CP3
- Exit checks
- Moving nodes/groups in/out changes Domain parentage only; no visual jumps
- Unit tests for full-containment and adopt/eject pass

## CP3 — Drag temp world positions (rubber-band ready)

- Scope
- Provide temporary world positions during drag; commit at drop.
- Ships (Coordinate plan)
- Adapter drag lifecycle: `beginDrag/updateDrag/endDrag` + temp world positions overlay
- Renderer/edge visuals consume temp world positions during drag; ViewState remains unchanged until drop
- Ships (Wave 2)
- Rubber-band connectors follow nodes during drag
- LOCK explicit drop-target reparent visuals (optional but enabled by temp world positions)
- Stop lines after CP3
- None specific; proceed to LOCK anchored verification
- Exit checks
- Live drag shows rubber-band; on drop ViewState commits or LOCK flow triggers; no mid-drag persistence

## CP4 — LOCK anchored layout verification

- Scope
- Ensure LOCK flow writes anchored ViewState and renders correctly through adapter.
- Ships (Coordinate plan)
- Verify Scoped ELK writes world coords; adapter renders; anchoring preserved
- Ships (Wave 2)
- LOCK acceptance scenarios (5.x in spec) run end-to-end
- Exit checks
- Acceptance 5.x tests green; no jumps when ELK runs, scope top-left anchored

## CP5 — Persistence precedence & reload correctness 🚫 BLOCKED

⚠️ **BLOCKED BY**: Mode Domain→ViewState Migration (Phase 3)
📋 **See**: `.cursor/plans/mode-domain-to-viewstate-migration.plan.md`

- Scope
- Finalize snapshot rules and reload stability across edits and reparent.
- Ships (Both)
- Snapshot = Domain + ViewState (world + layout modes); for same architecture ID, local snapshot always wins over URL
- Reload preserves deletions, reparents, AND mode states
- Exit checks
- E2E reload tests validate: delete → refresh → stays deleted; move in/out → refresh → parentage/positions preserved; mode → refresh → mode preserved

## Cross-team Stop/Go Summary

- After CP1: Wave 2 may proceed only on Wrapper Section, LOCK routing, and UI restrictions
- After CP2: Wave 2 may implement Adopt/Eject using world containment
- After CP3: Wave 2 may implement Rubber-band and LOCK drop-target visuals
- After CP4: Validate LOCK acceptance; fix regressions only
- **🚫 CP5 BLOCKED**: Wait for Mode Migration Phase 3 (see mode-domain-to-viewstate-migration.plan.md)
- After CP5: Ship persistence; proceed to next waves

## Guardrails

- Renderer strictly reads ViewState; ELK only informs structure/waypoints
- All world↔canvas conversions confined to adapters; core remains canvas-agnostic

### To-dos

- [ ] Add CoordinateService + CanvasAdapter + ReactFlowAdapterV2 (delegate only)
- [ ] Ship Wrapper Section, LOCK routing, and LOCK UI/Restrictions
- [ ] Refactor containment to use adapter world bounds/positions only
- [ ] FREE: commit-on-drop to ViewState; reparent Domain + adjust geometry
- [ ] Implement adopt/eject on move/resize using world full containment
- [ ] Adapter provides temp world positions during drag (lifecycle API)
- [ ] Implement rubber-band connectors and drop-target visuals using temp positions
- [ ] Verify LOCK anchored ELK writes ViewState; pass acceptance 5.x
- [ ] Enforce local snapshot precedence and reload stability
- [ ] Add E2E reload tests for delete and reparent persistence