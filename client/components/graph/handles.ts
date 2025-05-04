// Shared handle styles for nodes
export const baseHandleStyle = {
  background: '#555',
  opacity: 0.8,
  width: 6,
  height: 6
};

// Group node specific handle style
export const groupHandleStyle = {
  ...baseHandleStyle,
  opacity: 0.01,
  zIndex: 5000
}; 