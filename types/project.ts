export type WorkflowStep = 'blueprint' | 'imageboard' | 'script' | 'generate' | 'complete';

export type VideoApiPreference = 'auto' | 'sora' | 'veo';

export interface ImageStyleGuide {
  styleBible: string;
  colorPalette: string;
  lightingMood: string;
  cameraLanguage: string;
  negativePrompt: string;
}

export interface CharacterProfile {
  id: string;
  name: string;
  role: string;
  ethnicityNationality: string;
  ageAppearance: string;
  genderPresentation: string;
  appearanceTraits: string;
  wardrobe: string;
  mustKeep: string;
}

export interface Project {
  id: string;
  name: string;
  theme: string;
  totalDurationSec: number;
  currentStep: WorkflowStep;
  videoApiPreference: VideoApiPreference;
  imageStyleGuide: ImageStyleGuide;
  characterBible: CharacterProfile[];
  scenes: Scene[];
  createdAt: string;
  updatedAt: string;
}

export interface Scene {
  id: string;
  order: number;
  title: string;
  description: string;
  durationSec: number;
  styleDirection: string;
  videoApi: 'sora' | 'veo';
  castCharacterIds: string[];
  // イメージボード
  images: SceneImage[];
  selectedImageId: string | null;
  useAsVideoInput: boolean;
  // 台本（動画生成プロンプト）
  videoPrompt: string;
  promptMetadata: PromptMetadata;
  // 動画生成
  generations: VideoGeneration[];
  approvedGenerationId: string | null;
  chainFromPreviousScene: boolean;
}

export interface PromptMetadata {
  cameraWork: string;
  movement: string;
  lighting: string;
  style: string;
}

export interface SceneImage {
  id: string;
  sceneId: string;
  prompt: string;
  localPath: string;
  width: number;
  height: number;
  createdAt: string;
}

export type VideoStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface VideoGeneration {
  id: string;
  sceneId: string;
  version: number;
  api: 'sora' | 'veo';
  externalJobId: string;
  status: VideoStatus;
  prompt: string;
  inputImagePath: string | null;
  chainedFramePath: string | null;
  localPath: string | null;
  durationSec: number;
  resolution: string;
  estimatedCost: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CostEstimate {
  dalle3Images: number;
  soraVideos: number;
  veoVideos: number;
  llmTokens: number;
  total: number;
}

export interface BlueprintScene {
  title: string;
  description: string;
  durationSec: number;
  styleDirection: string;
  suggestedApi: 'sora' | 'veo';
}

export interface BlueprintResult {
  scenes: BlueprintScene[];
}
