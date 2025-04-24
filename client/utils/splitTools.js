/**
 * Splits an array of tools into smaller "pages" to ensure each session.update
 * event stays under the maximum frame size.
 * 
 * @param {Array} tools - The full array of tool definitions
 * @param {number} maxBytes - Max size for each page (default: 950 bytes)
 * @returns {Array} An array of tool arrays, each small enough to send
 */
export function chunkTools(tools, maxBytes = 950) {
  const pages = [];
  let current = [];
  let size = 0;

  for (const tool of tools) {
    const toolSize = JSON.stringify(tool).length;
    if (size + toolSize > maxBytes && current.length) {
      pages.push(current);
      current = [];
      size = 0;
    }
    current.push(tool);
    size += toolSize;
  }
  if (current.length) pages.push(current);
  return pages;
} 