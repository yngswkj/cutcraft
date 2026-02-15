import { NextResponse } from 'next/server';
import { withProjectLock } from '@/lib/project-store';
import { checkVideoStatus, downloadVideo } from '@/lib/video-service';
import type { VideoGeneration } from '@/types/project';
import { isSafeId } from '@/lib/validation';

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
  if (!isSafeId(projectId) || !isSafeId(sceneId) || !isSafeId(params.jobId)) {
    return NextResponse.json({ error: '不正なパラメータです' }, { status: 400 });
  }

  try {
    const { result: generation } = await withProjectLock<VideoGeneration>(projectId, async (project) => {
      const scene = project.scenes.find(s => s.id === sceneId);
      if (!scene) {
        throw new Error('シーンが見つかりません');
      }

      const genIndex = scene.generations.findIndex(g => g.id === params.jobId);
      if (genIndex === -1) {
        throw new Error('生成ジョブが見つかりません');
      }

      let updated = await checkVideoStatus(scene.generations[genIndex]);

      // 完了時に動画をダウンロード
      if (updated.status === 'completed' && !updated.localPath) {
        try {
          const localPath = await downloadVideo(updated, projectId);
          updated = { ...updated, localPath, errorMessage: null };
        } catch (error) {
          console.error('Video download error:', error);
          const detail = error instanceof Error ? error.message : '動画ファイルの保存に失敗しました';
          updated = {
            ...updated,
            status: 'failed',
            completedAt: updated.completedAt ?? new Date().toISOString(),
            errorMessage: detail,
          };
        }
      }

      scene.generations[genIndex] = updated;

      return { project, result: updated };
    });

    return NextResponse.json({ generation });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ステータス確認に失敗しました';
    if (message === 'プロジェクトが見つかりません' || message === 'シーンが見つかりません' || message === '生成ジョブが見つかりません') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
