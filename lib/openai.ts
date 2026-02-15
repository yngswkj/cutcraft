import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { getEffectiveSettings, renderPromptTemplate } from './settings';
import { NANO_BANANA_PRO_IMAGE_MODEL } from './scene-models';
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
    return NANO_BANANA_PRO_IMAGE_MODEL;
  }
  if (normalized === NANO_BANANA_PRO_IMAGE_MODEL) {
    return NANO_BANANA_PRO_IMAGE_MODEL;
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
  - "veo": Veo 3.1 Fast（4/6/8秒）向き。短尺で高速生成・高品質が必要なシーン、静的な美しさ重視のシーン向き`
    : `- suggestedApi: すべてのシーンで "${apiPreference}" を指定すること
  ${apiPreference === 'sora'
    ? '- Sora の制約: 各シーンは4/8/12秒'
    : '- Veo 3.1 Fast の制約: 各シーンは4/6/8秒'}`;

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

export interface GenerateImageOptions {
  modelOverride?: string;
}

function isGptImageModel(modelName: string): boolean {
  const normalized = modelName.trim().toLowerCase();
  return normalized.startsWith('gpt-image');
}

export async function generateImage(
  prompt: string,
  options: GenerateImageOptions = {}
): Promise<GenerateImageResult> {
  const settings = await getEffectiveSettings();
  const imageModel = (options.modelOverride || settings.models.imageModel).trim();
  const geminiImageModel = resolveGeminiImageModel(imageModel);

  if (geminiImageModel) {
    const googleApiKey = settings.apiKeys.googleAiApiKey;
    if (!googleApiKey) {
      throw new Error('GOOGLE_AI_API_KEY が設定されていません（設定画面または .env.local）');
    }
    return generateImageWithGemini(prompt, geminiImageModel, googleApiKey);
  }
  if (!isGptImageModel(imageModel)) {
    throw new Error(
      `未対応の画像モデルです: ${imageModel}. gpt-image* または nanobananapro（${NANO_BANANA_PRO_IMAGE_MODEL}）のみ使用できます`,
    );
  }

  const openAiKey = settings.apiKeys.openaiApiKey;
  if (!openAiKey) {
    throw new Error('OPENAI_API_KEY が設定されていません（設定画面または .env.local）');
  }
  const client = getClient(openAiKey);
  const request: OpenAI.Images.ImageGenerateParams = {
    model: imageModel,
    prompt,
    n: 1,
    size: '1536x1024', // gpt-image 系の横長最大サイズ
    quality: 'high',
    output_format: 'png',
  };

  const response = await client.images.generate(request);

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
  options: { videoApiLabel?: string; videoApiHint?: string } = {},
): Promise<GenerateScriptResult> {
  const { client, settings } = await getConfiguredOpenAIClient();
  const defaultLabel = videoApi === 'sora' ? 'Sora' : 'Veo 3.1 Fast';
  const defaultHint = videoApi === 'sora'
    ? 'Sora 2 は4/8/12秒の短中尺と複雑なカメラワークが得意'
    : 'Veo 3.1 Fast は4/6/8秒の短尺高速生成に向いている';

  const systemPrompt = renderPromptTemplate(
    settings.prompts.scriptSystemPromptTemplate,
    {
      VIDEO_API_LABEL: options.videoApiLabel || defaultLabel,
      VIDEO_API_HINT: options.videoApiHint || defaultHint,
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
