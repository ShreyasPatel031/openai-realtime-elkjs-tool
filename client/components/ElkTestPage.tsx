import React, { useState, useEffect } from 'react';
import ElkRender from './ElkRender';
import ElkExcalidrawRender from './ElkExcalidrawRender';

type PreviewMode = 'elk' | 'excalidraw';

export default function ElkTestPage() {
  const [jsonInput, setJsonInput] = useState('');
  const [graphData, setGraphData] = useState(null);
  const [error, setError] = useState(null);
  const [previewMode, setPreviewMode] = useState('elk');

  // Log when preview mode changes
  useEffect(() => {
    console.log('Preview mode changed:', previewMode);
  }, [previewMode]);

  // Log when graph data changes
  useEffect(() => {
    console.log('Graph data updated:', graphData);
  }, [graphData]);

  const stripComments = (jsonString: string) => {
    console.log('Stripping comments from input:', jsonString);
    const cleaned = jsonString
      .replace(/\/\/.*/g, '') // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
    console.log('Cleaned JSON string:', cleaned);
    return cleaned;
  };

  const handleJsonChange = (e: { target: { value: string } }) => {
    console.log('\n--- New JSON Input ---');
    console.log('Raw input:', e.target.value);
    setJsonInput(e.target.value);
    
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

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">ELK Graph Test Page</h1>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="text-lg font-semibold mb-2">Input JSON</h2>
          <textarea
            className="w-full h-[600px] p-2 border rounded font-mono text-sm"
            value={jsonInput}
            onChange={handleJsonChange}
            placeholder="Paste your ELK graph JSON here..."
          />
          {error && (
            <div className="mt-2">
              <p className="text-red-500">{error}</p>
              <p className="text-sm text-gray-500 mt-1">Check the browser console for more details</p>
            </div>
          )}
        </div>
        <div>
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
          </div>
          <div className="border rounded p-4 bg-white h-[600px] overflow-auto">
            {graphData ? (
              <div className="min-w-full min-h-full">
                {previewMode === 'elk' ? (
                  <ElkRender initialGraph={graphData} />
                ) : (
                  <ElkExcalidrawRender graphData={graphData} />
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