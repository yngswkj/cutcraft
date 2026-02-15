import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI, type GenerateVideosOperation } from '@google/genai';
import sharp from 'sharp';
import type { VideoGeneration, VideoStatus } from '@/types/project';
import { getProjectDir } from './file-storage';
import { getEffectiveSettings } from './settings';
import { detectImageMimeType } from './image-utils';
import {
  getSoraCostPerSec,
  quantizeSoraDuration,
  quantizeVeo31FastDuration,
  VEO_31_FAST_COST_PER_SEC,
} from './scene-models';

// ===== Sora (OpenAI) =====
const OPENAI_API_BASE = 'https://api.openai.com/v1';
const SAFE_IMAGE_PATH_REGEX = /^images\/[A-Za-z0-9._-]+$/;
const SORA_MODERATION_MODEL = 'omni-moderation-latest';
const SORA_SUPPORTED_RESOLUTIONS = [
  { label: '1280x720', width: 1280, height: 720 },
  { label: '1792x1024', width: 1792, height: 1024 },
  { label: '720x1280', width: 720, height: 1280 },
  { label: '1024x1792', width: 1024, height: 1792 },
] as const;
const VEO_MODEL_ALIAS_TO_CANONICAL: Record<string, string> = {
  'veo-3.1-fast': 'models/veo-3.1-fast-generate-preview',
  'models/veo-3.1-fast': 'models/veo-3.1-fast-generate-preview',
  'veo-3.1-fast-generate-preview': 'models/veo-3.1-fast-generate-preview',
  'models/veo-3.1-fast-generate-preview': 'models/veo-3.1-fast-generate-preview',
};
type SoraResolution = (typeof SORA_SUPPORTED_RESOLUTIONS)[number];
type SoraModerationResult = { flagged: boolean; reason: string | null };

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function summarizeErrorDetail(detail: unknown): string | null {
  if (detail instanceof Error) {
    return detail.message.trim() || null;
  }
  if (typeof detail === 'string') {
    const text = detail.trim();
    return text.length > 0 ? text : null;
  }
  if (typeof detail === 'number' || typeof detail === 'boolean') {
    return String(detail);
  }
  if (Array.isArray(detail)) {
    for (const item of detail) {
      const text = summarizeErrorDetail(item);
      if (text) return text;
    }
    return null;
  }

  const record = toRecord(detail);
  if (record) {
    const candidates = [
      record.message,
      record.error,
      record.reason,
      record.failure_reason,
      record.last_error,
      record.detail,
      record.details,
      record.status_details,
    ];
    for (const candidate of candidates) {
      const text = summarizeErrorDetail(candidate);
      if (text) return text;
    }
  }

  try {
    return JSON.stringify(detail);
  } catch {
    return null;
  }
}

function toFailedGeneration(generation: VideoGeneration, message: string): VideoGeneration {
  return {
    ...generation,
    status: 'failed',
    completedAt: generation.completedAt ?? new Date().toISOString(),
    errorMessage: message.slice(0, 2000),
  };
}

function isSoraModerationBlockedError(error: unknown): boolean {
  const detail = summarizeErrorDetail(error)?.toLowerCase() || '';
  return detail.includes('blocked by our moderation system')
    || (detail.includes('moderation') && detail.includes('sora api error'));
}

function sanitizePromptForModeration(prompt: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\b(kill|killing|murder|assassinate|execute|slaughter)\b/gi, 'defeat'],
    [/\b(blood|bloody|gore|gory|behead|dismember)\b/gi, 'dramatic'],
    [/\b(nude|nudity|sexual|sex|explicit)\b/gi, 'safe'],
    [/\b(terrorist|bomb|explosion attack)\b/gi, 'high tension'],
    [/\b(suicide|self-harm)\b/gi, 'emotional struggle'],
    [/殺す|殺害|流血|残虐|自殺|裸体|性的/gu, '安全な表現'],
  ];

  let sanitized = prompt;
  for (const [pattern, replacement] of replacements) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  const safetyGuardrail = ' Keep the scene PG-13, non-graphic, non-sexual, and policy-compliant.';
  if (!sanitized.toLowerCase().includes('policy-compliant')) {
    sanitized += safetyGuardrail;
  }
  return sanitized;
}

