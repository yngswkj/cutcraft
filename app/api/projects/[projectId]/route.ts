import { NextResponse } from 'next/server';
import { getProject, updateProject, deleteProject, withProjectLock } from '@/lib/project-store';
import type {
  CharacterProfile,
  ImageApi,
  ImageStyleGuide,
  Project,
  PromptMetadata,
  Scene,
  SceneVideoModelOverride,
  SceneImage,
  VideoApiPreference,
  VideoGeneration,
  VideoStatus,
  WorkflowStep,
} from '@/types/project';
import { VEO_31_FAST_MODEL } from '@/lib/scene-models';

const SAFE_PROJECT_ID_REGEX = /^[A-Za-z0-9-]+$/;
const SAFE_ID_REGEX = /^[A-Za-z0-9-]+$/;
const SAFE_FILENAME_REGEX = /^[A-Za-z0-9._-]+$/;
const SAFE_IMAGE_PATH_REGEX = /^images\/[A-Za-z0-9._-]+$/;
const WORKFLOW_STEPS = new Set<WorkflowStep>(['blueprint', 'imageboard', 'script', 'generate', 'complete']);
const VIDEO_API_PREFERENCES = new Set<VideoApiPreference>(['auto', 'sora', 'veo']);
const VIDEO_APIS = new Set<'sora' | 'veo'>(['sora', 'veo']);
const IMAGE_APIS = new Set<ImageApi>(['chatgpt', 'nanobananapro']);
const VIDEO_STATUSES = new Set<VideoStatus>(['queued', 'processing', 'completed', 'failed']);
const MAX_CHARACTER_COUNT = 30;
const MAX_CHARACTER_FIELD_LENGTH = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeProjectId(projectId: string): boolean {
  return SAFE_PROJECT_ID_REGEX.test(projectId);
}

function parseSafeId(value: unknown): string | null {
  if (typeof value !== 'string' || !SAFE_ID_REGEX.test(value)) return null;
  return value;
}

function parseString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value;
}

function parseNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function parseInteger(value: unknown, min: number, max: number): number | null {
  const parsed = parseNumber(value, min, max);
  if (parsed === null || !Number.isInteger(parsed)) return null;
  return parsed;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value !== 'boolean') return null;
  return value;
}

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return new Date(ts).toISOString();
}

function parseImageLocalPath(value: unknown, projectId: string): string | null {
  if (typeof value !== 'string') return null;
  const prefix = `/api/files/${projectId}/images/`;
  if (!value.startsWith(prefix)) return null;
  const filename = value.slice(prefix.length);
  if (!SAFE_FILENAME_REGEX.test(filename)) return null;
  return `${prefix}${filename}`;
}

function parseVideoLocalPath(value: unknown, projectId: string): string | null {
  if (typeof value !== 'string') return null;
  const prefix = `/api/files/${projectId}/videos/`;
  if (!value.startsWith(prefix)) return null;
  const filename = value.slice(prefix.length);
  if (!SAFE_FILENAME_REGEX.test(filename)) return null;
  return `${prefix}${filename}`;
}

function parseImagePath(value: unknown): string | null {
  if (typeof value !== 'string' || !SAFE_IMAGE_PATH_REGEX.test(value)) return null;
  return value;
}

function parsePromptMetadata(value: unknown): PromptMetadata | null {
  if (!isRecord(value)) return null;
  const cameraWork = parseString(value.cameraWork);
  const movement = parseString(value.movement);
  const lighting = parseString(value.lighting);
  const style = parseString(value.style);
  if (cameraWork === null || movement === null || lighting === null || style === null) {
    return null;
  }
  return { cameraWork, movement, lighting, style };
}

function parseImageStyleGuide(value: unknown): ImageStyleGuide | null {
  if (!isRecord(value)) return null;
  const styleBible = parseString(value.styleBible);
  const colorPalette = parseString(value.colorPalette);
  const lightingMood = parseString(value.lightingMood);
  const cameraLanguage = parseString(value.cameraLanguage);
  const negativePrompt = parseString(value.negativePrompt);

  if (
    styleBible === null ||
    colorPalette === null ||
    lightingMood === null ||
    cameraLanguage === null ||
    negativePrompt === null
  ) {
    return null;
  }

  if (
    styleBible.length > 4000 ||
    colorPalette.length > 4000 ||
    lightingMood.length > 4000 ||
    cameraLanguage.length > 4000 ||
    negativePrompt.length > 4000
  ) {
    return null;
  }

  return {
    styleBible,
    colorPalette,
    lightingMood,
    cameraLanguage,
    negativePrompt,
  };
}

