/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import type { Config } from '../config/config.js';
import { loadApiKey } from './apiKeyCredentialStorage.js';

import type { UserTierId } from '../code_assist/types.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  userTier?: UserTierId;

  userTierName?: string;
}

export enum AuthType {
  USE_GEMINI = 'gemini',
  USE_OPENAI = 'openai',
  USE_ANTHROPIC = 'anthropic',
}

export type ContentGeneratorConfig = {
  authType?: AuthType;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  //vertexai?: boolean;

  timeout?: number; // Timeout configuration in milliseconds
  maxRetries?: number; // Maximum retries for failed requests
  disableCacheControl?: boolean; // Disable cache control for DashScope providers
  samplingParams?: {
    top_p?: number;
    top_k?: number;
    repetition_penalty?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    temperature?: number;
    max_tokens?: number;
  };
  reasoning?:
    | false
    | {
        effort?: 'low' | 'medium' | 'high';
        budget_tokens?: number;
      };
  proxy?: string | undefined;
  userAgent?: string;
  // Schema compliance mode for tool definitions
  schemaCompliance?: 'auto' | 'openapi_30';
  // Context window size override. If set to a positive number, it will override
  // the automatic detection. Leave undefined to use automatic detection.
  contextWindowSize?: number;
  // Custom HTTP headers to be sent with requests
  customHeaders?: Record<string, string>;
  // Extra body parameters to be merged into the request body
  extra_body?: Record<string, unknown>;
};

export async function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): Promise<ContentGeneratorConfig> {
  const geminiApiKey =
    process.env['GEMINI_API_KEY'] || (await loadApiKey()) || undefined;
  const openaiApiKey = process.env['OPENAI_API_KEY'] || undefined;
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'] || undefined;

  const contentGeneratorConfig = config.getContentGeneratorConfig();
  contentGeneratorConfig.proxy = config.getProxy();

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_OPENAI && openaiApiKey) {
    contentGeneratorConfig.apiKey = openaiApiKey;
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_ANTHROPIC && anthropicApiKey) {
    contentGeneratorConfig.apiKey = anthropicApiKey;

    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  _sessionId?: string, // don't use sessionId, but keep it for now
): Promise<ContentGenerator> {
  const authType = config.authType;
  if (!authType) {
    throw new Error('ContentGeneratorConfig must have an authType');
  }

  let baseGenerator: ContentGenerator;
  if (authType === AuthType.USE_OPENAI) {
    const { createOpenAIContentGenerator } = await import(
      './openaiContentGenerator/index.js'
    );
    baseGenerator = createOpenAIContentGenerator(config, gcConfig);
  } else if (authType === AuthType.USE_ANTHROPIC) {
    const { createAnthropicContentGenerator } = await import(
      './anthropicContentGenerator/index.js'
    );
    baseGenerator = createAnthropicContentGenerator(config, gcConfig);
  } else if (authType === AuthType.USE_GEMINI) {
    const { createGeminiContentGenerator } = await import(
      './geminiContentGenerator/index.js'
    );
    baseGenerator = createGeminiContentGenerator(config, gcConfig);
  } else {
    throw new Error(
      `Error creating contentGenerator: Unsupported authType: ${authType}`,
    );
  }

  const generator = new LoggingContentGenerator(baseGenerator, gcConfig);
  return generator;
}
