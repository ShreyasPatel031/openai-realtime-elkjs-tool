export default async function handler(req: any, res: any) {
  // Simple debug endpoint to check environment variables
  const hasOpenAiKey = !!process.env.OPENAI_API_KEY;
  const keyLength = process.env.OPENAI_API_KEY?.length || 0;
  const keyPrefix = process.env.OPENAI_API_KEY?.substring(0, 10) || 'none';
  
  const debug = {
    hasOpenAiKey,
    keyLength,
    keyPrefix,
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  };

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  res.status(200).json(debug);
} 