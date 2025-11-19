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

  const model = process.env.OPENROUTER_VISION_MODEL ?? 'openai/gpt-4o-mini';
  const baseUrl = process.env.OPENROUTER_BASE_URL ?? OPENROUTER_DEFAULT_BASE_URL;
  const endpoint = `${normalizeBaseUrl(baseUrl)}/chat/completions`;

  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `You are an expert financial analyst. From the attached real estate proforma image, extract the following details.

Return a strictly valid JSON object with these keys:
1. "cash_flow_after_debt": Year 1 Cash Flow After Debt Service (numeric).
2. "cash_on_cash": Year 1 Cash on Cash Return (levered) as a decimal (e.g., 0.055 for 5.5%).
3. "dscr": Year 1 Debt Service Coverage Ratio (numeric).
4. "cap_rate": Year 1 Cap Rate as a decimal (e.g., 0.045 for 4.5%).
5. "purchase_price": Total purchase price (numeric).
6. "down_payment": Total cash required/equity/down payment (numeric).
7. "interest_rate": Mortgage interest rate as a decimal (e.g., 0.045).
8. "amortization_years": Mortgage amortization in years (integer).
9. "total_operating_expenses": Total Annual Operating Expenses (numeric).
10. "unit_mix": An array of unit types. For each type found:
   - "name": Label (e.g., "1 Bedroom", "Bachelor").
   - "count": Number of units (integer).
   - "monthly_rent": Monthly rent per unit (numeric).
   - "bedrooms": Number of bedrooms (integer, 0 for bachelor).

Sanitize all values. Remove currency symbols, commas, and percentage signs. Ensure decimals are used for percentages. If a value is not found, use null.`,
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
      max_tokens: 1000,
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
