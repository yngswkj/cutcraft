'use client';

import {
  CheckCircle,
  FileText,
  ImageIcon,
  PenTool,
  Video,
} from 'lucide-react';
import type { Project, WorkflowStep } from '@/types/project';

const STEPS: { key: WorkflowStep; label: string; icon: JSX.Element; href: string }[] = [
  { key: 'blueprint', label: '設計図', icon: <FileText size={16} />, href: 'blueprint' },
  { key: 'imageboard', label: 'イメージボード', icon: <ImageIcon size={16} />, href: 'imageboard' },
  { key: 'script', label: '台本', icon: <PenTool size={16} />, href: 'script' },
  { key: 'generate', label: '動画生成', icon: <Video size={16} />, href: 'generate' },
  { key: 'complete', label: '完了', icon: <CheckCircle size={16} />, href: 'complete' },
];

const STEP_ORDER: WorkflowStep[] = ['blueprint', 'imageboard', 'script', 'generate', 'complete'];

type Props = {
  project: Project;
  projectId: string;
};

export function ProjectStepNav({ project, projectId }: Props) {
  const currentStepIndex = STEP_ORDER.indexOf(project.currentStep);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      <div>
        <h2 className="font-semibold text-sm">{project.name}</h2>
        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{project.theme}</p>
      </div>

      <div className="space-y-2">
        {STEPS.map((step, index) => {
          const isActive = step.key === project.currentStep;
          const isCompleted = index < currentStepIndex;
          const isDisabled = index > currentStepIndex + 1 || step.key === 'complete';

          const classes = isActive
            ? 'border-primary-500 bg-primary-50 text-primary-700'
            : isCompleted
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-gray-200 bg-white text-gray-500';

          const item = (
            <div className="flex items-center gap-2.5">
              <div className={`${isCompleted ? 'text-green-600' : ''}`}>
                {isCompleted ? <CheckCircle size={16} /> : step.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{step.label}</p>
                <p className="text-[11px] opacity-70">
                  {isActive ? '現在のステップ' : isCompleted ? '完了' : '未着手'}
                </p>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                {index + 1}
              </span>
            </div>
          );

          if (isDisabled) {
            return (
              <div key={step.key} className={`border rounded-lg px-2.5 py-2 ${classes}`}>
                {item}
              </div>
            );
          }

          return (
            <a
              key={step.key}
              href={`/projects/${projectId}/${step.href}`}
              className={`block border rounded-lg px-2.5 py-2 transition hover:border-primary-400 ${classes}`}
            >
              {item}
            </a>
          );
        })}
      </div>
    </div>
  );
}
