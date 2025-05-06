import { RawGraph } from "./types/index";

export const getInitialElkGraph = (): RawGraph => ({
  id: "root",
  children: [
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
            { "id": "e6", "sources": [ "chat" ], "targets": [ "fetch" ], "labels": [{ "text": "Invokes" }] }
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
        { "id": "e1", "sources": [ "api" ], "targets": ["lambda" ], "labels": [{ "text": "Invokes" }] },
        { "id": "e2", "sources": [ "query" ], "targets": ["vector" ], "labels": [{ "text": "Retrieves" }] },
        { "id": "e3", "sources": [ "pdf" ], "targets": ["vector" ], "labels": [{ "text": "Indexes" }] },
        { "id": "e4", "sources": [ "pdf" ], "targets": ["storage" ], "labels": [{ "text": "Stores" }] },
        { "id": "e5", "sources": [ "fetch" ], "targets": ["storage" ], "labels": [{ "text": "Retrieves" }] }
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
    { "id": "e0", "sources": [ "webapp" ], "targets": [ "api" ], "labels": [{ "text": "HTTP" }] },
    { "id": "e7", "sources": [ "chat" ], "targets": ["chat_api" ], "labels": [{ "text": "RPC" }] },
    { "id": "e8", "sources": [ "embed" ], "targets": [ "query" ], "labels": [{ "text": "vec-search" }] },
    { "id": "e9", "sources": [ "embed" ], "targets": [ "pdf" ], "labels": [{ "text": "semantic rank" }] }
  ]
}); 