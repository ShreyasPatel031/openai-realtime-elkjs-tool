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

- Edge Routing Best Practice
Always place edges in the nearest common ancestor of the nodes it connects. For example:

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
    "partitioning.activate": "true"
  },
  "children": [
    {
      "id": "ui",
      "width": 80,
      "height": 80,
      "layoutOptions": {
        "partitioning.partition": 1,
        "elk.padding": "[top=20.0,left=20.0,bottom=20.0,right=20.0]",
        "nodeLabels.placement": "INSIDE V_TOP H_LEFT"
      },
      "labels": [{ "text": "UI" }],
      "children": [{ "id": "webapp", "width": 80, "height": 80, "labels": [{ "text": "Web App" }] }]
    },
    {
      "id": "aws",
      "width": 80,
      "height": 80,
      "layoutOptions": {
        "partitioning.partition": 2,
        "elk.padding": "[top=20.0,left=20.0,bottom=20.0,right=20.0]",
        "nodeLabels.placement": "INSIDE V_TOP H_LEFT"
      },
      "labels": [{ "text": "AWS" }],
      "children": [
        { "id": "api", "width": 80, "height": 80, "labels": [{ "text": "API" }] },
        {
          "id": "lambda",
          "width": 80,
          "height": 80,
          "labels": [{ "text": "Lambda" }],
          "layoutOptions": { "elk.padding": "[top=20.0,left=20.0,bottom=20.0,right=20.0]", "nodeLabels.placement": "INSIDE V_TOP H_LEFT" },
          "children": [
            { "id": "query", "width": 80, "height": 80, "labels": [{ "text": "Query" }] },
            { "id": "pdf", "width": 80, "height": 80, "labels": [{ "text": "PDF" }] },
            { "id": "fetch", "width": 80, "height": 80, "labels": [{ "text": "Fetch" }] },
            { "id": "chat", "width": 80, "height": 80, "labels": [{ "text": "Chat" }] }
          ],
          "edges": [
            { "id": "e6", "sources": ["chat"], "targets": ["fetch"] }
          ]
        }
      ],
      "edges": [
        { "id": "e1", "sources": ["api"], "targets": ["lambda"] },
        { "id": "e2", "sources": ["query"], "targets": ["pdf"] }
      ]
    }
  ],
  "edges": [
    { "id": "e0", "sources": ["webapp"], "targets": ["api"] }
  ]
}`; 