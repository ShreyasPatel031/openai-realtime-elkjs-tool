export default function handler(req, res) {
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
    
    console.log('API Key present:', !!apiKey);
    console.log('API Key length:', apiKey ? apiKey.length : 0);
    console.log('Node version:', process.version);
    console.log('Has fetch:', typeof fetch);
    
    // Test response
    res.json({ 
      success: true,
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      nodeVersion: process.version,
      hasFetch: typeof fetch !== 'undefined',
      environment: process.env.NODE_ENV || 'unknown'
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