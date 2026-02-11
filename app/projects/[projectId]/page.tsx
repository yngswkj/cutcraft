'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import type { Project } from '@/types/project';
import {
  WORKFLOW_STEPS,
  getWorkflowStepFlags,
} from './_components/workflow-steps';

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProject = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          throw new Error('プロジェクトの取得に失敗しました');
        }
        const data = await res.json();
        if (cancelled) return;
        setProject(data);
        setError(null);
      } catch {
        if (cancelled) return;
        setProject(null);
        setError('プロジェクトを読み込めませんでした');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProject();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-16 text-sm text-red-500">
        {error || 'プロジェクトを読み込めませんでした'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <a
        href="/"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 transition"
      >
        <ArrowLeft size={16} />
        プロジェクト一覧
      </a>

      <div>
        <h1 className="text-xl sm:text-2xl font-bold break-words">{project.name}</h1>
        <p className="text-gray-500 mt-1 text-sm sm:text-base break-words">{project.theme}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-gray-400">
          <span>{project.scenes.length} シーン</span>
          <span>{project.totalDurationSec}秒</span>
        </div>
      </div>

      <div className="space-y-3">
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
            <div className="flex items-start gap-3 sm:items-center sm:gap-4">
              <div className={`flex-shrink-0 mt-0.5 sm:mt-0 ${isCompleted ? 'text-green-500' : ''}`}>
                {isCompleted ? <CheckCircle size={20} /> : <Icon size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium break-words">{step.label}</p>
                <p className="text-xs mt-0.5 opacity-70">
                  {isActive ? '現在のステップ' : isCompleted ? '完了' : '未着手'}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded shrink-0 ${
                  isActive ? 'bg-primary-100' : isCompleted ? 'bg-green-100' : 'bg-gray-100'
                }`}
              >
                Step {index + 1}
              </span>
            </div>
          );

          if (isDisabled) {
            return (
              <div key={step.key} className={`p-4 rounded-lg border ${classes}`}>
                {item}
              </div>
            );
          }

          return (
            <a
              key={step.key}
              href={`/projects/${projectId}/${step.href}`}
              className={`block p-4 rounded-lg border transition hover:border-primary-400 ${classes}`}
            >
              {item}
            </a>
          );
        })}
      </div>
    </div>
  );
}
