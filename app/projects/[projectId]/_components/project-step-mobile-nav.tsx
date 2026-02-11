'use client';

import { useState } from 'react';
import { CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { Project } from '@/types/project';
import {
  WORKFLOW_STEPS,
  getWorkflowStepFlags,
} from './workflow-steps';

type Props = {
  project: Project;
  projectId: string;
  className?: string;
};

export function ProjectStepMobileNav({ project, projectId, className = '' }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const activeStep = WORKFLOW_STEPS.find((step) => step.key === project.currentStep);
  const activeIndex = Math.max(
    WORKFLOW_STEPS.findIndex((step) => step.key === project.currentStep),
    0,
  );
  const progress = ((activeIndex + 1) / WORKFLOW_STEPS.length) * 100;

  return (
    <section
      className={`min-[1000px]:hidden bg-white border border-gray-200 rounded-lg p-3 space-y-3 ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Workflow</p>
          <p className="text-sm font-semibold text-gray-800 break-words">
            Step {activeIndex + 1}/{WORKFLOW_STEPS.length}: {activeStep?.label || '進行中'}
          </p>
        </div>
        <span className="inline-flex items-center justify-center h-7 w-7 rounded border border-gray-200 text-gray-500 shrink-0">
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full bg-primary-500 transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      {isOpen && (
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
                  {isCompleted ? <CheckCircle size={14} /> : <Icon size={14} />}
                </div>
                <div className="min-w-0 flex-1">
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
      )}
    </section>
  );
}
