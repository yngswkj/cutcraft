import { NextResponse } from 'next/server';
import { getProject, updateProject } from '@/lib/project-store';
import { startVideoGeneration, getChainedFramePath } from '@/lib/video-service';

const SAFE_PROJECT_ID_REGEX = /^[A-Za-z0-9-]+$/;
const SAFE_SCENE_ID_REGEX = /^[A-Za-z0-9-]+$/;
const SAFE_FILENAME_REGEX = /^[A-Za-z0-9._-]+$/;

function parseImageInputPath(localPath: string, projectId: string): string | null {
  const prefix = `/api/files/${projectId}/images/`;
  if (!localPath.startsWith(prefix)) return null;
  const filename = localPath.slice(prefix.length);
  if (!SAFE_FILENAME_REGEX.test(filename)) return null;
  return `images/${filename}`;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { projectId, sceneId } = body as { projectId: string; sceneId: string };

  if (!SAFE_PROJECT_ID_REGEX.test(projectId) || !SAFE_SCENE_ID_REGEX.test(sceneId)) {
    return NextResponse.json({ error: '不正なパラメータです' }, { status: 400 });
  }

  const project = await getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'プロジェクトが見つかりません' }, { status: 404 });
  }

  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) {
    return NextResponse.json({ error: 'シーンが見つかりません' }, { status: 404 });
  }

  const prompt = scene.videoPrompt || scene.description;
  if (!prompt) {
    return NextResponse.json({ error: 'プロンプトが空です' }, { status: 400 });
  }

  try {
    const version = scene.generations.length + 1;

    // 入力画像の決定（チェーン > useAsVideoInput > なし）
    let inputImagePath: string | undefined;

    // シーンチェーン: 前のシーンの最終フレームを使用
    if (scene.chainFromPreviousScene) {
      const sceneIndex = project.scenes.findIndex((s) => s.id === sceneId);
      if (sceneIndex > 0) {
        const prevScene = project.scenes[sceneIndex - 1];
        const approvedGen = prevScene.generations.find(
          (g) => g.id === prevScene.approvedGenerationId
        );
        if (approvedGen && approvedGen.status === 'completed') {
          const framePath = await getChainedFramePath(
            projectId,
            prevScene.id,
            approvedGen.version,
          );
          if (framePath) {
            inputImagePath = framePath;
          }
        }
      }
    }

    // チェーンフレームがなければ、選択画像を使用
    if (!inputImagePath) {
      const selectedImage = scene.useAsVideoInput && scene.selectedImageId
        ? scene.images.find((img) => img.id === scene.selectedImageId)
        : undefined;
      if (selectedImage) {
        const parsed = parseImageInputPath(selectedImage.localPath, projectId);
        if (parsed) {
          inputImagePath = parsed;
        }
      }
    }

    const generation = await startVideoGeneration({
      projectId,
      sceneId,
      prompt,
      durationSec: scene.durationSec,
      api: scene.videoApi,
      modelOverride: scene.videoModelOverride || undefined,
      inputImagePath,
      version,
    });

    if (inputImagePath && scene.chainFromPreviousScene) {
      generation.chainedFramePath = inputImagePath;
    }

    scene.generations.push(generation);
    project.currentStep = 'generate';
    await updateProject(project);

    return NextResponse.json({ generation });
  } catch (error) {
    const message = error instanceof Error ? error.message : '動画生成の開始に失敗しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
