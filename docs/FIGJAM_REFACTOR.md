# 🎛️ FigJam-style + AI Diagrams — Refactor Spec

> Purpose: unify **human-made** and **AI-made** diagrams on one canonical ELK-shaped domain graph, with **FREE** (manual) and **LOCK** (auto-layout) behaviors.

---

## 0) Core Principles

* **Single domain graph (ELK-shaped).** One tree of groups (sections), with nodes inside groups and **edges stored at the group that is the LCG of their endpoints**.
* **Two modes live on groups:**
  * **FREE:** manual geometry, no auto-ELK.
  * **LOCK:** internal auto-ELK whenever the structure inside that group changes.
* **AI edits** are **ELK-first** by default (they mutate domain and immediately get laid out in the relevant scope).
  **User edits** default to **FREE** (mutate domain + view; no ELK) unless the edited scope is **LOCK**.
* **Root cannot be LOCKed.** There will be a separate "Arrange All" action for whole-canvas layout.
* **Anchoring:** whenever ELK runs on a scope, keep that scope's top-left anchored so nothing "jumps."
* **No duplicate IDs** (nodes, edges, groups).
* **Indistinguishable by origin:** Once saved, diagrams do not reveal whether AI or human created them. Only group modes (FREE/LOCK) persist.

---

## Architecture Dataflow (Authoritative)

```
┌─────────────────────────────────────────┐
│ INPUT: User / AI actions                │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│ ORCHESTRATION (policy + sequencing)     │
│ - Classify: geo-only | FREE-structural | AI/LOCK │
│ - Pick scope: LCG(id…) / highest locked ancestor  │
│ - Execute ordered steps (below)                   │
│ - Emit render only after ViewState is valid       │
└─────────────────────────────────────────┘
     │                    │                          │
     │ (G) Geo-only FREE  │ (F) FREE structural      │ (S) AI/LOCK structural
     │                    │                          │
     ▼                    ▼                          ▼
(G)  ViewState.write  (F1) Domain.mutate        (S1) Domain.mutate
     (pos/size/pts)   (reparent/group/edges)         (add/move/group/edges)
     │                    │                          │
     │              (F2) ViewState.adjust       (S2) Layout.run(scope, anchored)
     │                   - preserve world x,y        - reads Domain
     │                   - update relative coords    - computes geometry
     │                    │                          │
     │                    ▼                          ▼
     └──────────────► VIEWSTATE (geometry SoT) ◄─────┘
                        - positions/sizes/waypoints
                        - writers: (G) orchestration; (F2) orchestration; (S2) layout
                        - readers: renderer only
                              │
                              ▼
┌──────────────────────────────┐
│ RENDERER (ReactFlow adapter) │
│ - reads VIEWSTATE only       │
│ - builds RF nodes/edges      │
│ - never reads ELK/DOMAIN     │
└──────────────────────────────┘

┌───────────────────────────┐           ┌───────────────────────────┐
│ DOMAIN (pure structure)   │  ─────►   │ LAYOUT (ELK, scoped)      │
│ - nodes/groups/edges/mode │  used by  │ - reads Domain            │
│ - no geometry             │           │ - writes ViewState only   │
└───────────────────────────┘           └───────────────────────────┘
```

Key invariants:
- Domain never feeds the renderer directly; all structural changes route through ELK to ViewState.
- Renderer reads geometry only from ViewState (no ELK/domain geometry, no fallbacks).
- Orchestration is the sole place that sequences Domain mutations, ViewState updates, and Layout runs.
- FREE structural reparent: Domain.mutate → ViewState.adjust (preserve world x,y) → Render (no ELK).

---

## 1) Vocabulary (final)

* **LCG(S)**: **L**owest **C**ommon **G**roup (deepest section/container that already contains every item in set S).
  Used for edge parentage and as layout scope for explicit arrange actions.
* **Selection**: what the user picked in the UI.
* **Wrapper Section**: a regular section created deliberately to contain a multi-selection so it can be treated as one scope.
* **Scope**: the group on which ELK runs (never root by default).
* **Source**: ephemeral runtime context (`'ai'` or `'user'`); **not persisted**.

---

