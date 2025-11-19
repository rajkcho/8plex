export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | any[];
};

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '');

export const chatCompletion = async (
  messages: ChatMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
    baseURL?: string;
  } = {},
): Promise<string> => {
  if (!messages.length) {
    throw new Error('At least one message is required');
  }

  const { temperature = 0.1, maxTokens = 800 } = options;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const model = options.model ?? process.env.OPENROUTER_MODEL;
  if (!model) {
    throw new Error('OPENROUTER_MODEL is not configured');
  }

  const baseUrl = options.baseURL ?? process.env.OPENROUTER_BASE_URL ?? OPENROUTER_DEFAULT_BASE_URL;
  const endpoint = `${normalizeBaseUrl(baseUrl)}/chat/completions`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText} ${errorText}`.trim());
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenRouter response did not include a completion');
  }

  return content;
};

export const performOcr = async (imageBase64: string): Promise<string> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const model = process.env.OPENROUTER_VISION_MODEL ?? 'google/gemini-pro-1.5';
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
    throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText} ${errorText}`);
  }

  const payload = await response.json();
  // @ts-ignore
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('OpenRouter response did not include a completion.');
  }

  return content;
};
