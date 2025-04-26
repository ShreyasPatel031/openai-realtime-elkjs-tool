/* utils/elk/structuralHash.ts */
import stringify from "fast-json-stable-stringify";   // 600B, deterministic order

interface CanonicalNode {
  id: string;
  children?: CanonicalNode[];
  edges?: CanonicalEdge[];
}

interface CanonicalEdge {
  id: string;
  sources: string[];
  targets: string[];
}

function canonical(n: any): CanonicalNode {
  return {
    id: n.id,
    children: n.children?.map(canonical)
                        .sort((a: CanonicalNode, b: CanonicalNode) => a.id.localeCompare(b.id)),
    edges: n.edges?.map((e: any) => ({
              id: e.id,
              sources: [...e.sources].sort(),
              targets: [...e.targets].sort(),
           }))
           .sort((a: CanonicalEdge, b: CanonicalEdge) => a.id.localeCompare(b.id)),
  };
}

export function structuralHash(root: any): string {
  return stringify(canonical(root));                  // deterministic string
} 