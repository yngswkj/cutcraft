import { NextRequest, NextResponse } from 'next/server';
import {
  getSettingsApiResponse,
  resetSettings,
  SettingsValidationError,
  updateSettings,
} from '@/lib/settings';
import type { SettingsResetAction, SettingsUpdateInput } from '@/types/settings';

const RESET_ACTIONS = new Set<SettingsResetAction>(['reset-prompts', 'reset-models', 'reset-all']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isResetAction(value: unknown): value is SettingsResetAction {
  return typeof value === 'string' && RESET_ACTIONS.has(value as SettingsResetAction);
}

export async function GET() {
  try {
    const response = await getSettingsApiResponse();
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : '設定の取得に失敗しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 });
    }

    await updateSettings(body as SettingsUpdateInput);
    const response = await getSettingsApiResponse();
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : '設定の保存に失敗しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!isRecord(body) || !isResetAction(body.action)) {
      return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 });
    }

    await resetSettings(body.action);
    const response = await getSettingsApiResponse();
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : '設定リセットに失敗しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

