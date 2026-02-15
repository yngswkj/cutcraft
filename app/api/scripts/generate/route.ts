import { NextRequest, NextResponse } from 'next/server';
import { generateVideoScript } from '@/lib/openai';
import { getSceneVideoLabel, getSceneVideoChoice } from '@/lib/scene-models';
import { getProject, updateProject } from '@/lib/project-store';

const SAFE_ID_REGEX = /^[A-Za-z0-9-]+$/;

export async function POST(req: NextRequest) {
  try {
    const { projectId, sceneId } = await req.json();

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

    // プロジェクト取得
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'プロジェクトが見つかりません' }, { status: 404 });
    }

    const scene = project.scenes.find((s) => s.id === sceneId);
    if (!scene) {
      return NextResponse.json({ error: 'シーンが見つかりません' }, { status: 404 });
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

    await updateProject(project);

    return NextResponse.json({
      videoPrompt: result.videoPrompt,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error('Script generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'スクリプト生成に失敗しました' },
      { status: 500 },
    );
  }
}
