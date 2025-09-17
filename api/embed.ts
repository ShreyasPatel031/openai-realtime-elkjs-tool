import OpenAI from 'openai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Missing text parameter' });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY not found');
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
    }

    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY?.trim()
    });

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    });

    const embedding = response.data[0].embedding;
    
    return res.json({ embedding });
  } catch (err) {
    console.error('[embed] API error:', err);
    return res.status(500).json({ 
      error: 'Embedding failed',
      details: err instanceof Error ? err.message : String(err)
    });
  }
}
