import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getProjectDir } from '@/lib/file-storage';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; filename: string }> },
) {
  try {
    const { projectId, filename } = await params;
    if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
      return NextResponse.json({ error: '不正なファイル名です' }, { status: 400 });
    }

    const filePath = path.join(getProjectDir(projectId), 'videos', filename);

    const fileBuffer = await fs.readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('File read error:', error);
    return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 404 });
  }
}
