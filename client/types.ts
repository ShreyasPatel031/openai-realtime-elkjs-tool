// Define common types used across the application

export interface Message {
  id: string;
  content: string;
  sender: "user" | "assistant";
  type?: string;
  role?: string;
  response?: any;
}

export interface ElkLabel {
  text: string;
  x?: number;
  y?: number;
}

// You can add more types as needed 