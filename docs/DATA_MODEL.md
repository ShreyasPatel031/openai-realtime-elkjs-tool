# Data Model Architecture

This document defines the **ironclad data structures** used throughout the application. The architecture maintains strict separation between **domain graph** (structure) and **view state** (layout/rendering).

---

## Core Principle: 3-Layer Separation

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: DOMAIN GRAPH (Pure Structure)                  │
│ - Stored in Firebase, shared URLs, persisted            │
│ - NO positions, NO layout info, NO rendering details    │
│ - Just: nodes, edges, groups, labels, relationships     │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: LAYOUT ENGINE (Swappable - currently ELK)      │
│ - Takes Domain Graph as input                           │
│ - Computes positions → writes to ViewState              │
│ - Can be replaced with any algorithm                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: VIEW STATE (Ephemeral Geometry)                │
│ - NOT persisted to Firebase (computed on load)         │
│ - Just positions: { nodes: {id: {x,y,w,h}}, edges: {}} │
│ - Renderer reads from here (currently ReactFlow)        │
└─────────────────────────────────────────────────────────┘
```

**Key Invariant**: Domain Graph contains **ZERO** position/layout information. All rendering concerns live in ViewState.

---

## 1. Domain Graph (Pure Structure)

This is what gets **saved to Firebase**, **shared via URLs**, and **persisted**. It contains **ONLY** structural relationships and content - no positions, sizes, or rendering directives.

### DomainGraph

```typescript
type DomainGraph = {
  id: 'root'
  type: 'group'
  children: Array<DomainNode | DomainGroup>
  edges: DomainEdge[]
}
```

### DomainNode

```typescript
type DomainNode = {
  id: string                    // e.g., "user-node-123"
  type: 'node'
  labels?: Array<{ text: string }>
  icon?: string                 // optional icon name
  
  // ❌ NO x, y, width, height - these live in ViewState
  // ❌ NO mode (FREE/LOCK) - that's canvas-level, lives in ViewState
}
```

### DomainEdge

```typescript
type DomainEdge = {
  id: string                    // e.g., "edge-456"
  sources: [string]             // [sourceNodeId]
  targets: [string]             // [targetNodeId]
  labels?: Array<{ text: string }>
  
  // ❌ NO waypoints, NO routing info - these live in ViewState
}
```

### DomainGroup

```typescript
type DomainGroup = {
  id: string
  type: 'group'
  labels?: Array<{ text: string }>
  icon?: string                 // optional icon name
  children: Array<DomainNode | DomainGroup>
  edges: DomainEdge[]           // edges whose LCG is this group
  
  // ❌ NO mode (FREE/LOCK) here - that's canvas-level, lives in ViewState
  // ❌ NO x, y, width, height - these live in ViewState
}
```

---

## 2. View State (Ephemeral Geometry)

This is **NOT persisted to Firebase** (computed on load). It contains **ALL** position, size, and layout information. It is computed fresh when loading a diagram based on the current layout algorithm.

### ViewState

```typescript
type ViewState = {
  nodes: {
    [nodeId: string]: {
      x: number              // World coordinates
      y: number
      w: number              // Width
      h: number              // Height
    }
  }
  groups: {
    [groupId: string]: {
      x: number
      y: number
      w: number
      h: number
    }
  }
  edges: {
    [edgeId: string]: {
      waypoints?: Array<{x: number, y: number}>  // Optional manual routing
    }
  }
  layout: {
    [groupId: string]: {
      mode: 'FREE' | 'LOCK'  // Canvas-level layout mode
    }
  }
}
```

**Note**: The `layout` section stores FREE/LOCK modes for groups. This is **canvas-level** behavior that controls how layout algorithms are applied, not part of the structural domain graph.

---

## 3. Key Design Decisions

### Why Separate Domain from ViewState?

1. **Swappable Layout Algorithms**: Replace ELK with force-directed? Just swap Layer 2, Domain Graph unchanged.
2. **Swappable Renderers**: Replace ReactFlow with Canvas? Just swap renderer, Domain Graph unchanged.
3. **Firebase/Sharing**: Only Domain Graph is stored/shared. Positions are recomputed on load (so everyone gets the same structure, but layout can adapt).
4. **Future-Proof**: Want new layout algorithm? Add to Layer 2. Want new node types? Add to Domain Graph schema.

### What Gets Saved vs. What Gets Computed

| **Saved to Firebase** | **Computed on Load** |
|----------------------|---------------------|
| Domain Graph structure | ViewState positions |
| Node/Edge/Group IDs | Node/Group sizes |
| Labels and icons | Edge waypoints |
| Relationships | Layout modes (FREE/LOCK) |

### No Origin Metadata

**Critical Invariant**: The Domain Graph contains **NO** `createdBy`, `source`, or origin metadata. Once saved, diagrams are indistinguishable by origin. Only the structure and content matter - layout behavior (FREE/LOCK) is determined by the ViewState, not by who created the diagram.

---

## 4. Load Flow

When a user opens a diagram:

1. **Load Domain Graph** from Firebase
2. **Initialize ViewState** as empty `{}`
3. **Run Layout Engine** (ELK or manual):
   - If `layout[groupId].mode === 'LOCK'`: Run ELK, write positions to ViewState
   - If `layout[groupId].mode === 'FREE'`: Use stored positions or place manually
4. **Renderer** reads Domain + ViewState
5. **Display** on screen (ReactFlow or any other renderer)

---

## 5. Save Flow

When a user saves/shares:

1. **Serialize ONLY Domain Graph** (no ViewState)
2. **Save to Firebase** (or generate share link)
3. **ViewState is DISCARDED** (not saved)

When someone loads that shared link:
- They get the Domain Graph
- ViewState is recomputed based on their layout algorithm and screen size

---

## 6. Edge Parentage Rule

**Invariant**: Every edge object resides in the group that is the **Lowest Common Group (LCG)** of its source and target nodes.

```typescript
// Edge between nodes in same group
Group A {
  Node 1
  Node 2
  Edge(1 → 2)  // Edge lives in Group A
}