function parseCharacterField(value: unknown): string | null {
  const text = parseString(value);
  if (text === null) return null;
  if (text.length > MAX_CHARACTER_FIELD_LENGTH) return null;
  return text;
}

function parseCharacterProfile(value: unknown): CharacterProfile | null {
  if (!isRecord(value)) return null;

  const id = parseSafeId(value.id);
  const name = parseCharacterField(value.name);
  const role = parseCharacterField(value.role);
  const ethnicityNationality = parseCharacterField(value.ethnicityNationality);
  const ageAppearance = parseCharacterField(value.ageAppearance);
  const genderPresentation = parseCharacterField(value.genderPresentation);
  const appearanceTraits = parseCharacterField(value.appearanceTraits);
  const wardrobe = parseCharacterField(value.wardrobe);
  const mustKeep = parseCharacterField(value.mustKeep);

  if (
    id === null ||
    name === null ||
    role === null ||
    ethnicityNationality === null ||
    ageAppearance === null ||
    genderPresentation === null ||
    appearanceTraits === null ||
    wardrobe === null ||
    mustKeep === null
  ) {
    return null;
  }

  return {
    id,
    name,
    role,
    ethnicityNationality,
    ageAppearance,
    genderPresentation,
    appearanceTraits,
    wardrobe,
    mustKeep,
  };
}

function parseCharacterBible(value: unknown): CharacterProfile[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_CHARACTER_COUNT) return null;

  const profiles: CharacterProfile[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < value.length; i += 1) {
    const profile = parseCharacterProfile(value[i]);
    if (!profile) return null;
    if (usedIds.has(profile.id)) return null;
    usedIds.add(profile.id);
    profiles.push(profile);
  }

  return profiles;
}

function parseSceneImage(value: unknown, sceneId: string, projectId: string): SceneImage | null {
  if (!isRecord(value)) return null;

  const id = parseSafeId(value.id);
  const prompt = parseString(value.prompt);
  const localPath = parseImageLocalPath(value.localPath, projectId);
  const width = parseInteger(value.width, 1, 10000);
  const height = parseInteger(value.height, 1, 10000);
  const createdAt = parseIsoDate(value.createdAt);

  if (
    id === null ||
    prompt === null ||
    localPath === null ||
    width === null ||
    height === null ||
    createdAt === null
  ) {
    return null;
  }

  return {
    id,
    sceneId,
    prompt,
    localPath,
    width,
    height,
    createdAt,
  };
}

function parseVideoGeneration(value: unknown, sceneId: string, projectId: string): VideoGeneration | null {
  if (!isRecord(value)) return null;

  const id = parseSafeId(value.id);
  const version = parseInteger(value.version, 1, 100000);
  const api = typeof value.api === 'string' && VIDEO_APIS.has(value.api as 'sora' | 'veo')
    ? value.api as 'sora' | 'veo'
    : null;
  const externalJobId = parseString(value.externalJobId);
  const status = typeof value.status === 'string' && VIDEO_STATUSES.has(value.status as VideoStatus)
    ? value.status as VideoStatus
    : null;
  const prompt = parseString(value.prompt);
  const durationSec = parseNumber(value.durationSec, 1, 120);
  const resolution = parseString(value.resolution);
  const estimatedCost = parseNumber(value.estimatedCost, 0, 1000000);
  let errorMessage: string | null;
  if (value.errorMessage === null || value.errorMessage === undefined) {
    errorMessage = null;
  } else {
    const parsed = parseString(value.errorMessage);
    if (parsed === null) return null;
    errorMessage = parsed;
  }
  const createdAt = parseIsoDate(value.createdAt);
  let completedAt: string | null;
  if (value.completedAt === null) {
    completedAt = null;
  } else {
    const parsed = parseIsoDate(value.completedAt);
    if (!parsed) return null;
    completedAt = parsed;
  }

  let inputImagePath: string | null;
  if (value.inputImagePath === null) {
    inputImagePath = null;
  } else {
    const parsed = parseImagePath(value.inputImagePath);
    if (!parsed) return null;
    inputImagePath = parsed;
  }

  let chainedFramePath: string | null;
  if (value.chainedFramePath === null) {
    chainedFramePath = null;
  } else {
    const parsed = parseImagePath(value.chainedFramePath);
    if (!parsed) return null;
    chainedFramePath = parsed;
  }

  let localPath: string | null;
  if (value.localPath === null) {
    localPath = null;
  } else {
    const parsed = parseVideoLocalPath(value.localPath, projectId);
    if (!parsed) return null;
    localPath = parsed;
  }

  if (
    id === null ||
    version === null ||
    api === null ||
    externalJobId === null ||
    status === null ||
    prompt === null ||
    durationSec === null ||
    resolution === null ||
    estimatedCost === null ||
    createdAt === null
  ) {
    return null;
  }

  return {
    id,
    sceneId,
    version,
    api,
    externalJobId,
    status,
    prompt,
    inputImagePath,
    chainedFramePath,
    localPath,
    durationSec,
    resolution,
    estimatedCost,
    errorMessage,
    createdAt,
    completedAt,
  };
}

