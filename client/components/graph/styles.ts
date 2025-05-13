// Shared style definitions for graph components
export const STYLES = {
  GREEN: { bg: "#E8F5E9", border: "#43A047" },
  BLUE: { bg: "#E3F2FD", border: "#1A73E8" },
  YELLOW: { bg: "#FFF8E1", border: "#FFB300" },
  PURPLE: { bg: "#F3E5F5", border: "#8E24AA" },
  TEAL: { bg: "#E0F2F1", border: "#00897B" },
  GREY: { bg: "#ECEFF1", border: "#546E7A" },
};

// Helper function to get style by key or return the input if it's already a style object
export const getStyle = (styleInput: string | any): { bg: string, border: string } => {
  if (typeof styleInput === 'string' && styleInput in STYLES) {
    return STYLES[styleInput as keyof typeof STYLES];
  }
  
  // If it's already a style object with bg and border, return it
  if (styleInput && typeof styleInput === 'object' && 'bg' in styleInput && 'border' in styleInput) {
    return styleInput;
  }
  
  // Default fallback
  return STYLES.GREY;
}; 