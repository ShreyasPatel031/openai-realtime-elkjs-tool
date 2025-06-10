# Real-Time Agent User Flow Test Case

## User Flow Steps

1. **Start Connection**
   - User selects Mic button to start the connection
   - Connection should be established successfully
   - User should be able to talk to the agent

2. **Initial Agent Interaction**
   - Real-time agent says: "How can I help?"
   - Simulate user response: "I want to deploy a kubernetes GCP architecture, can you log my requirements"

3. **Log Requirements Trigger**
   - Real-time agent should trigger "log user requirements" function
   - Chat window should appear

4. **Chat Window Interaction**
   - Questions will be presented in the chat window
   - Simulate selecting the FIRST option for ALL questions asked

5. **Process Button**
   - Simulate clicking the "Process" button
   - Expected behavior:
     a. Reasoning agent should start either reasoning or function calling
     b. Should continue reasoning/function calling until stream is complete

6. **Function Call State Updates**
   - All function calls should work properly
   - They should change the state of the graph
   - Updated state should be sent back to the reasoning agent

7. **End State Validation**
   - The graph should have nodes and edges
   - Should NOT be the standard root state it started with
   - Graph should reflect the kubernetes GCP architecture based on user selections

## Test Validation Points

- [ ] Mic connection establishes successfully
- [ ] Real-time agent responds appropriately
- [ ] Chat window appears when requirements logging is triggered
- [ ] All first options can be selected in chat
- [ ] Process button triggers reasoning agent
- [ ] Function calls execute and update graph state
- [ ] Final graph contains nodes and edges beyond root