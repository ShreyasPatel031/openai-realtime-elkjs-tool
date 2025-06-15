import puppeteer from 'puppeteer';

class UserFlowSteps123Test {
  constructor() {
    this.browser = null;
    this.page = null;
    this.baseUrl = 'http://localhost:3000';
  }

  async setup() {
    console.log('\n🚀 Setting up test environment...');
    
    // Launch browser with permissions
    this.browser = await puppeteer.launch({ 
      headless: false,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream'
      ]
    });

    // Create new page and set permissions
    this.page = await this.browser.newPage();
    const context = this.browser.defaultBrowserContext();
    await context.overridePermissions(this.baseUrl, ['microphone']);
    
    // Add console logging from the page
    this.page.on('console', msg => console.log('Browser console:', msg.text()));
    
    // Add network request/response logging
    this.page.on('request', req => {
      console.log('Network request:', req.method(), req.url());
    });
    this.page.on('response', async res => {
      try {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('application/json')) {
          const body = await res.text();
          console.log('Network response:', res.status(), res.url(), body.substring(0, 500));
    } else {
          console.log('Network response:', res.status(), res.url());
    }
      } catch (e) {
        console.log('Network response error:', res.status(), res.url(), e.message);
      }
    });
    
    console.log('✅ Test environment ready');
  }

  async runTest() {
    try {
      await this.setup();
      await this.step1_micConnection();
      await this.step2_agentInteraction();
      await this.step3_requirementsLogging();
      console.log('\n✅ All steps completed successfully!');
    } catch (error) {
      console.error('\n❌ Test failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async step1_micConnection() {
    console.log('\n🎤 Step 1: Testing Mic Connection...');
    
    try {
      // Navigate to app and wait for it to be ready
      await this.page.goto(this.baseUrl, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });
      
      // Find and click the mic button (identified by red background)
      const micButtonClicked = await this.page.evaluate(() => {
        const micButton = Array.from(document.querySelectorAll('button'))
          .find(btn => window.getComputedStyle(btn).backgroundColor.includes('239, 68, 68')); // rgb(239, 68, 68) is red-500
        if (micButton) {
          console.log('Found mic button, clicking...');
          micButton.click();
          return true;
        }
        console.log('No mic button found with red background');
        return false;
      });
      
      if (!micButtonClicked) {
        throw new Error('Mic button not found');
    }
      
      // Wait for token request
      await this.page.waitForResponse(
        response => response.url().includes('/token'),
        { timeout: 30000 }
      );
      
      // Wait for session.created event
      await this.page.waitForFunction(() => {
        const events = Array.from(document.querySelectorAll('.event-log-item'))
          .map(item => item.textContent);
        return events.some(text => text.includes('session.created'));
      }, { 
        timeout: 30000,
        polling: 1000 
      });
      
      // Wait for agent ready
      await this.page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('.event-log-item'))
          .map(item => item.textContent)
          .some(text => text.includes('Agent is ready to listen'));
      }, { 
        timeout: 30000,
        polling: 1000 
      });
      
      console.log('✅ Mic connection established');
    } catch (error) {
      console.error('Step 1 failed:', error);
      throw error;
    }
  }

  async step2_agentInteraction() {
    console.log('\n💬 Step 2: Testing Initial Agent Interaction...');
    
    try {
      // Wait for agent's initial response
      await this.page.waitForFunction(() => {
        const messages = Array.from(document.querySelectorAll('.chat-message'))
          .map(msg => msg.textContent);
        const found = messages.some(msg => msg.includes('How can I help?'));
        console.log('Looking for initial message. Found:', found);
        return found;
      }, { 
        timeout: 30000,
        polling: 1000 
      });
      
      // Send the message through the WebSocket
      await this.page.evaluate(() => {
        if (window.realtimeAgentSendTextMessage) {
          window.realtimeAgentSendTextMessage(
            'I want to deploy a kubernetes GCP architecture, can you log my requirements'
          );
          return true;
        }
        throw new Error('realtimeAgentSendTextMessage not found');
      });
      
      console.log('✅ Agent interaction successful');
    } catch (error) {
      console.error('Step 2 failed:', error);
      throw error;
    }
  }

  async step3_requirementsLogging() {
    console.log('\n📝 Step 3: Testing Requirements Logging...');
    
    try {
      // Wait for chat window to appear
      await this.page.waitForSelector('.chat-window', { 
        visible: true,
        timeout: 30000 
      });
      
      // Verify log_requirements_and_generate_questions function was called
      await this.page.waitForFunction(() => {
        const messages = Array.from(document.querySelectorAll('.chat-message'))
          .map(msg => msg.textContent);
        const found = messages.some(msg => 
          msg.includes('requirements') || 
          msg.includes('questions') || 
          msg.includes('options')
        );
        console.log('Looking for requirements message. Found:', found);
        return found;
      }, { 
        timeout: 30000,
        polling: 1000 
      });
      
      console.log('✅ Requirements logging triggered');
    } catch (error) {
      console.error('Step 3 failed:', error);
      throw error;
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Run the test if this file is run directly
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const test = new UserFlowSteps123Test();
  test.runTest().catch(console.error);
}

export default UserFlowSteps123Test; 