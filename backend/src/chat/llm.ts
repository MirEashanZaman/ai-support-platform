export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export interface LlmRequest {
  system: string;
  user: string;
  maxTokens: number;
}

/** Adapter/Strategy: ChatService only knows this interface, so the model can be swapped. */
export interface LlmProvider {
  complete(req: LlmRequest): Promise<string>;
}

export class ClaudeProvider implements LlmProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(req: LlmRequest): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens,
        temperature: 0,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    return (body.content ?? [])
      .flatMap((b) => (b.type === 'text' && b.text ? [b.text] : []))
      .join('');
  }
}

/** Offline testing only: answers with the start of the first retrieved document. */
export class MockLlmProvider implements LlmProvider {
  async complete(req: LlmRequest): Promise<string> {
    const m = req.user.match(
      /<document number="1"[^>]*>\n([\s\S]*?)\n<\/document>/,
    );
    if (!m) {
      return JSON.stringify({
        answerable: false,
        confidence: 'low',
        answer: '',
        sources: [],
      });
    }
    return JSON.stringify({
      answerable: true,
      confidence: 'medium',
      answer: m[1].slice(0, 300),
      sources: ['1'],
    });
  }
}

export function createLlmProvider(): LlmProvider {
  const key = process.env.ANTHROPIC_API_KEY;
  if (
    process.env.LLM_PROVIDER === 'mock' ||
    !key ||
    key.startsWith('sk-ant-your-')
  ) {
    return new MockLlmProvider();
  }
  return new ClaudeProvider(
    key,
    process.env.CLAUDE_MODEL ??
      process.env.ANTHROPIC_MODEL ??
      'claude-3-5-sonnet-latest',
  );
}
