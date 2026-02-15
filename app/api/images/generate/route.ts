import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import sharp from 'sharp';
import { generateImage } from '@/lib/openai';
import { resolveImageModelByApi } from '@/lib/scene-models';
import { withProjectLock } from '@/lib/project-store';
import { ensureProjectDir, saveFile, getProjectDir } from '@/lib/file-storage';
import type { CharacterProfile, Project, Scene, SceneImage } from '@/types/project';
import { isSafeId } from '@/lib/validation';
import { resolveImageExtension } from '@/lib/image-utils';

function nonEmpty(value: string): string {
  return value.trim();
}

function appendCharacterProfileLine(lines: string[], character: CharacterProfile, index: number): void {
  lines.push(`${index + 1}. ${character.name || `Character ${index + 1}`}`);
  if (nonEmpty(character.role)) {
    lines.push(`   - Role: ${character.role}`);
  }
  if (nonEmpty(character.ethnicityNationality)) {
    lines.push(`   - Ethnicity/Nationality: ${character.ethnicityNationality}`);
  }
  if (nonEmpty(character.ageAppearance)) {
    lines.push(`   - Age appearance: ${character.ageAppearance}`);
  }
  if (nonEmpty(character.genderPresentation)) {
    lines.push(`   - Gender presentation: ${character.genderPresentation}`);
  }
  if (nonEmpty(character.appearanceTraits)) {
    lines.push(`   - Appearance traits: ${character.appearanceTraits}`);
  }
  if (nonEmpty(character.wardrobe)) {
    lines.push(`   - Wardrobe baseline: ${character.wardrobe}`);
  }
  if (nonEmpty(character.mustKeep)) {
    lines.push(`   - Must keep: ${character.mustKeep}`);
  }
}

function buildConsistentImagePrompt(
  project: Project,
  scene: Scene,
  scenePrompt: string,
): string {
  const guide = project.imageStyleGuide;
  const characterMap = new Map(project.characterBible.map((character) => [character.id, character]));
  const cast = scene.castCharacterIds
    .map((id) => characterMap.get(id))
    .filter((character): character is CharacterProfile => Boolean(character));
  const sections: string[] = [
    'You are generating a storyboard reference image for one scene in a single project.',
    'Keep visual consistency with other scenes in the same project.',
    '',
    `Project theme: ${project.theme}`,
    `Scene title: ${scene.title}`,
    `Scene description: ${scene.description}`,
    `Scene style direction: ${scene.styleDirection}`,
    '',
    `Scene-specific request: ${scenePrompt}`,
    '',
    'Character continuity lock (must keep):',
  ];

  if (cast.length > 0) {
    sections.push(
      '- Keep each listed character as the same person across scenes.',
      '- Do not change ethnicity/nationality, age appearance, gender presentation, facial traits, or wardrobe baseline unless explicitly requested by the user.',
      '- If the scene request is ambiguous, prioritize the character bible constraints.',
      '',
      'Scene cast:',
    );
    cast.forEach((character, index) => appendCharacterProfileLine(sections, character, index));
  } else if (project.characterBible.length > 0) {
    sections.push(
      '- No explicit cast was selected for this scene.',
      '- If people are shown, infer from project context and avoid identity drift from previously established characters.',
    );
  } else {
    sections.push(
      '- Character bible is empty for this project. Keep human attributes consistent with scene context when possible.',
    );
  }

  sections.push(
    '',
    'Global style bible (must apply to this image):',
  );

  if (nonEmpty(guide.styleBible)) {
    sections.push(`- Visual style: ${guide.styleBible}`);
  }
  if (nonEmpty(guide.colorPalette)) {
    sections.push(`- Color palette: ${guide.colorPalette}`);
  }
  if (nonEmpty(guide.lightingMood)) {
    sections.push(`- Lighting and mood: ${guide.lightingMood}`);
  }
  if (nonEmpty(guide.cameraLanguage)) {
    sections.push(`- Camera language / composition: ${guide.cameraLanguage}`);
  }
  if (nonEmpty(guide.negativePrompt)) {
    sections.push(`- Avoid: ${guide.negativePrompt}`);
  }

  sections.push(
    '',
    'Consistency constraints:',
    '- Keep color grading and cinematic language aligned with the project-wide style.',
    '- Do not change era, rendering medium, or tone unless explicitly instructed in scene-specific request.',
    '- Output a single high-quality horizontal image suitable for 16:9 video previsualization.',
  );

  return sections.join('\n');
}

export async function POST(req: NextRequest) {
  let body: { projectId: string; sceneId: string; prompt: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 });
  }

  const { projectId, sceneId, prompt } = body;

  if (!projectId || !sceneId || !prompt) {
    return NextResponse.json(
      { error: '必須パラメータが不足しています' },
      { status: 400 },
    );
  }
  if (!isSafeId(projectId) || !isSafeId(sceneId)) {
    return NextResponse.json(
      { error: '不正なパラメータです' },
      { status: 400 },
    );
  }

  try {
    const { result: sceneImage } = await withProjectLock<SceneImage>(projectId, async (project) => {
      const scene = project.scenes.find((s) => s.id === sceneId);
      if (!scene) {
        throw new Error('シーンが見つかりません');
      }

      // 設定された画像モデルで画像生成
      const consistentPrompt = buildConsistentImagePrompt(project, scene, prompt);
      const imageModel = resolveImageModelByApi(scene.imageApi);
      const result = await generateImage(consistentPrompt, { modelOverride: imageModel });

      // Base64をBufferに変換
      const imageBuffer = Buffer.from(result.b64_json, 'base64');
      const metadata = await sharp(imageBuffer).metadata();
      const width = typeof metadata.width === 'number' ? metadata.width : 1536;
      const height = typeof metadata.height === 'number' ? metadata.height : 1024;

      // ファイル保存
      await ensureProjectDir(projectId);
      const imageId = uuidv4();
      const extension = resolveImageExtension(imageBuffer, result.mimeType);
      const fileName = `${sceneId}_${imageId}${extension}`;
      const imagePath = path.join(getProjectDir(projectId), 'images', fileName);
      await saveFile(imagePath, imageBuffer);

      // SceneImageオブジェクト作成
      const sceneImage: SceneImage = {
        id: imageId,
        sceneId,
        prompt: result.revised_prompt || consistentPrompt,
        localPath: `/api/files/${projectId}/images/${fileName}`,
        width,
        height,
        createdAt: new Date().toISOString(),
      };

      // プロジェクトに画像情報を追加
      scene.images.push(sceneImage);
      if (!scene.selectedImageId) {
        scene.selectedImageId = imageId;
      }

      return { project, result: sceneImage };
    });

    return NextResponse.json({ image: sceneImage });
  } catch (error) {
    console.error('Image generation error:', error);
    const message = error instanceof Error ? error.message : '画像生成に失敗しました';
    if (message === 'プロジェクトが見つかりません' || message === 'シーンが見つかりません') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
