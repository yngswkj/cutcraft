import { NextResponse } from 'next/server';
import { withProjectLock } from '@/lib/project-store';
import { startVideoGeneration, getChainedFramePath } from '@/lib/video-service';
import type { VideoGeneration } from '@/types/project';
import { isSafeId, isSafeFilename } from '@/lib/validation';

function parseImageInputPath(localPath: string, projectId: string): string | null {
  const prefix = `/api/files/${projectId}/images/`;
  if (!localPath.startsWith(prefix)) return null;
  const filename = localPath.slice(prefix.length);
  if (!isSafeFilename(filename)) return null;
  return `images/${filename}`;
}

export async function POST(request: Request) {
  let body: { projectId: string; sceneId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 });
  }
  const { projectId, sceneId } = body;

  if (!projectId || !isSafeId(projectId) || !sceneId || !isSafeId(sceneId)) {
    return NextResponse.json({ error: '不正なパラメータです' }, { status: 400 });
  }

  try {
    const { result: generation } = await withProjectLock<VideoGeneration>(projectId, async (project) => {
      const scene = project.scenes.find((s) => s.id === sceneId);
      if (!scene) {
        throw new Error('シーンが見つかりません');
      }

      const prompt = scene.videoPrompt || scene.description;
      if (!prompt) {
        throw new Error('プロンプトが空です');
      }

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

      return { project, result: generation };
    });

    return NextResponse.json({ generation });
  } catch (error) {
    const message = error instanceof Error ? error.message : '動画生成の開始に失敗しました';
    if (message === 'プロジェクトが見つかりません' || message === 'シーンが見つかりません') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === 'プロンプトが空です') {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
