'use client';

import {
  CheckCircle,
  FileText,
  ImageIcon,
  PenTool,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { WorkflowStep } from '@/types/project';

export type WorkflowStepDefinition = {
  key: WorkflowStep;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const WORKFLOW_STEPS: WorkflowStepDefinition[] = [
  { key: 'blueprint', label: '設計図', icon: FileText, href: 'blueprint' },
  { key: 'imageboard', label: 'イメージボード', icon: ImageIcon, href: 'imageboard' },
  { key: 'script', label: '台本', icon: PenTool, href: 'script' },
  { key: 'generate', label: '動画生成', icon: Video, href: 'generate' },
  { key: 'complete', label: '完了', icon: CheckCircle, href: 'complete' },
];

export const WORKFLOW_STEP_ORDER: WorkflowStep[] = WORKFLOW_STEPS.map(
  (step) => step.key,
);

export function getWorkflowStepFlags(
  currentStep: WorkflowStep,
  step: WorkflowStep,
) {
  const currentStepIndex = WORKFLOW_STEP_ORDER.indexOf(currentStep);
  const stepIndex = WORKFLOW_STEP_ORDER.indexOf(step);
  const isActive = step === currentStep;
  const isCompleted =
    currentStepIndex >= 0 && stepIndex >= 0 && stepIndex < currentStepIndex;
  const isDisabled =
    step === 'complete' ||
    currentStepIndex < 0 ||
    stepIndex < 0 ||
    stepIndex > currentStepIndex + 1;

  return {
    currentStepIndex,
    stepIndex,
    isActive,
    isCompleted,
    isDisabled,
  };
}
