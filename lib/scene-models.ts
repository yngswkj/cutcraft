import type { ImageApi, SceneVideoModelOverride } from '@/types/project';

export const CHATGPT_IMAGE_MODEL = 'gpt-image-1.5';
export const NANO_BANANA_PRO_IMAGE_MODEL = 'gemini-3-pro-image-preview';
export const VEO_31_FAST_MODEL: Exclude<SceneVideoModelOverride, null> = 'veo-3.1-fast';
export const SORA_DURATIONS = [4, 8, 12] as const;
export const VEO_31_FAST_DURATIONS = [4, 6, 8] as const;
export const SORA_2_720P_COST_PER_SEC = 0.10;
export const SORA_2_PRO_720P_COST_PER_SEC = 0.30;
export const SORA_2_PRO_1024P_COST_PER_SEC = 0.50;
export const VEO_31_FAST_COST_PER_SEC = 0.15;
export const GPT_IMAGE_15_HIGH_1536_1024_COST_PER_IMAGE = 0.20;
export const NANO_BANANA_PRO_COST_PER_IMAGE = 0.134;

export type SceneVideoChoice = 'sora' | 'veo31fast';

export function resolveImageModelByApi(imageApi: ImageApi): string {
  if (imageApi === 'nanobananapro') {
    return NANO_BANANA_PRO_IMAGE_MODEL;
  }
  return CHATGPT_IMAGE_MODEL;
}

export function getImageApiLabel(imageApi: ImageApi): string {
  return imageApi === 'nanobananapro' ? 'nano banana pro' : 'ChatGPT';
}

export function getSceneVideoChoice(scene: {
  videoApi: 'sora' | 'veo';
  videoModelOverride: SceneVideoModelOverride;
}): SceneVideoChoice {
  if (scene.videoApi === 'veo' && scene.videoModelOverride === VEO_31_FAST_MODEL) {
    return 'veo31fast';
  }
  return 'sora';
}

export function getSceneVideoSelection(choice: SceneVideoChoice): {
  videoApi: 'sora' | 'veo';
  videoModelOverride: SceneVideoModelOverride;
} {
  if (choice === 'veo31fast') {
    return {
      videoApi: 'veo',
      videoModelOverride: VEO_31_FAST_MODEL,
    };
  }
  return {
    videoApi: 'sora',
    videoModelOverride: null,
  };
}

export function getSceneVideoLabel(scene: {
  videoApi: 'sora' | 'veo';
  videoModelOverride: SceneVideoModelOverride;
}): string {
  return getSceneVideoChoice(scene) === 'veo31fast' ? 'Veo 3.1 Fast' : 'Sora';
}

export function quantizeVeo31FastDuration(sec: number): (typeof VEO_31_FAST_DURATIONS)[number] {
  const normalized = Number.isFinite(sec) ? sec : 4;
  if (normalized <= 4) return 4;
  if (normalized <= 6) return 6;
  return 8;
}

export function quantizeSoraDuration(sec: number): (typeof SORA_DURATIONS)[number] {
  const normalized = Number.isFinite(sec) ? sec : 8;
  return SORA_DURATIONS.reduce((prev, curr) =>
    Math.abs(curr - normalized) < Math.abs(prev - normalized) ? curr : prev
  );
}

export function getSoraCostPerSec(modelName: string, resolution: string): number {
  const normalizedModel = modelName.trim().toLowerCase();
  if (normalizedModel === 'sora-2-pro') {
    if (resolution === '1792x1024' || resolution === '1024x1792') {
      return SORA_2_PRO_1024P_COST_PER_SEC;
    }
    return SORA_2_PRO_720P_COST_PER_SEC;
  }
  return SORA_2_720P_COST_PER_SEC;
}

export function estimateImageCostPerScene(imageApi: ImageApi): number {
  if (imageApi === 'nanobananapro') {
    return NANO_BANANA_PRO_COST_PER_IMAGE;
  }
  return GPT_IMAGE_15_HIGH_1536_1024_COST_PER_IMAGE;
}
