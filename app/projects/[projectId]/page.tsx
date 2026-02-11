'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { FileText, ImageIcon, PenTool, Video, CheckCircle, ArrowLeft } from 'lucide-react';
import type { Project, WorkflowStep } from '@/types/project';

const STEPS: { key: WorkflowStep; label: string; icon: React.ReactNode; href: string }[] = [
  { key: 'blueprint', label: '設計図', icon: <FileText size={20} />, href: 'blueprint' },
  { key: 'imageboard', label: 'イメージボード', icon: <ImageIcon size={20} />, href: 'imageboard' },
  { key: 'script', label: '台本', icon: <PenTool size={20} />, href: 'script' },
  { key: 'generate', label: '動画生成', icon: <Video size={20} />, href: 'generate' },
  { key: 'complete', label: '完了', icon: <CheckCircle size={20} />, href: 'complete' },
];

const STEP_ORDER: WorkflowStep[] = ['blueprint', 'imageboard', 'script', 'generate', 'complete'];

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

  const currentStepIndex = STEP_ORDER.indexOf(project.currentStep);

  return (
    <div>
      <a
        href="/"
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 mb-6 transition"
      >
        <ArrowLeft size={16} />
        プロジェクト一覧
      </a>

      <div className="mb-8">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-gray-500 mt-1">{project.theme}</p>
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
          <span>{project.scenes.length} シーン</span>
          <span>{project.totalDurationSec}秒</span>
        </div>
      </div>

      <div className="space-y-3">
        {STEPS.map((step, index) => {
          const isActive = step.key === project.currentStep;
          const isCompleted = index < currentStepIndex;
          const isDisabled = index > currentStepIndex + 1 || step.key === 'complete';

          return (
            <div key={step.key}>
              {step.href && !isDisabled ? (
                <a
                  href={`/projects/${projectId}/${step.href}`}
                  className={`flex items-center gap-4 p-4 rounded-lg border transition ${
                    isActive
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : isCompleted
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-gray-200 bg-white text-gray-400'
                  } ${!isDisabled ? 'hover:border-primary-400' : ''}`}
                >
                  <div className={`flex-shrink-0 ${isCompleted ? 'text-green-500' : ''}`}>
                    {isCompleted ? <CheckCircle size={20} /> : step.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{step.label}</div>
                    <div className="text-xs mt-0.5 opacity-70">
                      {isActive ? '現在のステップ' : isCompleted ? '完了' : '未着手'}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    isActive ? 'bg-primary-100' : isCompleted ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    Step {index + 1}
                  </span>
                </a>
              ) : (
                <div
                  className={`flex items-center gap-4 p-4 rounded-lg border ${
                    isCompleted
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-gray-200 bg-white text-gray-400'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {isCompleted ? <CheckCircle size={20} /> : step.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{step.label}</div>
                    <div className="text-xs mt-0.5 opacity-70">
                      {isCompleted ? '完了' : '未着手'}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-gray-100">
                    Step {index + 1}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
