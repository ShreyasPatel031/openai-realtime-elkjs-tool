"use client";
import { useState, useEffect } from "react";
import ELK from "elkjs/lib/elk.bundled.js";

interface ElkRenderProps {
  initialGraph: any;
}

/**
 * Flatten child coordinates by adding parent offsets so that
 * nested child nodes become absolute. Also shifts edges accordingly.
 */
function flattenGraph(
  node: any,
  parentX: number,
  parentY: number,
  accum: { nodes: any[]; edges: any[] }
) {
  const absX = (node.x ?? 0) + parentX;
  const absY = (node.y ?? 0) + parentY;

  // Shallow copy w/ absolute coords
  const newNode = { ...node, x: absX, y: absY };
  accum.nodes.push(newNode);

  if (Array.isArray(node.edges)) {
    for (const edge of node.edges) {
      const newEdge = {
        ...edge,
        sections: (edge.sections || []).map((section: any) => {
          const start = {
            x: section.startPoint.x + absX,
            y: section.startPoint.y + absY,
          };
          const end = {
            x: section.endPoint.x + absX,
            y: section.endPoint.y + absY,
          };
          const bendPoints = (section.bendPoints || []).map((bp: any) => ({
            x: bp.x + absX,
            y: bp.y + absY,
          }));
          return { ...section, startPoint: start, endPoint: end, bendPoints };
        }),
      };
      accum.edges.push(newEdge);
    }
  }

  // Recurse
  if (Array.isArray(node.children)) {
    node.children.forEach((child: any) => {
      flattenGraph(child, absX, absY, accum);
    });
  }
}

/**
 * Page: Renders a UI with two ways to get an ELK graph:
 * 1) Paste a JSON/JS-like object into the textarea and let elkjs layout
 * 2) Provide 'elkt' text in a separate input and call the /api/conversion to get JSON
 */
export default function ElkRender({ initialGraph }: ElkRenderProps) {
  const [graphLayout, setGraphLayout] = useState<any | null>(null);
  const elk = new ELK();

  useEffect(() => {
    async function layoutGraph() {
      try {
        // Add default layout options if none provided
        const graphWithOptions = {
          ...initialGraph,
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
            'elk.spacing.nodeNode': '50',
            ...initialGraph.layoutOptions
          }
        };

        console.log('Laying out graph:', graphWithOptions); // Debug log
        const layoutResult = await elk.layout(graphWithOptions);
        console.log('Layout result:', layoutResult); // Debug log
        setGraphLayout(layoutResult);
      } catch (err) {
        console.error("Error laying out graph:", err);
      }
    }
    
    if (initialGraph) {
      layoutGraph();
    }
  }, [initialGraph]);

  /**
   * Render the final ELK graph in an <svg> by flattening node coords.
   */
  function renderGraphSvg() {
    if (!graphLayout) return null;

    const accum = { nodes: [] as any[], edges: [] as any[] };
    flattenGraph(graphLayout, 0, 0, accum);

    const { nodes, edges } = accum;

    // bounding box
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const node of nodes) {
      const x2 = node.x + (node.width ?? 40);
      const y2 = node.y + (node.height ?? 40);
      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
      if (x2 > maxX) maxX = x2;
      if (y2 > maxY) maxY = y2;
    }

    const padding = 20;
    const svgWidth = maxX - minX + padding * 2;
    const svgHeight = maxY - minY + padding * 2;

    const shiftX = (x: number) => x - minX + padding;
    const shiftY = (y: number) => y - minY + padding;

    // Decide fill color based on whether node has "children" property
    function getNodeStyle(n: any) {
      const isContainer = Array.isArray(n.children) && n.children.length > 0;
      return {
        fill: isContainer ? "none" : "lightgray",
        stroke: "black",
        strokeWidth: 1,
      };
    }

    // Draw nodes first
    const nodeElements = nodes.map((n) => (
      <rect
        key={n.id}
        x={shiftX(n.x)}
        y={shiftY(n.y)}
        width={n.width ?? 40}
        height={n.height ?? 40}
        style={getNodeStyle(n)}
      />
    ));

    // Then edges
    const edgeElements = edges.flatMap((edge) => {
      return (edge.sections || []).map((sec: any, idx: number) => {
        const points = [
          sec.startPoint,
          ...(sec.bendPoints || []),
          sec.endPoint,
        ];
        const pointStr = points
          .map((p) => `${shiftX(p.x)},${shiftY(p.y)}`)
          .join(" ");
        return (
          <polyline
            key={`${edge.id}-${idx}`}
            fill="none"
            stroke="black"
            strokeWidth={1}
            points={pointStr}
          />
        );
      });
    });

    return (
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{ background: "#fafafa", border: "1px solid #ccc" }}
      >
        {nodeElements}
        {edgeElements}
      </svg>
    );
  }

  return graphLayout ? renderGraphSvg() : <p>Laying out graph...</p>;
}

