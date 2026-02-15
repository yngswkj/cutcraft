'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  ModelSettings,
  PromptSettings,
  SettingsApiResponse,
  SettingsResetAction,
  SettingsUpdateInput,
} from '@/types/settings';

const SOURCE_LABELS: Record<'settings' | 'env' | 'unset', string> = {
  settings: 'settings.json',
  env: '.env.local',
  unset: '未設定',
};

type ApiKeyTouched = {
  openaiApiKey: boolean;
  googleAiApiKey: boolean;
};

type ApiKeyDraft = {
  openaiApiKey: string;
  googleAiApiKey: string;
};

type ApiKeyVisibility = {
  openaiApiKey: boolean;
  googleAiApiKey: boolean;
};

function sourceBadgeClass(source: 'settings' | 'env' | 'unset'): string {
  if (source === 'settings') return 'bg-primary-50 text-primary-700';
  if (source === 'env') return 'bg-blue-50 text-blue-700';
  return 'bg-gray-100 text-gray-500';
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [models, setModels] = useState<ModelSettings | null>(null);
  const [prompts, setPrompts] = useState<PromptSettings | null>(null);
  const [defaults, setDefaults] = useState<{ models: ModelSettings; prompts: PromptSettings } | null>(null);

  const [effectiveSources, setEffectiveSources] = useState({
    openaiApiKey: 'unset' as 'settings' | 'env' | 'unset',
    googleAiApiKey: 'unset' as 'settings' | 'env' | 'unset',
  });
  const [storedMasks, setStoredMasks] = useState({
    openaiApiKeyMasked: null as string | null,
    googleAiApiKeyMasked: null as string | null,
  });

  const [apiKeys, setApiKeys] = useState<ApiKeyDraft>({
    openaiApiKey: '',
    googleAiApiKey: '',
  });
  const [apiKeyTouched, setApiKeyTouched] = useState<ApiKeyTouched>({
    openaiApiKey: false,
    googleAiApiKey: false,
  });
  const [apiKeyVisibility, setApiKeyVisibility] = useState<ApiKeyVisibility>({
    openaiApiKey: false,
    googleAiApiKey: false,
  });

  const applyResponse = useCallback((data: SettingsApiResponse) => {
    setModels(data.effective.models);
    setPrompts(data.effective.prompts);
    setDefaults(data.defaults);
    setEffectiveSources(data.effective.apiKeys.source);
    setStoredMasks(data.stored.apiKeys);
    setApiKeys({
      openaiApiKey: '',
      googleAiApiKey: '',
    });
    setApiKeyTouched({
      openaiApiKey: false,
      googleAiApiKey: false,
    });
  }, []);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || '設定の取得に失敗しました');
      }
      const data = await res.json() as SettingsApiResponse;
      applyResponse(data);
    } catch (fetchError) {
      const msg = fetchError instanceof Error ? fetchError.message : '設定の取得に失敗しました';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [applyResponse]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const canSave = useMemo(() => {
    return Boolean(models && prompts && !loading && !saving);
  }, [models, prompts, loading, saving]);

  const handleSave = async () => {
    if (!models || !prompts) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    const payload: SettingsUpdateInput = {
      models,
      prompts,
    };

    if (apiKeyTouched.openaiApiKey || apiKeyTouched.googleAiApiKey) {
      payload.apiKeys = {};
      if (apiKeyTouched.openaiApiKey) {
        payload.apiKeys.openaiApiKey = apiKeys.openaiApiKey.trim() || null;
      }
      if (apiKeyTouched.googleAiApiKey) {
        payload.apiKeys.googleAiApiKey = apiKeys.googleAiApiKey.trim() || null;
      }
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || '設定の保存に失敗しました');
      }

      applyResponse(body as SettingsApiResponse);
      setMessage('設定を保存しました');
    } catch (saveError) {
      const msg = saveError instanceof Error ? saveError.message : '設定の保存に失敗しました';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const runReset = async (action: SettingsResetAction, successMessage: string) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || '設定のリセットに失敗しました');
      }
      applyResponse(body as SettingsApiResponse);
      setMessage(successMessage);
    } catch (resetError) {
      const msg = resetError instanceof Error ? resetError.message : '設定のリセットに失敗しました';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const clearStoredApiKey = (key: keyof ApiKeyDraft) => {
    setApiKeys((prev) => ({ ...prev, [key]: '' }));
    setApiKeyTouched((prev) => ({ ...prev, [key]: true }));
  };

  if (loading && !models && !prompts) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      <a
        href="/"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 transition"
      >
        <ArrowLeft size={16} />
        ホームに戻る
      </a>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">設定</h1>
          <p className="text-sm text-gray-500 mt-1">
            APIキー、モデル、システムプロンプトを管理します
          </p>
        </div>
        <button
          onClick={fetchSettings}
          disabled={saving || loading}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-sm px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
        >
          <RefreshCw size={14} />
          再読み込み
        </button>
      </div>

      {message && (
        <div className="text-sm bg-green-50 text-green-700 border border-green-200 rounded-lg px-4 py-2.5">
          {message}
        </div>
      )}
      {error && (
        <div className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound size={16} className="text-primary-600" />
          <h2 className="font-semibold">APIキー</h2>
        </div>
        <p className="text-xs text-gray-500">
          入力したキーは <code>data/settings.json</code> に保存されます。空で保存すると <code>.env.local</code> フォールバックに戻ります。
        </p>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <label className="text-sm font-medium">OPENAI_API_KEY</label>
              <span className={`text-xs px-2 py-0.5 rounded ${sourceBadgeClass(effectiveSources.openaiApiKey)}`}>
                参照元: {SOURCE_LABELS[effectiveSources.openaiApiKey]}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type={apiKeyVisibility.openaiApiKey ? 'text' : 'password'}
                value={apiKeys.openaiApiKey ?? ''}
                onChange={(e) => {
                  setApiKeys((prev) => ({ ...prev, openaiApiKey: e.target.value }));
                  setApiKeyTouched((prev) => ({ ...prev, openaiApiKey: true }));
                }}
                placeholder="新しいキーを入力（変更しない場合は空）"
                className="w-full sm:flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setApiKeyVisibility((prev) => ({ ...prev, openaiApiKey: !prev.openaiApiKey }))
                  }
                  className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
                  title="表示切替"
                >
                  {apiKeyVisibility.openaiApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => clearStoredApiKey('openaiApiKey')}
                  className="text-sm px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
                >
                  クリア
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              settings.json: {storedMasks.openaiApiKeyMasked ?? '未設定'}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <label className="text-sm font-medium">GOOGLE_AI_API_KEY</label>
              <span className={`text-xs px-2 py-0.5 rounded ${sourceBadgeClass(effectiveSources.googleAiApiKey)}`}>
                参照元: {SOURCE_LABELS[effectiveSources.googleAiApiKey]}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type={apiKeyVisibility.googleAiApiKey ? 'text' : 'password'}
                value={apiKeys.googleAiApiKey ?? ''}
                onChange={(e) => {
                  setApiKeys((prev) => ({ ...prev, googleAiApiKey: e.target.value }));
                  setApiKeyTouched((prev) => ({ ...prev, googleAiApiKey: true }));
                }}
                placeholder="新しいキーを入力（変更しない場合は空）"
                className="w-full sm:flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setApiKeyVisibility((prev) => ({ ...prev, googleAiApiKey: !prev.googleAiApiKey }))
                  }
                  className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
                  title="表示切替"
                >
                  {apiKeyVisibility.googleAiApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => clearStoredApiKey('googleAiApiKey')}
                  className="text-sm px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
                >
                  クリア
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              settings.json: {storedMasks.googleAiApiKeyMasked ?? '未設定'}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex items-center gap-2">
            <Settings2 size={16} className="text-primary-600" />
            <h2 className="font-semibold">モデル設定</h2>
          </div>
          <button
            onClick={() => runReset('reset-models', 'モデル設定をデフォルトに戻しました')}
            disabled={saving || loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
          >
            <RotateCcw size={14} />
            デフォルトに戻す
          </button>
        </div>
        <p className="text-xs text-gray-500">
          推奨例: LLM <code>gpt-5.1</code> / 画像 <code>gpt-image-1.5</code> または <code>nanobananapro</code>（= <code>gemini-3-pro-image-preview</code>） / Sora <code>sora-2</code> / Veo <code>veo-3.1-fast</code>
        </p>

        {models && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm space-y-1.5">
              <span className="text-gray-600">LLMモデル（設計図・台本）</span>
              <input
                value={models.llmModel}
                onChange={(e) => setModels({ ...models, llmModel: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>
            <label className="text-sm space-y-1.5">
              <span className="text-gray-600">画像生成モデル</span>
              <input
                value={models.imageModel}
                onChange={(e) => setModels({ ...models, imageModel: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>
            <label className="text-sm space-y-1.5">
              <span className="text-gray-600">Soraモデル</span>
              <input
                value={models.soraModel}
                onChange={(e) => setModels({ ...models, soraModel: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>
            <label className="text-sm space-y-1.5">
              <span className="text-gray-600">Veoモデル</span>
              <input
                value={models.veoModel}
                onChange={(e) => setModels({ ...models, veoModel: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>
          </div>
        )}
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-primary-600" />
            <h2 className="font-semibold">システムプロンプト設定</h2>
          </div>
          <button
            onClick={() => runReset('reset-prompts', 'プロンプト設定をデフォルトに戻しました')}
            disabled={saving || loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
          >
            <RotateCcw size={14} />
            デフォルトに戻す
          </button>
        </div>
        <p className="text-xs text-gray-500">
          利用可能プレースホルダ: <code>{'{{API_INSTRUCTION}}'}</code>, <code>{'{{VIDEO_API_LABEL}}'}</code>, <code>{'{{VIDEO_API_HINT}}'}</code>
        </p>

        {prompts && (
          <div className="space-y-4">
            <label className="block text-sm space-y-1.5">
              <span className="text-gray-600">設計図生成プロンプト</span>
              <textarea
                value={prompts.blueprintSystemPromptTemplate}
                onChange={(e) =>
                  setPrompts({ ...prompts, blueprintSystemPromptTemplate: e.target.value })
                }
                rows={12}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>

            <label className="block text-sm space-y-1.5">
              <span className="text-gray-600">台本生成プロンプト</span>
              <textarea
                value={prompts.scriptSystemPromptTemplate}
                onChange={(e) =>
                  setPrompts({ ...prompts, scriptSystemPromptTemplate: e.target.value })
                }
                rows={12}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>
          </div>
        )}
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary-600 text-white px-5 py-2.5 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          onClick={() => runReset('reset-all', '設定をすべて初期化しました')}
          disabled={saving || loading}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-sm px-4 py-2.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
        >
          <SlidersHorizontal size={16} />
          全設定をリセット
        </button>
        <span className="text-xs text-gray-500">
          <RotateCcw size={12} className="inline mr-1" />
          リセット後も <code>.env.local</code> は削除されません
        </span>
      </section>

      {defaults && (
        <details className="bg-white rounded-lg border border-gray-200 p-5">
          <summary className="cursor-pointer text-sm font-medium text-gray-600">
            デフォルト値を表示
          </summary>
          <div className="mt-3 space-y-3 text-xs text-gray-600">
            <div>
              <p className="font-semibold mb-1">モデル</p>
              <pre className="bg-gray-50 border border-gray-200 rounded p-3 overflow-auto">
{JSON.stringify(defaults.models, null, 2)}
              </pre>
            </div>
            <div>
              <p className="font-semibold mb-1">プロンプト（先頭のみ）</p>
              <pre className="bg-gray-50 border border-gray-200 rounded p-3 overflow-auto whitespace-pre-wrap">
{defaults.prompts.blueprintSystemPromptTemplate.slice(0, 220)}...
              </pre>
              <pre className="bg-gray-50 border border-gray-200 rounded p-3 overflow-auto whitespace-pre-wrap mt-2">
{defaults.prompts.scriptSystemPromptTemplate.slice(0, 220)}...
              </pre>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