// Edge between nodes in different groups
Group A {
  Node 1
}
Group B {
  Node 2
}
// LCG(A, B) = root
Root {
  Group A
  Group B
  Edge(1 → 2)  // Edge lives at root
}
```

---

## 7. Example: Complete Domain Graph

```typescript
const exampleDomainGraph: DomainGraph = {
  id: 'root',
  type: 'group',
  children: [
    {
      id: 'node-1',
      type: 'node',
      labels: [{ text: 'User Input' }],
      icon: 'input'
    },
    {
      id: 'group-1',
      type: 'group',
      labels: [{ text: 'Processing Layer' }],
      icon: 'layer',
      children: [
        {
          id: 'node-2',
          type: 'node',
          labels: [{ text: 'Processor' }],
          icon: 'processor'
        }
      ],
      edges: []  // No edges within this group
    },
    {
      id: 'node-3',
      type: 'node',
      labels: [{ text: 'Output' }],
      icon: 'output'
    }
  ],
  edges: [
    {
      id: 'edge-1',
      sources: ['node-1'],
      targets: ['node-2']
    },
    {
      id: 'edge-2',
      sources: ['node-2'],
      targets: ['node-3']
    }
  ]
}
```

**Notice**:
- ✅ No positions (`x`, `y`, `width`, `height`)
- ✅ No layout modes (`FREE`/`LOCK`)
- ✅ No waypoints or routing info
- ✅ Just structure and content

---

## 8. Type Safety

All types should be strictly enforced:

```typescript
// ✅ CORRECT: Domain Graph has no positions
const node: DomainNode = {
  id: 'node-1',
  type: 'node',
  labels: [{ text: 'Test' }]
  // NO x, y, w, h here
}

// ❌ WRONG: Position in Domain Graph
const badNode = {
  id: 'node-1',
  type: 'node',
  x: 100,  // ❌ This should be in ViewState, not Domain Graph
  y: 200
}
```

---

## Next Steps

- See `VIEW_STATE.md` (to be created) for ViewState architecture details
- See `FIGJAM_REFACTOR.md` for implementation plan and phase breakdown

