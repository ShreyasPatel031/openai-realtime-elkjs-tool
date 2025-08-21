import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { description = "architecture" } = req.body;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a naming assistant. Generate short, professional names for cloud architectures. Keep names to 2-4 words maximum. Be creative but professional. Examples: 'Cloud Gateway Hub', 'Serverless Data Pipeline', 'Multi-Region Setup', 'API Gateway Architecture'."
        },
        {
          role: "user",
          content: `Generate a name for a new ${description} architecture. Just return the name, nothing else.`
        }
      ],
      max_tokens: 20,
      temperature: 0.8,
    });

    const generatedName = completion.choices[0]?.message?.content?.trim() || 'New Architecture';

    res.status(200).json({ name: generatedName });
  } catch (error) {
    console.error('Error generating name:', error);
    
    // Fallback names if OpenAI fails
    const fallbackNames = [
      'Cloud Architecture',
      'Serverless Setup',
      'Microservices Platform',
      'API Gateway Hub',
      'Data Pipeline',
      'Container Platform',
      'Event-Driven System',
      'Hybrid Cloud Setup'
    ];
    
    const randomName = fallbackNames[Math.floor(Math.random() * fallbackNames.length)];
    
    res.status(200).json({ name: randomName });
  }
}
