'use client';

import { useState, useEffect, useRef } from 'react';
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
  ChevronLeft,
  PanelRight,
  Palette,
  Save,
  UserPlus,
  Users,
} from 'lucide-react';
import type {
  CharacterProfile,
  ImageApi,
  ImageStyleGuide,
  Project,
  Scene,
  SceneImage,
} from '@/types/project';
import { getImageApiLabel } from '@/lib/scene-models';
import type { ImageStylePreset, SettingsApiResponse } from '@/types/settings';
import { ProjectStepNav } from '../_components/project-step-nav';
import { ProjectStepMobileNav } from '../_components/project-step-mobile-nav';

const DEFAULT_IMAGE_STYLE_GUIDE: ImageStyleGuide = {
  styleBible: '',
  colorPalette: '',
  lightingMood: '',
  cameraLanguage: '',
  negativePrompt: '',
};

function createEmptyCharacterProfile(id: string): CharacterProfile {
  return {
    id,
    name: '',
    role: '',
    ethnicityNationality: '',
    ageAppearance: '',
    genderPresentation: '',
    appearanceTraits: '',
    wardrobe: '',
    mustKeep: '',
  };
}

type StyleTemplate = {
  id: string;
  name: string;
  description: string;
  styleGuide: ImageStyleGuide;
};

const STYLE_TEMPLATES: StyleTemplate[] = [
  {
    id: 'cinematic-natural',
    name: 'Cinematic Natural',
    description: '写実寄りで映画的。自然光と抑えた色で安定したトーン。',
    styleGuide: {
      styleBible: 'cinematic realism, subtle film grain, natural texture, grounded production design',
      colorPalette: 'muted teal and warm amber, restrained saturation, soft contrast',
      lightingMood: 'soft key light, gentle shadow rolloff, calm and emotional atmosphere',
      cameraLanguage: '35mm lens feel, stable framing, measured dolly movement, shallow depth of field',
      negativePrompt: 'anime style, oversaturated neon, extreme fisheye, exaggerated stylization',
    },
  },
  {
    id: 'high-end-commercial',
    name: 'High-end Commercial',
    description: '広告映像向けのクリーンで高コントラストなルック。',
    styleGuide: {
      styleBible: 'premium commercial look, crisp detail, clean production value',
      colorPalette: 'neutral base with selective brand color accents, high clarity',
      lightingMood: 'high-key with controlled contrast, polished highlights, energetic mood',
      cameraLanguage: 'precise composition, smooth motion control, product-centric framing',
      negativePrompt: 'low-detail texture, noisy grain, muddy colors, unstable handheld shake',
    },
  },
  {
    id: 'dramatic-noir',
    name: 'Dramatic Noir',
    description: '陰影を強く活かしたドラマチックなノワール調。',
    styleGuide: {
      styleBible: 'neo-noir cinematic language, dramatic contrast, moody visual storytelling',
      colorPalette: 'deep blacks, cool steel blue, sparse warm highlights',
      lightingMood: 'directional practical light, hard shadow edges, tense atmosphere',
      cameraLanguage: 'intentional negative space, low-key framing, controlled slow push-ins',
      negativePrompt: 'flat lighting, pastel palette, cheerful tone, cartoon rendering',
    },
  },
  {
    id: 'warm-human-documentary',
    name: 'Warm Human Documentary',
    description: 'ドキュメンタリー寄りの温かく人間味のある表現。',
    styleGuide: {
      styleBible: 'human-centered documentary realism, intimate storytelling, authentic imperfections',
      colorPalette: 'warm skin tones, earthy neutrals, natural ambient colors',
      lightingMood: 'available light feel, soft bounce, empathetic and hopeful mood',
      cameraLanguage: 'observational framing, handheld but steady, eye-level perspective',
      negativePrompt: 'hyper-polished CGI look, sterile lighting, overly dramatic VFX',
    },
  },
];

