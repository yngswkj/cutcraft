import type { Scene } from '@/types/project';

// USD単価
const COST_PER_SEC = {
  sora_480p: 0.02,
  sora_720p: 0.04,
  sora_1080p: 0.10,
  veo: 0.75,
  veo_fast: 0.40,
} as const;

const DALLE3_HD_COST = 0.12; // per image

export function estimateSceneCost(scene: Scene): number {
  if (scene.videoApi === 'sora') {
    return scene.durationSec * COST_PER_SEC.sora_720p;
  }
  return scene.durationSec * COST_PER_SEC.veo;
}

export function estimateProjectCost(scenes: Scene[]): {
  videoCost: number;
  imageCost: number;
  total: number;
} {
  const videoCost = scenes.reduce((sum, s) => sum + estimateSceneCost(s), 0);
  const imageCost = scenes.length * DALLE3_HD_COST;
  return {
    videoCost: Math.round(videoCost * 100) / 100,
    imageCost: Math.round(imageCost * 100) / 100,
    total: Math.round((videoCost + imageCost) * 100) / 100,
  };
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}
