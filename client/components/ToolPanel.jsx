import { useEffect, useState } from "react";
import ElkRender from "./ElkRender";
import { elkGraphDescription } from "./elkGraphDescription";

const minimalSessionUpdate = {
  type: "session.update",
  session: {
    tools: [
      {
        type: "function",
        name: "display_elk_graph",
        description: "Function to create node-edge graph visualizations",
        parameters: {
          type: "object",
          strict: true,
          properties: {
            title: {
              type: "string",
              description: "Title for the graph visualization",
            },
            graph: {
              type: "object",
              description: "ELK graph structure with hierarchical support",
              properties: {
                id: { type: "string" },
                children: {
                  type: "array",
                  items: {
                    type: "object",
                    description: "A node that can contain children and its own edges",
                    properties: {
                      id: { type: "string" },
                      width: { type: "number" },
                      height: { type: "number" },
                      children: { 
                        type: "array",
                        description: "Nested child nodes",
                        items: { "$ref": "#/properties/graph/properties/children/items" }
                      },
                      edges: {
                        type: "array",
                        description: "Edges between nodes within this container",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            sources: { type: "array", items: { type: "string" } },
                            targets: { type: "array", items: { type: "string" } }
                          }
                        }
                      }
                    }
                  }
                },
                edges: {
                  type: "array",
                  description: "Top-level edges between nodes",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      sources: { type: "array", items: { type: "string" } },
                      targets: { type: "array", items: { type: "string" } }
                    }
                  }
                },
                layoutOptions: {
                  type: "object",
                  description: "ELK layout algorithm options",
                  properties: {
                    algorithm: { 
                      type: "string",
                      description: "Layout algorithm (e.g., 'elk.layered')"
                    },
                    hierarchyHandling: {
                      type: "string",
                      description: "How to handle hierarchy ('INCLUDE_CHILDREN' or 'SEPARATE_CHILDREN')"
                    }
                  }
                }
              },
              required: ["id"]
            }
          },
          required: ["title", "graph"]
        }
      }
    ],
    tool_choice: "auto",
  },
};

function FunctionCallOutput({ functionCallOutput }) {
  if (!functionCallOutput) return null;

  try {
    const { title, graph } = JSON.parse(functionCallOutput.arguments);
    console.log("Rendering graph with data:", {
      title,
      graphId: graph.id,
      childCount: graph.children?.length || 0,
      edgeCount: graph.edges?.length || 0,
      layoutOptions: graph.layoutOptions
    });

    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-bold text-lg">{title}</h3>
        <div className="bg-white rounded-md p-4 border border-gray-200">
          <ElkRender initialGraph={graph} />
        </div>
        <pre className="text-xs bg-gray-100 rounded-md p-2 overflow-x-auto">
          {JSON.stringify(functionCallOutput, null, 2)}
        </pre>
      </div>
    );
  } catch (error) {
    console.error('Error in FunctionCallOutput:', error);
    return <div>Error rendering graph</div>;
  }
}

export default function ToolPanel({
  isSessionActive,
  sendClientEvent,
  events,
}) {
  const [functionAdded, setFunctionAdded] = useState(false);
  const [functionCallOutput, setFunctionCallOutput] = useState(null);

  useEffect(() => {
    if (!events || events.length === 0) return;

    const firstEvent = events[events.length - 1];
    if (!functionAdded && firstEvent.type === "session.created") {
      console.log("Session created, sending minimal update...");
      sendClientEvent(minimalSessionUpdate);
      
      // Send the full description in a separate message
      setTimeout(() => {
        console.log("Sending full description...");
        sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Here are the detailed instructions for creating ELK.js graphs:\n\n${elkGraphDescription}`
              }
            ]
          }
        });
        sendClientEvent({ type: "response.create" });
      }, 1000);
      
      setFunctionAdded(true);
    }

    const mostRecentEvent = events[0];
    if (
      mostRecentEvent.type === "response.done" &&
      mostRecentEvent.response.output
    ) {
      mostRecentEvent.response.output.forEach((output) => {
        if (output.type === "function_call" && output.name === "display_elk_graph") {
          console.log("Agent output:", output);
          console.log("Function arguments:", JSON.parse(output.arguments));
          const { title, graph } = JSON.parse(output.arguments);
          console.log("Graph structure:", {
            title,
            nodes: graph.children,
            edges: graph.edges,
            layoutOptions: graph.layoutOptions
          });
          setFunctionCallOutput(output);
          setTimeout(() => {
            sendClientEvent({
              type: "response.create",
              response: {
                instructions: `ask for feedback about the graph visualization - don't repeat the graph details, just ask if they like the layout.`
              },
            });
          }, 500);
        }
      });
    }
  }, [events]);

  useEffect(() => {
    if (!isSessionActive) {
      setFunctionAdded(false);
      setFunctionCallOutput(null);
    }
  }, [isSessionActive]);

  return (
    <section className="h-full w-full flex flex-col gap-4">
      <div className="h-full bg-gray-50 rounded-md p-4">
        <h2 className="text-lg font-bold">AI Tools</h2>
        {isSessionActive ? (
          functionCallOutput ? (
            <FunctionCallOutput functionCallOutput={functionCallOutput} />
          ) : (
            <div>
              <p className="mb-2">Ask for:</p>
              <ul className="list-disc pl-5">
                <li>A graph visualization with nodes and edges</li>
              </ul>
            </div>
          )
        ) : (
          <p>Start the session to use these tools...</p>
        )}
      </div>
    </section>
  );
}
