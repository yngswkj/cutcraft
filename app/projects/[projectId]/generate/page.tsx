'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Play,
  RefreshCw,
  Check,
  Loader2,
  AlertCircle,
  Video,
} from 'lucide-react';
import type { Project, Scene, VideoGeneration } from '@/types/project';
import { formatCost, estimateSceneCost } from '@/lib/cost-calculator';

export default function GeneratePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingScene, setGeneratingScene] = useState<string | null>(null);
  const pollingRef = useRef<Record<string, NodeJS.Timeout>>({});

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`);
    const data = await res.json();
    setProject(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchProject();
    const currentPolling = pollingRef.current;
    return () => {
      Object.values(currentPolling).forEach(clearInterval);
    };
  }, [fetchProject]);

  const startGeneration = async (scene: Scene) => {
    setGeneratingScene(scene.id);
    try {
      const res = await fetch('/api/videos/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sceneId: scene.id }),
      });
      if (res.ok) {
        const data = await res.json();
        startPolling(scene.id, data.generation);
        await fetchProject();
      } else {
        const err = await res.json();
        alert(err.error || '動画生成の開始に失敗しました');
      }
    } catch {
      alert('動画生成の開始に失敗しました');
    }
    setGeneratingScene(null);
  };

  const startPolling = (sceneId: string, generation: VideoGeneration) => {
    if (pollingRef.current[generation.id]) {
      clearInterval(pollingRef.current[generation.id]);
    }

    pollingRef.current[generation.id] = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/videos/status/${generation.id}?projectId=${projectId}&sceneId=${sceneId}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.generation.status === 'completed' || data.generation.status === 'failed') {
            clearInterval(pollingRef.current[generation.id]);
            delete pollingRef.current[generation.id];
            await fetchProject();
          }
        }
      } catch {
        // ポーリングエラーは無視
      }
    }, 5000);
  };

  const approveGeneration = async (scene: Scene, generationId: string) => {
    if (!project) return;
    const scenes = project.scenes.map(s =>
      s.id === scene.id ? { ...s, approvedGenerationId: generationId } : s
    );
    const updated = { ...project, scenes };
    await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setProject(updated);
  };

  // 処理中のジョブを再開始
  useEffect(() => {
    if (!project) return;
    for (const scene of project.scenes) {
      for (const gen of scene.generations) {
        if (gen.status === 'processing' && !pollingRef.current[gen.id]) {
          startPolling(scene.id, gen);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'processing':
      case 'queued':
        return <Loader2 size={16} className="animate-spin text-yellow-500" />;
      case 'completed':
        return <Check size={16} className="text-green-500" />;
      case 'failed':
        return <AlertCircle size={16} className="text-red-500" />;
      default:
        return null;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'queued':
        return 'キュー待ち';
      case 'processing':
        return '生成中';
      case 'completed':
        return '完了';
      case 'failed':
        return '失敗';
      default:
        return status;
    }
  };

  return (
    <div>
      <a
        href={`/projects/${projectId}`}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 mb-6 transition"
      >
        <ArrowLeft size={16} />
        プロジェクトに戻る
      </a>

      <h1 className="text-2xl font-bold mb-6">動画生成</h1>

      {project.scenes.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Video size={48} className="mx-auto mb-4 text-gray-300" />
          <p>シーンがありません。設計図を先に作成してください。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {project.scenes.map((scene, index) => (
            <div key={scene.id} className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400 font-mono">{index + 1}.</span>
                    <h3 className="font-medium">{scene.title}</h3>
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {scene.durationSec}秒
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      scene.videoApi === 'sora'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-purple-50 text-purple-600'
                    }`}>
                      {scene.videoApi === 'sora' ? 'Sora' : 'Veo'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {scene.videoPrompt || scene.description}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <span className="text-xs text-gray-400">{formatCost(estimateSceneCost(scene))}</span>
                  <button
                    onClick={() => startGeneration(scene)}
                    disabled={generatingScene === scene.id || scene.generations.some(g => g.status === 'processing')}
                    className="flex items-center gap-1.5 bg-primary-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
                  >
                    {scene.generations.some(g => g.status === 'processing') ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        生成中
                      </>
                    ) : (
                      <>
                        {scene.generations.length > 0 ? <RefreshCw size={14} /> : <Play size={14} />}
                        {scene.generations.length > 0 ? '再生成' : '生成'}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {scene.generations.length > 0 && (
                <div className="border-t border-gray-100 pt-3 mt-3">
                  <h4 className="text-xs text-gray-500 mb-2">生成履歴</h4>
                  <div className="space-y-2">
                    {scene.generations.map(gen => (
                      <div
                        key={gen.id}
                        className={`flex items-center gap-3 p-2 rounded ${
                          scene.approvedGenerationId === gen.id
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-gray-50'
                        }`}
                      >
                        {statusIcon(gen.status)}
                        <span className="text-sm">v{gen.version}</span>
                        <span className="text-xs text-gray-400">{statusLabel(gen.status)}</span>
                        <span className="text-xs text-gray-400">{gen.resolution}</span>
                        <span className="text-xs text-gray-400">{gen.durationSec}秒</span>
                        <span className="text-xs text-gray-400">{formatCost(gen.estimatedCost)}</span>
                        <div className="flex-1" />
                        {gen.status === 'completed' && (
                          <>
                            {gen.localPath && (
                              <span className="text-xs text-green-600">保存済み</span>
                            )}
                            {scene.approvedGenerationId !== gen.id && (
                              <button
                                onClick={() => approveGeneration(scene, gen.id)}
                                className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition"
                              >
                                承認
                              </button>
                            )}
                            {scene.approvedGenerationId === gen.id && (
                              <span className="text-xs text-green-700 font-medium">✓ 承認済み</span>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
