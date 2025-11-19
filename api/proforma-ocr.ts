
import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '');

// This is adapted from server/llmClient.ts to support multimodal input for Gemini.
export const performOcr = async (imageBase64: string): Promise<string> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  // Crucial: Target the specific model as requested.
  const model = 'google/gemini-flash-1.5';

  const baseUrl = process.env.OPENROUTER_BASE_URL ?? OPENROUTER_DEFAULT_BASE_URL;
  const endpoint = `${normalizeBaseUrl(baseUrl)}/chat/completions`;

  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `You are an expert financial analyst. From the attached image, find the "Year 1" column and extract the values for "Cash Flow After Debt Service", "Cash on Cash Return (levered)", and "Debt Service Coverage Ratio".
- "Cash Flow After Debt Service" should be the key "cash_flow_after_debt".
- "Cash on Cash Return (levered)" should be the key "cash_on_cash".
- "Debt Service Coverage Ratio" should be the key "dscr".
Your response MUST be ONLY a valid JSON object with these keys. Sanitize currency strings (e.g., "$30,165.79") and percentages (e.g., "24.6%") into clean float numbers (e.g., 30165.79 and 0.246).`,
        },
        {
          type: 'image_url',
          image_url: {
            url: imageBase64,
          },
        },
      ],
    },
  ];

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 500,
      temperature: 0.0,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Failed to read error response.');
    console.error('OpenRouter Error:', errorText);
    throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('OpenRouter response did not include a completion.');
  }

  return content;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const { image } = req.body;
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'A valid base64 image string is required.' });
    }

    const ocrResult = await performOcr(image);
    
    // The model should return a clean JSON string. We parse it to ensure it's valid before sending.
    const jsonData = JSON.parse(ocrResult);

    return res.status(200).json(jsonData);

  } catch (error) {
    console.error('Error in proforma-ocr handler:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return res.status(500).json({ error: 'Failed to process the proforma.', details: message });
  }
}
