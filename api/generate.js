export default async function handler(req, res) {
  /* ─── CORS headers ─────────────────────────────────── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  /* ─── Validate request body ────────────────────────── */
  const { context, prompt } = req.body;
  if (!context || !prompt) {
    return res.status(400).json({ error: 'Missing context or prompt' });
  }

  /* ─── Read API key from environment ────────────────── */
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
  }

  /* ─── Call Gemini API ──────────────────────────────── */
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Here is information about a GitHub repository:\n\n${context}\n\n${prompt}\n\nReturn only clean markdown. No preamble, no explanation.`,
            }],
          }],
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.4,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'Gemini API error',
      });
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map(p => p.text || '')
      .join('') || '';

    return res.status(200).json({ text });

  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
