module.exports = async function handler(req, res) {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.error("OPENAI_API_KEY is not set");
      return res.status(500).json({ error: "API key not configured" });
    }

    // Test endpoint - just return success for now
    res.json({ 
      success: true, 
      message: "Token endpoint is working",
      hasApiKey: !!apiKey,
      environment: process.env.NODE_ENV || "unknown"
    });
    
  } catch (error) {
    console.error("Token endpoint error:", error);
    res.status(500).json({ 
      error: "Function error", 
      details: error.message,
      stack: error.stack 
    });
  }
} 