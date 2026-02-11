'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import {
  ArrowLeft,
  Wand2,
  Save,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Video,
  Zap,
} from 'lucide-react';
import type { Project, Scene } from '@/types/project';

export default function ScriptPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const [generatingScenes, setGeneratingScenes] = useState<Set<string>>(new Set());
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [editingScenes, setEditingScenes] = useState<Record<string, Scene>>({});

  useEffect(() => {
    let cancelled = false;

    const loadProject = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          throw new Error('プロジェクトの取得に失敗しました');
        }

        const data = await res.json();
        if (cancelled) return;

        setProject(data);
        setError(null);
        // デフォルトで全シーン展開
        setExpandedScenes(new Set(data.scenes.map((s: Scene) => s.id)));
      } catch {
        if (cancelled) return;
        setProject(null);
        setError('プロジェクトを読み込めませんでした');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProject();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const toggleScene = (sceneId: string) => {
    setExpandedScenes(prev => {
      const next = new Set(prev);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
  };

  const generateScript = async (sceneId: string) => {
    setGeneratingScenes(prev => new Set(prev).add(sceneId));
    try {
      const res = await fetch('/api/scripts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sceneId }),
      });

      if (res.ok) {
        const data = await res.json();
        setProject(prev => {
          if (!prev) return null;
          const scenes = prev.scenes.map(s => {
            if (s.id === sceneId) {
              return {
                ...s,
                videoPrompt: data.videoPrompt,
                promptMetadata: data.metadata,
              };
            }
            return s;
          });
          return { ...prev, scenes };
        });
      } else {
        const err = await res.json();
        alert(err.error || 'スクリプト生成に失敗しました');
      }
    } catch {
      alert('スクリプト生成に失敗しました');
    } finally {
      setGeneratingScenes(prev => {
        const next = new Set(prev);
        next.delete(sceneId);
        return next;
      });
    }
  };

  const generateAllScripts = async () => {
    if (!project) return;
    setBulkGenerating(true);
    for (const scene of project.scenes) {
      if (scene.videoPrompt.trim().length > 0) continue;
      setGeneratingScenes(prev => new Set(prev).add(scene.id));
      try {
        const res = await fetch('/api/scripts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, sceneId: scene.id }),
        });
        if (res.ok) {
          const data = await res.json();
          setProject(prev => {
            if (!prev) return null;
            return {
              ...prev,
              scenes: prev.scenes.map(s =>
                s.id === scene.id
                  ? { ...s, videoPrompt: data.videoPrompt, promptMetadata: data.metadata }
                  : s
              ),
            };
          });
        }
      } catch {
        // 個別エラーはスキップ
      } finally {
        setGeneratingScenes(prev => {
          const next = new Set(prev);
          next.delete(scene.id);
          return next;
        });
      }
    }
    setBulkGenerating(false);
  };

  const startEdit = (scene: Scene) => {
    setEditingScenes(prev => ({ ...prev, [scene.id]: { ...scene } }));
  };

  const updateEdit = (sceneId: string, field: string, value: string) => {
    setEditingScenes(prev => {
      const scene = prev[sceneId];
      if (!scene) return prev;

      if (field === 'videoPrompt') {
        return { ...prev, [sceneId]: { ...scene, videoPrompt: value } };
      } else {
        return {
          ...prev,
          [sceneId]: {
            ...scene,
            promptMetadata: { ...scene.promptMetadata, [field]: value },
          },
        };
      }
    });
  };

  const saveEdit = async (sceneId: string) => {
    const editedScene = editingScenes[sceneId];
    if (!editedScene || !project) return;

    const updated = {
      ...project,
      scenes: project.scenes.map(s =>
        s.id === sceneId
          ? {
              ...s,
              videoPrompt: editedScene.videoPrompt,
              promptMetadata: editedScene.promptMetadata,
            }
          : s
      ),
    };

    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      setProject(updated);
      setEditingScenes(prev => {
        const next = { ...prev };
        delete next[sceneId];
        return next;
      });
    }
  };

  const cancelEdit = (sceneId: string) => {
    setEditingScenes(prev => {
      const next = { ...prev };
      delete next[sceneId];
      return next;
    });
  };

  const proceedToNext = async () => {
    if (!project) return;
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...project, currentStep: 'generate' }),
    });
    if (res.ok) {
      window.location.href = `/projects/${projectId}`;
    }
  };

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

  const allScenesHavePrompts = project.scenes.every(s => s.videoPrompt.trim().length > 0);

  return (
    <div>
      <a
        href={`/projects/${projectId}`}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 mb-6 transition"
      >
        <ArrowLeft size={16} />
        プロジェクトに戻る
      </a>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">台本</h1>
          <p className="text-gray-500 text-sm mt-1">
            各シーンの動画生成プロンプトを作成しましょう
          </p>
        </div>
        {project.scenes.some(s => !s.videoPrompt.trim()) && (
          <button
            onClick={generateAllScripts}
            disabled={bulkGenerating}
            className="flex items-center gap-2 bg-primary-600 text-white px-5 py-2.5 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
          >
            <Zap size={18} />
            {bulkGenerating ? '一括生成中...' : '未作成の台本を一括生成'}
          </button>
        )}
      </div>

      <div className="space-y-4 mb-6">
        {project.scenes.map((scene, index) => {
          const isExpanded = expandedScenes.has(scene.id);
          const isGenerating = generatingScenes.has(scene.id);
          const isEditing = !!editingScenes[scene.id];
          const editScene = editingScenes[scene.id] || scene;
          const selectedImage = scene.images.find(img => img.id === scene.selectedImageId);

          return (
            <div
              key={scene.id}
              className="bg-white rounded-lg border border-gray-200"
            >
              <button
                onClick={() => toggleScene(scene.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition"
              >
                <div className="flex-shrink-0 text-gray-400 text-sm font-mono w-6 text-right">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{scene.title}</h3>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      scene.videoApi === 'sora'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-purple-50 text-purple-600'
                    }`}>
                      {scene.videoApi === 'sora' ? 'Sora' : 'Veo'}
                    </span>
                    {scene.videoPrompt && (
                      <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Video size={12} />
                        台本あり
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1 truncate">{scene.description}</p>
                </div>
                <div className="flex-shrink-0 text-gray-400">
                  {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-200 p-4 space-y-4">
                  {selectedImage && (
                    <div>
                      <label className="block text-sm font-medium mb-2">参考画像</label>
                      <div className="relative inline-block">
                        <Image
                          src={selectedImage.localPath}
                          alt={selectedImage.prompt}
                          width={256}
                          height={144}
                          className="w-64 rounded-lg border border-gray-200"
                        />
                        {scene.useAsVideoInput && (
                          <div className="absolute top-2 left-2 bg-primary-500 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                            <ImageIcon size={12} />
                            入力画像として使用
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium">
                        動画生成プロンプト（英語）
                      </label>
                      {!isEditing && (
                        <button
                          onClick={() => generateScript(scene.id)}
                          disabled={isGenerating}
                          className="flex items-center gap-1 text-xs bg-primary-600 text-white px-3 py-1.5 rounded hover:bg-primary-700 transition disabled:opacity-50"
                        >
                          <Wand2 size={14} />
                          {isGenerating ? '生成中...' : 'AIで自動生成'}
                        </button>
                      )}
                    </div>
                    <textarea
                      value={editScene.videoPrompt}
                      onChange={e => {
                        if (!isEditing) startEdit(scene);
                        updateEdit(scene.id, 'videoPrompt', e.target.value);
                      }}
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                      placeholder="A cinematic shot of..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">カメラワーク</label>
                      <input
                        type="text"
                        value={editScene.promptMetadata.cameraWork}
                        onChange={e => {
                          if (!isEditing) startEdit(scene);
                          updateEdit(scene.id, 'cameraWork', e.target.value);
                        }}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="例: 固定カメラ、パン、ズーム"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">動き</label>
                      <input
                        type="text"
                        value={editScene.promptMetadata.movement}
                        onChange={e => {
                          if (!isEditing) startEdit(scene);
                          updateEdit(scene.id, 'movement', e.target.value);
                        }}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="例: ゆっくり歩く、走る"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">ライティング</label>
                      <input
                        type="text"
                        value={editScene.promptMetadata.lighting}
                        onChange={e => {
                          if (!isEditing) startEdit(scene);
                          updateEdit(scene.id, 'lighting', e.target.value);
                        }}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="例: 自然光、夕暮れ"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">スタイル・雰囲気</label>
                      <input
                        type="text"
                        value={editScene.promptMetadata.style}
                        onChange={e => {
                          if (!isEditing) startEdit(scene);
                          updateEdit(scene.id, 'style', e.target.value);
                        }}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="例: シネマティック、暖色"
                      />
                    </div>
                  </div>

                  {isEditing && (
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => saveEdit(scene.id)}
                        className="flex items-center gap-1 text-sm bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition"
                      >
                        <Save size={14} />
                        保存
                      </button>
                      <button
                        onClick={() => cancelEdit(scene.id)}
                        className="text-sm text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition"
                      >
                        キャンセル
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center">
        <a
          href={`/projects/${projectId}/imageboard`}
          className="text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition"
        >
          ← イメージボードに戻る
        </a>
        <button
          onClick={proceedToNext}
          disabled={!allScenesHavePrompts}
          className="bg-primary-600 text-white px-6 py-2.5 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title={!allScenesHavePrompts ? '全シーンの台本を作成してください' : ''}
        >
          次のステップへ →
        </button>
      </div>
    </div>
  );
}
