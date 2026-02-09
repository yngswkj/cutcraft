import { v4 as uuidv4 } from 'uuid';
import type { Project, Scene, BlueprintScene, VideoApiPreference } from '@/types/project';
import {
  readJsonFile,
  writeJsonFile,
  deleteDir,
  listDirs,
  ensureProjectDir,
  getProjectDir,
  getProjectFilePath,
} from './file-storage';

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
  return readJsonFile<Project>(getProjectFilePath(projectId));
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
