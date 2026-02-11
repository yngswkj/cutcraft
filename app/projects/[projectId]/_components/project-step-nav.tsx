'use client';

import { CheckCircle } from 'lucide-react';
import type { Project } from '@/types/project';
import {
  WORKFLOW_STEPS,
  getWorkflowStepFlags,
} from './workflow-steps';

type Props = {
  project: Project;
  projectId: string;
};

export function ProjectStepNav({ project, projectId }: Props) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      <div>
        <h2 className="font-semibold text-sm break-words">{project.name}</h2>
        <p className="text-xs text-gray-500 mt-1 line-clamp-2 break-words">{project.theme}</p>
      </div>

      <div className="space-y-2">
        {WORKFLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          const { isActive, isCompleted, isDisabled } = getWorkflowStepFlags(
            project.currentStep,
            step.key,
          );
          const classes = isActive
            ? 'border-primary-500 bg-primary-50 text-primary-700'
            : isCompleted
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-gray-200 bg-white text-gray-500';

          const item = (
            <div className="flex items-center gap-2.5">
              <div className={`${isCompleted ? 'text-green-600' : ''}`}>
                {isCompleted ? <CheckCircle size={16} /> : <Icon size={16} />}
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
