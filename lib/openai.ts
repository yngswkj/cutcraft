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
