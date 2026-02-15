import path from 'path';
import { readJsonFile, writeJsonFile } from './file-storage';
import { isRecord } from './validation';
import type {
  ApiKeyOverrides,
  EffectiveSettings,
  ImageStylePreset,
  ModelSettings,
  PromptSettings,
  SecretSource,
  Settings,
  SettingsApiResponse,
  SettingsResetAction,
  SettingsUpdateInput,
} from '@/types/settings';
import type { ImageStyleGuide } from '@/types/project';

export class SettingsValidationError extends Error {}

export const SETTINGS_FILE_PATH = path.join(process.cwd(), 'data', 'settings.json');

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  llmModel: 'gpt-5.1',
  imageModel: 'gpt-image-1.5',
  soraModel: 'sora-2',
  veoModel: 'veo-3.1-fast',
};

const DEFAULT_BLUEPRINT_PROMPT_TEMPLATE = `あなたは映像ディレクターです。ユーザーのテーマから約2分間の動画の設計図を作成してください。

以下のJSON形式で出力してください:
{
  "scenes": [
    {
      "title": "シーンタイトル",
      "description": "シーンの詳細な説明（映像内容、雰囲気、色調）",
      "durationSec": 秒数,
      "styleDirection": "映像スタイルの方向性（英語キーワード）",
      "suggestedApi": "sora" または "veo"
    }
  ]
}

制約:
- 合計秒数は約120秒になるようにする
- 8〜15シーン程度に分割
- シーン間の自然なつながりを意識
{{API_INSTRUCTION}}
- description は映像として具体的に想像できる内容にする
- styleDirection は英語のキーワードで（例: "cinematic, warm tones, shallow depth of field"）`;

const DEFAULT_SCRIPT_PROMPT_TEMPLATE = `あなたは映像プロダクションの専門家です。シーン情報から{{VIDEO_API_LABEL}}向けの動画生成プロンプトを作成してください。

以下のJSON形式で出力してください:
{
  "videoPrompt": "動画生成用の詳細なプロンプト（英語、1-2文）",
  "metadata": {
    "cameraWork": "カメラワークの説明（日本語）",
    "movement": "動きの説明（日本語）",
    "lighting": "ライティングの説明（日本語）",
    "style": "スタイル・雰囲気の説明（日本語）"
  }
}

制約:
- videoPrompt は英語で具体的に（カメラアングル、動き、ライティング、色調を含む）
- {{VIDEO_API_HINT}}
- 映像として実現可能な内容にする
- metadata は日本語で分かりやすく`;

export const DEFAULT_PROMPT_SETTINGS: PromptSettings = {
  blueprintSystemPromptTemplate: DEFAULT_BLUEPRINT_PROMPT_TEMPLATE,
  scriptSystemPromptTemplate: DEFAULT_SCRIPT_PROMPT_TEMPLATE,
};

const MAX_IMAGE_STYLE_PRESET_COUNT = 50;
const MAX_IMAGE_STYLE_FIELD_LENGTH = 4000;
const MAX_IMAGE_STYLE_PRESET_NAME_LENGTH = 80;
const SAFE_PRESET_ID_REGEX = /^[A-Za-z0-9_-]{1,120}$/;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  apiKeys: {
    openaiApiKey: null,
    googleAiApiKey: null,
  },
  models: DEFAULT_MODEL_SETTINGS,
  prompts: DEFAULT_PROMPT_SETTINGS,
  imageStylePresets: [],
  updatedAt: new Date(0).toISOString(),
};

function parseOptionalSecret(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function normalizeModelValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

function normalizePromptValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  if (!value.trim()) return fallback;
  return value;
}

function normalizeImageStyleGuide(value: unknown): ImageStyleGuide {
  if (!isRecord(value)) {
    return {
      styleBible: '',
      colorPalette: '',
      lightingMood: '',
      cameraLanguage: '',
      negativePrompt: '',
    };
  }

  return {
    styleBible: typeof value.styleBible === 'string' ? value.styleBible : '',
    colorPalette: typeof value.colorPalette === 'string' ? value.colorPalette : '',
    lightingMood: typeof value.lightingMood === 'string' ? value.lightingMood : '',
    cameraLanguage: typeof value.cameraLanguage === 'string' ? value.cameraLanguage : '',
    negativePrompt: typeof value.negativePrompt === 'string' ? value.negativePrompt : '',
  };
}