async function runSoraTextModeration(openAIKey: string, prompt: string): Promise<SoraModerationResult> {
  try {
    const res = await soraRequest(openAIKey, '/moderations', {
      method: 'POST',
      body: JSON.stringify({
        model: SORA_MODERATION_MODEL,
        input: prompt,
      }),
    });
    const data = await res.json() as unknown;
    const record = toRecord(data);
    const results = Array.isArray(record?.results) ? record.results : [];
    const first = results.length > 0 ? toRecord(results[0]) : null;
    const flagged = first?.flagged === true;

    if (!flagged) {
      return { flagged: false, reason: null };
    }

    const categories = toRecord(first?.categories);
    const categoryNames = categories
      ? Object.entries(categories)
        .filter(([, value]) => value === true)
        .map(([key]) => key)
      : [];
    const reason = categoryNames.length > 0
      ? `moderation categories: ${categoryNames.join(', ')}`
      : 'flagged by moderation';

    return { flagged: true, reason };
  } catch {
    // モデレーションAPI自体の障害で動画生成を止めない
    return { flagged: false, reason: null };
  }
}

function requireOpenAIKey(settings: Awaited<ReturnType<typeof getEffectiveSettings>>): string {
  const key = settings.apiKeys.openaiApiKey;
  if (!key) {
    throw new Error('OPENAI_API_KEY が設定されていません（設定画面または .env.local）');
  }
  return key;
}

function requireGeminiClient(settings: Awaited<ReturnType<typeof getEffectiveSettings>>): GoogleGenAI {
  const key = settings.apiKeys.googleAiApiKey;
  if (!key) {
    throw new Error('GOOGLE_AI_API_KEY が設定されていません（設定画面または .env.local）');
  }
  return new GoogleGenAI({ apiKey: key });
}

