import type { ImageStyleGuide } from './project';

export type SecretSource = 'settings' | 'env' | 'unset';
export type SettingsVersion = 1;

export interface ApiKeyOverrides {
  openaiApiKey: string | null;
  googleAiApiKey: string | null;
}

export interface ModelSettings {
  llmModel: string;
  imageModel: string;
  soraModel: string;
  veoModel: string;
}

export interface PromptSettings {
  blueprintSystemPromptTemplate: string;
  scriptSystemPromptTemplate: string;
}

export interface ImageStylePreset {
  id: string;
  name: string;
  styleGuide: ImageStyleGuide;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  version: SettingsVersion;
  apiKeys: ApiKeyOverrides;
  models: ModelSettings;
  prompts: PromptSettings;
  imageStylePresets: ImageStylePreset[];
  updatedAt: string;
}

export interface EffectiveSettings {
  apiKeys: {
    openaiApiKey: string | null;
    googleAiApiKey: string | null;
    source: {
      openaiApiKey: SecretSource;
      googleAiApiKey: SecretSource;
    };
  };
  models: ModelSettings;
  prompts: PromptSettings;
}

export interface SettingsUpdateInput {
  apiKeys?: Partial<ApiKeyOverrides>;
  models?: Partial<ModelSettings>;
  prompts?: Partial<PromptSettings>;
  imageStylePresets?: ImageStylePreset[];
}

export type SettingsResetAction = 'reset-prompts' | 'reset-models' | 'reset-all';

export interface SettingsApiResponse {
  stored: Omit<Settings, 'apiKeys'> & {
    apiKeys: {
      openaiApiKeyMasked: string | null;
      googleAiApiKeyMasked: string | null;
    };
  };
  effective: EffectiveSettings;
  defaults: {
    models: ModelSettings;
    prompts: PromptSettings;
  };
}
