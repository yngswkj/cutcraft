import { NextRequest, NextResponse } from 'next/server';
import { generateVideoScript, type GenerateScriptResult } from '@/lib/openai';
import { getSceneVideoLabel, getSceneVideoChoice } from '@/lib/scene-models';
import { withProjectLock } from '@/lib/project-store';

const SAFE_ID_REGEX = /^[A-Za-z0-9-]+$/;

export async function POST(req: NextRequest) {
  let body: { projectId: string; sceneId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 });
  }

  const { projectId, sceneId } = body;

  if (!projectId || !sceneId) {
    return NextResponse.json(
      { error: '必須パラメータが不足しています' },
      { status: 400 },
    );
  }
  if (!SAFE_ID_REGEX.test(projectId) || !SAFE_ID_REGEX.test(sceneId)) {
    return NextResponse.json(
      { error: '不正なパラメータです' },
      { status: 400 },
    );
  }

  try {
    const { result } = await withProjectLock<GenerateScriptResult>(projectId, async (project) => {
      const scene = project.scenes.find((s) => s.id === sceneId);
      if (!scene) {
        throw new Error('シーンが見つかりません');
      }

      // LLMでスクリプト生成
      const videoChoice = getSceneVideoChoice(scene);
      const result = await generateVideoScript(
        scene.title,
        scene.description,
        scene.styleDirection,
        scene.videoApi,
        {
          videoApiLabel: getSceneVideoLabel(scene),
          videoApiHint: videoChoice === 'veo31fast'
            ? 'Veo 3.1 Fast は4/6/8秒の短尺で高速生成に向いています'
            : undefined,
        },
      );

      // シーンに反映
      scene.videoPrompt = result.videoPrompt;
      scene.promptMetadata = result.metadata;

      return { project, result };
    });

    return NextResponse.json({
      videoPrompt: result.videoPrompt,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error('Script generation error:', error);
    const message = error instanceof Error ? error.message : 'スクリプト生成に失敗しました';
    if (message === 'プロジェクトが見つかりません' || message === 'シーンが見つかりません') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
