import { NextResponse } from 'next/server';
import { getProject, updateProject, createSceneFromBlueprint } from '@/lib/project-store';
import { generateBlueprint } from '@/lib/openai';

export async function POST(request: Request) {
  const body = await request.json();
  const { projectId } = body as { projectId: string };

  const project = await getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'プロジェクトが見つかりません' }, { status: 404 });
  }

  try {
    const preference = project.videoApiPreference || 'auto';
    const result = await generateBlueprint(project.theme, preference);
    const scenes = result.scenes.map((s, i) =>
      createSceneFromBlueprint(s, i, preference)
    );

    project.scenes = scenes;
    project.currentStep = 'blueprint';
    await updateProject(project);

    return NextResponse.json({ scenes });
  } catch (error) {
    const message = error instanceof Error ? error.message : '設計図の生成に失敗しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
