'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Wand2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Edit3,
  Save,
  X,
  DollarSign,
} from 'lucide-react';
import type { Project, Scene, VideoApiPreference } from '@/types/project';
import { estimateProjectCost, formatCost, estimateSceneCost } from '@/lib/cost-calculator';
import { ProjectStepNav } from '../_components/project-step-nav';
import { ProjectStepMobileNav } from '../_components/project-step-mobile-nav';

export default function BlueprintPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editingScene, setEditingScene] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Scene>>({});

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then(res => res.json())
      .then(data => {
        setProject(data);
        setLoading(false);
      });
  }, [projectId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/blueprint/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        const data = await res.json();
        setProject(prev => prev ? { ...prev, scenes: data.scenes } : null);
      } else {
        const err = await res.json();
        alert(err.error || '生成に失敗しました');
      }
    } catch {
      alert('生成に失敗しました');
    }
    setGenerating(false);
  };

  const saveProject = async (updated: Project) => {
    await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setProject(updated);
  };

  const moveScene = (index: number, direction: -1 | 1) => {
    if (!project) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= project.scenes.length) return;
    const scenes = [...project.scenes];
    [scenes[index], scenes[newIndex]] = [scenes[newIndex], scenes[index]];
    scenes.forEach((s, i) => (s.order = i));
    saveProject({ ...project, scenes });
  };

  const deleteScene = (sceneId: string) => {
    if (!project || !confirm('このシーンを削除しますか？')) return;
    const scenes = project.scenes.filter(s => s.id !== sceneId);
    scenes.forEach((s, i) => (s.order = i));
    saveProject({ ...project, scenes });
  };

  const addScene = () => {
    if (!project) return;
    const newScene: Scene = {
      id: crypto.randomUUID(),
      order: project.scenes.length,
      title: '新しいシーン',
      description: '',
      durationSec: 8,
      styleDirection: '',
      videoApi: 'sora',
      castCharacterIds: [],
      images: [],
      selectedImageId: null,
      useAsVideoInput: false,
      videoPrompt: '',
      promptMetadata: { cameraWork: '', movement: '', lighting: '', style: '' },
      generations: [],
      approvedGenerationId: null,
      chainFromPreviousScene: false,
    };
    saveProject({ ...project, scenes: [...project.scenes, newScene] });
  };

  const startEdit = (scene: Scene) => {
    setEditingScene(scene.id);
    setEditForm({
      title: scene.title,
      description: scene.description,
      durationSec: scene.durationSec,
      styleDirection: scene.styleDirection,
      videoApi: scene.videoApi,
    });
  };

  const saveEdit = () => {
    if (!project || !editingScene) return;
    const scenes = project.scenes.map(s =>
      s.id === editingScene ? { ...s, ...editForm } : s
    );
    saveProject({ ...project, scenes });
    setEditingScene(null);
  };

  const proceedToNext = async () => {
    if (!project || project.scenes.length === 0) return;
    await saveProject({ ...project, currentStep: 'imageboard' });
    window.location.href = `/projects/${projectId}`;
  };

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const totalSec = project.scenes.reduce((sum, s) => sum + s.durationSec, 0);
  const cost = estimateProjectCost(project.scenes);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">設計図</h1>
          <p className="text-gray-500 text-sm mt-1">{project.theme}</p>
        </div>
        <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row sm:flex-nowrap sm:items-center sm:gap-3 sm:shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-xs text-gray-500 whitespace-nowrap">動画API</label>
            <select
              value={project.videoApiPreference || 'auto'}
              onChange={e => {
                const pref = e.target.value as VideoApiPreference;
                saveProject({ ...project, videoApiPreference: pref });
              }}
              className="w-full sm:w-auto border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="auto">おまかせ（AI判断）</option>
              <option value="sora">Sora のみ</option>
              <option value="veo">Veo のみ</option>
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 bg-primary-600 text-white px-5 py-2.5 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
          >
            <Wand2 size={18} />
            {generating ? 'AI生成中...' : project.scenes.length > 0 ? '再生成' : 'AIで設計図を生成'}
          </button>
        </div>
      </div>

      {project.scenes.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span>
            <strong>{project.scenes.length}</strong> シーン
          </span>
          <span>
            合計 <strong>{totalSec}</strong>秒
            {totalSec !== 120 && (
              <span className={`ml-1 ${Math.abs(totalSec - 120) > 10 ? 'text-red-500' : 'text-yellow-600'}`}>
                (目標: 120秒)
              </span>
            )}
          </span>
          <span className="flex items-center gap-1 text-gray-500">
            <DollarSign size={14} />
            推定コスト: <strong>{formatCost(cost.total)}</strong>
            <span className="text-xs break-words">(動画: {formatCost(cost.videoCost)}, 画像: {formatCost(cost.imageCost)})</span>
          </span>
        </div>
      )}

      {project.scenes.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Wand2 size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-lg">設計図がまだありません</p>
          <p className="text-sm mt-1">「AIで設計図を生成」ボタンを押して設計図を作成しましょう</p>
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-6">
            {project.scenes.map((scene, index) => (
              <div
                key={scene.id}
                className="bg-white rounded-lg border border-gray-200 p-4"
              >
                {editingScene === scene.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editForm.title || ''}
                      onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="シーンタイトル"
                    />
                    <textarea
                      value={editForm.description || ''}
                      onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                      rows={3}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="シーンの説明"
                    />
                    <div className="flex flex-col gap-3 min-[430px]:flex-row min-[430px]:items-end">
                      <div>
                        <label className="text-xs text-gray-500">秒数</label>
                        <input
                          type="number"
                          value={editForm.durationSec || 8}
                          onChange={e => setEditForm(f => ({ ...f, durationSec: parseInt(e.target.value) || 8 }))}
                          min={4}
                          max={20}
                          className="w-full min-[430px]:w-20 border border-gray-300 rounded px-2 py-1 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">API</label>
                        <select
                          value={editForm.videoApi || 'sora'}
                          onChange={e => setEditForm(f => ({ ...f, videoApi: e.target.value as 'sora' | 'veo' }))}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm mt-1"
                        >
                          <option value="sora">Sora</option>
                          <option value="veo">Veo</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-gray-500">スタイル</label>
                        <input
                          type="text"
                          value={editForm.styleDirection || ''}
                          onChange={e => setEditForm(f => ({ ...f, styleDirection: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm mt-1"
                          placeholder="cinematic, warm tones..."
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        className="flex items-center gap-1 text-sm bg-primary-600 text-white px-3 py-1.5 rounded hover:bg-primary-700 transition"
                      >
                        <Save size={14} /> 保存
                      </button>
                      <button
                        onClick={() => setEditingScene(null)}
                        className="flex items-center gap-1 text-sm text-gray-500 px-3 py-1.5 rounded hover:bg-gray-100 transition"
                      >
                        <X size={14} /> キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 min-[430px]:flex-row min-[430px]:items-start">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0 text-gray-400 text-sm font-mono w-6 text-right pt-0.5">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium break-words">{scene.title}</h3>
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
                          <span className="text-xs text-gray-400">
                            {formatCost(estimateSceneCost(scene))}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1 break-words">{scene.description}</p>
                        {scene.styleDirection && (
                          <p className="text-xs text-gray-400 mt-1 italic break-words">{scene.styleDirection}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 self-end min-[430px]:self-start flex-shrink-0">
                      <button
                        onClick={() => moveScene(index, -1)}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        title="上に移動"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        onClick={() => moveScene(index, 1)}
                        disabled={index === project.scenes.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        title="下に移動"
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        onClick={() => startEdit(scene)}
                        className="p-1 text-gray-400 hover:text-primary-600"
                        title="編集"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => deleteScene(scene.id)}
                        className="p-1 text-gray-400 hover:text-red-500"
                        title="削除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={addScene}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-sm text-gray-600 px-4 py-2 border border-dashed border-gray-300 rounded-lg hover:border-primary-400 hover:text-primary-600 transition"
            >
              <Plus size={16} />
              シーンを追加
            </button>
            <button
              onClick={proceedToNext}
              className="w-full sm:w-auto bg-primary-600 text-white px-6 py-2.5 rounded-lg hover:bg-primary-700 transition"
            >
              次のステップへ →
            </button>
          </div>
        </>
      )}
        </div>
      </div>
    </div>
  );
}

