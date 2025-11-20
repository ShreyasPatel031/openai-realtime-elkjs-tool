# Core Graph Engine

This directory contains the core graph engine modules organized by layer:

```
core/
├── domain/          # Pure structure (nodes, groups, edges, no geometry)
├── viewstate/       # Authoritative geometry (positions, sizes, waypoints)
├── layout/          # ELK orchestration (scoped, anchored layout runs)
├── renderer/        # ReactFlow conversion (reads Domain + ViewState)
└── orchestration/   # Policy & coordination (routes intents, sequences operations)
```

## Architecture Flow

```
INPUT → orchestration → domain → layout → viewstate → renderer → OUTPUT
```

See `docs/FIGJAM_REFACTOR.md` for the complete architecture diagram.

## Module Responsibilities

- **domain/**: Pure structure mutations (addNode, moveNode, groupNodes, etc.)
- **viewstate/**: Geometry store (createEmpty, requireGeometry, adjustForReparent)
- **layout/**: Scoped ELK execution (runScopeLayout with anchoring)
- **renderer/**: ReactFlow adapter (toReactFlowWithViewState - ViewState-first)
- **orchestration/**: Policy decisions (decideLayout, findHighestLockedAncestor) and intent routing (apply)

## Key Invariants

1. **ViewState is the geometry source of truth** - Renderer reads exclusively from ViewState
2. **No fallbacks** - If geometry missing, fail loudly in dev
3. **Domain never affects renderer directly** - All geometry flows: Domain → Layout → ViewState → Renderer
4. **Orchestration coordinates** - Only orchestration writes to Domain/Layout/ViewState

## Agent Implementation Status

- **B1 (Renderer)**: ✅ Complete - ViewState-first adapter with dev assertions
- **B2 (ViewState)**: ✅ Complete - Types, helpers, adjustForReparent
- **B3 (Layout)**: 🔄 Stub - Signature ready for Agent C
- **B4 (Policy)**: 🔄 Stub - Signatures ready for Agent D
- **B5 (Orchestrator)**: 🔄 Stub - Routing placeholders ready for implementation
- **B6 (UI Seam)**: ⏳ Pending - Wire orchestrator into InteractiveCanvas
- **B7 (Tests)**: ✅ Complete - Unit tests for adapter and adjustForReparent