function parseScene(value: unknown, fallbackOrder: number, projectId: string): Scene | null {
  if (!isRecord(value)) return null;

  const id = parseSafeId(value.id);
  const title = parseString(value.title);
  const description = parseString(value.description);
  const durationSec = parseInteger(value.durationSec, 1, 120);
  const styleDirection = parseString(value.styleDirection);
  const videoApi = typeof value.videoApi === 'string' && VIDEO_APIS.has(value.videoApi as 'sora' | 'veo')
    ? value.videoApi as 'sora' | 'veo'
    : null;
  const imageApi = (value.imageApi === null || value.imageApi === undefined)
    ? 'chatgpt'
    : (typeof value.imageApi === 'string' && IMAGE_APIS.has(value.imageApi as ImageApi)
      ? value.imageApi as ImageApi
      : null);
  let videoModelOverride: SceneVideoModelOverride;
  if (value.videoModelOverride === null || value.videoModelOverride === undefined || value.videoModelOverride === '') {
    videoModelOverride = null;
  } else if (value.videoModelOverride === VEO_31_FAST_MODEL) {
    videoModelOverride = VEO_31_FAST_MODEL;
  } else {
    return null;
  }

  if (
    id === null ||
    title === null ||
    description === null ||
    durationSec === null ||
    styleDirection === null ||
    videoApi === null ||
    imageApi === null
  ) {
    return null;
  }

  if (videoApi === 'sora') {
    videoModelOverride = null;
  } else if (videoModelOverride === null) {
    videoModelOverride = VEO_31_FAST_MODEL;
  }

  if ('images' in value && !Array.isArray(value.images)) return null;
  if ('generations' in value && !Array.isArray(value.generations)) return null;
  if ('castCharacterIds' in value && !Array.isArray(value.castCharacterIds)) return null;

  const castCharacterIdsRaw = Array.isArray(value.castCharacterIds) ? value.castCharacterIds : [];
  const castCharacterIds: string[] = [];
  const castIdSet = new Set<string>();
  for (const castIdRaw of castCharacterIdsRaw) {
    const castId = parseSafeId(castIdRaw);
    if (!castId) return null;
    if (castIdSet.has(castId)) continue;
    castIdSet.add(castId);
    castCharacterIds.push(castId);
  }

  const imagesRaw = Array.isArray(value.images) ? value.images : [];
  const images: SceneImage[] = [];
  for (const imageRaw of imagesRaw) {
    const image = parseSceneImage(imageRaw, id, projectId);
    if (!image) return null;
    images.push(image);
  }

  const imageIds = new Set(images.map((image) => image.id));
  let selectedImageId: string | null = null;
  if (value.selectedImageId !== null && value.selectedImageId !== undefined) {
    const candidate = parseSafeId(value.selectedImageId);
    if (!candidate || !imageIds.has(candidate)) return null;
    selectedImageId = candidate;
  }

  const promptMetadata = parsePromptMetadata(value.promptMetadata);
  if (!promptMetadata) return null;

  const generationsRaw = Array.isArray(value.generations) ? value.generations : [];
  const generations: VideoGeneration[] = [];
  for (const generationRaw of generationsRaw) {
    const generation = parseVideoGeneration(generationRaw, id, projectId);
    if (!generation) return null;
    generations.push(generation);
  }

  const generationMap = new Map(generations.map((generation) => [generation.id, generation]));
  let approvedGenerationId: string | null = null;
  if (value.approvedGenerationId !== null && value.approvedGenerationId !== undefined) {
    const candidate = parseSafeId(value.approvedGenerationId);
    if (!candidate) return null;
    const approved = generationMap.get(candidate);
    if (!approved || approved.status !== 'completed' || !approved.localPath) {
      return null;
    }
    approvedGenerationId = candidate;
  }

  const useAsVideoInput = parseBoolean(value.useAsVideoInput);
  const videoPrompt = parseString(value.videoPrompt);
  const chainFromPreviousScene = parseBoolean(value.chainFromPreviousScene);

  if (
    useAsVideoInput === null ||
    videoPrompt === null ||
    chainFromPreviousScene === null
  ) {
    return null;
  }

  return {
    id,
    order: fallbackOrder,
    title,
    description,
    durationSec,
    styleDirection,
    videoApi,
    videoModelOverride,
    imageApi,
    castCharacterIds,
    images,
    selectedImageId,
    useAsVideoInput,
    videoPrompt,
    promptMetadata,
    generations,
    approvedGenerationId,
    chainFromPreviousScene,
  };
}

