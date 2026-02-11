import { v4 as uuidv4 } from 'uuid';
import type {
  BlueprintScene,
  CharacterProfile,
  ImageStyleGuide,
  Project,
  Scene,
  VideoApiPreference,
} from '@/types/project';
import {
  readJsonFile,
  writeJsonFile,
  deleteDir,
  listDirs,
  ensureProjectDir,
  getProjectDir,
  getProjectFilePath,
} from './file-storage';

export function getDefaultImageStyleGuide(): ImageStyleGuide {
  return {
    styleBible: '',
    colorPalette: '',
    lightingMood: '',
    cameraLanguage: '',
    negativePrompt: '',
  };
}

function normalizeCharacterText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeCharacterBible(value: unknown): CharacterProfile[] {
  if (!Array.isArray(value)) return [];

  const result: CharacterProfile[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < value.length; i += 1) {
    const raw = value[i];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      continue;
    }

    const asRecord = raw as Record<string, unknown>;
    const id = typeof asRecord.id === 'string' ? asRecord.id : '';
    if (!id || usedIds.has(id)) {
      continue;
    }
    usedIds.add(id);

    result.push({
      id,
      name: normalizeCharacterText(asRecord.name),
      role: normalizeCharacterText(asRecord.role),
      ethnicityNationality: normalizeCharacterText(asRecord.ethnicityNationality),
      ageAppearance: normalizeCharacterText(asRecord.ageAppearance),
      genderPresentation: normalizeCharacterText(asRecord.genderPresentation),
      appearanceTraits: normalizeCharacterText(asRecord.appearanceTraits),
      wardrobe: normalizeCharacterText(asRecord.wardrobe),
      mustKeep: normalizeCharacterText(asRecord.mustKeep),
    });
  }

  return result;
}

function normalizeImageStyleGuide(value: unknown): ImageStyleGuide {
  const base = getDefaultImageStyleGuide();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return base;
  }

  const asRecord = value as Record<string, unknown>;
  return {
    styleBible: typeof asRecord.styleBible === 'string' ? asRecord.styleBible : base.styleBible,
    colorPalette: typeof asRecord.colorPalette === 'string' ? asRecord.colorPalette : base.colorPalette,
    lightingMood: typeof asRecord.lightingMood === 'string' ? asRecord.lightingMood : base.lightingMood,
    cameraLanguage: typeof asRecord.cameraLanguage === 'string' ? asRecord.cameraLanguage : base.cameraLanguage,
    negativePrompt: typeof asRecord.negativePrompt === 'string' ? asRecord.negativePrompt : base.negativePrompt,
  };
}

function normalizeProject(project: Project): Project {
  const characterBible = normalizeCharacterBible(project.characterBible);
  const characterIdSet = new Set(characterBible.map((character) => character.id));
  const scenes = Array.isArray(project.scenes) ? project.scenes : [];

  return {
    ...project,
    imageStyleGuide: normalizeImageStyleGuide(project.imageStyleGuide),
    characterBible,
    scenes: scenes.map((scene) => {
      const castCharacterIds = Array.isArray(scene.castCharacterIds)
        ? scene.castCharacterIds.filter(
          (id): id is string => typeof id === 'string' && characterIdSet.has(id),
        )
        : [];

      return {
        ...scene,
        castCharacterIds,
      };
    }),
  };
}

export async function listProjects(): Promise<Project[]> {
  const ids = await listDirs(getProjectDir('').replace(/[/\\][/\\]?$/, ''));
  const projects: Project[] = [];
  for (const id of ids) {
    const project = await getProject(id);
    if (project) projects.push(project);
  }
  return projects.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getProject(projectId: string): Promise<Project | null> {
  const project = await readJsonFile<Project>(getProjectFilePath(projectId));
  if (!project) return null;
  return normalizeProject(project);
}

export async function createProject(name: string, theme: string): Promise<Project> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const project: Project = {
    id,
    name,
    theme,
    totalDurationSec: 120,
    currentStep: 'blueprint',
    videoApiPreference: 'auto',
    imageStyleGuide: getDefaultImageStyleGuide(),
    characterBible: [],
    scenes: [],
    createdAt: now,
    updatedAt: now,
  };
  await ensureProjectDir(id);
  await writeJsonFile(getProjectFilePath(id), project);
  return project;
}

export async function updateProject(project: Project): Promise<Project> {
  project.updatedAt = new Date().toISOString();
  await writeJsonFile(getProjectFilePath(project.id), project);
  return project;
}

export async function deleteProject(projectId: string): Promise<void> {
  await deleteDir(getProjectDir(projectId));
}

export function createSceneFromBlueprint(
  blueprint: BlueprintScene,
  order: number,
  apiOverride?: VideoApiPreference,
): Scene {
  const videoApi = apiOverride && apiOverride !== 'auto'
    ? apiOverride
    : blueprint.suggestedApi;
  return {
    id: uuidv4(),
    order,
    title: blueprint.title,
    description: blueprint.description,
    durationSec: blueprint.durationSec,
    styleDirection: blueprint.styleDirection,
    videoApi,
    castCharacterIds: [],
    images: [],
    selectedImageId: null,
    useAsVideoInput: false,
    videoPrompt: '',
    promptMetadata: {
      cameraWork: '',
      movement: '',
      lighting: '',
      style: '',
    },
    generations: [],
    approvedGenerationId: null,
    chainFromPreviousScene: false,
  };
}
