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
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  roughness?: number;
  backgroundColor?: string;
  boundElements?: Array<{
    id: string;
    type: 'arrow';
  }>;
}

interface TextElement extends BaseElement {
  type: 'text';
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize?: number;
}

interface ArrowElement extends BaseElement {
  type: 'arrow';
  id: string;
  x: number;
  y: number;
  points: [number, number][];
  startArrowhead?: string;
  endArrowhead?: string;
  startArrowheadSize?: number;
  endArrowheadSize?: number;
  label?: string;
  roughness?: number;
  startBinding?: {
    elementId: string;
    // focus: number;
    // gap: number;
  };
  endBinding?: {
    elementId: string;
    // focus: number;
    // gap: number;
  };
}

type ExcalidrawElement = RectangleElement | TextElement | ArrowElement;

export default function ElkExcalidrawRender({ graphData }: ElkExcalidrawRenderProps) {
  const [excalidrawJson, setExcalidrawJson] = useState<any>(null);
  const GRID_SIZE = 10;

  // Helper function to snap coordinates to grid
  const snapToGrid = (value: number): number => {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  };

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

    // Calculate absolute coordinates and snap to grid
    const absX = snapToGrid((node.x ?? 0) + parentX);
    const absY = snapToGrid((node.y ?? 0) + parentY);

    console.log(`Node ${node.id} absolute position:`, { x: absX, y: absY });

    // Shallow copy w/ absolute coords and ensure id exists
    const newNode = { 
      ...node, 
      x: absX, 
      y: absY,
      id: node.id || `node-${Math.random().toString(36).substr(2, 9)}` // Ensure id exists
    };
    accum.nodes.push(newNode);

    // Process edges at all levels
    if (Array.isArray(node.edges)) {
      console.log('\nProcessing edges for node:', node.id);
      for (const edge of node.edges) {
        console.log('Processing edge:', {
          id: edge.id,
          sources: edge.sources,
          targets: edge.targets,
          sections: edge.sections
        });
        if (edge.sections) {
          // Snap edge coordinates to grid and adjust for parent position
          const snappedEdge = {
            ...edge,
            sections: edge.sections.map((section: any) => ({
              ...section,
              startPoint: {
                x: snapToGrid(section.startPoint.x + absX),
                y: snapToGrid(section.startPoint.y + absY)
              },
              endPoint: {
                x: snapToGrid(section.endPoint.x + absX),
                y: snapToGrid(section.endPoint.y + absY)
              },
              bendPoints: section.bendPoints?.map((bp: any) => ({
                x: snapToGrid(bp.x + absX),
                y: snapToGrid(bp.y + absY)
              }))
            }))
          };
          accum.edges.push(snappedEdge);
          console.log(`Added edge ${edge.id} to accumulator with adjusted coordinates:`, snappedEdge);
        } else {
          console.log(`Edge ${edge.id} has no sections, skipping...`);
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
      console.log(`Creating rectangle for node:`, node);

      // Add node rectangle with snapped coordinates
      elements.push({
        type: 'rectangle',
        id: node.id,
        x: snapToGrid(node.x),
        y: snapToGrid(node.y),
        roughness: 0,
        width: snapToGrid(node.width ?? 40),
        height: snapToGrid(node.height ?? 40),
        backgroundColor: Array.isArray(node.children) && node.children.length > 0 ? 'transparent' : '#e5e7eb',
        strokeColor: '#000000',
        strokeWidth: 1,
        boundElements: [] // Initialize empty boundElements array
      });

      // Add node label with snapped coordinates
      if (node.labels && node.labels[0]) {
        elements.push({
          type: 'text',
          id: node.id,
          x: snapToGrid(node.x + (node.labels[0].x ?? 5)),
          y: snapToGrid(node.y + (node.labels[0].y ?? 5)),
          text: node.labels[0].text,
          fontSize: 12,
        });
      }
    }

    // Process edges
    console.log('\nProcessing edges...');
    for (const edge of accum.edges) {
      console.log('Processing edge:', edge);

      if (!edge.sections) {
        console.log(`Edge ${edge.id} has no sections, skipping...`);
        continue;
      }

      for (const section of edge.sections) {
        console.log('Processing section:', section);

        if (!section.startPoint || !section.endPoint) {
          console.log('Section missing start or end point, skipping...');
          continue;
        }

        // Find source and target nodes
        const sourceNode = accum.nodes.find(n => n.id === edge.sources[0]);
        const targetNode = accum.nodes.find(n => n.id === edge.targets[0]);

        // Skip if either node is missing
        if (!sourceNode || !targetNode) {
          console.log('Skipping arrow - missing nodes:', {
            sourceId: edge.sources[0],
            targetId: edge.targets[0]
          });
          continue;
        }

        // Create points array with snapped coordinates
        const points: [number, number][] = [];
        
        // Add start point (relative to arrow's x,y)
        points.push([
          snapToGrid(Number(section.startPoint.x) - Number(section.startPoint.x)),
          snapToGrid(Number(section.startPoint.y) - Number(section.startPoint.y))
        ]);

        // Add bend points if they exist (relative to arrow's x,y)
        if (section.bendPoints) {
          section.bendPoints.forEach((bp: any) => {
            points.push([
              snapToGrid(Number(bp.x) - Number(section.startPoint.x)),
              snapToGrid(Number(bp.y) - Number(section.startPoint.y))
            ]);
          });
        }

        // Add end point (relative to arrow's x,y)
        points.push([
          snapToGrid(Number(section.endPoint.x) - Number(section.startPoint.x)),
          snapToGrid(Number(section.endPoint.y) - Number(section.startPoint.y))
        ]);

        // Use the edge's existing ID instead of generating a new one
        const arrowId = edge.id;

        // Create arrow element with proper bindings and snapped coordinates
        const arrowElement: ArrowElement = {
          type: 'arrow',
          id: arrowId,
          x: snapToGrid(Number(section.startPoint.x)),
          y: snapToGrid(Number(section.startPoint.y)),
          points,
          strokeColor: '#000000',
          strokeWidth: 1,
          endArrowhead: 'arrow',
          startArrowheadSize: 1,
          endArrowheadSize: 1,
          label: edge.id,
          roughness: 0,
          startBinding: {
            elementId: sourceNode.id,
          },
          endBinding: {
            elementId: targetNode.id,
          }
        };

        // Add the arrow to the boundElements of both source and target rectangles
        const sourceRect = elements.find(e => e.type === 'rectangle' && e.id === sourceNode.id) as RectangleElement;
        const targetRect = elements.find(e => e.type === 'rectangle' && e.id === targetNode.id) as RectangleElement;

        if (sourceRect) {
          sourceRect.boundElements = sourceRect.boundElements || [];
          sourceRect.boundElements.push({ id: arrowId, type: 'arrow' });
        }

        if (targetRect) {
          targetRect.boundElements = targetRect.boundElements || [];
          targetRect.boundElements.push({ id: arrowId, type: 'arrow' });
        }

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
        id: e.id,
        ...(e.type === 'arrow' ? { 
          points: (e as ArrowElement).points,
          startBinding: (e as ArrowElement).startBinding,
          endBinding: (e as ArrowElement).endBinding
        } : {}),
        ...(e.type === 'rectangle' ? { 
          x: e.x, 
          y: e.y,
          boundElements: (e as RectangleElement).boundElements 
        } : {}),
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
        gridSize: 10,
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

  // Handle render button click
  const handleRender = () => {
    try {
      // Deep clone the current JSON
      const currentJson = JSON.parse(JSON.stringify(excalidrawJson));
      
      // Ensure the JSON has the required structure
      if (!currentJson || !currentJson.elements || !Array.isArray(currentJson.elements)) {
        console.error('Invalid JSON structure:', currentJson);
        return;
      }

      // Ensure each element has required properties
      const validatedElements = currentJson.elements.map((element: any) => {
        if (!element) return null;
        
        // Ensure points array exists for arrows
        if (element.type === 'arrow' && (!element.points || !Array.isArray(element.points))) {
          console.error('Invalid arrow element:', element);
          return null;
        }

        // Ensure dimensions exist for rectangles
        if (element.type === 'rectangle' && (!element.width || !element.height)) {
          console.error('Invalid rectangle element:', element);
          return null;
        }

        // Ensure text exists for text elements
        if (element.type === 'text' && !element.text) {
          console.error('Invalid text element:', element);
          return null;
        }

        return element;
      }).filter(Boolean); // Remove null elements

      // Create a new JSON object with validated elements
      const validatedJson = {
        type: 'excalidraw',
        version: 2,
        source: 'elk-graph',
        elements: validatedElements,
        appState: {
          viewBackgroundColor: '#ffffff',
          gridSize: 10,
        },
      };

      console.log('Validated JSON before render:', {
        elementCount: validatedJson.elements.length,
        elements: validatedJson.elements.map((e: any) => ({
          type: e.type,
          ...(e.type === 'arrow' ? { points: e.points } : {}),
          ...(e.type === 'rectangle' ? { width: e.width, height: e.height } : {}),
          ...(e.type === 'text' ? { text: e.text } : {})
        }))
      });

      // Force a re-render with validated data
      setExcalidrawJson(null);
      setTimeout(() => {
        setExcalidrawJson(validatedJson);
      }, 0);
    } catch (err) {
      console.error('Error refreshing diagram:', err);
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
      <div className="flex justify-end space-x-2">
        <button
          onClick={handleRender}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Render
        </button>
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