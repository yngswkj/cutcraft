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
  Link2,
  Zap,
} from 'lucide-react';
import type { Project, Scene, VideoGeneration } from '@/types/project';
import {
  getSceneVideoChoice,
  getSceneVideoLabel,
  getSceneVideoSelection,
  quantizeVeo31FastDuration,
  type SceneVideoChoice,
} from '@/lib/scene-models';
import { formatCost, estimateSceneCost } from '@/lib/cost-calculator';
import { ProjectStepNav } from '../_components/project-step-nav';
import { ProjectStepMobileNav } from '../_components/project-step-mobile-nav';

export default function GeneratePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [soraModelForCost, setSoraModelForCost] = useState('sora-2');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingScene, setGeneratingScene] = useState<string | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [savingVideoApiScenes, setSavingVideoApiScenes] = useState<Set<string>>(new Set());
  const pollingRef = useRef<Record<string, NodeJS.Timeout>>({});

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) {
      setProject(null);
      setError('プロジェクトを読み込めませんでした');
      setLoading(false);
      return;
    }

    const data = await res.json();
    setProject(data);
    setError(null);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchProject();
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const model = data?.effective?.models?.soraModel;
        if (typeof model === 'string' && model.trim()) {
          setSoraModelForCost(model.trim());
        }
      })
      .catch(() => {
        // 設定取得失敗時はデフォルト単価を使用
      });

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

  const startBulkGeneration = async () => {
    if (!project) return;
    setBulkGenerating(true);

    for (const scene of project.scenes) {
      if (scene.approvedGenerationId) continue;
      if (scene.generations.some(g => g.status === 'processing')) continue;
      if (scene.generations.some(g => g.status === 'completed' && !g.localPath)) continue;

      try {
        const res = await fetch('/api/videos/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, sceneId: scene.id }),
        });
        if (res.ok) {
          const data = await res.json();
          startPolling(scene.id, data.generation);
        }
      } catch {
        // 個別エラーはスキップして次へ
      }
    }
    await fetchProject();
    setBulkGenerating(false);
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
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const message = body?.error || `ステータス確認に失敗しました (${res.status})`;
          clearInterval(pollingRef.current[generation.id]);
          delete pollingRef.current[generation.id];
          setError(message);
          await fetchProject();
          return;
        }

        const data = await res.json();
        const isReady =
          data.generation.status === 'completed' && Boolean(data.generation.localPath);
        const isFailed = data.generation.status === 'failed';

        if (isReady || isFailed) {
          clearInterval(pollingRef.current[generation.id]);
          delete pollingRef.current[generation.id];
          await fetchProject();
        }
      } catch (pollingError) {
        const message = pollingError instanceof Error
          ? pollingError.message
          : 'ステータス確認中に通信エラーが発生しました';
        clearInterval(pollingRef.current[generation.id]);
        delete pollingRef.current[generation.id];
        setError(message);
      }
    }, 5000);
  };

  const approveGeneration = async (scene: Scene, generationId: string) => {
    if (!project) return;
    const generation = scene.generations.find((g) => g.id === generationId);
    if (!generation || generation.status !== 'completed' || !generation.localPath) {
      alert('動画ファイルの保存完了後に承認してください');
      return;
    }

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

  const toggleChain = async (sceneId: string) => {
    if (!project) return;
    const scenes = project.scenes.map(s =>
      s.id === sceneId ? { ...s, chainFromPreviousScene: !s.chainFromPreviousScene } : s
    );
    const updated = { ...project, scenes };
    await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setProject(updated);
  };

  const updateSceneVideoChoice = async (sceneId: string, choice: SceneVideoChoice) => {
    if (!project) return;
    setSavingVideoApiScenes(prev => new Set(prev).add(sceneId));
    try {
      const nextSelection = getSceneVideoSelection(choice);
      const updated = {
        ...project,
        scenes: project.scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, ...nextSelection } : scene
        ),
      };

      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '動画APIの更新に失敗しました');
      }
      const nextProject = await res.json();
      setProject(nextProject);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : '動画APIの更新に失敗しました';
      setError(message);
    } finally {
      setSavingVideoApiScenes(prev => {
        const next = new Set(prev);
        next.delete(sceneId);
        return next;
      });
    }
  };

  const proceedToComplete = async () => {
    if (!project) return;
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...project, currentStep: 'complete' }),
    });
    if (res.ok) {
      window.location.href = `/projects/${projectId}/complete`;
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-16 text-sm text-red-500">
        {error || 'プロジェクトを読み込めませんでした'}
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

  const allScenesApproved = project.scenes.every((scene) => {
    if (!scene.approvedGenerationId) return false;
    const approved = scene.generations.find((g) => g.id === scene.approvedGenerationId);
    return Boolean(approved && approved.status === 'completed' && approved.localPath);
  });
  const hasUngeneratedScenes = project.scenes.some(
    (s) =>
      !s.approvedGenerationId &&
      !s.generations.some((g) => g.status === 'processing') &&
      !s.generations.some((g) => g.status === 'completed' && !g.localPath)
  );

  return (
    <div>
      <a
        href={`/projects/${projectId}`}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 mb-6 transition"
      >
        <ArrowLeft size={16} />
        プロジェクトに戻る
      </a>

      <ProjectStepMobileNav project={project} projectId={projectId} className="mb-4" />

      <div className="min-[1000px]:grid min-[1000px]:grid-cols-[220px_minmax(0,1fr)] min-[1000px]:gap-6 items-start">
        <aside className="hidden min-[1000px]:block min-[1000px]:sticky min-[1000px]:top-20">
          <ProjectStepNav project={project} projectId={projectId} />
        </aside>

        <div className="min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">動画生成</h1>
        {hasUngeneratedScenes && (
          <button
            onClick={startBulkGeneration}
            disabled={bulkGenerating}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary-600 text-white px-5 py-2.5 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
          >
            <Zap size={18} />
            {bulkGenerating ? '一括生成中...' : '未生成シーンを一括生成'}
          </button>
        )}
      </div>

      {project.scenes.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Video size={48} className="mx-auto mb-4 text-gray-300" />
          <p>シーンがありません。設計図を先に作成してください。</p>
        </div>
      ) : (
        <div className="space-y-4 mb-6">
          {project.scenes.map((scene, index) => {
            const prevScene = index > 0 ? project.scenes[index - 1] : null;
            const canChain = prevScene && prevScene.approvedGenerationId;
            const isProcessing = scene.generations.some((g) => g.status === 'processing');
            const isSavingVideoApi = savingVideoApiScenes.has(scene.id);
            const videoChoice = getSceneVideoChoice(scene);
            const resolvedVeoDuration = scene.videoApi === 'veo'
              ? quantizeVeo31FastDuration(scene.durationSec)
              : null;
            const showsResolvedVeoDuration = resolvedVeoDuration !== null
              && resolvedVeoDuration !== scene.durationSec;

            return (
              <div key={scene.id} className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
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
                        {getSceneVideoLabel(scene)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                      {scene.videoPrompt || scene.description}
                    </p>
                    {showsResolvedVeoDuration && (
                      <p className="text-xs text-purple-600 mt-1">
                        実行秒数: {resolvedVeoDuration}秒（Veo 3.1 Fast）
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0 sm:ml-4">
                    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => updateSceneVideoChoice(scene.id, 'sora')}
                        disabled={isSavingVideoApi || isProcessing}
                        className={`px-2 py-1 text-xs rounded-md transition ${
                          videoChoice === 'sora'
                            ? 'bg-primary-600 text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                        } disabled:opacity-50`}
                      >
                        Sora
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSceneVideoChoice(scene.id, 'veo31fast')}
                        disabled={isSavingVideoApi || isProcessing}
                        className={`px-2 py-1 text-xs rounded-md transition ${
                          videoChoice === 'veo31fast'
                            ? 'bg-primary-600 text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                        } disabled:opacity-50`}
                      >
                        Veo 3.1 Fast
                      </button>
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatCost(estimateSceneCost(scene, { soraModel: soraModelForCost }))}
                    </span>
                    <button
                      onClick={() => startGeneration(scene)}
                      disabled={
                        generatingScene === scene.id ||
                        isProcessing ||
                        scene.generations.some((g) => g.status === 'completed' && !g.localPath)
                      }
                      className="inline-flex items-center gap-1.5 bg-primary-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
                    >
                      {isProcessing ? (
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

                {/* チェーン設定 */}
                {index > 0 && (
                  <div className="mb-3">
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scene.chainFromPreviousScene}
                        onChange={() => toggleChain(scene.id)}
                        disabled={!canChain}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 disabled:opacity-40"
                      />
                      <Link2 size={14} className={scene.chainFromPreviousScene ? 'text-primary-600' : 'text-gray-400'} />
                      <span className={`break-words ${scene.chainFromPreviousScene ? 'text-primary-700' : 'text-gray-500'}`}>
                        前のシーンの最終フレームを入力として使用（チェーン）
                      </span>
                      {!canChain && (
                        <span className="text-xs text-gray-400">
                          ※ 前のシーンの動画を承認してください
                        </span>
                      )}
                    </label>
                  </div>
                )}

                {/* 生成履歴 + 動画プレビュー */}
                {scene.generations.length > 0 && (
                  <div className="border-t border-gray-100 pt-3 mt-3">
                    <h4 className="text-xs text-gray-500 mb-2">生成履歴</h4>
                    <div className="space-y-3">
                      {scene.generations.map(gen => (
                        <div key={gen.id}>
                          <div
                            className={`p-2 rounded ${
                              scene.approvedGenerationId === gen.id
                                ? 'bg-green-50 border border-green-200'
                                : 'bg-gray-50'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              {statusIcon(gen.status)}
                              <span className="text-sm">v{gen.version}</span>
                              <span className="text-xs text-gray-400">
                                {gen.status === 'completed' && !gen.localPath ? '保存中' : statusLabel(gen.status)}
                              </span>
                              <span className="text-xs text-gray-400">{gen.resolution}</span>
                              <span className="text-xs text-gray-400">{gen.durationSec}秒</span>
                              <span className="text-xs text-gray-400">{formatCost(gen.estimatedCost)}</span>
                              {gen.chainedFramePath && (
                                <span className="text-xs text-primary-500 inline-flex items-center gap-1">
                                  <Link2 size={12} />
                                  チェーン
                                </span>
                              )}
                              {gen.status === 'completed' && (
                                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                                  {gen.localPath && (
                                    <span className="text-xs text-green-600">保存済み</span>
                                  )}
                                  {scene.approvedGenerationId !== gen.id && gen.localPath && (
                                    <button
                                      onClick={() => approveGeneration(scene, gen.id)}
                                      className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition"
                                    >
                                      承認
                                    </button>
                                  )}
                                  {scene.approvedGenerationId === gen.id && (
                                    <span className="text-xs text-green-700 font-medium">承認済み</span>
                                  )}
                                </div>
                              )}
                            </div>
                            {gen.status === 'failed' && (
                              <p className="mt-2 text-xs text-red-600 whitespace-pre-wrap break-all">
                                原因: {gen.errorMessage || '詳細情報を取得できませんでした。再生成して再度ご確認ください。'}
                              </p>
                            )}
                          </div>
                          {/* 動画プレビュー */}
                          {gen.status === 'completed' && gen.localPath && (
                            <div className="mt-2 sm:ml-6">
                              <video
                                src={gen.localPath}
                                controls
                                className="w-full max-w-lg rounded-lg border border-gray-200"
                              >
                                <track kind="captions" />
                              </video>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center">
        <a
          href={`/projects/${projectId}/script`}
          className="w-full sm:w-auto text-center sm:text-left text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition"
        >
          ← 台本に戻る
        </a>
        <button
          onClick={proceedToComplete}
          disabled={!allScenesApproved}
          className="w-full sm:w-auto bg-primary-600 text-white px-6 py-2.5 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title={!allScenesApproved ? '全シーンの動画を承認してください' : ''}
        >
          完了へ →
        </button>
      </div>
        </div>
      </div>
    </div>
  );
}
