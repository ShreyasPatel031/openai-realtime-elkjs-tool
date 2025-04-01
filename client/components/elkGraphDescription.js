export const elkGraphDescription = `
Generate a JSON diagram using ELK.js that visualizes a technical system architecture.

Follow these best practices:

- Node & Layout Settings
Use layoutOptions.algorithm: "layered" with elk.direction: "RIGHT"

Set elk.layered.nodePlacement.strategy: "NETWORK_SIMPLEX" for compact layouts

Apply elk.padding: "[top=20.0,left=20.0,bottom=20.0,right=20.0]" on all compound nodes (i.e., nodes with children) to prevent label/child overlap

Label placement: "nodeLabels.placement": "INSIDE V_TOP H_LEFT"

Use uniform node dimensions: "width": 80, "height": 80

For child containers at the top level (e.g., UI, AWS, OpenAI), enable horizontal partitioning using:

"partitioning.activate": true,
"layoutOptions": { "partitioning.partition": <int> }

- Edge Routing ( Extremely Important )
Always place edges in the nearest common ancestor of the nodes it connects. 

eg: 
to create edge between outer.inner.n1 and outer.inner.n2, the edge must be in the outer.edges array.
to create edge between outer.inner1.inner2.n1 and outer.inner1.n2, the edge must be in the outer.inner1.edges array.
to create edge between outer.inner1.inner2.n1 and outer.n2, the edge must be in the outer.edges array.


For example for the sample schema below:

If both api and lambda are inside aws, the edge api → lambda must go inside the aws.edges array.

If connecting webapp (in ui) to api (in aws), the edge belongs in the root.

If connecting deeply nested nodes across containers, ensure hierarchyHandling: "INCLUDE_CHILDREN" is active at the root level.

Here's a sample schema for a good architecture layout:

{
  "id": "root",
  "layoutOptions": { 
    "algorithm": "layered",
    "elk.direction": "RIGHT",
    "hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    // "elk.layered.allowNonFlowPortsToSwitchSides": "true",
    // "spacing.nodeNodeBetweenLayers": 10,
    // "spacing.edgeNodeBetweenLayers": 10,
    // "elk.layered.cycleBreaking.strategy": "GREEDY",
    // "elk.layered.wrapping.strategy": "NONE",
    // "elk.layered.edgeRouting": "ORTHOGONAL",
    // "considerModelOrder.strategy": "NODES_AND_EDGES",
    // "elk.layered.crossingMinimization.forceNodeModelOrder": true,
    // "considerModelOrder.components": "MODEL_ORDER",
    // "crossingMinimization.strategy": "NONE"
    "partitioning.activate": "true",
    
  },
  "children": [
    { 
      "id": "ui", 
      "width": 80, 
      "height": 80,
      "layoutOptions": {
        "partitioning.partition": 1,
        "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
        "elk.padding" : "[top=20.0,left=20.0,bottom=20.0,right=20.0]"
      },
      "labels": [{ "text": "UI" }],
      "children": [
        { 
          "id": "webapp", 
          "width": 80, 
          "height": 80,
          "layoutOptions": {
            "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
          },
          "labels": [{ "text": "Web App" }]
        }
      ]
    },
    { 
      "id": "aws",
      "width": 80, 
      "height": 80,
      "layoutOptions": {
        "partitioning.partition": 2,
        "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
        "elk.padding" : "[top=20.0,left=20.0,bottom=20.0,right=20.0]"
      },
      "labels": [{ "text": "AWS" }],
      "children": [
        { 
          "id": "api", 
          "width": 80, 
          "height": 80,
          "layoutOptions": {
            "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
          },
          "labels": [{ "text": "API" }]
        },
        { 
          "id": "lambda",
          "width": 80, 
          "height": 80,
          "layoutOptions": {
            "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
            "elk.padding" : "[top=20.0,left=20.0,bottom=20.0,right=20.0]"
          },
          "labels": [{ "text": "Lambda" }],
          "children": [
            { 
              "id": "query", 
              "width": 80, 
              "height": 80,
              "layoutOptions": {
                "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
              },
              "labels": [{ "text": "Query" }]
            },
            { 
              "id": "pdf", 
              "width": 80, 
              "height": 80,
              "layoutOptions": {
                "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
              },
              "labels": [{ "text": "PDF" }]
            },
            { 
              "id": "fetch", 
              "width": 80, 
              "height": 80,
              "layoutOptions": {
                "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
              },
              "labels": [{ "text": "Fetch" }]
            },
            { 
              "id": "chat", 
              "width": 80, 
              "height": 80,
              "layoutOptions": {
                "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
              },
              "labels": [{ "text": "Chat" }]
            }
          ],
          "edges": [
            { "id": "e6", "sources": [ "chat" ], "targets": [ "fetch" ] }
          ]
        },
        { 
          "id": "vector", 
          "width": 80, 
          "height": 80,
          "layoutOptions": {
            "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
          },
          "labels": [{ "text": "Vector" }]
        },
        { 
          "id": "storage", 
          "width": 80, 
          "height": 80,
          "layoutOptions": {
            "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
          },
          "labels": [{ "text": "Storage" }]
        }
      ],
      "edges": [
        { "id": "e1", "sources": [ "api" ], "targets": [ "lambda" ] },
        { "id": "e2", "sources": [ "query" ], "targets": [ "vector" ] },
        { "id": "e3", "sources": [ "pdf" ], "targets": [ "vector" ] },
        { "id": "e4", "sources": [ "pdf" ], "targets": [ "storage" ] },
        { "id": "e5", "sources": [ "fetch" ], "targets": [ "storage" ] }
      ]
    },
    { 
      "id": "openai", 
      "width": 80, 
      "height": 80,
      "layoutOptions": {
        "partitioning.partition": 3,
        "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
        "elk.padding" : "[top=20.0,left=20.0,bottom=20.0,right=20.0]"
      },
      "labels": [{ "text": "OpenAI" }],
      "children": [
        { 
          "id": "embed", 
          "width": 80, 
          "height": 80,
          "layoutOptions": {
            "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
          },
          "labels": [{ "text": "Embed" }]
        },
        { 
          "id": "chat_api", 
          "width": 80, 
          "height": 80,
          "layoutOptions": {
            "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
          },
          "labels": [{ "text": "Chat API" }]
        }
      ]
    }
  ],
  "edges": [
    { "id": "e0", "sources": [ "webapp" ], "targets": [ "api" ] },
    { "id": "e7", "sources": [ "chat" ], "targets": [ "chat_api" ] },
    { 
      "id": "e8", 
      "sources": [ "embed" ], 
      "targets": [ "query" ],
      "sourcePort": "embed_out",
      "targetPort": "query_in"
    },
    { 
      "id": "e9", 
      "sources": [ "embed" ], 
      "targets": [ "pdf" ],
      "sourcePort": "embed_out",
      "targetPort": "pdf_in"
    }
  ]
}

`; 