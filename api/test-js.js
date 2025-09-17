export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    return res.json({ 
      success: true, 
      message: 'Test JS API working',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[test-js] API error:', err);
    return res.status(500).json({ 
      error: 'Test failed',
      details: err instanceof Error ? err.message : String(err)
    });
  }
}
