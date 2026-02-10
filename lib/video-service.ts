import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { VideoGeneration, VideoStatus } from '@/types/project';
import { getProjectDir } from './file-storage';

const OPENAI_API_BASE = 'https://api.openai.com/v1';

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY が設定されていません');
  return key;
}

async function soraRequest(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${OPENAI_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sora API error (${res.status}): ${body}`);
  }
  return res;
}

// Soraの対応秒数に丸める
function nearestSoraDuration(sec: number): number {
  const options = [5, 10, 15, 20];
  return options.reduce((prev, curr) =>
    Math.abs(curr - sec) < Math.abs(prev - sec) ? curr : prev
  );
}

export interface GenerateVideoParams {
  projectId: string;
  sceneId: string;
  prompt: string;
  durationSec: number;
  api: 'sora' | 'veo';
  inputImagePath?: string;
  version: number;
}

export async function startVideoGeneration(params: GenerateVideoParams): Promise<VideoGeneration> {
  const id = uuidv4();

  if (params.api === 'sora') {
    return await startSoraGeneration(id, params);
  }
  // Veo対応は Phase 3 で実装
  throw new Error('Veo APIは未実装です。Phase 3で対応予定。');
}

async function startSoraGeneration(
  id: string,
  params: GenerateVideoParams
): Promise<VideoGeneration> {
  const duration = nearestSoraDuration(params.durationSec);

  const input: Record<string, unknown>[] = [
    { type: 'text', text: params.prompt },
  ];

  // image-to-video: 入力画像がある場合
  if (params.inputImagePath) {
    const normalized = path.normalize(params.inputImagePath).replace(/^([/\\])+/, '');
    const absPath = path.join(getProjectDir(params.projectId), normalized);
    const imageData = await fs.readFile(absPath);
    const base64 = imageData.toString('base64');
    const mimeType = normalized.endsWith('.png') ? 'image/png' : 'image/jpeg';
    input.push({
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${base64}`,
      },
    });
  }

  const res = await soraRequest('/videos/generations', {
    method: 'POST',
    body: JSON.stringify({
      model: 'sora',
      input,
      duration,
      aspect_ratio: '16:9',
      n: 1,
    }),
  });

  const data = await res.json();

  const costPerSec = 0.04; // 720p
  return {
    id,
    sceneId: params.sceneId,
    version: params.version,
    api: 'sora',
    externalJobId: data.id || '',
    status: 'processing' as VideoStatus,
    prompt: params.prompt,
    inputImagePath: params.inputImagePath || null,
    chainedFramePath: null,
    localPath: null,
    durationSec: duration,
    resolution: '1280x720',
    estimatedCost: duration * costPerSec,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
}

export async function checkVideoStatus(
  generation: VideoGeneration
): Promise<VideoGeneration> {
  if (generation.api !== 'sora') {
    return generation;
  }

  try {
    const res = await soraRequest(`/videos/generations/${generation.externalJobId}`, {
      method: 'GET',
    });
    const data = await res.json();

    if (data.status === 'completed') {
      return { ...generation, status: 'completed', completedAt: new Date().toISOString() };
    } else if (data.status === 'failed') {
      return { ...generation, status: 'failed' };
    }
    return { ...generation, status: 'processing' };
  } catch {
    return generation;
  }
}

export async function downloadVideo(
  generation: VideoGeneration,
  projectId: string
): Promise<string> {
  if (generation.api !== 'sora') {
    throw new Error('Veo APIは未実装です');
  }

  const res = await soraRequest(`/videos/generations/${generation.externalJobId}`, {
    method: 'GET',
  });
  const data = await res.json();

  // 動画URLを取得してダウンロード
  const videoUrl = data.data?.[0]?.url || data.url;
  if (!videoUrl) {
    throw new Error('動画URLが取得できませんでした');
  }

  const videoRes = await fetch(videoUrl);
  const buffer = Buffer.from(await videoRes.arrayBuffer());

  const videoDir = path.join(getProjectDir(projectId), 'videos');
  await fs.mkdir(videoDir, { recursive: true });
  const filename = `${generation.sceneId}_v${generation.version}.mp4`;
  const filePath = path.join(videoDir, filename);
  await fs.writeFile(filePath, buffer);

  return `/api/files/${projectId}/videos/${filename}`;
}
