import OpenAI from 'openai';
import type { BlueprintResult, VideoApiPreference } from '@/types/project';

function getClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function buildBlueprintPrompt(apiPreference: VideoApiPreference): string {
  const apiInstruction = apiPreference === 'auto'
    ? `- suggestedApi: シーンの特性に応じて最適なAPIを選択する
  - "sora": 動きが大きいシーン、長尺（最大20秒）、カメラワークが複雑なシーン向き
  - "veo": 短尺（最大8秒）、高品質・高解像度が必要なシーン、静的な美しさ重視のシーン向き`
    : `- suggestedApi: すべてのシーンで "${apiPreference}" を指定すること
  ${apiPreference === 'sora'
    ? '- Sora の制約: 各シーン最大20秒'
    : '- Veo の制約: 各シーン最大8秒'}`;

  return `あなたは映像ディレクターです。ユーザーのテーマから約2分間の動画の設計図を作成してください。

以下のJSON形式で出力してください:
{
  "scenes": [
    {
      "title": "シーンタイトル",
      "description": "シーンの詳細な説明（映像内容、雰囲気、色調）",
      "durationSec": 秒数,
      "styleDirection": "映像スタイルの方向性（英語キーワード）",
      "suggestedApi": "sora" または "veo"
    }
  ]
}

制約:
- 合計秒数は約120秒になるようにする
- 8〜15シーン程度に分割
- シーン間の自然なつながりを意識
${apiInstruction}
- description は映像として具体的に想像できる内容にする
- styleDirection は英語のキーワードで（例: "cinematic, warm tones, shallow depth of field"）`;
}

export async function generateBlueprint(
  theme: string,
  apiPreference: VideoApiPreference = 'auto',
): Promise<BlueprintResult> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: buildBlueprintPrompt(apiPreference) },
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
}

export async function generateImage(prompt: string): Promise<GenerateImageResult> {
  const client = getClient();
  const response = await client.images.generate({
    model: 'dall-e-3',
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
  const client = getClient();
  const systemPrompt = `あなたは映像プロダクションの専門家です。シーン情報から${videoApi === 'sora' ? 'Sora' : 'Veo'}向けの動画生成プロンプトを作成してください。

以下のJSON形式で出力してください:
{
  "videoPrompt": "動画生成用の詳細なプロンプト（英語、1-2文）",
  "metadata": {
    "cameraWork": "カメラワークの説明（日本語）",
    "movement": "動きの説明（日本語）",
    "lighting": "ライティングの説明（日本語）",
    "style": "スタイル・雰囲気の説明（日本語）"
  }
}

制約:
- videoPrompt は英語で具体的に（カメラアングル、動き、ライティング、色調を含む）
- ${videoApi === 'sora' ? 'Sora は長尺と複雑なカメラワークが得意' : 'Veo は短尺で高品質、静的な美しさが得意'}
- 映像として実現可能な内容にする
- metadata は日本語で分かりやすく`;

  const userPrompt = `【シーンタイトル】${sceneTitle}
【シーン説明】${sceneDescription}
【スタイル方向性】${styleDirection}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
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
