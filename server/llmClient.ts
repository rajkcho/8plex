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
