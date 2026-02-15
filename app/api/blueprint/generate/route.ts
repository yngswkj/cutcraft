import { NextResponse } from 'next/server';
import { withProjectLock, createSceneFromBlueprint } from '@/lib/project-store';
import { generateBlueprint } from '@/lib/openai';
import type { Scene } from '@/types/project';

const SAFE_PROJECT_ID_REGEX = /^[A-Za-z0-9-]+$/;

export async function POST(request: Request) {
  let body: { projectId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 });
  }
  const { projectId } = body;

  if (!projectId || !SAFE_PROJECT_ID_REGEX.test(projectId)) {
    return NextResponse.json({ error: '不正なprojectIdです' }, { status: 400 });
  }

  try {
    const { result: scenes } = await withProjectLock<Scene[]>(projectId, async (project) => {
      const preference = project.videoApiPreference || 'auto';
      const result = await generateBlueprint(project.theme, preference);
      const scenes = result.scenes.map((s, i) =>
        createSceneFromBlueprint(s, i, preference)
      );

      project.scenes = scenes;
      project.currentStep = 'blueprint';
      return { project, result: scenes };
    });

    return NextResponse.json({ scenes });
  } catch (error) {
    const message = error instanceof Error ? error.message : '設計図の生成に失敗しました';
    if (message === 'プロジェクトが見つかりません') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
