export default async function handler(req: any, res: any) {
  console.log('🧪 Simple test endpoint called');
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  try {
    const envCheck = {
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      nodeVersion: process.version,
      method: req.method,
      timestamp: new Date().toISOString()
    };
    
    console.log('Environment check:', envCheck);
    
    res.status(200).json({
      success: true,
      message: 'Test endpoint working!',
      ...envCheck
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({
      error: 'Test endpoint failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
} 