import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { getProjectDir } from '@/lib/file-storage';
import { isSafeId, isSafeFilename } from '@/lib/validation';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; filename: string }> },
) {
  try {
    const { projectId, filename } = await params;
    if (!isSafeId(projectId)) {
      return NextResponse.json({ error: '不正なprojectIdです' }, { status: 400 });
    }
    if (!isSafeFilename(filename)) {
      return NextResponse.json({ error: '不正なファイル名です' }, { status: 400 });
    }

    const filePath = path.join(getProjectDir(projectId), 'videos', filename);

    const stat = statSync(filePath);
    const stream = createReadStream(filePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('File read error:', error);
    return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 404 });
  }
}
