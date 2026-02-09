'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import {
  ArrowLeft,
  Sparkles,
  ImageIcon,
  Check,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { Project, Scene, SceneImage } from '@/types/project';

export default function ImageboardPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const [generatingScenes, setGeneratingScenes] = useState<Set<string>>(new Set());
  const [prompts, setPrompts] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then(res => res.json())
      .then(data => {
        setProject(data);
        setLoading(false);
        // デフォルトで全シーン展開
        setExpandedScenes(new Set(data.scenes.map((s: Scene) => s.id)));
        // 各シーンのプロンプト初期値設定
        const initialPrompts: Record<string, string> = {};
        data.scenes.forEach((s: Scene) => {
          initialPrompts[s.id] = s.description || '';
        });
        setPrompts(initialPrompts);
      });
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

  const generateImage = async (sceneId: string) => {
    const prompt = prompts[sceneId];
    if (!prompt?.trim()) {
      alert('プロンプトを入力してください');
      return;
    }

    setGeneratingScenes(prev => new Set(prev).add(sceneId));
    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sceneId, prompt }),
      });

      if (res.ok) {
        const data = await res.json();
        setProject(prev => {
          if (!prev) return null;
          const scenes = prev.scenes.map(s => {
            if (s.id === sceneId) {
              return {
                ...s,
                images: [...s.images, data.image],
                selectedImageId: s.selectedImageId || data.image.id,
              };
            }
            return s;
          });
          return { ...prev, scenes };
        });
      } else {
        const err = await res.json();
        alert(err.error || '画像生成に失敗しました');
      }
    } catch {
      alert('画像生成に失敗しました');
    } finally {
      setGeneratingScenes(prev => {
        const next = new Set(prev);
        next.delete(sceneId);
        return next;
      });
    }
  };

  const selectImage = async (sceneId: string, imageId: string) => {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...project,
        scenes: project?.scenes.map(s =>
          s.id === sceneId ? { ...s, selectedImageId: imageId } : s
        ),
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setProject(updated);
    }
  };

  const toggleUseAsInput = async (sceneId: string) => {
    if (!project) return;
    const scene = project.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    const updated = {
      ...project,
      scenes: project.scenes.map(s =>
        s.id === sceneId ? { ...s, useAsVideoInput: !s.useAsVideoInput } : s
      ),
    };

    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      setProject(updated);
    }
  };

  const deleteImage = async (sceneId: string, imageId: string) => {
    if (!project || !confirm('この画像を削除しますか？')) return;

    const scene = project.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    const images = scene.images.filter(img => img.id !== imageId);
    let selectedImageId = scene.selectedImageId;
    if (selectedImageId === imageId) {
      selectedImageId = images.length > 0 ? images[0].id : null;
    }

    const updated = {
      ...project,
      scenes: project.scenes.map(s =>
        s.id === sceneId ? { ...s, images, selectedImageId } : s
      ),
    };

    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      setProject(updated);
    }
  };

  const proceedToNext = async () => {
    if (!project) return;
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...project, currentStep: 'script' }),
    });
    if (res.ok) {
      window.location.href = `/projects/${projectId}`;
    }
  };

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const allScenesHaveImages = project.scenes.every(s => s.images.length > 0);

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
          <h1 className="text-2xl font-bold">イメージボード</h1>
          <p className="text-gray-500 text-sm mt-1">
            各シーンの参考画像を生成しましょう（DALL-E 3）
          </p>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        {project.scenes.map((scene, index) => {
          const isExpanded = expandedScenes.has(scene.id);
          const isGenerating = generatingScenes.has(scene.id);

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
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {scene.durationSec}秒
                    </span>
                    {scene.images.length > 0 && (
                      <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <ImageIcon size={12} />
                        {scene.images.length}枚
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
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      画像生成プロンプト
                    </label>
                    <textarea
                      value={prompts[scene.id] || ''}
                      onChange={e =>
                        setPrompts(prev => ({ ...prev, [scene.id]: e.target.value }))
                      }
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="シーンの雰囲気、色調、構図などを記述してください"
                    />
                    <button
                      onClick={() => generateImage(scene.id)}
                      disabled={isGenerating}
                      className="mt-2 flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 text-sm"
                    >
                      <Sparkles size={16} />
                      {isGenerating ? '生成中...' : '画像を生成'}
                    </button>
                  </div>

                  {scene.images.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        生成済み画像（クリックで選択）
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {scene.images.map((img: SceneImage) => {
                          const isSelected = scene.selectedImageId === img.id;
                          return (
                            <div
                              key={img.id}
                              className={`relative border-2 rounded-lg overflow-hidden cursor-pointer transition ${
                                isSelected
                                  ? 'border-primary-500 ring-2 ring-primary-200'
                                  : 'border-gray-200 hover:border-primary-300'
                              }`}
                              onClick={() => selectImage(scene.id, img.id)}
                            >
                              <Image
                                src={img.localPath}
                                alt={img.prompt}
                                width={1792}
                                height={1024}
                                className="w-full aspect-video object-cover"
                              />
                              {isSelected && (
                                <div className="absolute top-2 left-2 bg-primary-500 text-white p-1 rounded-full">
                                  <Check size={16} />
                                </div>
                              )}
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  deleteImage(scene.id, img.id);
                                }}
                                className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition opacity-80 hover:opacity-100"
                              >
                                <Trash2 size={16} />
                              </button>
                              <div className="p-2 bg-gray-50 border-t border-gray-200">
                                <p className="text-xs text-gray-600 line-clamp-2">{img.prompt}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scene.useAsVideoInput}
                          onChange={() => toggleUseAsInput(scene.id)}
                          className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <span className="text-gray-700">
                          選択した画像を動画生成の入力として使用する（image-to-video）
                        </span>
                      </label>
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
          href={`/projects/${projectId}/blueprint`}
          className="text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition"
        >
          ← 設計図に戻る
        </a>
        <button
          onClick={proceedToNext}
          disabled={!allScenesHaveImages}
          className="bg-primary-600 text-white px-6 py-2.5 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title={!allScenesHaveImages ? '全シーンの画像を生成してください' : ''}
        >
          次のステップへ →
        </button>
      </div>
    </div>
  );
}
