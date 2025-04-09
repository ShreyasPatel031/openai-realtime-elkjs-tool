"use client";
import React, { useState, useEffect } from "react";
import ELK from "elkjs/lib/elk.bundled.js";

// Add default options constants
const ROOT_DEFAULT_OPTIONS = {
  layoutOptions: {
    "algorithm": "layered",
    "elk.direction": "RIGHT",
    "hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    "elk.layered.considerModelOrder": "true",
    // "elk.layered.options.CrossingMinimizationStrategy": "INTERACTIVE",
    // "elk.alg.layered.components.ComponentOrderingStrategy": "FORCE_MODEL_ORDER",
    // "elk.layered.crossingMinimization.semiInteractive": "true",
    // "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
  }
};

const NON_ROOT_DEFAULT_OPTIONS = {
  width: 80,
  height: 80,
  layoutOptions: {
    "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
    "elk.padding": "[top=40.0,left=20.0,bottom=20.0,right=20.0]"
  }
};

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

// Modify the ensureIds function to also apply default options
function ensureIds(node: any, parentId: string = '') {
  if (!node) return node;
  
  // Apply defaults directly to the node
  if (!parentId) {
    // Root node
    Object.assign(node, {
      ...ROOT_DEFAULT_OPTIONS,
      layoutOptions: {
        ...ROOT_DEFAULT_OPTIONS.layoutOptions,
        ...(node.layoutOptions || {})
      }
    });
  } else {
    // Non-root node - ensure width and height are set
    node.width = node.width || NON_ROOT_DEFAULT_OPTIONS.width;
    node.height = node.height || NON_ROOT_DEFAULT_OPTIONS.height;
    node.layoutOptions = {
      ...NON_ROOT_DEFAULT_OPTIONS.layoutOptions,
      ...(node.layoutOptions || {})
    };
  }

  if (!node.id) {
    node.id = `${parentId}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Update children recursively
  if (Array.isArray(node.children)) {
    node.children.forEach((child: any) => ensureIds(child, node.id));
  }

  return node;
}

/**
 * Page: Renders a UI with two ways to get an ELK graph:
 * 1) Paste a JSON/JS-like object into the textarea and let elkjs layout
 * 2) Provide 'elkt' text in a separate input and call the /api/conversion to get JSON
 */
export default function ElkRender({ initialGraph }: ElkRenderProps) {
  const [graphLayout, setGraphLayout] = useState<any>(null);
  const elk = new ELK();

  useEffect(() => {
    async function layoutGraph() {
      try {
        // Create a deep copy of the graph to avoid modifying the original
        const graphCopy = JSON.parse(JSON.stringify(initialGraph));
        
        // Apply defaults through ensureIds
        const graphWithOptions = ensureIds(graphCopy);

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
      <g key={n.id}>
        <rect
          x={shiftX(n.x)}
          y={shiftY(n.y)}
          width={n.width ?? 40}
          height={n.height ?? 40}
          style={getNodeStyle(n)}
        />
        {n.labels && n.labels[0] && (
          <text
            x={shiftX(n.x) + (n.labels[0].x ?? 5)}
            y={shiftY(n.y) + (n.labels[0].y ?? 5)}
            textAnchor="start"
            dominantBaseline="hanging"
            fontSize="12"
            fill="black"
          >
            {n.labels[0].text}
          </text>
        )}
      </g>
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

