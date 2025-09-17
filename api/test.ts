export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    return res.json({ 
      success: true, 
      message: 'Test API working',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[test] API error:', err);
    return res.status(500).json({ 
      error: 'Test failed',
      details: err instanceof Error ? err.message : String(err)
    });
  }
}
