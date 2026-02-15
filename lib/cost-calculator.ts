import type { Scene } from '@/types/project';
import {
  estimateImageCostPerScene,
  getSoraCostPerSec,
  quantizeSoraDuration,
  quantizeVeo31FastDuration,
  VEO_31_FAST_COST_PER_SEC,
} from './scene-models';

const DEFAULT_SORA_MODEL = 'sora-2';

interface EstimateOptions {
  soraModel?: string;
}

function resolveEstimatedSoraResolution(scene: Scene): string {
  if (!scene.useAsVideoInput || !scene.selectedImageId) {
    return '1280x720';
  }

  const selectedImage = scene.images.find((image) => image.id === scene.selectedImageId);
  if (!selectedImage) {
    return '1280x720';
  }

  return selectedImage.height > selectedImage.width ? '1024x1792' : '1792x1024';
}

export function estimateSceneCost(scene: Scene, options: EstimateOptions = {}): number {
  if (scene.videoApi === 'sora') {
    const model = options.soraModel || DEFAULT_SORA_MODEL;
    const duration = quantizeSoraDuration(scene.durationSec);
    const resolution = resolveEstimatedSoraResolution(scene);
    return duration * getSoraCostPerSec(model, resolution);
  }
  return quantizeVeo31FastDuration(scene.durationSec) * VEO_31_FAST_COST_PER_SEC;
}

export function estimateProjectCost(scenes: Scene[], options: EstimateOptions = {}): {
  videoCost: number;
  imageCost: number;
  total: number;
} {
  const videoCost = scenes.reduce((sum, scene) => sum + estimateSceneCost(scene, options), 0);
  const imageCost = scenes.reduce((sum, scene) => sum + estimateImageCostPerScene(scene.imageApi), 0);
  return {
    videoCost: Math.round(videoCost * 100) / 100,
    imageCost: Math.round(imageCost * 100) / 100,
    total: Math.round((videoCost + imageCost) * 100) / 100,
  };
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}
