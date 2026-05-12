import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { Env, Provider } from './env.js';

export interface LlmCallOptions {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly responseFormat?: 'text' | 'json';
}

export interface LlmCallResult {
  readonly content: string;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
  readonly model: string;
}

export interface LlmClient {
  call(options: LlmCallOptions): Promise<LlmCallResult>;
  readonly provider: Provider;
  readonly model: string;
}

class OpenAiClient implements LlmClient {
  public readonly provider: Provider = 'openai';
  public readonly model: string;
  private readonly client: OpenAI;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async call(opts: LlmCallOptions): Promise<LlmCallResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxOutputTokens ?? 4000,
      ...(opts.responseFormat === 'json'
        ? { response_format: { type: 'json_object' as const } }
        : {}),
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userPrompt },
      ],
    });
    const choice = response.choices[0];
    if (!choice || !choice.message.content) {
      throw new Error('[openai] Empty response.');
    }
    return {
      content: choice.message.content,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      model: this.model,
    };
  }
}

class AnthropicClient implements LlmClient {
  public readonly provider: Provider = 'anthropic';
  public readonly model: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async call(opts: LlmCallOptions): Promise<LlmCallResult> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: opts.maxOutputTokens ?? 4000,
      temperature: opts.temperature ?? 0.7,
      system: opts.systemPrompt,
      messages: [{ role: 'user', content: opts.userPrompt }],
    });
    const block = message.content[0];
    if (!block || block.type !== 'text') {
      throw new Error('[anthropic] Unexpected response shape.');
    }
    return {
      content: block.text,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
      model: this.model,
    };
  }
}

export function buildLlmClient(env: Env, provider: Provider): LlmClient {
  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing.');
    return new OpenAiClient(env.OPENAI_API_KEY, env.EDITORIAL_PILOT_OPENAI_MODEL);
  }
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing.');
  return new AnthropicClient(env.ANTHROPIC_API_KEY, env.EDITORIAL_PILOT_ANTHROPIC_MODEL);
}
