import { NextResponse } from 'next/server';
import { getProject, updateProject } from '@/lib/project-store';
import { startVideoGeneration } from '@/lib/video-service';

export async function POST(request: Request) {
  const body = await request.json();
  const { projectId, sceneId } = body as { projectId: string; sceneId: string };

  const project = await getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'プロジェクトが見つかりません' }, { status: 404 });
  }

  const scene = project.scenes.find(s => s.id === sceneId);
  if (!scene) {
    return NextResponse.json({ error: 'シーンが見つかりません' }, { status: 404 });
  }

  const prompt = scene.videoPrompt || scene.description;
  if (!prompt) {
    return NextResponse.json({ error: 'プロンプトが空です' }, { status: 400 });
  }

  try {
    const version = scene.generations.length + 1;
    const inputImagePath = scene.useAsVideoInput && scene.selectedImageId
      ? scene.images.find(img => img.id === scene.selectedImageId)?.localPath
      : undefined;

    const generation = await startVideoGeneration({
      projectId,
      sceneId,
      prompt,
      durationSec: scene.durationSec,
      api: scene.videoApi,
      inputImagePath,
      version,
    });

    scene.generations.push(generation);
    project.currentStep = 'generate';
    await updateProject(project);

    return NextResponse.json({ generation });
  } catch (error) {
    const message = error instanceof Error ? error.message : '動画生成の開始に失敗しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