function sanitizeProjectUpdate(existing: Project, body: unknown, projectId: string): Project {
  if (!isRecord(body)) {
    throw new Error('リクエストボディが不正です');
  }

  const next: Project = { ...existing };

  if ('name' in body) {
    const name = parseString(body.name);
    if (!name || name.trim().length === 0) {
      throw new Error('name が不正です');
    }
    next.name = name.trim();
  }

  if ('theme' in body) {
    const theme = parseString(body.theme);
    if (!theme || theme.trim().length === 0) {
      throw new Error('theme が不正です');
    }
    next.theme = theme.trim();
  }

  if ('totalDurationSec' in body) {
    const totalDurationSec = parseInteger(body.totalDurationSec, 1, 3600);
    if (totalDurationSec === null) {
      throw new Error('totalDurationSec が不正です');
    }
    next.totalDurationSec = totalDurationSec;
  }

  if ('currentStep' in body) {
    const currentStep = typeof body.currentStep === 'string' &&
      WORKFLOW_STEPS.has(body.currentStep as WorkflowStep)
      ? body.currentStep as WorkflowStep
      : null;
    if (!currentStep) {
      throw new Error('currentStep が不正です');
    }
    next.currentStep = currentStep;
  }

  if ('videoApiPreference' in body) {
    const videoApiPreference = typeof body.videoApiPreference === 'string' &&
      VIDEO_API_PREFERENCES.has(body.videoApiPreference as VideoApiPreference)
      ? body.videoApiPreference as VideoApiPreference
      : null;
    if (!videoApiPreference) {
      throw new Error('videoApiPreference が不正です');
    }
    next.videoApiPreference = videoApiPreference;
  }

  if ('imageStyleGuide' in body) {
    const imageStyleGuide = parseImageStyleGuide(body.imageStyleGuide);
    if (!imageStyleGuide) {
      throw new Error('imageStyleGuide が不正です');
    }
    next.imageStyleGuide = imageStyleGuide;
  }

  if ('characterBible' in body) {
    const characterBible = parseCharacterBible(body.characterBible);
    if (!characterBible) {
      throw new Error('characterBible が不正です');
    }
    next.characterBible = characterBible;
  }

  if ('scenes' in body) {
    if (!Array.isArray(body.scenes)) {
      throw new Error('scenes が不正です');
    }

    const scenes: Scene[] = [];
    for (let i = 0; i < body.scenes.length; i += 1) {
      const parsed = parseScene(body.scenes[i], i, projectId);
      if (!parsed) {
        throw new Error(`scenes[${i}] が不正です`);
      }
      scenes.push({ ...parsed, order: i });
    }
    next.scenes = scenes;
  }

  const validCharacterIds = new Set(next.characterBible.map((character) => character.id));
  next.scenes = next.scenes.map((scene) => ({
    ...scene,
    castCharacterIds: scene.castCharacterIds.filter((id) => validCharacterIds.has(id)),
  }));

  return next;
}

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  if (!isSafeProjectId(params.projectId)) {
    return NextResponse.json({ error: '不正なprojectIdです' }, { status: 400 });
  }

  const project = await getProject(params.projectId);
  if (!project) {
    return NextResponse.json({ error: 'プロジェクトが見つかりません' }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PUT(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  if (!isSafeProjectId(params.projectId)) {
    return NextResponse.json({ error: '不正なprojectIdです' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 });
  }

  try {
    const { result: updated } = await withProjectLock(params.projectId, async (existing) => {
      const sanitized = sanitizeProjectUpdate(existing, body, params.projectId);
      return { project: { ...sanitized, id: existing.id }, result: { ...sanitized, id: existing.id } };
    });
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新データが不正です';
    if (message === 'プロジェクトが見つかりません') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  if (!isSafeProjectId(params.projectId)) {
    return NextResponse.json({ error: '不正なprojectIdです' }, { status: 400 });
  }

  await deleteProject(params.projectId);
  return NextResponse.json({ ok: true });
}
