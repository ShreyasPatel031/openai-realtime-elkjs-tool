import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if the API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return NextResponse.json(
        { error: 'OpenAI API key is not configured' },
        { status: 500 }
      );
    }

    // Get a token from OpenAI's Realtime API
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'verse'
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to get token from OpenAI', details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Return the session data with the API key as the client secret
    return NextResponse.json({
      ...data,
      client_secret: {
        value: process.env.OPENAI_API_KEY // Use the actual API key as the client secret
      }
    });
  } catch (error) {
    console.error('Token endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 