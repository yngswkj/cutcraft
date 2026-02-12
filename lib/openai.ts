import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { getEffectiveSettings, renderPromptTemplate } from './settings';
import type { BlueprintResult, VideoApiPreference } from '@/types/project';

function getClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

async function getConfiguredOpenAIClient(): Promise<{ client: OpenAI; settings: Awaited<ReturnType<typeof getEffectiveSettings>> }> {
  const settings = await getEffectiveSettings();
  const apiKey = settings.apiKeys.openaiApiKey;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY が設定されていません（設定画面または .env.local）');
  }
  return {
    client: getClient(apiKey),
    settings,
  };
}

function resolveGeminiImageModel(modelName: string): string | null {
  const normalized = modelName.trim().toLowerCase();

  if (
    normalized === 'nanobananapro' ||
    normalized === 'nano-banana-pro' ||
    normalized === 'nano banana pro'
  ) {
    return 'gemini-3-pro-image-preview';
  }
  if (
    normalized === 'nanobanana' ||
    normalized === 'nano-banana' ||
    normalized === 'nano banana'
  ) {
    return 'gemini-2.5-flash-image';
  }
  if (normalized.startsWith('gemini-') && normalized.includes('image')) {
    return modelName.trim();
  }
  return null;
}

async function generateImageWithGemini(
  prompt: string,
  model: string,
  googleApiKey: string,
): Promise<GenerateImageResult> {
  const ai = new GoogleGenAI({ apiKey: googleApiKey });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  let imageBase64: string | null = null;
  let imageMimeType: string | undefined;
  const revisedPromptTexts: string[] = [];

  for (const part of parts) {
    if (part.text) {
      revisedPromptTexts.push(part.text);
    }
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || '';
      if (!mimeType || mimeType.startsWith('image/')) {
        imageBase64 = part.inlineData.data;
        imageMimeType = mimeType || undefined;
      }
    }
  }

  if (!imageBase64) {
    throw new Error('Gemini画像生成の結果から画像データを取得できませんでした');
  }

  return {
    b64_json: imageBase64,
    revised_prompt: revisedPromptTexts.join('\n').trim() || prompt,
    mimeType: imageMimeType,
  };
}

function buildBlueprintApiInstruction(apiPreference: VideoApiPreference): string {
  const apiInstruction = apiPreference === 'auto'
    ? `- suggestedApi: シーンの特性に応じて最適なAPIを選択する
  - "sora": 動きが大きいシーン、短中尺（4/8/12秒）、カメラワークが複雑なシーン向き
  - "veo": 短尺（最大8秒）、高品質・高解像度が必要なシーン、静的な美しさ重視のシーン向き`
    : `- suggestedApi: すべてのシーンで "${apiPreference}" を指定すること
  ${apiPreference === 'sora'
    ? '- Sora の制約: 各シーンは4/8/12秒'
    : '- Veo の制約: 各シーン最大8秒'}`;

  return apiInstruction;
}

function buildBlueprintPrompt(
  apiPreference: VideoApiPreference,
  promptTemplate: string,
): string {
  const apiInstruction = buildBlueprintApiInstruction(apiPreference);
  return renderPromptTemplate(promptTemplate, {
    API_INSTRUCTION: apiInstruction,
  });
}

export async function generateBlueprint(
  theme: string,
  apiPreference: VideoApiPreference = 'auto',
): Promise<BlueprintResult> {
  const { client, settings } = await getConfiguredOpenAIClient();
  const systemPrompt = buildBlueprintPrompt(
    apiPreference,
    settings.prompts.blueprintSystemPromptTemplate,
  );

  const response = await client.chat.completions.create({
    model: settings.models.llmModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: theme },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('LLMからの応答が空です');
  return JSON.parse(content) as BlueprintResult;
}

export interface GenerateImageResult {
  b64_json: string;
  revised_prompt?: string;
  mimeType?: string;
}

export async function generateImage(prompt: string): Promise<GenerateImageResult> {
  const settings = await getEffectiveSettings();
  const imageModel = settings.models.imageModel.trim();
  const geminiImageModel = resolveGeminiImageModel(imageModel);

  if (geminiImageModel) {
    const googleApiKey = settings.apiKeys.googleAiApiKey;
    if (!googleApiKey) {
      throw new Error('GOOGLE_AI_API_KEY が設定されていません（設定画面または .env.local）');
    }
    return generateImageWithGemini(prompt, geminiImageModel, googleApiKey);
  }

  const openAiKey = settings.apiKeys.openaiApiKey;
  if (!openAiKey) {
    throw new Error('OPENAI_API_KEY が設定されていません（設定画面または .env.local）');
  }
  const client = getClient(openAiKey);
  const response = await client.images.generate({
    model: imageModel,
    prompt,
    n: 1,
    size: '1792x1024', // 16:9 横長（動画に適したアスペクト比）
    quality: 'hd',
    response_format: 'b64_json',
  });

  if (!response.data || response.data.length === 0) {
    throw new Error('画像生成に失敗しました');
  }

  const imageData = response.data[0];
  if (!imageData?.b64_json) throw new Error('画像生成に失敗しました');

  return {
    b64_json: imageData.b64_json,
    revised_prompt: imageData.revised_prompt,
  };
}

export interface GenerateScriptResult {
  videoPrompt: string;
  metadata: {
    cameraWork: string;
    movement: string;
    lighting: string;
    style: string;
  };
}

export async function generateVideoScript(
  sceneTitle: string,
  sceneDescription: string,
  styleDirection: string,
  videoApi: 'sora' | 'veo',
): Promise<GenerateScriptResult> {
  const { client, settings } = await getConfiguredOpenAIClient();
  const systemPrompt = renderPromptTemplate(
    settings.prompts.scriptSystemPromptTemplate,
    {
      VIDEO_API_LABEL: videoApi === 'sora' ? 'Sora' : 'Veo',
      VIDEO_API_HINT: videoApi === 'sora'
        ? 'Sora 2 は4/8/12秒の短中尺と複雑なカメラワークが得意'
        : 'Veo は短尺で高品質、静的な美しさが得意',
    },
  );

  const userPrompt = `【シーンタイトル】${sceneTitle}
【シーン説明】${sceneDescription}
【スタイル方向性】${styleDirection}`;

  const response = await client.chat.completions.create({
    model: settings.models.llmModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('LLMからの応答が空です');
  return JSON.parse(content) as GenerateScriptResult;
}
