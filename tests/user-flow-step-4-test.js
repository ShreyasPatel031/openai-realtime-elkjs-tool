#!/usr/bin/env node

// USER FLOW STEP 4 TEST - Requirements Gathering Simulation

import puppeteer from "puppeteer";

console.log("🎯 Step 4 test created - ready for development");

class UserFlowTest {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.browser = null;
    this.page = null;
    this.events = {
      agentReady: false,
      messageReceived: false,
      optionsReady: false
    };
    this.eventPromises = {};
  }

  createEventPromise(eventName) {
    this.eventPromises[eventName] = new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.events[eventName]) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
    return this.eventPromises[eventName];
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runTest() {
    console.log('🎯 Starting User Flow Test');
    console.log('='.repeat(50));

    try {
      await this.setup();
      await this.startSession();
      await this.waitForAgent();
      await this.sendInitialQuestion();
      await this.waitForChatWindow();
      await this.selectAllOptions();
      await this.clickProcess();
      await this.waitForGraphCompletion();
      console.log('✅ Test completed successfully!');
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      await this.takeErrorScreenshot();
    } finally {
      await this.cleanup();
    }
  }

  async setup() {
    console.log('\n🔧 Setting up browser...');
    
    this.browser = await puppeteer.launch({ 
      headless: false,
      args: ['--use-fake-ui-for-media-stream'],
      defaultViewport: { width: 1400, height: 900 }
    });
    
    this.page = await this.browser.newPage();
    
    // Initialize test logs and helper functions
    await this.page.evaluate(() => {
      window._testLogs = [];
      window._testState = {
        agentReady: false,
        sessionActive: false,
        messageReceived: false,
        graphInitialized: false
      };

      // Override console.log
      const oldConsoleLog = console.log;
      console.log = function(...args) {
        const text = args.join(' ');
        window._testLogs.push(text);
        
        // Update test state based on logs
        if (text.includes('Agent is ready to listen')) {
          window._testState.agentReady = true;
        }
        if (text.includes('Session initialization complete')) {
          window._testState.sessionActive = true;
        }
        if (text.includes('Processing requirements') || 
            text.includes('Function call: log_requirements')) {
          window._testState.messageReceived = true;
        }
        if (text.includes('[ELK] layout OK')) {
          window._testState.graphInitialized = true;
        }
        
        oldConsoleLog.apply(console, args);
      };

      // Add helper functions
      window.sendTestMessage = async (message) => {
        return new Promise((resolve, reject) => {
          try {
            console.log('Sending message:', message);
            window.realtimeAgentSendTextMessage(message);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      };

      window.waitForElement = (selector, timeout = 10000) => {
        return new Promise((resolve, reject) => {
          const startTime = Date.now();
          const checkElement = () => {
            const element = document.querySelector(selector);
            if (element) {
              resolve(element);
            } else if (Date.now() - startTime > timeout) {
              reject(new Error(`Timeout waiting for element: ${selector}`));
            } else {
              requestAnimationFrame(checkElement);
            }
          };
          checkElement();
        });
      };
    });
    
    // Set up event monitoring
    this.page.on('console', msg => {
      const text = msg.text();
      console.log('Browser:', text);
    });
    
    // Enable microphone permission
    const context = this.browser.defaultBrowserContext();
    await context.overridePermissions(this.baseUrl, ['microphone']);
    
    await this.page.goto(this.baseUrl, { waitUntil: 'networkidle0' });

    // Wait for React Flow container to be ready
    console.log('Waiting for React Flow initialization...');
    await this.page.waitForFunction(() => {
      return window._testState.graphInitialized === true;
    }, { timeout: 30000 });
    console.log('✅ React Flow initialized');
  }

  async waitForEvent(eventName, timeout = 30000) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout waiting for event: ${eventName}`)), timeout);
    });

    try {
      await Promise.race([
        this.eventPromises[eventName],
        timeoutPromise
      ]);
      return true;
    } catch (error) {
      throw error;
    }
  }

  async startSession() {
    console.log('\n🎤 Starting session...');
    
    // Wait for and click the red mic button
    await this.page.waitForFunction(() => {
      const micButton = Array.from(document.querySelectorAll('button'))
        .find(btn => {
          const style = window.getComputedStyle(btn);
          const rgb = style.backgroundColor;
          return rgb.includes('239, 68, 68') || rgb.includes('rgb(239, 68, 68)');
        });
      return micButton && micButton.offsetParent !== null;
    }, { timeout: 30000 });

    // Click the mic button
    await this.page.evaluate(() => {
      const micButton = Array.from(document.querySelectorAll('button'))
        .find(btn => {
          const style = window.getComputedStyle(btn);
          const rgb = style.backgroundColor;
          return rgb.includes('239, 68, 68') || rgb.includes('rgb(239, 68, 68)');
        });
      console.log('Clicking mic button');
      micButton.click();
    });

    // Wait for session initialization
    console.log('Waiting for session initialization...');
    await this.page.waitForFunction(() => {
      return window._testState.sessionActive === true;
    }, { timeout: 30000 });
    console.log('✅ Session active');

    // Wait for WebRTC connection
    console.log('Waiting for WebRTC connection...');
    await this.page.waitForFunction(() => {
      // Check for WebRTC connection status
      const isConnected = window._testState.sessionActive && 
                         typeof window.realtimeAgentSendTextMessage === 'function' &&
                         window.realtimeAgentSessionActive === true;
      console.log('WebRTC connection check:', { isConnected });
      return isConnected;
    }, { timeout: 45000 });
    console.log('✅ WebRTC connected');

    // Give time for session to stabilize
    await this.sleep(3000);
    console.log('✅ Session setup complete');
  }

  async waitForAgent() {
    console.log('\n⏳ Waiting for agent...');
    
    try {
      // Wait for message function to be ready
      console.log('Checking for realtimeAgentSendTextMessage function...');
      await this.page.waitForFunction(() => {
        const hasFunction = typeof window.realtimeAgentSendTextMessage === 'function';
        const isSessionActive = window.realtimeAgentSessionActive === true;
        console.log('Function check:', { hasFunction, isSessionActive });
        return hasFunction && isSessionActive;
      }, { timeout: 45000 });
      console.log('✅ Message function ready');

      // Wait for agent ready state
      console.log('Checking for agent ready state...');
      await this.page.waitForFunction(() => {
        const isReady = window._testState.agentReady === true;
        console.log('Agent ready check:', isReady);
        return isReady;
      }, { timeout: 45000 });
      console.log('✅ Agent ready state confirmed');

      // Verify chat window is accessible
      console.log('Verifying chat window accessibility...');
      const chatWindowAccessible = await this.page.evaluate(() => {
        const chatWindow = document.querySelector('[data-testid="chat-window"]') || 
                         document.querySelector('.chat-window');
        return chatWindow !== null;
      });
      console.log('Chat window accessible:', chatWindowAccessible);

      // Give time for UI to stabilize
      await this.sleep(3000);
      console.log('✅ Agent ready checks complete');
    } catch (error) {
      console.error('❌ waitForAgent failed:', error.message);
      console.log('Current page state:');
      await this.page.evaluate(() => {
        console.log('testState:', window._testState);
        console.log('realtimeAgentSendTextMessage exists:', typeof window.realtimeAgentSendTextMessage === 'function');
        console.log('realtimeAgentSessionActive:', window.realtimeAgentSessionActive);
      });
      throw error;
    }
  }

  async sendInitialQuestion() {
    console.log('\n💬 Sending initial question...');
    
    // Reset message state
    await this.page.evaluate(() => {
      window._testState.messageReceived = false;
      window._testLogs = [];
    });

    // Send the message with retry
    let retries = 0;
    const maxRetries = 3;
    while (retries < maxRetries) {
      try {
        await this.page.evaluate(() => {
          return window.sendTestMessage('I need kubernetes on GCP');
        });
        break;
      } catch (error) {
        console.log(`Retry ${retries + 1}/${maxRetries} sending message...`);
        retries++;
        if (retries === maxRetries) {
          throw error;
        }
        await this.sleep(2000);
      }
    }

    // Wait for message to be processed
    await this.page.waitForFunction(() => {
      return window._testState.messageReceived === true;
    }, { timeout: 30000 });

    // Wait for chat window to become visible
    await this.page.evaluate(() => {
      return window.waitForElement('[data-testid="chat-window"], .chat-window');
    });

    // Wait for questions to start appearing
    await this.page.waitForFunction(() => {
      return window._testLogs?.some(log => 
        log.includes('Adding user decision to chat') ||
        log.includes('Creating follow-up questions')
      ) || false;
    }, { timeout: 30000 });

    // Give time for all questions to appear
    await this.sleep(3000);
  }

  async waitForChatWindow() {
    console.log('\n⏳ Waiting for chat window and options...');
    
    // Wait for chat window to be visible
    await this.page.evaluate(() => {
      return window.waitForElement('[data-testid="chat-window"], .chat-window');
    });

    // Wait for questions to be added
    await this.page.waitForFunction(() => {
      return window._testLogs?.some(log => 
        log.includes('Follow-up questions created and added to chat successfully')
      ) || false;
    }, { timeout: 30000 });

    // Wait for interactive elements
    await this.page.evaluate(() => {
      return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const timeout = 30000;
        const checkElements = () => {
          const elements = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"], select, [role="radio"], [role="checkbox"]'));
          const visibleElements = elements.filter(el => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   !el.disabled &&
                   rect.width > 0 &&
                   rect.height > 0;
          });
          
          if (visibleElements.length > 0) {
            resolve(visibleElements.length);
          } else if (Date.now() - startTime > timeout) {
            reject(new Error('Timeout waiting for interactive elements'));
          } else {
            requestAnimationFrame(checkElements);
          }
        };
        checkElements();
      });
    });

    // Give UI time to stabilize
    await this.sleep(2000);
  }

  async selectAllOptions() {
    console.log('\n✅ Selecting all options...');
    
    // Get count of options before selecting
    const beforeCount = await this.page.evaluate(() => {
      return document.querySelectorAll('input[type="radio"], input[type="checkbox"], select, [role="radio"], [role="checkbox"]').length;
    });
    
    console.log(`Found ${beforeCount} options to select`);

    // Select all options
    await this.page.evaluate(() => {
      return new Promise((resolve, reject) => {
        try {
          // Select all radio buttons and checkboxes
          document.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]')
            .forEach(el => {
              if (!el.checked) {
                try {
                  el.click();
                  console.log('Clicked:', el.value || el.textContent);
                } catch (error) {
                  console.log('Failed to click:', el.value || el.textContent, error);
                }
              }
            });

          // Select first option in all select dropdowns
          document.querySelectorAll('select').forEach(select => {
            if (select.options.length > 0) {
              try {
                select.selectedIndex = 0;
                select.dispatchEvent(new Event('change'));
                console.log('Selected:', select.value);
              } catch (error) {
                console.log('Failed to select:', select.value, error);
              }
            }
          });

          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });

    // Verify selections
    const afterCount = await this.page.evaluate(() => {
      return Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"], select, [role="radio"], [role="checkbox"]'))
        .filter(el => el.checked || (el.tagName === 'SELECT' && el.selectedIndex >= 0))
        .length;
    });

    console.log(`Selected ${afterCount} options`);

    // Give time for UI to update
    await this.sleep(2000);
  }

  async clickProcess() {
    console.log('\n🔄 Clicking Process button...');
    
    // Wait for Process button to be enabled
    await this.page.evaluate(() => {
      return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const timeout = 30000;
        const checkButton = () => {
          const processButton = Array.from(document.querySelectorAll('button'))
            .find(btn => btn.textContent?.includes('Process'));
          
          if (processButton && !processButton.disabled) {
            resolve(processButton);
          } else if (Date.now() - startTime > timeout) {
            reject(new Error('Timeout waiting for Process button'));
          } else {
            requestAnimationFrame(checkButton);
          }
        };
        checkButton();
      });
    });

    // Click the Process button
    await this.page.evaluate(() => {
      return new Promise((resolve, reject) => {
        try {
          const processButton = Array.from(document.querySelectorAll('button'))
            .find(btn => btn.textContent?.includes('Process'));
          if (processButton) {
            console.log('Clicking Process button');
            processButton.click();
            resolve();
          } else {
            reject(new Error('Process button not found'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    // Wait for processing to start
    await this.page.waitForFunction(() => {
      return window._testLogs?.some(log => 
        log.includes('Processing started') ||
        log.includes('Architecture generation started')
      ) || false;
    }, { timeout: 30000 });
  }

  async waitForGraphCompletion() {
    console.log('\n📊 Waiting for graph completion...');
    
    // Wait for graph updates to finish
    await this.page.waitForFunction(() => {
      return window._testLogs?.some(log => 
        log.includes('Architecture generation finished') ||
        log.includes('Graph stabilized') ||
        log.includes('All nodes and edges added')
      ) || false;
    }, { timeout: 60000 });

    // Take final screenshot
    await this.page.screenshot({ 
      path: 'test-completion.png',
      fullPage: true 
    });

    console.log('✅ Graph generation complete');
  }

  async takeErrorScreenshot() {
    try {
      await this.page.screenshot({ 
        path: 'test-error.png',
        fullPage: true 
      });
    } catch (e) {
      console.error('Failed to take error screenshot:', e);
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Run the test
const test = new UserFlowTest();
test.runTest().then(() => {
  console.log('\n🏁 Test completed successfully!');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Test failed:', error);
  process.exit(1);
});
 