## 2) Data Model

### 2.1 Domain graph (canonical, ELK-shaped)

Pure structure; **no permanent x/y**.

```ts
Group {
  id: string
  type: 'group'
  mode: 'FREE' | 'LOCK'         // default FREE
  labels?: [{ text: string }]
  children?: Array<Group | Node>
  edges?: Edge[]                // only edges whose endpoints' LCG == this group
}

Node {
  id: string
  type: 'node'
  labels?: [{ text: string }]
  // no x/y/size stored here
}

Edge {
  id: string
  type: 'edge'
  sources: [nodeId]             // single source for now
  targets: [nodeId]             // single target for now
  labels?: [{ text: string }]
  // no waypoints here; parentage is implicit via placement inside Group
}
```

> **Invariant:** every edge object resides in the group `LCG({source, target})`.

### 2.2 View-state (authoritative geometry for rendering)

Manual/ELK geometry lives here; re-written by ELK or drags.

```ts
ViewState {
  node: { [id]: { x, y, w, h } }          // nodes
  group: { [id]: { x, y, w, h } }         // section frames
  edge: { [id]: { waypoints?: Point[] } } // optional manual routes in FREE
}
```

* **FREE:** drags/resizes write to `ViewState` only.
* **LOCK:** ELK writes `ViewState` for the locked scope.

### 2.3 Indices (for speed & correctness)

* `parentOf: { id -> groupId }` (updated on reparent)
* `pathToRoot(id): groupId[]` (for LCG)
* R-tree/quad-tree for hit-testing & containment checks (sections).

### 2.4 Reparenting and Domain Changes

* Dragging a node across group boundaries updates the domain graph (the node’s parent changes).
* Dragging a group across boundaries updates the domain graph (the group’s parent changes). If a group now fully contains other sections/nodes, those may be adopted; if items fall outside, they may be ejected per FREE rules.
* Moving a LOCK group “as a whole” only translates geometry when parentage does not change. If the move crosses into a different parent (or creates/enters a wrapper), the domain changes (reparent), and ELK policy applies.

---

## 3) ELK Triggers Matrix

| Operation                                               | Who      | Scope that runs ELK                                                                       | Runs ELK?                         |
| ------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------- | --------------------------------- |
| Add/Move/Delete Node/Edge/Group inside a **FREE** group | **User** | —                                                                                         | **No** (just update ViewState)    |
| "Auto-layout" button (FREE)                             | User     | `LCG(selection)` or newly created **Wrapper Section**                                     | **Yes** (once)                    |
| Toggle **FREE → LOCK** on a group                       | User     | that group's subtree                                                                      | **Yes** (normalize once)          |
| Any structural change inside a **LOCK** group           | User     | **Highest locked ancestor** that encloses the change                                      | **Yes**                           |
| Any AI mutation (add/move/group/edge)                   | **AI**   | The AI's chosen group scope (usually the target group or `LCG(selection)` it operates on) | **Yes** (always)                  |
| Moving a **LOCK** group as a whole                      | User     | — (if parentage unchanged)                                                                | **No** (block translation only)   |

> In **LOCK**, there's **no "Auto-layout" button**; lock **is** auto-layout.
> In **FREE**, nothing auto-layouts unless the user explicitly asks or toggles the group to LOCK.

### 3.1 Scope Resolution and Chain Locking

When ELK runs (AI or LOCK cases):
* Lock the entire ancestor chain of the edited scope up to (but not including) root. This stabilizes enclosing frames and prevents bumping into unlocked containers.
* Choose the top‑most locked ancestor within that chain (under root) as the ELK scope.
* Run anchored ELK on that scope (see §6.6). Other parts of the canvas remain unchanged.

---

## 4) FREE Mode — Interaction Rules

### 4.1 Add Node (box)

* **Domain:** create node as child of chosen group.
* **View:** place at drop point (snap-to-grid).
* **ELK:** **No**.

### 4.2 Add Edge (connector)

* **Constraint:** can **only** add edge between **nodes** (not from selection).
* **Domain:** create edge **in** `LCG({source, target})`.
* **View:** draw connector immediately (orthogonal/manual, rubber-band while dragging).
* **ELK:** **No**.

