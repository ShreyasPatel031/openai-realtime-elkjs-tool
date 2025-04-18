import React, { useState, useEffect } from 'react';
import ElkRender from './ElkRender';
import ElkExcalidrawRender from './ElkExcalidrawRender';
import ReactFlowGraph from './ReactFlowGraph';
import ELK from 'elkjs';
import {
  addNode,
  deleteNode,
  moveNode,
  addEdge,
  deleteEdge,
  groupNodes,
  removeGroup
} from '../utils/graph_helper_functions';
import type { ElkNode as HelperElkNode, ElkEdge } from '../utils/graph_helper_functions';

// Extend ElkNode with layout properties
interface LayoutElkNode extends HelperElkNode {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: LayoutElkNode[];
}

// Update the default graph data definition to match the LayoutElkNode type
const DEFAULT_GRAPH_DATA: LayoutElkNode = {
  "id": "root",
  "labels": [{ "text": "Root" }], // Added the required labels property
  "children": [
    { 
      "id": "ui",
      "labels": [{ "text": "UI" }],
      "children": [
        { 
          "id": "webapp",        
          "labels": [{ "text": "Web App" }]
        }
      ]
    },
    { 
      "id": "aws",
      "labels": [{ "text": "AWS" }],
      "children": [
        { 
          "id": "api",  
          "labels": [{ "text": "API" }]
        },
        { 
          "id": "lambda",
          "labels": [{ "text": "Lambda" }],
          "children": [
            { 
              "id": "query", 
              "labels": [{ "text": "Query" }]
            },
            { 
              "id": "pdf", 
              "labels": [{ "text": "PDF" }]
            },
            { 
              "id": "fetch", 
              "labels": [{ "text": "Fetch" }]
            },
            { 
              "id": "chat", 
              "labels": [{ "text": "Chat" }]
            }
          ],
          "edges": [
            { "id": "e6", "sources": [ "chat" ], "targets": [ "fetch" ] }
          ]
        },
        { 
          "id": "vector", 
          "labels": [{ "text": "Vector" }]
        },
        { 
          "id": "storage", 
          "labels": [{ "text": "Storage" }]
        }
      ],
      "edges": [
        { "id": "e1", "sources": [ "api" ], "targets": ["lambda" ] },
        { "id": "e2", "sources": [ "query" ], "targets": ["vector" ] },
        { "id": "e3", "sources": [ "pdf" ], "targets": ["vector" ] },
        { "id": "e4", "sources": [ "pdf" ], "targets": ["storage" ] },
        { "id": "e5", "sources": [ "fetch" ], "targets": ["storage" ] }
      ]
    },
    { 
      "id": "openai", 
      "labels": [{ "text": "OpenAI" }],
      "children": [
        { 
          "id": "embed", 
          "labels": [{ "text": "Embed" }]
        },
        { 
          "id": "chat_api", 
          "labels": [{ "text": "Chat API" }]
        }
      ]
    }
  ],
  "edges": [
    { "id": "e0", "sources": [ "webapp" ], "targets": [ "api" ] },
    { "id": "e7", "sources": [ "chat" ], "targets": ["chat_api" ] },
    { 
      "id": "e8", 
      "sources": [ "embed" ], 
      "targets": [ "query" ]
    },
    { 
      "id": "e9", 
      "sources": [ "embed" ], 
      "targets": [ "pdf" ]
    }
  ]
};

type PreviewMode = 'elk' | 'excalidraw' | 'reactflow';

