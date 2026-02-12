import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getProjectDir } from '@/lib/file-storage';

const SAFE_PROJECT_ID_REGEX = /^[A-Za-z0-9-]+$/;
const PNG_SIGNATURE = '89504e470d0a1a0a';

function detectImageContentType(fileBuffer: Buffer, fallbackFilename: string): 'image/png' | 'image/jpeg' {
  if (fileBuffer.length >= 8 && fileBuffer.subarray(0, 8).toString('hex') === PNG_SIGNATURE) {
    return 'image/png';
  }
  if (
    fileBuffer.length >= 3 &&
    fileBuffer[0] === 0xff &&
    fileBuffer[1] === 0xd8 &&
    fileBuffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  const ext = path.extname(fallbackFilename).toLowerCase();
  return ext === '.png' ? 'image/png' : 'image/jpeg';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; filename: string }> },
) {
  try {
    const { projectId, filename } = await params;
    if (!SAFE_PROJECT_ID_REGEX.test(projectId)) {
      return NextResponse.json({ error: '不正なprojectIdです' }, { status: 400 });
    }
    if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
      return NextResponse.json({ error: '不正なファイル名です' }, { status: 400 });
    }

    const filePath = path.join(getProjectDir(projectId), 'images', filename);

    const fileBuffer = await fs.readFile(filePath);
    const contentType = detectImageContentType(fileBuffer, filename);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('File read error:', error);
    return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 404 });
  }
}