#### 4.2.a Dragging across boundaries (reparent)
* **Domain:** dragging nodes or groups across group boundaries changes parentage; after any reparent, recompute edge parentage via `LCG({u,v})` and move edges to their correct group.
* **View:** update ViewState for positions; connectors rubber‑band during drag.
* **ELK:** **No** in FREE unless user explicitly arranges or toggles to LOCK.

### 4.3 Create Section from multi-selection

* **Behavior (FREE):**
  * Create a **section around only the selected children** (no closure expansion).
  * **Reparent subsections** that are **fully enclosed** by the new section's frame.
  * **Nodes without an immediate parent** get added under the new section.
  * **Edges**: reparent any edges whose endpoints' `LCG` changed due to the moves.
* **Domain:** insert section under `LCG(selection)`; perform the reparent rules above.
* **View:** keep positions; draw the new frame around them.
* **ELK:** **No**.

> Note: make "Wrapper Section" explicit label in the UI when you create it for layout purposes.

### 4.4 Move Node

* **Domain:** if dropped into a different section → reparent; recompute edge parent groups (`LCG({u,v})`).
* **View:** while dragging, **keep edges visually attached** (rubber-band). On drop, commit handle positions.
* **ELK:** **No**.

### 4.5 Move Section

* **Domain:** if, after drop, the moved section **fully contains** another section's bbox → reparent that contained section under the moved section. Also reparent nodes **fully enclosed** that have no closer parent. Reparent edges as necessary (per new `LCG({u,v})`).
* **View:** translate the section frame and its children; unaffected neighbors stay put.
* **ELK:** **No**.

### 4.6 Resize Section

* **Domain:**
  * **Reparent OUT** nodes/sections that fall **completely outside** after resize (hoist to parent).
  * **Reparent IN** nodes/sections that fall **completely inside** (adopt).
  * Reattach edges if `LCG({u,v})` changes.
* **View:** frame resizes; children remain where they were (except reparent side-effects).
* **ELK:** **No**.

### 4.7 Delete Node / 4.8 Delete Edge / 4.9 Delete Section

* **Domain:** normal removal + purge incident edges (for nodes/sections) + move section-owned edges up.
* **View:** remove visuals; keep others as-is.
* **ELK:** **No**.

### 4.10 Toggle FREE → LOCK (on a section)

* **Domain:** `mode = LOCK`.
* **ELK:** **Yes (once)** on that section to normalize; write positions.
* **View:** anchored; auto-fit frame.

### 4.11 Multi-select "Auto-layout" (explicit)

* **Scope:** `LCG(selection)`; if nothing contains all, **create a wrapper section**, reparent selection into it.
* **ELK:** **Yes (once)** on that scope; write positions; anchor scope.
* **View:** local reflow only.

### 4.12 Cross-section connectors

* **Domain:** edges always live at `LCG({A,C})`.
* **View:** draw/remove; **no ELK** unless user explicitly arranges that scope.

---

## 5) LOCK Mode — Rules

> In LOCK, **internal auto-layout is on**; **no "Auto-layout" command** exists here.
> **Resizing a locked section is not allowed.**
> Drag-and-drop adoption uses an **explicit highlight** target (no "full containment" requirement).

### 5.1 Add Node (inside LOCK)

* **Domain:** add node inside the locked section.
* **ELK:** run on that locked section's subtree.
* **View:** reflowed; anchored.

### 5.2 Add Edge

* **Domain:** store at `LCG({u,v})`.
* **ELK:** run at the **highest locked ancestor** touched by the edit (often the section itself).
* **View:** routed by ELK; anchored.

### 5.3 Create Section from selection (inside LOCK)

* **Domain:** create section, reparent selected children under it.
* **LOCK nuance:** The **parent locked** section still governs. The **new child** can be FREE or LOCK later, but the parent's auto-layout will run for the parent scope.
* **ELK:** parent locked scope runs (single pass).
* **View:** anchored.

### 5.4 Move Node (inside LOCK)

* **Domain:** reparent on drop; reattach edges.
* **ELK:** winning locked scope runs.
* **View:** anchored.

