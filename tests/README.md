Yeah# OpenAI Realtime Console Tests

This directory contains automated tests for the OpenAI realtime console application, following the user flow specification in `docs/user-flow-specification.md`.

## Test Structure

- `docs/user-flow-specification.md` - The definitive user flow specification
- `user-flow-steps-1-3-test.js` - Tests for steps 1-3 (mic connection, agent interaction, requirements logging)
- `user-flow-step-4-test.js` - Tests for step 4 (requirements gathering simulation)
- `run-tests.js` - Test runner utility

## Running Tests

To run all tests:
```bash
node run-tests.js
```

To run specific test files:
```bash
# Run steps 1-3 test
node tests/user-flow-steps-1-3-test.js

# Run step 4 test
node tests/user-flow-step-4-test.js
```

## Test Flow Steps

### Steps 1-3 (`user-flow-steps-1-3-test.js`)
1. Mic Connection & Realtime Setup
   - User clicks mic button
   - WebSocket connection established

2. Initial Agent Interaction
   - Agent says "How can I help?"
   - User sends "I want to deploy a kubernetes GCP architecture" message

3. Requirements Logging Trigger
   - Agent triggers log_requirements_and_generate_questions
   - Chat window appears with requirements gathering questions

### Step 4 (`user-flow-step-4-test.js`)
4. Requirements Gathering Simulation
   - Selects first option for all questions
   - Clicks Process button
   - Waits for architecture generation
   - Verifies completion

## Test Development

When adding new tests:
1. Follow the user flow specification in `docs/user-flow-specification.md`
2. Use the existing test files as templates
3. Keep tests focused and modular
4. Add proper error handling and cleanup

## Important Notes

- Tests use Puppeteer for browser automation
- Mic permissions are handled automatically
- Tests expect the app to be running on localhost:3000
- Each test file can be run independently
- The test suite is designed to be extensible for future steps 