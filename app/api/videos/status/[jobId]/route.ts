import { NextResponse } from 'next/server';
import { getProject, updateProject } from '@/lib/project-store';
import { checkVideoStatus, downloadVideo } from '@/lib/video-service';

export async function GET(
  request: Request,
  { params }: { params: { jobId: string } }
) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');
  const sceneId = url.searchParams.get('sceneId');

  if (!projectId || !sceneId) {
    return NextResponse.json({ error: 'projectIdとsceneIdが必要です' }, { status: 400 });
  }

  const project = await getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'プロジェクトが見つかりません' }, { status: 404 });
  }

  const scene = project.scenes.find(s => s.id === sceneId);
  if (!scene) {
    return NextResponse.json({ error: 'シーンが見つかりません' }, { status: 404 });
  }

  const genIndex = scene.generations.findIndex(g => g.id === params.jobId);
  if (genIndex === -1) {
    return NextResponse.json({ error: '生成ジョブが見つかりません' }, { status: 404 });
  }

  try {
    const updated = await checkVideoStatus(scene.generations[genIndex]);

    // 完了時に動画をダウンロード
    if (updated.status === 'completed' && !updated.localPath) {
      try {
        const localPath = await downloadVideo(updated, projectId);
        updated.localPath = localPath;
      } catch {
        // ダウンロード失敗は致命的ではない
      }
    }

    scene.generations[genIndex] = updated;
    await updateProject(project);

    return NextResponse.json({ generation: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ステータス確認に失敗しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
