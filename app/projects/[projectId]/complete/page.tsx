'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle,
  Video,
  DollarSign,
  Clock,
} from 'lucide-react';
import type { Project } from '@/types/project';
import { formatCost, estimateProjectCost } from '@/lib/cost-calculator';

export default function CompletePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then(res => res.json())
      .then(data => {
        setProject(data);
        setLoading(false);
      });
  }, [projectId]);

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const approvedGenerations = project.scenes
    .map(s => {
      const gen = s.generations.find(g => g.id === s.approvedGenerationId);
      return { scene: s, generation: gen };
    })
    .filter(item => item.generation);

  const totalDuration = approvedGenerations.reduce(
    (sum, item) => sum + (item.generation?.durationSec || 0), 0
  );
  const totalCost = approvedGenerations.reduce(
    (sum, item) => sum + (item.generation?.estimatedCost || 0), 0
  );
  const imageCost = estimateProjectCost(project.scenes).imageCost;

  return (
    <div>
      <a
        href={`/projects/${projectId}`}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 mb-6 transition"
      >
        <ArrowLeft size={16} />
        プロジェクトに戻る
      </a>

      <div className="text-center mb-8">
        <CheckCircle size={64} className="mx-auto mb-4 text-green-500" />
        <h1 className="text-2xl font-bold">プロジェクト完了</h1>
        <p className="text-gray-500 mt-1">{project.name}</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-bold mb-4">サマリー</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-gray-50 rounded-lg p-4">
            <Video size={24} className="mx-auto mb-2 text-primary-500" />
            <div className="text-2xl font-bold">{approvedGenerations.length}</div>
            <div className="text-xs text-gray-500">シーン</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <Clock size={24} className="mx-auto mb-2 text-primary-500" />
            <div className="text-2xl font-bold">{totalDuration}</div>
            <div className="text-xs text-gray-500">秒（合計）</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <DollarSign size={24} className="mx-auto mb-2 text-primary-500" />
            <div className="text-2xl font-bold">{formatCost(totalCost + imageCost)}</div>
            <div className="text-xs text-gray-500">推定コスト</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-bold mb-4">生成済み動画一覧</h2>
        <div className="space-y-4">
          {approvedGenerations.map(({ scene, generation }, index) => (
            <div
              key={scene.id}
              className="border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-gray-400 font-mono">{index + 1}.</span>
                <h3 className="font-medium">{scene.title}</h3>
                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                  {generation?.durationSec}秒
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  generation?.api === 'sora'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-purple-50 text-purple-600'
                }`}>
                  {generation?.api === 'sora' ? 'Sora' : 'Veo'}
                </span>
                <span className="text-xs text-gray-400">
                  v{generation?.version} | {formatCost(generation?.estimatedCost || 0)}
                </span>
              </div>
              {generation?.localPath && (
                <video
                  src={generation.localPath}
                  controls
                  className="w-full max-w-2xl rounded-lg border border-gray-200"
                >
                  <track kind="captions" />
                </video>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 text-center">
        <a
          href="/"
          className="text-primary-600 hover:text-primary-700 transition"
        >
          プロジェクト一覧に戻る
        </a>
      </div>
    </div>
  );
}
