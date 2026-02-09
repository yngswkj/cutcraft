import { NextResponse } from 'next/server';
import { listProjects, createProject } from '@/lib/project-store';

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, theme } = body as { name: string; theme: string };

  if (!name || !theme) {
    return NextResponse.json({ error: '名前とテーマは必須です' }, { status: 400 });
  }

  const project = await createProject(name, theme);
  return NextResponse.json(project, { status: 201 });
}