### 5.5 Move Section (inside LOCK)

* **UX:** explicit drop target highlight decides reparent; **no full-containment requirement** here.
* **Domain:** if dropped onto a highlighted section target → reparent under it; reattach edges.
* **ELK:** resolve scope by locking the ancestor chain (up to but not including root) and running on the **top‑most locked ancestor (under root)** that encloses the edit; anchored.
* **View:** anchored.

### 5.6 Resize Section

* **Not allowed in LOCK.**

### 5.7–5.9 Delete node/edge/section

* **Domain:** remove + reparent effects as usual.
* **ELK:** winning locked scope runs.
* **View:** anchored.

### 5.10 Toggle LOCK → FREE

* **Domain:** `mode = FREE`.
* **ELK:** none (keep current geometry exactly).
* **View:** unchanged; future edits manual.

### 5.11 Cross-section connectors

* **Domain:** unchanged rule (`LCG({u,v})`).
* **ELK:** if the winning locked scope encloses both endpoints (or the edit), it runs; else not.
* **View:** anchored.

### 5.12 Root cannot be locked

* Provide a separate **"Arrange All (root)"** action; confirm before running ELK at root.

### 5.13 No "Auto-layout" command in LOCK

* LOCK *is* auto-layout; user can't trigger a separate arrange.

### 5.14 Nested groups default to locked?

* **Rule:** "nested groups are locked by default, can only make free; making subgroup free doesn't unlock parents; making parent free/lock toggles descendants."
* **Spec:**
  * Toggling **parent** FREE/LOCK **propagates** to descendants.
  * Toggling a **child** can only **relax** to FREE; it does **not** flip ancestors.
  * Gesture routing always executes **one** ELK pass at the **highest locked ancestor** covering the edit.

### 5.15 No preserve-manual-route

* ELK may re-route edges; keep it simple.

---

## 6) Algorithms (no code, just the plan)

### 6.1 LCG(S)

* Precompute `pathToRoot(id)` for each node/section.
* Walk from the deepest upward to find the **lowest** group that appears in all paths.

### 6.2 Edge parentage maintenance

* After any **reparent** of a node or section:
  * For each incident edge `e(u,v)`, compute `g = LCG({u,v})`.
  * If `edge.parent !== g`, move edge object to `g.edges`.

### 6.3 FREE: Section creation rules

* Given selection **S**:
  1. Create section **W** under `LCG(S)`.
  2. Put **only selected children** inside **W**.
  3. If **W** fully contains a section **K** → reparent **K** into **W**.
  4. If **W** fully contains nodes without an immediate parent → reparent those nodes into **W**.
  5. Reparent edges whose endpoints' `LCG` changed.

### 6.4 FREE: Move/Resize adoption rules

* **Move Section:** on drop, for any overlapped section **K** that's **fully enclosed** → reparent **K** under moved section. Recompute edge parentage.
* **Resize Section:** after resize, adopt/eject children that are **fully inside/outside**. Recompute edge parentage.

### 6.5 LOCK: Gesture routing

* For any mutation, compute the **highest locked ancestor** that encloses the edit → run **one** ELK pass on that subtree.
* If none locked → it falls back to FREE rules (no ELK).

### 6.6 Anchoring ELK output

* First lock the entire ancestor chain of the edited scope (up to but not including root), then pick the **top‑most locked ancestor (under root)** as the ELK scope.
* Compute the pre-layout **scope bbox top-left**; after ELK, translate the output so that top-left stays the same.
* Write `ViewState` for nodes/edges/groups within that scope.
* Auto-fit the section frame to children.

---

## 7) AI vs User Integration

* **AI:**
  * Picks a target scope (a group or a wrapper it creates). If the target is **FREE**, AI first sets it to **LOCK** to maintain ELK‑first behavior.
  * Applies mutations (add/move/group/edges).
  * **Always** triggers ELK immediately by locking the ancestor chain and running anchored ELK on the **top‑most locked ancestor (under root)** that encloses the edit.
  * Default mode: LOCK (but does not persist "createdBy").
