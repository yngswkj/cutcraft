'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Film, Trash2, Clock, ChevronRight } from 'lucide-react';
import type { Project } from '@/types/project';

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [theme, setTheme] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchProjects = useCallback(async () => {
    const res = await fetch('/api/projects');
    const data = await res.json();
    setProjects(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !theme.trim()) return;
    setCreating(true);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), theme: theme.trim() }),
    });
    if (res.ok) {
      const project = await res.json();
      setName('');
      setTheme('');
      setShowCreate(false);
      window.location.href = `/projects/${project.id}`;
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このプロジェクトを削除しますか？')) return;
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    fetchProjects();
  };

  const stepLabels: Record<string, string> = {
    blueprint: '設計図',
    imageboard: 'イメージボード',
    script: '台本',
    generate: '動画生成',
    complete: '完了',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold tracking-wide">プロジェクト</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-primary-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-primary-700 transition"
        >
          <Plus size={16} />
          新規作成
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <h2 className="text-base font-medium mb-4">新規プロジェクト</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                プロジェクト名
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="例：桜並木の風景"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                テーマ・コンセプト
              </label>
              <textarea
                value={theme}
                onChange={e => setTheme(e.target.value)}
                placeholder="例：春の京都、桜並木を歩くカップルの2分間の映像。柔らかな光と暖かい色調で。"
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating || !name.trim() || !theme.trim()}
                className="bg-primary-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
              >
                {creating ? '作成中…' : '作成'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-gray-500 text-sm px-4 py-2 hover:bg-gray-100 rounded-lg transition"
              >
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Film size={40} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">プロジェクトがありません</p>
          <p className="text-xs mt-1">「新規作成」から始めましょう</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map(project => (
            <a
              key={project.id}
              href={`/projects/${project.id}`}
              className="flex items-center gap-4 bg-white rounded-lg border border-gray-200 px-4 py-3.5 hover:border-primary-300 transition group"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 group-hover:text-primary-600 transition truncate">
                  {project.name}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate leading-relaxed">
                  {project.theme}
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                  <span className="flex items-center gap-0.5">
                    <Clock size={10} />
                    {new Date(project.updatedAt).toLocaleDateString('ja-JP')}
                  </span>
                  <span className="bg-primary-50 text-primary-600 px-1.5 py-px rounded font-medium">
                    {stepLabels[project.currentStep] || project.currentStep}
                  </span>
                  <span>{project.scenes.length}シーン</span>
                  <span>{project.totalDurationSec}秒</span>
                </div>
              </div>
              <button
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDelete(project.id);
                }}
                className="p-1.5 text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
                title="削除"
              >
                <Trash2 size={15} />
              </button>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-primary-400 transition flex-shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