function normalizeImageStylePresets(raw: unknown, nowIso: string): ImageStylePreset[] {
  if (!Array.isArray(raw)) return [];

  const normalized: ImageStylePreset[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!isRecord(item)) continue;

    const id =
      typeof item.id === 'string' && SAFE_PRESET_ID_REGEX.test(item.id)
        ? item.id
        : `preset_${i + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const name =
      typeof item.name === 'string' && item.name.trim()
        ? item.name.trim().slice(0, MAX_IMAGE_STYLE_PRESET_NAME_LENGTH)
        : `Preset ${i + 1}`;

    const createdAt =
      typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt))
        ? new Date(item.createdAt).toISOString()
        : nowIso;

    const updatedAt =
      typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt))
        ? new Date(item.updatedAt).toISOString()
        : createdAt;

    normalized.push({
      id,
      name,
      styleGuide: normalizeImageStyleGuide(item.styleGuide),
      createdAt,
      updatedAt,
    });

    if (normalized.length >= MAX_IMAGE_STYLE_PRESET_COUNT) break;
  }

  return normalized;
}

function normalizeStoredSettings(raw: unknown): Settings {
  const nowIso = new Date().toISOString();
  if (!isRecord(raw)) {
    return { ...DEFAULT_SETTINGS, updatedAt: nowIso };
  }

  const apiKeysRaw = isRecord(raw.apiKeys) ? raw.apiKeys : {};
  const modelsRaw = isRecord(raw.models) ? raw.models : {};
  const promptsRaw = isRecord(raw.prompts) ? raw.prompts : {};
  const imageStylePresets = normalizeImageStylePresets(raw.imageStylePresets, nowIso);

  const updatedAt = typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))
    ? new Date(raw.updatedAt).toISOString()
    : nowIso;

  return {
    version: 1,
    apiKeys: {
      openaiApiKey: parseOptionalSecret(apiKeysRaw.openaiApiKey),
      googleAiApiKey: parseOptionalSecret(apiKeysRaw.googleAiApiKey),
    },
    models: {
      llmModel: normalizeModelValue(modelsRaw.llmModel, DEFAULT_MODEL_SETTINGS.llmModel),
      imageModel: normalizeModelValue(modelsRaw.imageModel, DEFAULT_MODEL_SETTINGS.imageModel),
      soraModel: normalizeModelValue(modelsRaw.soraModel, DEFAULT_MODEL_SETTINGS.soraModel),
      veoModel: normalizeModelValue(modelsRaw.veoModel, DEFAULT_MODEL_SETTINGS.veoModel),
    },
    prompts: {
      blueprintSystemPromptTemplate: normalizePromptValue(
        promptsRaw.blueprintSystemPromptTemplate,
        DEFAULT_PROMPT_SETTINGS.blueprintSystemPromptTemplate,
      ),
      scriptSystemPromptTemplate: normalizePromptValue(
        promptsRaw.scriptSystemPromptTemplate,
        DEFAULT_PROMPT_SETTINGS.scriptSystemPromptTemplate,
      ),
    },
    imageStylePresets,
    updatedAt,
  };
}

function validateModel(name: string, value: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 100) {
    throw new SettingsValidationError(`${name} は1〜100文字で入力してください`);
  }
  return normalized;
}

function validatePrompt(name: string, value: string): string {
  if (!value.trim()) {
    throw new SettingsValidationError(`${name} は空にできません`);
  }
  if (value.length > 12000) {
    throw new SettingsValidationError(`${name} は12000文字以下で入力してください`);
  }
  return value;
}

function validateApiKeyInput(name: string, value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 500) {
    throw new SettingsValidationError(`${name} は500文字以下で入力してください`);
  }
  return normalized;
}

function validateImageStyleField(name: string, value: unknown): string {
  if (typeof value !== 'string') {
    throw new SettingsValidationError(`${name} は文字列で入力してください`);
  }
  if (value.length > MAX_IMAGE_STYLE_FIELD_LENGTH) {
    throw new SettingsValidationError(
      `${name} は${MAX_IMAGE_STYLE_FIELD_LENGTH}文字以下で入力してください`,
    );
  }
  return value;
}

function validateImageStyleGuide(value: unknown): ImageStyleGuide {
  if (!isRecord(value)) {
    throw new SettingsValidationError('プリセットのスタイルガイドが不正です');
  }

  return {
    styleBible: validateImageStyleField('styleBible', value.styleBible),
    colorPalette: validateImageStyleField('colorPalette', value.colorPalette),
    lightingMood: validateImageStyleField('lightingMood', value.lightingMood),
    cameraLanguage: validateImageStyleField('cameraLanguage', value.cameraLanguage),
    negativePrompt: validateImageStyleField('negativePrompt', value.negativePrompt),
  };
}

function validateImageStylePresets(value: unknown): ImageStylePreset[] {
  if (!Array.isArray(value)) {
    throw new SettingsValidationError('imageStylePresets は配列で指定してください');
  }
  if (value.length > MAX_IMAGE_STYLE_PRESET_COUNT) {
    throw new SettingsValidationError(`プリセットは最大${MAX_IMAGE_STYLE_PRESET_COUNT}件までです`);
  }

  const nowIso = new Date().toISOString();
  const presets: ImageStylePreset[] = [];
  const usedId = new Set<string>();

  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!isRecord(item)) {
      throw new SettingsValidationError(`imageStylePresets[${i}] が不正です`);
    }

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!SAFE_PRESET_ID_REGEX.test(id)) {
      throw new SettingsValidationError(`imageStylePresets[${i}].id が不正です`);
    }
    if (usedId.has(id)) {
      throw new SettingsValidationError(`imageStylePresets[${i}].id が重複しています`);
    }
    usedId.add(id);

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name || name.length > MAX_IMAGE_STYLE_PRESET_NAME_LENGTH) {
      throw new SettingsValidationError(
        `imageStylePresets[${i}].name は1〜${MAX_IMAGE_STYLE_PRESET_NAME_LENGTH}文字で入力してください`,
      );
    }

    const createdAt =
      typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt))
        ? new Date(item.createdAt).toISOString()
        : nowIso;
    const updatedAt =
      typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt))
        ? new Date(item.updatedAt).toISOString()
        : nowIso;

    presets.push({
      id,
      name,
      styleGuide: validateImageStyleGuide(item.styleGuide),
      createdAt,
      updatedAt,
    });
  }

  return presets;
}

function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function resolveApiKey(storedValue: string | null, envValue: string | undefined): {
  value: string | null;
  source: SecretSource;
} {
  if (storedValue) {
    return { value: storedValue, source: 'settings' };
  }
  if (envValue && envValue.trim()) {
    return { value: envValue.trim(), source: 'env' };
  }
  return { value: null, source: 'unset' };
}

export function renderPromptTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : _match;
  });
}

export async function readSettingsFile(): Promise<Settings | null> {
  const raw = await readJsonFile<unknown>(SETTINGS_FILE_PATH);
  if (!raw) return null;
  return normalizeStoredSettings(raw);
}

export async function writeSettingsFile(settings: Settings): Promise<void> {
  await writeJsonFile(SETTINGS_FILE_PATH, settings);
}

export async function getStoredSettings(): Promise<Settings> {
  const stored = await readSettingsFile();
  if (stored) return stored;
  return { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
}

export async function getEffectiveSettings(): Promise<EffectiveSettings> {
  const stored = await getStoredSettings();
  const openai = resolveApiKey(stored.apiKeys.openaiApiKey, process.env.OPENAI_API_KEY);
  const google = resolveApiKey(stored.apiKeys.googleAiApiKey, process.env.GOOGLE_AI_API_KEY);

  return {
    apiKeys: {
      openaiApiKey: openai.value,
      googleAiApiKey: google.value,
      source: {
        openaiApiKey: openai.source,
        googleAiApiKey: google.source,
      },
    },
    models: stored.models,
    prompts: stored.prompts,
  };
}

export async function updateSettings(input: SettingsUpdateInput): Promise<Settings> {
  const stored = await getStoredSettings();
  const next: Settings = {
    ...stored,
    apiKeys: { ...stored.apiKeys },
    models: { ...stored.models },
    prompts: { ...stored.prompts },
    imageStylePresets: [...stored.imageStylePresets],
    updatedAt: new Date().toISOString(),
  };

  if (input.apiKeys) {
    if (Object.prototype.hasOwnProperty.call(input.apiKeys, 'openaiApiKey')) {
      next.apiKeys.openaiApiKey = validateApiKeyInput(
        'OPENAI_API_KEY',
        input.apiKeys.openaiApiKey ?? null,
      );
    }
    if (Object.prototype.hasOwnProperty.call(input.apiKeys, 'googleAiApiKey')) {
      next.apiKeys.googleAiApiKey = validateApiKeyInput(
        'GOOGLE_AI_API_KEY',
        input.apiKeys.googleAiApiKey ?? null,
      );
    }
  }

  if (input.models) {
    if (typeof input.models.llmModel === 'string') {
      next.models.llmModel = validateModel('LLMモデル', input.models.llmModel);
    }
    if (typeof input.models.imageModel === 'string') {
      next.models.imageModel = validateModel('画像モデル', input.models.imageModel);
    }
    if (typeof input.models.soraModel === 'string') {
      next.models.soraModel = validateModel('Soraモデル', input.models.soraModel);
    }
    if (typeof input.models.veoModel === 'string') {
      next.models.veoModel = validateModel('Veoモデル', input.models.veoModel);
    }
  }

  if (input.prompts) {
    if (typeof input.prompts.blueprintSystemPromptTemplate === 'string') {
      next.prompts.blueprintSystemPromptTemplate = validatePrompt(
        '設計図生成プロンプト',
        input.prompts.blueprintSystemPromptTemplate,
      );
    }
    if (typeof input.prompts.scriptSystemPromptTemplate === 'string') {
      next.prompts.scriptSystemPromptTemplate = validatePrompt(
        '台本生成プロンプト',
        input.prompts.scriptSystemPromptTemplate,
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'imageStylePresets')) {
    next.imageStylePresets = validateImageStylePresets(input.imageStylePresets);
  }

  await writeSettingsFile(next);
  return next;
}

export async function resetSettings(action: SettingsResetAction): Promise<Settings> {
  const stored = await getStoredSettings();
  const next: Settings = {
    ...stored,
    apiKeys: { ...stored.apiKeys },
    models: { ...stored.models },
    prompts: { ...stored.prompts },
    imageStylePresets: [...stored.imageStylePresets],
    updatedAt: new Date().toISOString(),
  };

  if (action === 'reset-prompts' || action === 'reset-all') {
    next.prompts = { ...DEFAULT_PROMPT_SETTINGS };
  }
  if (action === 'reset-models' || action === 'reset-all') {
    next.models = { ...DEFAULT_MODEL_SETTINGS };
  }
  if (action === 'reset-all') {
    next.apiKeys = {
      openaiApiKey: null,
      googleAiApiKey: null,
    };
    next.imageStylePresets = [];
  }

  await writeSettingsFile(next);
  return next;
}

export async function getSettingsApiResponse(): Promise<SettingsApiResponse> {
  const stored = await getStoredSettings();
  const effective = await getEffectiveSettings();

  return {
    stored: {
      version: stored.version,
      models: stored.models,
      prompts: stored.prompts,
      imageStylePresets: stored.imageStylePresets,
      updatedAt: stored.updatedAt,
      apiKeys: {
        openaiApiKeyMasked: maskSecret(stored.apiKeys.openaiApiKey),
        googleAiApiKeyMasked: maskSecret(stored.apiKeys.googleAiApiKey),
      },
    },
    effective,
    defaults: {
      models: DEFAULT_MODEL_SETTINGS,
      prompts: DEFAULT_PROMPT_SETTINGS,
    },
  };
}