export default function ElkTestPage() {
  const [jsonInput, setJsonInput] = useState('');
  const [graphData, setGraphData] = useState<LayoutElkNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('elk');

  // Add new state for operation inputs
  const [nodeOperation, setNodeOperation] = useState({
    nodeName: '',
    parentId: '',
    newParentId: ''
  });

  const [edgeOperation, setEdgeOperation] = useState({
    edgeId: '',
    sourceId: '',
    targetId: '',
  });

  const [groupOperation, setGroupOperation] = useState({
    groupId: '',
    nodeIds: '',  // Comma-separated list of node IDs
    parentId: ''
  });

  // Special state for the layouted graph (after ELK processing)
  const [layoutedGraphData, setLayoutedGraphData] = useState<LayoutElkNode | null>(null);

  // Log when preview mode changes
  useEffect(() => {
    console.log('Preview mode changed:', previewMode);
  }, [previewMode]);

  // Log when graph data changes
  useEffect(() => {
    console.log('Graph data updated:', graphData);
    
    // Whenever graph data changes, we need to update the layout
    if (graphData) {
      // We don't need to wait for switching to ReactFlow - always keep the layout up to date
      console.log("ElkTestPage: Requesting new layout for updated graph data");
    }
  }, [graphData]);

  // Add effect to handle graph data changes
  useEffect(() => {
    if (!graphData) return;
    
    console.log("ElkTestPage: Using original graph data", graphData);
    
    // Simple state update to trigger the child components
    setGraphData(graphData);
  }, [jsonInput]); // Only run when JSON input changes

  // Update the useEffect to initialize with default data
  useEffect(() => {
    const defaultJsonString = JSON.stringify(DEFAULT_GRAPH_DATA, null, 2);
    setJsonInput(defaultJsonString);
    setGraphData(DEFAULT_GRAPH_DATA);
  }, []);

  const stripComments = (jsonString: string) => {
    // console.log('Stripping comments from input:', jsonString);
    const cleaned = jsonString
      .replace(/\/\/.*/g, '') // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
    console.log('Cleaned JSON string:', cleaned);
    return cleaned;
  };

  const handleJsonChange = (e: { target: { value: string } }) => {
    setJsonInput(e.target.value);
    
    if (!e.target.value.trim()) {
      setError("Please enter JSON data");
      setGraphData(null);
      return;
    }
    
    try {
      const cleanedJson = stripComments(e.target.value);
      console.log('Attempting to parse cleaned JSON');
      const parsed = JSON.parse(cleanedJson);
      console.log('Successfully parsed JSON:', parsed);
      console.log('Setting graph data...');
      setGraphData(parsed);
      setError(null);
    } catch (err) {
      console.error('\nJSON Parse Error:', {
        name: err.name,
        message: err.message,
        stack: err.stack
      });
      setError(`Invalid JSON: ${err.message}`);
      setGraphData(null);
    }
  };

  // Operation handlers
  const handleNodeOperation = (operation: string) => {
    try {
      const currentGraph = JSON.parse(stripComments(jsonInput));
      let updatedGraph: LayoutElkNode;

      switch (operation) {
        case 'add':
          updatedGraph = addNode(nodeOperation.nodeName, nodeOperation.parentId, currentGraph);
          break;
        case 'delete':
          updatedGraph = deleteNode(nodeOperation.nodeName, currentGraph);
          break;
        case 'move':
          updatedGraph = moveNode(
            nodeOperation.nodeName,
            nodeOperation.newParentId,
            currentGraph
          );
          break;
        default:
          return;
      }
      const updatedJson = JSON.stringify(updatedGraph, null, 2);
      setJsonInput(updatedJson);
      setGraphData(updatedGraph);
      setError(null);
    } catch (err) {
        console.error('Error during node operation:', err);
        setError(`Operation failed: ${err.message}`);
    }
  };

  const handleEdgeOperation = (operation: string) => {
    try {
      const currentGraph = JSON.parse(stripComments(jsonInput));
      let updatedGraph: LayoutElkNode;

      switch (operation) {
        case 'add':
          updatedGraph = addEdge(
            edgeOperation.edgeId,
            null,
            edgeOperation.sourceId,
            edgeOperation.targetId,
            currentGraph
          );
          break;
        case 'delete':
          updatedGraph = deleteEdge(edgeOperation.edgeId, currentGraph);
          break;
        default:
          return;
      }
      const updatedJson = JSON.stringify(updatedGraph, null, 2);
      setJsonInput(updatedJson);
      setGraphData(updatedGraph);
      setError(null);
    } catch (err) {
      console.error('Error during edge operation:', err);
      setError(`Operation failed: ${err.message}`);
    }
  };

  const handleGroupOperation = (operation: string) => {
    try {
      const currentGraph = JSON.parse(stripComments(jsonInput));
      let updatedGraph: LayoutElkNode;

      switch (operation) {
        case 'group':
          updatedGraph = groupNodes(
            groupOperation.nodeIds.split(',').map(id => id.trim()),
            groupOperation.parentId,
            groupOperation.groupId,
            currentGraph
          );
          break;
        case 'removeGroup':
          updatedGraph = removeGroup(groupOperation.groupId, currentGraph);
          break;
        default:
          return;
      }
      const updatedJson = JSON.stringify(updatedGraph, null, 2);
      setJsonInput(updatedJson);
      setGraphData(updatedGraph);
      setError(null);
    } catch (err) {
      console.error('Error during group operation:', err);
      setError(`Operation failed: ${err.message}`);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">ELK Graph Test Page</h1>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4 h-[calc(100vh-8rem)] overflow-y-auto">
          <h2 className="text-lg font-semibold mb-2 sticky top-0 bg-white z-10">Input JSON</h2>
          <textarea
            className="w-full h-[300px] p-2 border rounded font-mono text-sm mb-4"
            value={jsonInput}
            onChange={handleJsonChange}
            placeholder="Paste your ELK graph JSON here..."
          />

          <div className="space-y-6">
            <div className="border p-4 rounded">
              <h3 className="font-semibold mb-2">🟩 Node Operations</h3>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Node Name"
                  className="w-full p-2 border rounded"
                  value={nodeOperation.nodeName}
                  onChange={e => setNodeOperation({...nodeOperation, nodeName: e.target.value})}
                />
                <input
                  type="text"
                  placeholder="Parent ID (for add/move source)"
                  className="w-full p-2 border rounded"
                  value={nodeOperation.parentId}
                  onChange={e => setNodeOperation({...nodeOperation, parentId: e.target.value})}
                />
                <input
                  type="text"
                  placeholder="New Parent ID (for move destination)"
                  className="w-full p-2 border rounded"
                  value={nodeOperation.newParentId}
                  onChange={e => setNodeOperation({...nodeOperation, newParentId: e.target.value})}
                />
                <div className="flex space-x-2">
                  <button onClick={() => handleNodeOperation('add')} className="bg-green-500 text-white px-4 py-2 rounded">Add</button>
                  <button onClick={() => handleNodeOperation('delete')} className="bg-red-500 text-white px-4 py-2 rounded">Delete</button>
                  <button onClick={() => handleNodeOperation('move')} className="bg-blue-500 text-white px-4 py-2 rounded">Move</button>
                </div>
              </div>
            </div>

            <div className="border p-4 rounded">
              <h3 className="font-semibold mb-2">🟧 Edge Operations</h3>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Edge ID"
                  className="w-full p-2 border rounded"
                  value={edgeOperation.edgeId}
                  onChange={e => setEdgeOperation({...edgeOperation, edgeId: e.target.value})}
                />
                <input
                  type="text"
                  placeholder="Source ID"
                  className="w-full p-2 border rounded"
                  value={edgeOperation.sourceId}
                  onChange={e => setEdgeOperation({...edgeOperation, sourceId: e.target.value})}
                />
                <input
                  type="text"
                  placeholder="Target ID"
                  className="w-full p-2 border rounded"
                  value={edgeOperation.targetId}
                  onChange={e => setEdgeOperation({...edgeOperation, targetId: e.target.value})}
                />
                <div className="flex space-x-2">
                  <button onClick={() => handleEdgeOperation('add')} className="bg-green-500 text-white px-4 py-2 rounded">Add</button>
                  <button onClick={() => handleEdgeOperation('delete')} className="bg-red-500 text-white px-4 py-2 rounded">Delete</button>
                </div>
              </div>
            </div>

            <div className="border p-4 rounded">
              <h3 className="font-semibold mb-2">🟦 Group Operations</h3>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Group ID"
                  className="w-full p-2 border rounded"
                  value={groupOperation.groupId}
                  onChange={e => setGroupOperation({...groupOperation, groupId: e.target.value})}
                />
                <input
                  type="text"
                  placeholder="Node IDs (comma-separated)"
                  className="w-full p-2 border rounded"
                  value={groupOperation.nodeIds}
                  onChange={e => setGroupOperation({...groupOperation, nodeIds: e.target.value})}
                />
                <input
                  type="text"
                  placeholder="Parent ID"
                  className="w-full p-2 border rounded"
                  value={groupOperation.parentId}
                  onChange={e => setGroupOperation({...groupOperation, parentId: e.target.value})}
                />
                <div className="flex space-x-2">
                  <button onClick={() => handleGroupOperation('group')} className="bg-green-500 text-white px-4 py-2 rounded">Group</button>
                  <button onClick={() => handleGroupOperation('removeGroup')} className="bg-red-500 text-white px-4 py-2 rounded">Remove Group</button>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-2">
              <p className="text-red-500">{error}</p>
              <p className="text-sm text-gray-500 mt-1">Check the browser console for more details</p>
            </div>
          )}
        </div>
        <div className="col-span-8">
          <h2 className="text-lg font-semibold mb-2">Preview</h2>
          <div className="mb-2 flex space-x-2">
            <button
              onClick={() => {
                console.log('Switching to ELK view');
                setPreviewMode('elk');
              }}
              className={`px-4 py-2 rounded ${
                previewMode === 'elk'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              ELK View
            </button>
            <button
              onClick={() => {
                console.log('Switching to Excalidraw view');
                setPreviewMode('excalidraw');
              }}
              className={`px-4 py-2 rounded ${
                previewMode === 'excalidraw'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Excalidraw View
            </button>
            <button
              onClick={() => {
                console.log('Switching to ReactFlow view');
                setPreviewMode('reactflow');
              }}
              className={`px-4 py-2 rounded ${
                previewMode === 'reactflow'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              ReactFlow View
            </button>
          </div>
          <div className="border rounded p-4 bg-white h-[calc(100vh-12rem)] overflow-auto">
            {graphData ? (
              <div className="min-w-full min-h-full">
                {previewMode === 'elk' ? (
                  <ElkRender 
                    initialGraph={graphData} 
                    onLayoutComplete={(layoutedGraph) => {
                      console.log("ElkTestPage: Received layouted graph from ElkRender:", layoutedGraph);
                      setLayoutedGraphData(layoutedGraph);
                    }}
                  />
                ) : previewMode === 'excalidraw' ? (
                  <ElkExcalidrawRender graphData={graphData} />
                ) : (
                  <div style={{ height: '600px', width: '100%' }}>
                    {/* Always render both ElkRender (hidden) and ReactFlow */}
                    <div style={{ display: 'none' }}>
                      <ElkRender 
                        initialGraph={graphData} 
                        onLayoutComplete={(layoutedGraph) => {
                          console.log("ElkTestPage: Received layouted graph from ElkRender:", layoutedGraph);
                          setLayoutedGraphData(layoutedGraph);
                        }}
                      />
                    </div>
                    <ReactFlowGraph 
                      graphData={layoutedGraphData || graphData} 
                      key={layoutedGraphData ? 'layouted' : 'raw'}
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500">Enter valid JSON to see the graph</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 