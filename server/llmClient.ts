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
7. "broker_fee": Broker fee or acquisition fee (numeric). If not found, return 0.
8. "interest_rate": Mortgage interest rate as a decimal (e.g., 0.045).
9. "amortization_years": Mortgage amortization in years (integer).
10. "total_operating_expenses": Total Annual Operating Expenses (numeric).
11. "expenses_breakdown": Object containing individual annual expense line items found (e.g., {"property_taxes": 5000, "insurance": 1200, "management": 3000, "utilities": 2500, "repairs": 1500}). Use standard keys where possible.
12. "unit_mix": An array of unit types. For each type found:
   - "name": Label (e.g., "1 Bedroom", "Bachelor").
   - "count": Number of units (integer).
   - "monthly_rent": Monthly rent per unit (numeric).
   - "bedrooms": Number of bedrooms (integer, 0 for bachelor).
   - "usage": Usage type (e.g., "Residential", "Commercial", "Parking"). Default to "Residential" if not specified.
   
   For "Pet" income, look for "Pet" in the income section. Extract:
   - "pet_count": Number of pet units/fees.
   - "pet_fee": Monthly fee per pet.
   
13. "pet_income_details": { "count": integer, "fee": numeric } if found.

Sanitize all values. Remove currency symbols, commas, and percentage signs. Ensure decimals are used for percentages. If a value is not found, use null (or 0 for broker_fee).`,
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