async function soraRequest(openAIKey: string, endpoint: string, options?: RequestInit) {
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

function nearestSoraResolution(width: number, height: number): SoraResolution {
  const isPortrait = height > width;
  const candidates = SORA_SUPPORTED_RESOLUTIONS.filter((item) =>
    isPortrait ? item.height > item.width : item.width > item.height
  );

  const nearest = candidates.reduce((prev, curr) => {
    const prevDiff = Math.abs(prev.width - width) + Math.abs(prev.height - height);
    const currDiff = Math.abs(curr.width - width) + Math.abs(curr.height - height);
    return currDiff < prevDiff ? curr : prev;
  });

  return nearest;
}

async function resizeImageForSora(
  imageData: Buffer,
  mimeType: 'image/png' | 'image/jpeg',
  target: SoraResolution
): Promise<Buffer> {
  const transformer = sharp(imageData).resize(target.width, target.height, {
    fit: 'cover',
    position: 'centre',
  });

  if (mimeType === 'image/png') {
    return await transformer.png().toBuffer();
  }

  return await transformer.jpeg({ quality: 95 }).toBuffer();
}

function resolveVeoModelName(modelName: string): string {
  const trimmed = modelName.trim();
  const normalized = modelName.trim().toLowerCase();
  const aliased = VEO_MODEL_ALIAS_TO_CANONICAL[normalized];
  if (aliased) {
    return aliased;
  }
  if (normalized.startsWith('models/')) {
    return trimmed;
  }
  if (normalized.startsWith('veo-')) {
    return `models/${trimmed}`;
  }
  return trimmed;
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

function getImageMimeType(
  imageData: Buffer,
  imagePath: string
): 'image/png' | 'image/jpeg' {
  return detectImageMimeType(imageData, imagePath);
}

function parsePngDimensions(imageData: Buffer): { width: number; height: number } {
  const pngSignature = '89504e470d0a1a0a';
  if (imageData.length < 24 || imageData.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error('PNG画像の解析に失敗しました');
  }

  const width = imageData.readUInt32BE(16);
  const height = imageData.readUInt32BE(20);

  if (width <= 0 || height <= 0) {
    throw new Error('PNG画像のサイズが不正です');
  }

  return { width, height };
}

function parseJpegDimensions(imageData: Buffer): { width: number; height: number } {
  if (imageData.length < 4 || imageData[0] !== 0xff || imageData[1] !== 0xd8) {
    throw new Error('JPEG画像の解析に失敗しました');
  }

  let offset = 2;
  while (offset + 9 < imageData.length) {
    if (imageData[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = imageData[offset + 1];
    offset += 2;

    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }

    if (offset + 2 > imageData.length) break;
    const segmentLength = imageData.readUInt16BE(offset);

    if (segmentLength < 2 || offset + segmentLength > imageData.length) {
      break;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame) {
      if (segmentLength < 7) break;
      const height = imageData.readUInt16BE(offset + 3);
      const width = imageData.readUInt16BE(offset + 5);

      if (width <= 0 || height <= 0) {
        throw new Error('JPEG画像のサイズが不正です');
      }
      return { width, height };
    }

    offset += segmentLength;
  }

  throw new Error('JPEG画像のサイズを取得できませんでした');
}

function getImageDimensions(
  imageData: Buffer,
  mimeType: 'image/png' | 'image/jpeg'
): { width: number; height: number } {
  if (mimeType === 'image/png') {
    return parsePngDimensions(imageData);
  }
  return parseJpegDimensions(imageData);
}

// ===== 共通インターフェース =====

export interface GenerateVideoParams {
  projectId: string;
  sceneId: string;
  prompt: string;
  durationSec: number;
  api: 'sora' | 'veo';
  modelOverride?: string;
  inputImagePath?: string;
  version: number;
}

export async function startVideoGeneration(params: GenerateVideoParams): Promise<VideoGeneration> {
  const id = uuidv4();
  const settings = await getEffectiveSettings();

  if (params.api === 'sora') {
    return await startSoraGeneration(id, params, settings);
  }
  return await startVeoGeneration(id, params, settings);
}

// ===== Sora 生成 =====

async function startSoraGeneration(
  id: string,
  params: GenerateVideoParams,
  settings: Awaited<ReturnType<typeof getEffectiveSettings>>,
): Promise<VideoGeneration> {
  const openAIKey = requireOpenAIKey(settings);
  const duration = quantizeSoraDuration(params.durationSec);
  let resolution = '1280x720';
  let uploadImageData: Buffer | null = null;
  let uploadMimeType: 'image/png' | 'image/jpeg' | null = null;
  let uploadFilename: string | null = null;

  if (params.inputImagePath) {
    const absPath = resolveProjectImagePath(params.projectId, params.inputImagePath);
    const sourceImageData = await fs.readFile(absPath);
    const sourceMimeType = getImageMimeType(sourceImageData, absPath);
    const dimensions = getImageDimensions(sourceImageData, sourceMimeType);
    const targetResolution = nearestSoraResolution(dimensions.width, dimensions.height);
    resolution = targetResolution.label;

    const requiresResize =
      dimensions.width !== targetResolution.width ||
      dimensions.height !== targetResolution.height;
    uploadImageData = requiresResize
      ? await resizeImageForSora(sourceImageData, sourceMimeType, targetResolution)
      : sourceImageData;
    uploadMimeType = sourceMimeType;
    const parsedName = path.parse(absPath).name;
    uploadFilename = uploadMimeType === 'image/png' ? `${parsedName}.png` : `${parsedName}.jpg`;
  }
  const submitSoraRequest = async (prompt: string): Promise<Record<string, unknown>> => {
    const formData = new FormData();
    formData.append('model', settings.models.soraModel);
    formData.append('prompt', prompt);
    formData.append('seconds', String(duration));
    formData.append('size', resolution);

    if (uploadImageData && uploadMimeType && uploadFilename) {
      const blob = new Blob([new Uint8Array(uploadImageData)], { type: uploadMimeType });
      formData.append('input_reference', blob, uploadFilename);
    }

    const res = await soraRequest(openAIKey, '/videos', {
      method: 'POST',
      body: formData,
    });
    return await res.json() as Record<string, unknown>;
  };

  const moderation = await runSoraTextModeration(openAIKey, params.prompt);
  let promptForRequest = moderation.flagged
    ? sanitizePromptForModeration(params.prompt)
    : params.prompt;

  let data: Record<string, unknown>;
  try {
    data = await submitSoraRequest(promptForRequest);
  } catch (error) {
    if (!isSoraModerationBlockedError(error)) {
      throw error;
    }

    const retriedPrompt = sanitizePromptForModeration(promptForRequest);
    const canRetry = retriedPrompt !== promptForRequest;
    if (!canRetry) {
      if (params.inputImagePath) {
        throw new Error(
          'Soraのモデレーションによりブロックされました。入力画像またはプロンプトをより安全な内容に変更してください。'
        );
      }
      throw error;
    }

    promptForRequest = retriedPrompt;
    try {
      data = await submitSoraRequest(promptForRequest);
    } catch (retryError) {
      if (isSoraModerationBlockedError(retryError) && params.inputImagePath) {
        const moderationHint = moderation.reason ? ` (${moderation.reason})` : '';
        throw new Error(
          `Soraのモデレーションによりブロックされました${moderationHint}。入力画像またはプロンプトをより安全な内容に変更してください。`
        );
      }
      throw retryError;
    }
  }

  const costPerSec = getSoraCostPerSec(settings.models.soraModel, resolution);
  return {
    id,
    sceneId: params.sceneId,
    version: params.version,
    api: 'sora',
    externalJobId: typeof data.id === 'string' ? data.id : '',
    status: 'processing' as VideoStatus,
    prompt: promptForRequest,
    inputImagePath: params.inputImagePath || null,
    chainedFramePath: null,
    localPath: null,
    durationSec: duration,
    resolution,
    estimatedCost: duration * costPerSec,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
}

// ===== Veo 生成 =====

async function startVeoGeneration(
  id: string,
  params: GenerateVideoParams,
  settings: Awaited<ReturnType<typeof getEffectiveSettings>>,
): Promise<VideoGeneration> {
  const requestedDuration = params.durationSec;
  const duration = quantizeVeo31FastDuration(requestedDuration);
  const requestedModel = (params.modelOverride || settings.models.veoModel).trim();
  const selectedModel = resolveVeoModelName(requestedModel);
  const ai = requireGeminiClient(settings);

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
    const mimeType = getImageMimeType(imageData, absPath);
    config.image = {
      imageBytes: base64,
      mimeType,
    };
  }

  let operation: GenerateVideosOperation;
  try {
    operation = await ai.models.generateVideos({
      model: selectedModel,
      prompt: params.prompt,
      config,
    });
  } catch (error) {
    const detail = summarizeErrorDetail(error) || 'Veo API呼び出しに失敗しました';
    throw new Error(
      `Veo API呼び出しに失敗しました (requestedModel: ${requestedModel}, resolvedModel: ${selectedModel}, requestedDuration: ${requestedDuration}, resolvedDuration: ${duration}): ${detail}`,
    );
  }

  const costPerSec = VEO_31_FAST_COST_PER_SEC;
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
    errorMessage: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
}

// ===== ステータス確認 =====

export async function checkVideoStatus(
  generation: VideoGeneration
): Promise<VideoGeneration> {
  const settings = await getEffectiveSettings();
  if (generation.api === 'sora') {
    return checkSoraStatus(generation, requireOpenAIKey(settings));
  }
  return checkVeoStatus(generation, requireGeminiClient(settings));
}

async function checkSoraStatus(generation: VideoGeneration, openAIKey: string): Promise<VideoGeneration> {
  try {
    const res = await soraRequest(openAIKey, `/videos/${generation.externalJobId}`, {
      method: 'GET',
    });
    const data = await res.json() as unknown;
    const record = toRecord(data);
    const status = typeof record?.status === 'string' ? record.status : '';

    if (status === 'completed') {
      return {
        ...generation,
        status: 'completed',
        completedAt: new Date().toISOString(),
        errorMessage: null,
      };
    }

    if (status === 'failed' || status === 'cancelled') {
      const detail = summarizeErrorDetail(record) || `Soraジョブが${status}になりました`;
      return toFailedGeneration(generation, detail);
    }

    if (status.length > 0) {
      return { ...generation, status: 'processing', errorMessage: null };
    }

    return toFailedGeneration(generation, 'Soraステータスが取得できませんでした');
  } catch (error) {
    const detail = summarizeErrorDetail(error) || 'Soraステータス確認に失敗しました';
    return toFailedGeneration(generation, detail);
  }
}

async function checkVeoStatus(generation: VideoGeneration, ai: GoogleGenAI): Promise<VideoGeneration> {
  try {
    const operationRef = { name: generation.externalJobId } as GenerateVideosOperation;
    const operation = await ai.operations.getVideosOperation({ operation: operationRef });

    if (operation.done) {
      const hasError = Boolean((operation as { error?: unknown }).error);
      const generatedVideos = operation.response?.generatedVideos;
      const hasVideos = Array.isArray(generatedVideos) && generatedVideos.length > 0;
      if (hasError || !hasVideos) {
        const detail = summarizeErrorDetail((operation as { error?: unknown }).error)
          || 'Veoジョブが失敗しました';
        return toFailedGeneration(generation, detail);
      }
      return {
        ...generation,
        status: 'completed',
        completedAt: new Date().toISOString(),
        errorMessage: null,
      };
    }
    return { ...generation, status: 'processing', errorMessage: null };
  } catch (error) {
    const detail = summarizeErrorDetail(error) || 'Veoステータス確認に失敗しました';
    return toFailedGeneration(generation, detail);
  }
}

// ===== 動画ダウンロード =====

export async function downloadVideo(
  generation: VideoGeneration,
  projectId: string
): Promise<string> {
  const settings = await getEffectiveSettings();
  const videoDir = path.join(getProjectDir(projectId), 'videos');
  await fs.mkdir(videoDir, { recursive: true });
  const filename = `${generation.sceneId}_v${generation.version}.mp4`;
  const filePath = path.join(videoDir, filename);

  if (generation.api === 'sora') {
    await downloadSoraVideo(generation, filePath, requireOpenAIKey(settings));
  } else {
    await downloadVeoVideo(generation, filePath, requireGeminiClient(settings));
  }

  return `/api/files/${projectId}/videos/${filename}`;
}

async function downloadSoraVideo(generation: VideoGeneration, filePath: string, openAIKey: string): Promise<void> {
  const res = await soraRequest(openAIKey, `/videos/${generation.externalJobId}/content`, {
    method: 'GET',
  });

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(filePath, buffer);
}

async function downloadVeoVideo(generation: VideoGeneration, filePath: string, ai: GoogleGenAI): Promise<void> {
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
