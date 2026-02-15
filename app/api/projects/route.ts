import { NextResponse } from 'next/server';
import { listProjects, createProject } from '@/lib/project-store';

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  let body: { name: string; theme: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 });
  }
  const { name, theme } = body;

  if (!name || !theme) {
    return NextResponse.json({ error: '名前とテーマは必須です' }, { status: 400 });
  }

  const project = await createProject(name, theme);
  return NextResponse.json(project, { status: 201 });
}
