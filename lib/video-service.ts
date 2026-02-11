import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI, type GenerateVideosOperation } from '@google/genai';
import type { VideoGeneration, VideoStatus } from '@/types/project';
import { getProjectDir } from './file-storage';
import { getEffectiveSettings } from './settings';

// ===== Sora (OpenAI) =====
const OPENAI_API_BASE = 'https://api.openai.com/v1';
const SAFE_IMAGE_PATH_REGEX = /^images\/[A-Za-z0-9._-]+$/;

async function getOpenAIKey(): Promise<string> {
  const settings = await getEffectiveSettings();
  const key = settings.apiKeys.openaiApiKey;
  if (!key) {
    throw new Error('OPENAI_API_KEY が設定されていません（設定画面または .env.local）');
  }
  return key;
}

async function getGeminiClient(): Promise<GoogleGenAI> {
  const settings = await getEffectiveSettings();
  const key = settings.apiKeys.googleAiApiKey;
  if (!key) {
    throw new Error('GOOGLE_AI_API_KEY が設定されていません（設定画面または .env.local）');
  }
  return new GoogleGenAI({ apiKey: key });
}

async function soraRequest(endpoint: string, options?: RequestInit) {
  const openAIKey = await getOpenAIKey();
  const headers = new Headers(options?.headers || {});
  headers.set('Authorization', `Bearer ${openAIKey}`);
  if (!headers.has('Content-Type') && options?.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${OPENAI_API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sora API error (${res.status}): ${body}`);
  }
  return res;
}

function nearestSoraDuration(sec: number): number {
  const options = [4, 8, 12];
  return options.reduce((prev, curr) =>
    Math.abs(curr - sec) < Math.abs(prev - sec) ? curr : prev
  );
}

function nearestVeoDuration(sec: number): number {
  if (sec <= 5) return 5;
  return Math.min(sec, 8);
}

function getSoraCostPerSec(modelName: string): number {
  const normalized = modelName.trim().toLowerCase();
  if (normalized === 'sora-2-pro') return 0.30;
  if (normalized === 'sora-2') return 0.10;
  return 0.10;
}

function resolveProjectImagePath(projectId: string, imagePath: string): string {
  if (!SAFE_IMAGE_PATH_REGEX.test(imagePath)) {
    throw new Error('不正な入力画像パスです');
  }

  const projectDir = path.resolve(getProjectDir(projectId));
  const imagesDir = path.resolve(projectDir, 'images');
  const absPath = path.resolve(projectDir, imagePath);

  if (!absPath.startsWith(`${imagesDir}${path.sep}`)) {
    throw new Error('入力画像パスが不正です');
  }

  return absPath;
}

function getImageMimeType(imagePath: string): 'image/png' | 'image/jpeg' {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  throw new Error('未対応の画像形式です');
}

// ===== 共通インターフェース =====

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
  return await startVeoGeneration(id, params);
}

// ===== Sora 生成 =====

async function startSoraGeneration(
  id: string,
  params: GenerateVideoParams
): Promise<VideoGeneration> {
  const settings = await getEffectiveSettings();
  const duration = nearestSoraDuration(params.durationSec);

  const formData = new FormData();
  formData.append('model', settings.models.soraModel);
  formData.append('prompt', params.prompt);
  formData.append('seconds', String(duration));
  formData.append('size', '1280x720');

  if (params.inputImagePath) {
    const absPath = resolveProjectImagePath(params.projectId, params.inputImagePath);
    const imageData = await fs.readFile(absPath);
    const mimeType = getImageMimeType(absPath);
    const blob = new Blob([imageData], { type: mimeType });
    formData.append('input_reference', blob, path.basename(absPath));
  }

  const res = await soraRequest('/videos', {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();

  const costPerSec = getSoraCostPerSec(settings.models.soraModel);
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

// ===== Veo 生成 =====

async function startVeoGeneration(
  id: string,
  params: GenerateVideoParams
): Promise<VideoGeneration> {
  const settings = await getEffectiveSettings();
  const duration = nearestVeoDuration(params.durationSec);
  const ai = await getGeminiClient();

  const config: Record<string, unknown> = {
    numberOfVideos: 1,
    durationSeconds: duration,
    aspectRatio: '16:9',
  };

  // image-to-video: 入力画像がある場合
  if (params.inputImagePath) {
    const absPath = resolveProjectImagePath(params.projectId, params.inputImagePath);
    const imageData = await fs.readFile(absPath);
    const base64 = imageData.toString('base64');
    const mimeType = getImageMimeType(absPath);
    config.image = {
      imageBytes: base64,
      mimeType,
    };
  }

  const operation = await ai.models.generateVideos({
    model: settings.models.veoModel,
    prompt: params.prompt,
    config,
  });

  const costPerSec = 0.75;
  return {
    id,
    sceneId: params.sceneId,
    version: params.version,
    api: 'veo',
    externalJobId: operation.name || '',
    status: 'processing' as VideoStatus,
    prompt: params.prompt,
    inputImagePath: params.inputImagePath || null,
    chainedFramePath: null,
    localPath: null,
    durationSec: duration,
    resolution: '1920x1080',
    estimatedCost: duration * costPerSec,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
}

// ===== ステータス確認 =====

export async function checkVideoStatus(
  generation: VideoGeneration
): Promise<VideoGeneration> {
  if (generation.api === 'sora') {
    return checkSoraStatus(generation);
  }
  return checkVeoStatus(generation);
}

async function checkSoraStatus(generation: VideoGeneration): Promise<VideoGeneration> {
  try {
    const res = await soraRequest(`/videos/${generation.externalJobId}`, {
      method: 'GET',
    });
    const data = await res.json();

    if (data.status === 'completed') {
      return { ...generation, status: 'completed', completedAt: new Date().toISOString() };
    } else if (data.status === 'failed' || data.status === 'cancelled') {
      return { ...generation, status: 'failed' };
    }
    return { ...generation, status: 'processing' };
  } catch {
    return generation;
  }
}

async function checkVeoStatus(generation: VideoGeneration): Promise<VideoGeneration> {
  try {
    const ai = await getGeminiClient();
    const operationRef = { name: generation.externalJobId } as GenerateVideosOperation;
    const operation = await ai.operations.getVideosOperation({ operation: operationRef });

    if (operation.done) {
      const hasError = Boolean((operation as { error?: unknown }).error);
      const generatedVideos = operation.response?.generatedVideos;
      const hasVideos = Array.isArray(generatedVideos) && generatedVideos.length > 0;
      if (hasError || !hasVideos) {
        return { ...generation, status: 'failed', completedAt: new Date().toISOString() };
      }
      return { ...generation, status: 'completed', completedAt: new Date().toISOString() };
    }
    return { ...generation, status: 'processing' };
  } catch {
    return generation;
  }
}

// ===== 動画ダウンロード =====

export async function downloadVideo(
  generation: VideoGeneration,
  projectId: string
): Promise<string> {
  const videoDir = path.join(getProjectDir(projectId), 'videos');
  await fs.mkdir(videoDir, { recursive: true });
  const filename = `${generation.sceneId}_v${generation.version}.mp4`;
  const filePath = path.join(videoDir, filename);

  if (generation.api === 'sora') {
    await downloadSoraVideo(generation, filePath);
  } else {
    await downloadVeoVideo(generation, filePath);
  }

  return `/api/files/${projectId}/videos/${filename}`;
}

async function downloadSoraVideo(generation: VideoGeneration, filePath: string): Promise<void> {
  const res = await soraRequest(`/videos/${generation.externalJobId}/content`, {
    method: 'GET',
  });

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(filePath, buffer);
}

async function downloadVeoVideo(generation: VideoGeneration, filePath: string): Promise<void> {
  const ai = await getGeminiClient();
  const operationRef = { name: generation.externalJobId } as GenerateVideosOperation;
  const operation = await ai.operations.getVideosOperation({ operation: operationRef });

  if (!operation.done) {
    throw new Error('動画生成がまだ完了していません');
  }

  if (!operation.response) {
    throw new Error('Veo APIからのレスポンスが空です');
  }

  const videos = operation.response.generatedVideos;
  if (!videos || videos.length === 0) {
    throw new Error('生成された動画が見つかりません');
  }

  const video = videos[0].video;
  if (!video) {
    throw new Error('動画データが取得できませんでした');
  }

  if (video.uri) {
    const videoRes = await fetch(video.uri);
    if (!videoRes.ok) {
      throw new Error(`動画ダウンロードに失敗しました (${videoRes.status})`);
    }
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    await fs.writeFile(filePath, buffer);
  } else if (video.videoBytes) {
    const buffer = Buffer.from(video.videoBytes, 'base64');
    await fs.writeFile(filePath, buffer);
  } else {
    throw new Error('動画データが取得できませんでした');
  }
}

// ===== シーンチェーン: 最終フレーム抽出 =====

export async function extractLastFrame(
  videoPath: string,
  outputPath: string,
): Promise<void> {
  const { spawn } = await import('child_process');

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(
      'ffmpeg',
      ['-sseof', '-1', '-i', videoPath, '-frames:v', '1', '-update', '1', '-y', outputPath],
      { windowsHide: true },
    );

    let stderr = '';
    ffmpeg.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg execution failed (${code}): ${stderr.trim()}`));
    });
  });
}

export async function getChainedFramePath(
  projectId: string,
  previousSceneId: string,
  previousVersion: number,
): Promise<string | null> {
  const videoDir = path.join(getProjectDir(projectId), 'videos');
  const videoFilename = `${previousSceneId}_v${previousVersion}.mp4`;
  const videoPath = path.join(videoDir, videoFilename);

  try {
    await fs.access(videoPath);
  } catch {
    return null;
  }

  const frameFilename = `${previousSceneId}_v${previousVersion}_lastframe.png`;
  const framePath = path.join(getProjectDir(projectId), 'images', frameFilename);

  await extractLastFrame(videoPath, framePath);

  return `images/${frameFilename}`;
}