const CHARACTER_FIELDS: Array<keyof Omit<CharacterProfile, 'id'>> = [
  'name',
  'role',
  'ethnicityNationality',
  'ageAppearance',
  'genderPresentation',
  'appearanceTraits',
  'wardrobe',
  'mustKeep',
];

const STYLE_GUIDE_FIELDS: Array<keyof ImageStyleGuide> = [
  'styleBible',
  'colorPalette',
  'lightingMood',
  'cameraLanguage',
  'negativePrompt',
];

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function hasConfiguredStyleGuide(styleGuide: ImageStyleGuide): boolean {
  return STYLE_GUIDE_FIELDS.some((field) => hasText(styleGuide[field]));
}

function hasConfiguredCharacter(character: CharacterProfile): boolean {
  return CHARACTER_FIELDS.some((field) => hasText(character[field]));
}

function shouldAutoOpenStyleDrawer(
  styleGuide: ImageStyleGuide,
  characterBible: CharacterProfile[],
): boolean {
  const hasCommonStyle = hasConfiguredStyleGuide(styleGuide);
  const hasCharacterDefinition = characterBible.some(hasConfiguredCharacter);
  return !(hasCommonStyle || hasCharacterDefinition);
}

export default function ImageboardPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const styleDrawerDismissKey = `cutcraft:imageboard:style-drawer-dismissed:${projectId}`;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const [generatingScenes, setGeneratingScenes] = useState<Set<string>>(new Set());
  const [savingImageApiScenes, setSavingImageApiScenes] = useState<Set<string>>(new Set());
  const [styleGuide, setStyleGuide] = useState<ImageStyleGuide>(DEFAULT_IMAGE_STYLE_GUIDE);
  const [characterBible, setCharacterBible] = useState<CharacterProfile[]>([]);
  const [savingStyleGuide, setSavingStyleGuide] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [savedPresets, setSavedPresets] = useState<ImageStylePreset[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(STYLE_TEMPLATES[0].id);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [presetName, setPresetName] = useState<string>('');
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [isStyleDrawerOpen, setIsStyleDrawerOpen] = useState(false);
  const styleDrawerContentRef = useRef<HTMLDivElement | null>(null);

  const openStyleDrawer = () => {
    setIsStyleDrawerOpen(true);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        styleDrawerContentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      });
    }
  };

  const closeStyleDrawer = () => {
    setIsStyleDrawerOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(styleDrawerDismissKey, '1');
    }
  };

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

        const nextStyleGuide = data.imageStyleGuide || DEFAULT_IMAGE_STYLE_GUIDE;
        const nextCharacterBible = Array.isArray(data.characterBible) ? data.characterBible : [];

        setProject(data);
        setError(null);
        const shouldOpen = shouldAutoOpenStyleDrawer(nextStyleGuide, nextCharacterBible);
        const isDismissed = typeof window !== 'undefined'
          && window.localStorage.getItem(styleDrawerDismissKey) === '1';

        setStyleGuide(nextStyleGuide);
        setCharacterBible(nextCharacterBible);
        setIsStyleDrawerOpen(shouldOpen && !isDismissed);
        // デフォルトで全シーン展開
        setExpandedScenes(new Set(data.scenes.map((s: Scene) => s.id)));
        // 各シーンのプロンプト初期値設定
        const initialPrompts: Record<string, string> = {};
        data.scenes.forEach((s: Scene) => {
          initialPrompts[s.id] = s.description || '';
        });
        setPrompts(initialPrompts);
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
  }, [projectId, styleDrawerDismissKey]);

  useEffect(() => {
    let cancelled = false;

    const loadStylePresets = async () => {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) {
          throw new Error('設定の取得に失敗しました');
        }
        const data = await res.json() as SettingsApiResponse;
        if (cancelled) return;
        setSavedPresets(data.stored.imageStylePresets || []);
      } catch {
        if (cancelled) return;
        setSavedPresets([]);
      }
    };

    loadStylePresets();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isStyleDrawerOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isStyleDrawerOpen]);

  useEffect(() => {
    if (!isStyleDrawerOpen) return;
    styleDrawerContentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [isStyleDrawerOpen]);

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

  const saveStyleGuide = async () => {
    setSavingStyleGuide(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageStyleGuide: styleGuide,
          characterBible,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '共通設定の保存に失敗しました');
      }
      const updated = await res.json();
      setProject(updated);
      setStyleGuide(updated.imageStyleGuide || DEFAULT_IMAGE_STYLE_GUIDE);
      setCharacterBible(Array.isArray(updated.characterBible) ? updated.characterBible : []);
      closeStyleDrawer();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : '共通設定の保存に失敗しました';
      alert(message);
    } finally {
      setSavingStyleGuide(false);
    }
  };

  const syncStylePresets = async (nextPresets: ImageStylePreset[]): Promise<ImageStylePreset[]> => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageStylePresets: nextPresets }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || 'プリセット保存に失敗しました');
    }
    const response = body as SettingsApiResponse;
    const synced = response.stored.imageStylePresets || [];
    setSavedPresets(synced);
    return synced;
  };

  const applySelectedTemplate = () => {
    const template = STYLE_TEMPLATES.find((t) => t.id === selectedTemplateId);
    if (!template) return;
    setStyleGuide({ ...template.styleGuide });
  };

  const saveCurrentAsPreset = async () => {
    const name = presetName.trim();
    if (!name) {
      alert('プリセット名を入力してください');
      return;
    }

    setSavingPreset(true);
    try {
      const nowIso = new Date().toISOString();
      const existing = savedPresets.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
      const presetId = existing?.id ?? (
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `preset_${Date.now()}`
      );

      const nextPresets = existing
        ? savedPresets.map((preset) =>
            preset.id === existing.id
              ? {
                  ...preset,
                  name,
                  styleGuide: { ...styleGuide },
                  updatedAt: nowIso,
                }
              : preset,
          )
        : [
            ...savedPresets,
            {
              id: presetId,
              name,
              styleGuide: { ...styleGuide },
              createdAt: nowIso,
              updatedAt: nowIso,
            },
          ];

      const synced = await syncStylePresets(nextPresets);
      setSelectedPresetId(presetId);
      setPresetName('');
      alert(existing ? '既存プリセットを上書き保存しました' : 'プリセットを保存しました');

      if (!synced.some((preset) => preset.id === presetId)) {
        setSelectedPresetId('');
      }
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'プリセット保存に失敗しました';
      alert(message);
    } finally {
      setSavingPreset(false);
    }
  };

  const applySelectedPreset = () => {
    const preset = savedPresets.find((item) => item.id === selectedPresetId);
    if (!preset) {
      alert('適用するプリセットを選択してください');
      return;
    }
    setStyleGuide({ ...preset.styleGuide });
  };

  const deleteSelectedPreset = async () => {
    if (!selectedPresetId) {
      alert('削除するプリセットを選択してください');
      return;
    }
    const target = savedPresets.find((item) => item.id === selectedPresetId);
    if (!target) return;
    if (!confirm(`プリセット「${target.name}」を削除しますか？`)) return;

    setSavingPreset(true);
    try {
      const nextPresets = savedPresets.filter((item) => item.id !== selectedPresetId);
      await syncStylePresets(nextPresets);
      setSelectedPresetId('');
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'プリセット削除に失敗しました';
      alert(message);
    } finally {
      setSavingPreset(false);
    }
  };

  const addCharacterProfile = () => {
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `character-${Date.now()}`;
    setCharacterBible((prev) => [...prev, createEmptyCharacterProfile(id)]);
  };

  const updateCharacterProfile = (
    id: string,
    key: keyof Omit<CharacterProfile, 'id'>,
    value: string,
  ) => {
    setCharacterBible((prev) => prev.map((character) => (
      character.id === id
        ? { ...character, [key]: value }
        : character
    )));
  };

  const removeCharacterProfile = (id: string) => {
    setCharacterBible((prev) => prev.filter((character) => character.id !== id));
    setProject((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          castCharacterIds: scene.castCharacterIds.filter((castId) => castId !== id),
        })),
      };
    });
  };

  const updateSceneImageApi = async (sceneId: string, imageApi: ImageApi) => {
    if (!project) return;
    setSavingImageApiScenes(prev => new Set(prev).add(sceneId));
    try {
      const updated = {
        ...project,
        scenes: project.scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, imageApi } : scene
        ),
      };
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '画像APIの更新に失敗しました');
      }
      const nextProject = await res.json();
      setProject(nextProject);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : '画像APIの更新に失敗しました';
      alert(message);
    } finally {
      setSavingImageApiScenes(prev => {
        const next = new Set(prev);
        next.delete(sceneId);
        return next;
      });
    }
  };

  const toggleSceneCastCharacter = async (sceneId: string, characterId: string, checked: boolean) => {
    if (!project) return;

    const nextScenes = project.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      if (checked) {
        if (scene.castCharacterIds.includes(characterId)) return scene;
        return {
          ...scene,
          castCharacterIds: [...scene.castCharacterIds, characterId],
        };
      }

      return {
        ...scene,
        castCharacterIds: scene.castCharacterIds.filter((id) => id !== characterId),
      };
    });

    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenes: nextScenes,
        characterBible,
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      setProject(updated);
      setCharacterBible(Array.isArray(updated.characterBible) ? updated.characterBible : []);
      return;
    }

    const err = await res.json().catch(() => ({}));
    alert(err.error || 'シーンのキャラクター設定更新に失敗しました');
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

  const allScenesHaveImages = project.scenes.every(s => s.images.length > 0);

  return (
    <div className="w-full">
      <div className="max-w-[1700px] mx-auto">
      <a
        href={`/projects/${projectId}`}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 mb-6 transition"
      >
        <ArrowLeft size={16} />
        プロジェクトに戻る
      </a>

      <ProjectStepMobileNav project={project} projectId={projectId} className="mb-4" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">イメージボード</h1>
          <p className="text-gray-500 text-sm mt-1">
            各シーンの参考画像を生成しましょう（設定画面の画像モデルを使用）
          </p>
        </div>
        <button
          type="button"
          onClick={openStyleDrawer}
          className="min-[1000px]:hidden w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition"
        >
          <PanelRight size={16} />
          共通設定
        </button>
      </div>

      {!isStyleDrawerOpen && (
        <button
          type="button"
          onClick={openStyleDrawer}
          className="hidden min-[1000px]:inline-flex min-[1000px]:fixed min-[1000px]:right-6 min-[1000px]:top-24 min-[1000px]:z-40 items-center gap-1.5 bg-primary-600 text-white rounded-lg px-3 py-2.5 shadow-lg hover:bg-primary-700 transition"
          aria-label="共通設定を開く"
        >
          <PanelRight size={16} />
          共通設定
        </button>
      )}

      <div
        className={`fixed inset-0 z-40 bg-gray-900/20 backdrop-blur-[1px] transition-opacity duration-300 ${
          isStyleDrawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={closeStyleDrawer}
        aria-hidden={!isStyleDrawerOpen}
      />

      <div className="grid grid-cols-1 min-[1000px]:grid-cols-[220px_minmax(0,1fr)] gap-6 items-start">
        <aside className="hidden min-[1000px]:block min-[1000px]:sticky min-[1000px]:top-20">
          <ProjectStepNav project={project} projectId={projectId} />
        </aside>

        <aside
          className={`fixed inset-y-0 right-0 z-50 w-full max-w-[900px] transform transition-transform duration-300 ease-out ${
            isStyleDrawerOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
          }`}
          aria-hidden={!isStyleDrawerOpen}
        >
          <div
            ref={styleDrawerContentRef}
            className="h-full bg-white border-l border-gray-200 p-4 sm:p-5 space-y-3 overflow-y-auto shadow-2xl"
          >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-primary-600" />
            <h2 className="text-sm font-semibold">プロジェクト共通スタイル / Character Bible</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={saveStyleGuide}
              disabled={savingStyleGuide}
              className="inline-flex items-center justify-center gap-1.5 bg-primary-600 text-white text-sm px-3.5 py-1.5 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
            >
              <Save size={14} />
              {savingStyleGuide ? '保存中...' : '共通設定を保存'}
            </button>
            <button
              type="button"
              onClick={closeStyleDrawer}
              className="inline-flex items-center justify-center h-8 w-8 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 transition"
              aria-label="共通設定を折りたたむ"
              title="折りたたむ"
            >
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          ここで指定した内容は同一プロジェクト内の全シーン画像生成に共通適用され、画風と人物同一性の整合性を強めます。
        </p>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded">
            Characters: {characterBible.length}
          </span>
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
            Presets: {savedPresets.length}
          </span>
        </div>

        <div className="grid grid-cols-1 min-[430px]:grid-cols-2 gap-3">
          <label className="text-xs text-gray-600 space-y-1">
            <span>スタイルバイブル</span>
            <textarea
              value={styleGuide.styleBible}
              onChange={(e) => setStyleGuide((prev) => ({ ...prev, styleBible: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="例: cinematic realism, subtle film grain, natural skin texture"
            />
          </label>
          <label className="text-xs text-gray-600 space-y-1">
            <span>カラーパレット</span>
            <textarea
              value={styleGuide.colorPalette}
              onChange={(e) => setStyleGuide((prev) => ({ ...prev, colorPalette: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="例: muted teal and amber, low saturation highlights"
            />
          </label>
          <label className="text-xs text-gray-600 space-y-1">
            <span>ライティング / ムード</span>
            <textarea
              value={styleGuide.lightingMood}
              onChange={(e) => setStyleGuide((prev) => ({ ...prev, lightingMood: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="例: soft key light, gentle contrast, melancholic atmosphere"
            />
          </label>
          <label className="text-xs text-gray-600 space-y-1">
            <span>カメラ言語 / 構図</span>
            <textarea
              value={styleGuide.cameraLanguage}
              onChange={(e) => setStyleGuide((prev) => ({ ...prev, cameraLanguage: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="例: 35mm lens feel, centered composition, restrained depth of field"
            />
          </label>
        </div>

        <label className="text-xs text-gray-600 space-y-1 block">
          <span>避けたい表現（ネガティブ）</span>
          <textarea
            value={styleGuide.negativePrompt}
            onChange={(e) => setStyleGuide((prev) => ({ ...prev, negativePrompt: e.target.value }))}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="例: oversaturated colors, anime style, extreme wide-angle distortion"
          />
        </label>

        <details className="border-t border-gray-200 pt-3" open={characterBible.length === 0}>
          <summary className="flex items-center justify-between gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-primary-600" />
              <p className="text-xs font-semibold text-gray-700">Character Bible</p>
            </div>
            <span className="text-xs text-gray-500">{characterBible.length}人</span>
          </summary>

          <div className="mt-3 space-y-3">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={addCharacterProfile}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
              >
                <UserPlus size={13} />
                人物を追加
              </button>
            </div>
            <p className="text-xs text-gray-500">
              人物の固定属性を定義します。ここで設定した内容と、各シーンで選択した登場人物をもとに同一人物性を維持します。
            </p>

            {characterBible.length === 0 ? (
              <p className="text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg px-3 py-2">
                人物が未定義です。必要に応じて追加し、民族・外見・服装などの固定情報を入力してください。
              </p>
            ) : (
              <div className="space-y-3">
                {characterBible.map((character, idx) => (
                  <div key={character.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-700">人物 {idx + 1}</p>
                      <button
                        type="button"
                        onClick={() => removeCharacterProfile(character.id)}
                        className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 transition"
                      >
                        削除
                      </button>
                    </div>
                    <div className="grid grid-cols-1 min-[430px]:grid-cols-2 gap-2">
                      <label className="text-xs text-gray-600 space-y-1">
                        <span>名前</span>
                        <input
                          value={character.name}
                          onChange={(e) => updateCharacterProfile(character.id, 'name', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="例: 部下A / 主人公"
                        />
                      </label>
                      <label className="text-xs text-gray-600 space-y-1">
                        <span>役割</span>
                        <input
                          value={character.role}
                          onChange={(e) => updateCharacterProfile(character.id, 'role', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="例: プレゼンター、部長"
                        />
                      </label>
                      <label className="text-xs text-gray-600 space-y-1">
                        <span>民族・国籍</span>
                        <input
                          value={character.ethnicityNationality}
                          onChange={(e) => updateCharacterProfile(character.id, 'ethnicityNationality', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="例: Japanese"
                        />
                      </label>
                      <label className="text-xs text-gray-600 space-y-1">
                        <span>年齢印象</span>
                        <input
                          value={character.ageAppearance}
                          onChange={(e) => updateCharacterProfile(character.id, 'ageAppearance', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="例: late 20s"
                        />
                      </label>
                      <label className="text-xs text-gray-600 space-y-1">
                        <span>性別表現</span>
                        <input
                          value={character.genderPresentation}
                          onChange={(e) => updateCharacterProfile(character.id, 'genderPresentation', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="例: male / female / androgynous"
                        />
                      </label>
                    </div>
                    <label className="text-xs text-gray-600 space-y-1 block">
                      <span>外見特徴</span>
                      <textarea
                        value={character.appearanceTraits}
                        onChange={(e) => updateCharacterProfile(character.id, 'appearanceTraits', e.target.value)}
                        rows={2}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="例: short black hair, oval face, thin-rim glasses"
                      />
                    </label>
                    <label className="text-xs text-gray-600 space-y-1 block">
                      <span>服装ベース</span>
                      <textarea
                        value={character.wardrobe}
                        onChange={(e) => updateCharacterProfile(character.id, 'wardrobe', e.target.value)}
                        rows={2}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="例: navy suit, white shirt, company lanyard"
                      />
                    </label>
                    <label className="text-xs text-gray-600 space-y-1 block">
                      <span>必須固定（変えてはいけない点）</span>
                      <textarea
                        value={character.mustKeep}
                        onChange={(e) => updateCharacterProfile(character.id, 'mustKeep', e.target.value)}
                        rows={2}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="例: keep same face shape, same hairstyle, same ethnicity"
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>

        <details className="border-t border-gray-200 pt-3">
          <summary className="flex items-center justify-between gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <p className="text-xs font-semibold text-gray-700">テンプレート / プリセット</p>
            <span className="text-xs text-gray-500">再利用設定</span>
          </summary>

          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-700">テンプレート選択</p>
              <p className="text-xs text-gray-500 mt-0.5">
                組み込みテンプレートをベースにすると、プロジェクト初期のトーンを素早く揃えられます。
              </p>
            </div>
            <div className="flex flex-col min-[430px]:flex-row gap-2">
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {STYLE_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <button
                onClick={applySelectedTemplate}
                className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
              >
                テンプレート適用
              </button>
            </div>
            <p className="text-xs text-gray-500">
              {STYLE_TEMPLATES.find((template) => template.id === selectedTemplateId)?.description}
            </p>

            <div className="border-t border-gray-200 pt-3">
              <p className="text-xs font-semibold text-gray-700">プリセット保存</p>
              <p className="text-xs text-gray-500 mt-0.5">
                現在の共通スタイルを名前付きで保存し、他プロジェクトでも再利用できます。
              </p>
            </div>

            <div className="flex flex-col min-[430px]:flex-row gap-2">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="プリセット名（例: Brand A - Warm Cinema）"
              />
              <button
                onClick={saveCurrentAsPreset}
                disabled={savingPreset}
                className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition disabled:opacity-50"
              >
                {savingPreset ? '保存中...' : '現在のスタイルを保存'}
              </button>
            </div>

            <div className="flex flex-col min-[430px]:flex-row gap-2">
              <select
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">保存済みプリセットを選択</option>
                {savedPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <button
                onClick={applySelectedPreset}
                disabled={!selectedPresetId}
                className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
              >
                プリセット適用
              </button>
              <button
                onClick={deleteSelectedPreset}
                disabled={!selectedPresetId || savingPreset}
                className="text-sm px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
              >
                削除
              </button>
            </div>
            <p className="text-xs text-gray-500">
              保存済み: {savedPresets.length}件
            </p>
          </div>
        </details>
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <div className="space-y-4">
        {project.scenes.map((scene, index) => {
          const isExpanded = expandedScenes.has(scene.id);
          const isGenerating = generatingScenes.has(scene.id);

          return (
            <div
              key={scene.id}
              className="bg-white rounded-lg border border-gray-200"
            >
              <div className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition">
                <button
                  onClick={() => toggleScene(scene.id)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left"
                >
                  <div className="flex-shrink-0 text-gray-400 text-sm font-mono w-6 text-right">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
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
                </button>

                <div className="flex-shrink-0 flex items-center gap-2">
                  <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => updateSceneImageApi(scene.id, 'chatgpt')}
                      disabled={savingImageApiScenes.has(scene.id)}
                      className={`px-2 py-1 text-xs rounded-md transition ${
                        scene.imageApi === 'chatgpt'
                          ? 'bg-primary-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      } disabled:opacity-50`}
                    >
                      ChatGPT
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSceneImageApi(scene.id, 'nanobananapro')}
                      disabled={savingImageApiScenes.has(scene.id)}
                      className={`px-2 py-1 text-xs rounded-md transition ${
                        scene.imageApi === 'nanobananapro'
                          ? 'bg-primary-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      } disabled:opacity-50`}
                    >
                      nano banana pro
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleScene(scene.id)}
                    className="text-gray-400 hover:text-gray-600 transition"
                    aria-label={isExpanded ? 'シーンを折りたたむ' : 'シーンを展開する'}
                  >
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-200 p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      シーン登場キャラクター（整合性ロック）
                    </label>
                    {characterBible.length === 0 ? (
                      <p className="text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg px-3 py-2">
                        先に共通設定パネルの Character Bible で人物を登録してください。
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {characterBible.map((character) => (
                          <label
                            key={character.id}
                            className="inline-flex items-center gap-2 text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-gray-50"
                          >
                            <input
                              type="checkbox"
                              checked={scene.castCharacterIds.includes(character.id)}
                              onChange={(e) =>
                                toggleSceneCastCharacter(scene.id, character.id, e.target.checked)
                              }
                              className="w-3.5 h-3.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                            />
                            <span className="text-gray-700">
                              {character.name.trim() ? character.name : '名前未設定の人物'}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      チェックした人物は民族・外見・服装などを固定し、シーン間で同一人物として扱います。
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      画像生成プロンプト
                    </label>
                    <p className="text-xs text-primary-600 mb-1">
                      使用モデル: {getImageApiLabel(scene.imageApi)}
                    </p>
                    <p className="text-xs text-gray-500 mb-2">
                      入力内容に加えて、共通設定パネルの「プロジェクト共通スタイル」が自動で適用されます。
                    </p>
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
                      <div className="grid grid-cols-1 min-[430px]:grid-cols-2 gap-3">
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

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center">
        <a
          href={`/projects/${projectId}/blueprint`}
          className="w-full sm:w-auto text-center sm:text-left text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition"
        >
          ← 設計図に戻る
        </a>
        <button
          onClick={proceedToNext}
          disabled={!allScenesHaveImages}
          className="w-full sm:w-auto bg-primary-600 text-white px-6 py-2.5 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title={!allScenesHaveImages ? '全シーンの画像を生成してください' : ''}
        >
          次のステップへ →
        </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
