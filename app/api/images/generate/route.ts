import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { generateImage } from '@/lib/openai';
import { getProject, updateProject } from '@/lib/project-store';
import { ensureProjectDir, saveFile, getProjectDir } from '@/lib/file-storage';
import type { SceneImage } from '@/types/project';

export async function POST(req: NextRequest) {
  try {
    const { projectId, sceneId, prompt } = await req.json();

    if (!projectId || !sceneId || !prompt) {
      return NextResponse.json(
        { error: '必須パラメータが不足しています' },
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

    // DALL-E 3で画像生成
    const result = await generateImage(prompt);

    // Base64をBufferに変換
    const imageBuffer = Buffer.from(result.b64_json, 'base64');

    // ファイル保存
    await ensureProjectDir(projectId);
    const imageId = uuidv4();
    const fileName = `${sceneId}_${imageId}.png`;
    const imagePath = path.join(getProjectDir(projectId), 'images', fileName);
    await saveFile(imagePath, imageBuffer);

    // SceneImageオブジェクト作成
    const sceneImage: SceneImage = {
      id: imageId,
      sceneId,
      prompt: result.revised_prompt || prompt,
      localPath: `/api/files/${projectId}/images/${fileName}`,
      width: 1792,
      height: 1024,
      createdAt: new Date().toISOString(),
    };

    // プロジェクトに画像情報を追加
    scene.images.push(sceneImage);
    if (!scene.selectedImageId) {
      scene.selectedImageId = imageId;
    }

    await updateProject(project);

    return NextResponse.json({ image: sceneImage });
  } catch (error) {
    console.error('Image generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '画像生成に失敗しました' },
      { status: 500 },
    );
  }
}
