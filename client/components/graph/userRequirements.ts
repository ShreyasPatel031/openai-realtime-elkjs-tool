/**
 * This file contains the process_user_requirements function which returns
 * sample architecture diagram instructions.
 */

/**
 * Process user requirements and return sample architecture diagram instructions
 * Returns an array of instructions for building an architecture diagram
 * 
 * Always triggers StreamViewer via DOM manipulation for consistent UI output
 */
export const process_user_requirements = (elkGraph?: any, setElkGraph?: (graph: any) => void) => {
  console.group(`[user requirements] process_user_requirements`);
  console.time("process_user_requirements");
  
  console.log("🎯 process_user_requirements called - triggering StreamViewer via DOM");
  
  // Always use DOM manipulation to trigger StreamViewer for consistent UI output
  // This ensures both agent calls and test button calls show streaming output in the UI
  const streamViewerButton = document.querySelector('[data-streamviewer-trigger]') as HTMLButtonElement;
  if (streamViewerButton && !streamViewerButton.disabled) {
    console.log("✅ Found StreamViewer button, triggering...");
    streamViewerButton.click();
  } else {
    console.warn("⚠️ StreamViewer button not found or disabled");
  }
  
  console.timeEnd("process_user_requirements");
  console.groupEnd();
  
  const result: string[] = [];
  return result;
}; 