* **User:**
  * Works in **FREE** by default; all the FREE rules above apply.
  * When they toggle a section to **LOCK**, the first ELK normalizes geometry, then LOCK semantics apply.
  * A **locked** section can still be **moved as a whole** without triggering ELK on siblings (it's a block translation).
  * Default mode: FREE (but does not persist "createdBy").

**Critical invariant:** Once saved, the diagram is indistinguishable by origin. Only group `mode` flags persist; no "source" or "createdBy" metadata exists.

---

## 8) Bump Without Global ELK (Collision Resolution)

**Goal:** When an AI edit (or a LOCK-mode user edit) makes a group's contents bigger and they collide with other things on the canvas, clear the overlaps without global ELK, without moving the edited selection, and without left/up "ping-pong".

**Policy:** translate obstacles only; selection stays anchored; push right, then down; treat moved ancestors as rigid blocks.

### When this runs

* After an AI mutation that changes footprint (add/move/group/edge) or any edit inside a LOCK group.
* Free-mode user edits do not auto-bump; they're manual unless the user locks or explicitly arranges.

### Inputs & constants

* **Sel**: current selection (the things AI edited; can be a section or nodes).
* **LCGsel**: lowest common group of Sel (selection only; no "closure" expansion).
* **margin**: clearance gap (e.g., 12).
* **grid**: snap size (e.g., 8 / 16).
* **Direction rule**: prefer Right if it clears; otherwise Down. (Tie → Right.)
* **Rigid blocks**: when translating an ancestor, move it as one rectangle (no internal ELK).

### Phase 1 — Make the "bubble" stable

1. Lock the entire ancestor chain of LCGsel up to (but not including) root.
2. Run one ELK on the highest locked ancestor, anchoring LCGsel's top-left so the edited area doesn't jump.
3. Write ELK geometry to ViewState for that locked subtree only.
4. Root is always FREE; it's unbounded and never auto-laid out by this flow.

### Phase 2 — Find obstacles

Build a spatial index (grid/R-tree) of items that can overlap the bubble:

* If an item shares LCGsel, the obstacle is the item itself.
* If an item doesn't share LCGsel (or common is root), the obstacle is its highest non-root parent (move that container as a unit).

### Phase 3 — Deterministic bump chain (monotone)

For each overlapping obstacle O (fixed order: by distance from Sel's top-left; tie: top→bottom, then left→right):

1. Compute minimal deltas to clear by margin:
   * `dx = max(0, bubble.right + margin - O.left)`
   * `dy = max(0, bubble.bottom + margin - O.top)`
2. Choose the smaller; if equal, choose Right.
3. Snap the chosen delta to grid.
4. Translate O (or its highestNonRootParent) by that delta. Treat as a rigid block (no internal ELK).
5. Update the spatial index and continue scanning until no overlaps remain.

### Properties

* **Monotone** (Right/Down only) ⇒ no oscillation/ping-pong.
* **Deterministic** (fixed scan order + direction rule) ⇒ stable outcomes.
* **Terminates**: with unbounded root, repeated Right/Down shifts always find clearance.

### Edge & section side-effects

* If a node/section is reparented by a separate gesture (not by bump), recompute edge parentage (edge lives at LCG({u,v})).
* During bumping we do not reparent—only translate obstacles as rectangles. Connectors visually re-route after positions settle.

### What we explicitly don't do here

* No global/root ELK.
* No pushing Left/Up.
* No changing internal spacing/compaction.
* No "closure" expansion for scope picking (LCG is computed from selection only).

---

## 9) Undo/Redo + Cost Control

* Record **domain mutations** as undoable steps (small JSON ops).
* Store **view diffs** (only changed ids' geometry) to keep memory small.
* **Coalesce AI streams** into a single undo step (or a small batch).
* Persist snapshots to Firebase **only on explicit save / share / pause**; keep most undo in memory (ring buffer).
* Optional periodic "lightweight checkpoints" (e.g., every N ops) to make redo robust without spamming writes.

---

## 10) Acceptance Tests (Given/When/Then)

1. **FREE: Create Section from selection**
   * **Given** nodes A,B and section K nearby; select A,B and "Create Section".
   * **When** new section W appears.
   * **Then** only A,B become children of W; K stays put **unless** fully enclosed by W; edges reparented if LCG changed.

2. **FREE: Move Node keeps edges attached**
   * **Given** edge A→B.
   * **When** dragging A.
   * **Then** connector rubber-bands to A; on drop, edge remains; if A's parent changed, edge's parent group updates to `LCG({A,B})`.

3. **FREE: Move Section adopts fully contained sections**
   * **Given** section M moved over section N.
   * **When** N is fully inside M on drop.
   * **Then** N reparents under M; edge parents reattached as needed; no ELK.

4. **FREE: Resize Section adopts/ejects**
   * **Given** section S, node A near boundary.
   * **When** resizing S so A becomes fully inside.
   * **Then** A reparents under S; edges reattached.

5. **FREE: Multi-select Auto-layout**
   * **Given** A,B scattered with no common parent.
   * **When** select both and click Arrange.
   * **Then** create Wrapper Section W, move A,B inside W, run ELK(W), anchor, write geometry.

6. **LOCK: Add Node**
   * **Given** section L is LOCK.
   * **When** add node A inside L.
   * **Then** ELK runs on L; geometry written; anchored.

7. **LOCK: Move Section with explicit drop target**
   * **Given** sections L (LOCK) and T (target).
   * **When** dragging L and dropping onto T's highlighted surface.
   * **Then** reparents L under T; ELK runs at winning locked scope; anchored.

8. **LOCK: Resize disallowed**
   * **Given** section L is LOCK.
   * **When** attempt to resize L.
   * **Then** blocked.

9. **Root never LOCK**
   * **Given** root.
   * **When** user tries to lock root.
   * **Then** disallow; offer "Arrange All" instead with confirmation.

10. **AI edit always ELK**
* **Given** AI adds A,B and edge A→B into target section X (FREE or LOCK).
* **When** operation completes.
* **Then** ELK runs on X; geometry written; anchored.

11. **Bump collision resolution**
    * **Given** AI adds nodes inside LOCK group G, causing G to grow and overlap obstacle O.
    * **When** mutation completes.
    * **Then** ELK runs on G (anchored); bump algorithm pushes O right/down; no global ELK; selection stays anchored.

12. **Indistinguishable by origin**
    * **Given** diagram created by AI (with LOCK groups) and user (with FREE groups).
    * **When** saved and reloaded.
    * **Then** no "createdBy" or "source" metadata exists; only group `mode` flags persist; behavior is determined by mode, not origin.

---

## 11) Refactor Plan (milestones)

### Phase 0 — Foundations (No Breaking Changes)

* Introduce **Domain vs ViewState** split.
* Add `viewStateRef` to `useElkToReactflowGraphConverter` (holds authoritative positions).
* Add **mode flag** per group (default FREE) to domain graph schema.
* Keep existing behavior (everything still triggers ELK) to ensure nothing breaks.
* **Test:** Existing functionality works identically.

### Phase 1 — Conditional ELK Triggering

* Modify Layer 5 (ELK useEffect) to check mode before running.
* Add orchestration layer (Layer 2) ephemeral `source: 'ai' | 'user'` parameter.
* Implement policy gate in Layer 3:
  * If `source === 'ai'` → run ELK on target scope.
  * If `source === 'user'`:
    * If scope (or highest locked ancestor) is LOCK → run ELK on that scope.
    * Else (FREE) → skip ELK, update ViewState only.
* Implement **anchored ELK(scope)** runner that writes to ViewState.
* **Test:** AI edits trigger ELK; user FREE edits skip ELK; user LOCK edits trigger scoped ELK.

### Phase 2 — Scope-Based ELK

* Implement scope-based ELK (run only on changed group, not whole graph).
* Implement anchoring: compute pre-layout bbox top-left, translate output to keep it fixed.
* Auto-fit section frames to children after ELK.
* **Test:** ELK runs only on affected scope; selection doesn't jump; positions are stable.

### Phase 3 — FREE Mode Parity

* Implement FREE rules 4.1–4.12 (add/move/resize/sections/adoption/auto-layout).
* Wrapper Section for multi-select auto-layout.
* Rubber-band edges during drags.
* Snap-to-grid always on.
* **Test:** User can create diagrams manually in FREE mode; positions persist; no ELK unless explicit.

### Phase 4 — LOCK Mode

* Gesture routing to **highest locked ancestor**.
* Enforce **no resize** for locked sections.
* Explicit **drop target highlighting** for section-to-section reparent (no full-containment check).
* Remove "Auto-layout" surface from locked scopes (it's automatic).
* **Test:** LOCK mode auto-layouts on every edit; FREE subgroups work independently.

### Phase 5 — Bump Collision Resolution

* Implement spatial index (R-tree/grid) for obstacle detection.
* Implement Phase 1 (make bubble stable with anchored ELK).
* Implement Phase 2 (find obstacles using LCG rules).
* Implement Phase 3 (deterministic monotone bump chain).
* **Test:** AI edits (or LOCK edits) that cause overlaps trigger bump; obstacles move right/down only; selection stays anchored; no global ELK.

### Phase 6 — AI Integration

* AI mutations always run ELK on their chosen scope.
* Coalesce streaming ops into one undo step.
* Keep root FREE; confirm before any "Arrange All".
* **Test:** AI creates diagrams with LOCK groups; bump resolves collisions; saved diagrams are indistinguishable by origin.

### Phase 7 — Persistence & Polish

* Save ViewState alongside domain graph.
* Load ViewState on reload.
* Remove any temporary "source" or "createdBy" fields (they should never persist).
* Implement undo/redo with view diffs.
* **Test:** Saved diagrams reload correctly; positions are preserved; no origin metadata exists.

---

## 12) Developer Checklists

* [ ] No duplicate ids on create.
* [ ] After any reparent, **recompute edge parent groups** for incident edges.
* [ ] ELK writes **only** to ViewState; Domain remains structural.
* [ ] When ELK runs, **anchor** scope top-left and **auto-fit** section frame.
* [ ] FREE section creation: **selected children only**; adopt fully enclosed sections; adopt orphan nodes; no closure expansion.
* [ ] FREE move/resize: implement **adopt/eject** by full containment; recompute edge parentage.
* [ ] LOCK: block resize; explicit drop target for reparent.
* [ ] Root cannot be LOCKed.
* [ ] History: coalesce AI edits; local ring buffer; persist only on explicit actions.
* [ ] Bump: monotone right/down only; deterministic ordering; no global ELK.
* [ ] **No "source" or "createdBy" metadata persists.** Saved diagrams are indistinguishable by origin.

---

## 13) Implementation Layers (Where to Change)

### Layer 1: Input Sources (No Changes)
* User: Chatbox, DevPanel, ReactFlow interactions
* AI: handleFunctionCall.ts

### Layer 2: Orchestration (Minimal Changes)
* Add ephemeral `{ source: 'ai' | 'user', scopeId }` parameter to mutation calls
* InteractiveCanvas.handleChatSubmit() → calls with `source: 'ai'`
* User interactions → call with `source: 'user'`
* **Do not persist source; it's runtime policy only**

### Layer 3: State Management (Key Changes)
* `useElkToReactflowGraphConverter`:
  * Add `viewStateRef` for authoritative positions
  * Add `mutate({ source, scopeId }, fn, ...args)` wrapper
  * Implement policy gate: when to trigger ELK based on source + mode
  * Sync ReactFlow from ViewState (not directly from ELK)

### Layer 4: Mutations (No Changes)
* Keep `mutations.ts` pure and unchanged
* No knowledge of ELK, modes, or sources
* Domain-only operations

### Layer 5: Layout Engine (Key Changes)
* Make ELK conditional (not automatic on every graph change)
* Implement `runScopeLayout(scopeId, { anchorId })` for scoped, anchored ELK
* Implement `resolveBumps({ selectionIds, lcgId, margin, grid })` for collision resolution
* Write positions to ViewState only (not domain graph)

### Layer 6: ReactFlow View (Minor Changes)
* Sync from ViewState (not directly from ELK output)
* User drags write to ViewState in FREE mode
* Snap-to-grid on all manual positioning

---

This spec is ready for phased implementation. Start with Phase 0 (foundations) and test after each phase before proceeding.

