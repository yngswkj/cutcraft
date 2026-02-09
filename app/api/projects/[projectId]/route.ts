import { NextResponse } from 'next/server';
import { getProject, updateProject, deleteProject } from '@/lib/project-store';

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const project = await getProject(params.projectId);
  if (!project) {
    return NextResponse.json({ error: 'プロジェクトが見つかりません' }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PUT(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const existing = await getProject(params.projectId);
  if (!existing) {
    return NextResponse.json({ error: 'プロジェクトが見つかりません' }, { status: 404 });
  }

  const body = await request.json();
  const updated = await updateProject({ ...existing, ...body, id: existing.id });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  await deleteProject(params.projectId);
  return NextResponse.json({ ok: true });
}
