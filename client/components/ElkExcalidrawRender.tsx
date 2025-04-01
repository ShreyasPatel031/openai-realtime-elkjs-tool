import React, { Suspense, lazy, useState, useEffect } from 'react';

declare module 'react' {
  interface SuspenseProps {
    fallback?: React.ReactNode;
    children?: React.ReactNode;
  }
}

// Dynamically import Excalidraw with no SSR and process environment
const Excalidraw = lazy(() => {
  // @ts-ignore
  window.process = { env: { NODE_ENV: 'development' } };
  return import('@excalidraw/excalidraw').then(module => ({ 
    default: module.Excalidraw 
  }));
}) as any;

interface ElkExcalidrawRenderProps {
  graphData: any;
}

interface BaseElement {
  type: 'rectangle' | 'text' | 'arrow';
  strokeColor?: string;
  strokeWidth?: number;
}

interface RectangleElement extends BaseElement {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor?: string;
}

interface TextElement extends BaseElement {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize?: number;
}

interface ArrowElement extends BaseElement {
  type: 'arrow';
  x: number;
  y: number;
  points: [number, number][];
  startArrowhead?: string;
  endArrowhead?: string;
}

type ExcalidrawElement = RectangleElement | TextElement | ArrowElement;

export default function ElkExcalidrawRender({ graphData }: ElkExcalidrawRenderProps) {
  const [excalidrawJson, setExcalidrawJson] = useState<any>(null);

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
    console.log(`\nProcessing node ${node.id}:`, {
      original: { x: node.x, y: node.y },
      parent: { x: parentX, y: parentY }
    });

    // Calculate absolute coordinates
    const absX = (node.x ?? 0) + parentX;
    const absY = (node.y ?? 0) + parentY;

    console.log(`Node ${node.id} absolute position:`, { x: absX, y: absY });

    // Shallow copy w/ absolute coords
    const newNode = { ...node, x: absX, y: absY };
    accum.nodes.push(newNode);

    // Process edges at current level
    if (Array.isArray(node.edges)) {
      console.log(`Found ${node.edges.length} edges for node ${node.id}`);
      for (const edge of node.edges) {
        console.log(`Processing edge in node ${node.id}:`, {
          edgeId: edge.id,
          container: edge.container,
          sources: edge.sources,
          targets: edge.targets,
          sections: edge.sections
        });

        if (!edge.sections) {
          console.log(`No sections found for edge ${edge.id}, skipping...`);
          continue;
        }

        const newEdge = {
          ...edge,
          sections: edge.sections.map((section: any, idx: number) => {
            console.log(`Edge section ${idx} before transformation:`, {
              startPoint: section.startPoint,
              endPoint: section.endPoint,
              bendPoints: section.bendPoints,
              parentOffset: { x: absX, y: absY }
            });

            // Transform coordinates if this edge belongs to this container
            const shouldTransform = edge.container === node.id;
            
            // Transform coordinates
            const start = shouldTransform ? {
              x: section.startPoint.x + absX,
              y: section.startPoint.y + absY,
            } : section.startPoint;

            const end = shouldTransform ? {
              x: section.endPoint.x + absX,
              y: section.endPoint.y + absY,
            } : section.endPoint;

            const bendPoints = shouldTransform && section.bendPoints ? 
              section.bendPoints.map((bp: any) => ({
                x: bp.x + absX,
                y: bp.y + absY,
              })) : section.bendPoints;

            console.log(`Edge section ${idx} after transformation:`, {
              start,
              end,
              bendPoints,
              wasTransformed: shouldTransform
            });

            return { ...section, startPoint: start, endPoint: end, bendPoints };
          }),
        };
        accum.edges.push(newEdge);
        console.log(`Added edge ${edge.id} to accumulator, total edges: ${accum.edges.length}`);
      }
    }

    // Process root level edges
    if (node.id === 'root' && Array.isArray(node.edges)) {
      console.log('\nProcessing root level edges');
      for (const edge of node.edges) {
        console.log('Processing root edge:', {
          id: edge.id,
          sources: edge.sources,
          targets: edge.targets,
          sections: edge.sections
        });
        if (edge.sections) {
          accum.edges.push(edge);
          console.log(`Added root edge ${edge.id} to accumulator`);
        } else {
          console.log(`Root edge ${edge.id} has no sections, skipping...`);
        }
      }
    }

    // Recurse through children
    if (Array.isArray(node.children)) {
      console.log(`Found ${node.children.length} children for node ${node.id}`);
      node.children.forEach((child: any) => {
        console.log(`\nProcessing child of ${node.id}:`, child.id);
        flattenGraph(child, absX, absY, accum);
      });
    }
  }

  const convertToExcalidraw = (node: any): ExcalidrawElement[] => {
    console.log('\nStarting conversion to Excalidraw format');
    const elements: ExcalidrawElement[] = [];
    const accum = { nodes: [] as any[], edges: [] as any[] };
    
    console.log('Flattening graph structure...');
    flattenGraph(node, 0, 0, accum);

    console.log('\nFlattened graph:', {
      nodeCount: accum.nodes.length,
      edgeCount: accum.edges.length
    });

    // Process nodes
    console.log('\nProcessing nodes...');
    for (const node of accum.nodes) {
      console.log(`Creating rectangle for node ${node.id}:`, {
        position: { x: node.x, y: node.y },
        size: { width: node.width, height: node.height }
      });

      // Add node rectangle
      elements.push({
        type: 'rectangle',
        x: node.x,
        y: node.y,
        width: node.width ?? 40,
        height: node.height ?? 40,
        backgroundColor: Array.isArray(node.children) && node.children.length > 0 ? 'transparent' : '#e5e7eb',
        strokeColor: '#000000',
        strokeWidth: 1,
      });

      // Add node label
      if (node.labels && node.labels[0]) {
        elements.push({
          type: 'text',
          x: node.x + (node.labels[0].x ?? 5),
          y: node.y + (node.labels[0].y ?? 5),
          text: node.labels[0].text,
          fontSize: 12,
        });
      }
    }

    // Process edges
    console.log('\nProcessing edges...');
    for (const edge of accum.edges) {
      console.log('Processing edge:', {
        id: edge.id,
        hasContainer: !!edge.container,
        container: edge.container,
        sectionCount: edge.sections?.length,
        sections: edge.sections
      });

      if (!edge.sections) {
        console.log(`Edge ${edge.id} has no sections, skipping...`);
        continue;
      }

      for (const section of edge.sections) {
        console.log('Processing section:', {
          startPoint: section.startPoint,
          endPoint: section.endPoint,
          hasBendPoints: !!section.bendPoints,
          bendPointCount: section.bendPoints?.length
        });

        if (!section.startPoint || !section.endPoint) {
          console.log('Section missing start or end point, skipping...');
          continue;
        }

        // Create points array with absolute coordinates
        const points: [number, number][] = [];
        
        // Add start point
        points.push([
          Number(section.startPoint.x),
          Number(section.startPoint.y)
        ]);

        // Add bend points if they exist
        if (section.bendPoints) {
          section.bendPoints.forEach((bp: any) => {
            points.push([Number(bp.x), Number(bp.y)]);
          });
        }

        // Add end point
        points.push([
          Number(section.endPoint.x),
          Number(section.endPoint.y)
        ]);

        console.log('Created arrow points:', points);

        // Create arrow element
        const arrowElement: ArrowElement = {
          type: 'arrow',
          x: Number(section.startPoint.x),
          y: Number(section.startPoint.y),
          points,
          strokeColor: '#000000',
          strokeWidth: 1,
          startArrowhead: 'dot',
          endArrowhead: 'arrow',
        };

        console.log('Adding arrow element:', arrowElement);
        elements.push(arrowElement);
      }
    }

    const elementCounts = {
      total: elements.length,
      rectangles: elements.filter(e => e.type === 'rectangle').length,
      labels: elements.filter(e => e.type === 'text').length,
      arrows: elements.filter(e => e.type === 'arrow').length
    };

    console.log('\nConversion complete:', {
      ...elementCounts,
      elements: elements.map(e => ({
        type: e.type,
        ...(e.type === 'arrow' ? { points: (e as ArrowElement).points } : {}),
        ...(e.type === 'rectangle' ? { x: e.x, y: e.y } : {}),
        ...(e.type === 'text' ? { text: (e as TextElement).text } : {})
      }))
    });

    return elements;
  };

  // Update JSON when graphData changes
  useEffect(() => {
    console.log('\nConverting graph data to Excalidraw format...');
    const elements = convertToExcalidraw(graphData);
    
    // Log the elements before creating the JSON
    console.log('\nElements before creating JSON:', {
      total: elements.length,
      arrows: elements.filter(e => e.type === 'arrow').length,
      arrowDetails: elements.filter(e => e.type === 'arrow').map(e => ({
        points: (e as ArrowElement).points,
        x: e.x,
        y: e.y
      }))
    });

    const newJson = {
      type: 'excalidraw',
      version: 2,
      source: 'elk-graph',
      elements,
      appState: {
        viewBackgroundColor: '#ffffff',
        gridSize: 20,
      },
    };

    console.log('\nSetting new Excalidraw JSON:', {
      elementCount: newJson.elements.length,
      arrowCount: newJson.elements.filter((e: any) => e.type === 'arrow').length
    });

    setExcalidrawJson(newJson);
  }, [graphData]);

  // Handle JSON changes from textarea
  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    try {
      const newJson = JSON.parse(e.target.value);
      console.log('\nParsed JSON from textarea:', {
        elementCount: newJson.elements.length,
        arrowCount: newJson.elements.filter((e: any) => e.type === 'arrow').length
      });
      setExcalidrawJson(newJson);
    } catch (err) {
      console.error('Invalid JSON:', err);
    }
  };

  if (!excalidrawJson) {
    return <div>Loading...</div>;
  }

  // Create a download link for the Excalidraw JSON
  const downloadJson = () => {
    const dataStr = JSON.stringify(excalidrawJson);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'elk-graph.excalidraw.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  return (
    <div className="space-y-4">
      <div className="border rounded p-4 bg-white" style={{ height: '600px' }}>
        {/* @ts-ignore */}
        <Suspense fallback={<div>Loading Excalidraw...</div>}>
          <Excalidraw
            initialData={excalidrawJson}
            theme="light"
            gridModeEnabled={true}
            viewModeEnabled={false}
          />
        </Suspense>
      </div>
      <div className="flex justify-end">
        <button
          onClick={downloadJson}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Download Excalidraw JSON
        </button>
      </div>
      <div className="border rounded p-4 bg-gray-50">
        <textarea
          className="w-full h-[200px] p-2 font-mono text-sm"
          value={JSON.stringify(excalidrawJson, null, 2)}
          onChange={handleJsonChange}
        />
      </div>
    </div>
  );
} 