import {
    addNode,
    deleteNode,
    moveNode,
    addEdge,
    deleteEdge,
    moveEdge,
    groupNodes,
    removeGroup,
    ElkNode,
  } from './graph_helper_functions';
  
  // Initial test layout
  const getInitialLayout = (): ElkNode => ({
    id: "root",
    children: [
      { 
        id: "ui",
        labels: [{ text: "UI" }],
        children: [
          { 
            id: "webapp",        
            labels: [{ text: "Web App" }]
          }
        ]
      },
      { 
        id: "aws",
        labels: [{ text: "AWS" }],
        children: [
          { 
            id: "api",  
            labels: [{ text: "API" }]
          },
          { 
            id: "lambda",
            labels: [{ text: "Lambda" }],
            children: [
              { 
                id: "query", 
                labels: [{ text: "Query" }]
              },
              { 
                id: "pdf", 
                labels: [{ text: "PDF" }]
              },
              { 
                id: "fetch", 
                labels: [{ text: "Fetch" }]
              },
              { 
                id: "chat", 
                labels: [{ text: "Chat" }]
              }
            ],
            edges: [
              { id: "e6", sources: ["chat"], targets: ["fetch"] }
            ]
          },
          { 
            id: "vector", 
            labels: [{ text: "Vector" }]
          },
          { 
            id: "storage", 
            labels: [{ text: "Storage" }]
          }
        ],
        edges: [
          { id: "e1", sources: ["api"], targets: ["lambda"] },
          { id: "e2", sources: ["query"], targets: ["vector"] },
          { id: "e3", sources: ["pdf"], targets: ["vector"] },
          { id: "e4", sources: ["pdf"], targets: ["storage"] },
          { id: "e5", sources: ["fetch"], targets: ["storage"] }
        ]
      },
      { 
        id: "openai", 
        labels: [{ text: "OpenAI" }],
        children: [
          { 
            id: "embed", 
            labels: [{ text: "Embed" }]
          },
          { 
            id: "chat_api", 
            labels: [{ text: "Chat API" }]
          }
        ]
      }
    ],
    edges: [
      { id: "e0", sources: ["webapp"], targets: ["api"] },
      { id: "e7", sources: ["chat"], targets: ["chat_api"] },
      { id: "e8", sources: ["embed"], targets: ["query"] },
      { id: "e9", sources: ["embed"], targets: ["pdf"] }
    ]
  });
  
  describe('Graph Helper Functions', () => {
    let layout: ElkNode;
  
    beforeEach(() => {
      layout = getInitialLayout();
    });
  
    describe('addNode', () => {
      it('should add a new node to a parent', () => {
        layout = addNode('newService', 'aws', layout);
        const awsNode = layout.children?.find(child => child.id === 'aws');
        expect(awsNode?.children?.some(child => child.id === 'newService')).toBe(true);
      });
    });
  
    describe('deleteNode', () => {
      it('should delete a node and its related edges', () => {
        layout = deleteNode('pdf', layout);
        const lambdaNode = layout.children?.[1].children?.[1]; // aws -> lambda
        expect(lambdaNode?.children?.some(child => child.id === 'pdf')).toBe(false);
        // Check if edges related to pdf are removed
        expect(layout.children?.[1].edges?.some(edge => 
          edge.sources.includes('pdf') || edge.targets.includes('pdf')
        )).toBe(false);
      });
    });
  
    describe('moveNode', () => {
      it('should move a node to a new parent and update edges', () => {
        layout = moveNode('chat', 'lambda', 'openai', layout);
        // Check if node was moved
        const openaiNode = layout.children?.find(child => child.id === 'openai');
        expect(openaiNode?.children?.some(child => child.id === 'chat')).toBe(true);
        // Check if edge was reattached at the correct level
        expect(layout.edges?.some(edge => 
          edge.id === 'e7' && 
          edge.sources.includes('chat') && 
          edge.targets.includes('chat_api')
        )).toBe(true);
      });
    });
  
    describe('addEdge', () => {
      it('should add an edge at the common ancestor level', () => {
        layout = addEdge('newEdge', null, 'webapp', 'chat_api', layout);
        expect(layout.edges?.some(edge => 
          edge.id === 'newEdge' && 
          edge.sources.includes('webapp') && 
          edge.targets.includes('chat_api')
        )).toBe(true);
      });
    });
  
    describe('deleteEdge', () => {
      it('should remove an edge from the layout', () => {
        layout = deleteEdge('e0', layout);
        expect(layout.edges?.some(edge => edge.id === 'e0')).toBe(false);
      });
    });
  
    describe('moveEdge', () => {
      it('should move an edge to new endpoints', () => {
        layout = moveEdge('e0', 'webapp', 'vector', layout);
        expect(layout.edges?.some(edge => 
          edge.id === 'e0' && 
          edge.sources.includes('webapp') && 
          edge.targets.includes('vector')
        )).toBe(true);
      });
    });
  
    describe('groupNodes', () => {
      it('should create a group and move nodes into it', () => {
        layout = groupNodes(['vector', 'storage'], 'aws', 'dataStore', layout);
        const awsNode = layout.children?.find(child => child.id === 'aws');
        const groupNode = awsNode?.children?.find(child => child.id === 'dataStore');
        expect(groupNode).toBeTruthy();
        expect(groupNode?.children?.length).toBe(2);
        expect(groupNode?.children?.some(child => child.id === 'vector')).toBe(true);
        expect(groupNode?.children?.some(child => child.id === 'storage')).toBe(true);
      });
    });
  
    describe('removeGroup', () => {
      it('should remove a group and promote its children', () => {
        // First create a group
        layout = groupNodes(['vector', 'storage'], 'aws', 'dataStore', layout);
        // Then remove it
        layout = removeGroup('dataStore', layout);
        const awsNode = layout.children?.find(child => child.id === 'aws');
        expect(awsNode?.children?.some(child => child.id === 'dataStore')).toBe(false);
        expect(awsNode?.children?.some(child => child.id === 'vector')).toBe(true);
        expect(awsNode?.children?.some(child => child.id === 'storage')).toBe(true);
      });
    });
  });