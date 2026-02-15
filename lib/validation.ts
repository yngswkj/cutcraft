/** 安全な ID（UUID 等）のパターン */
export const SAFE_ID_REGEX = /^[A-Za-z0-9-]+$/;

/** 安全なファイル名のパターン */
export const SAFE_FILENAME_REGEX = /^[A-Za-z0-9._-]+$/;

/** 安全な画像パスのパターン（images/filename 形式） */
export const SAFE_IMAGE_PATH_REGEX = /^images\/[A-Za-z0-9._-]+$/;

export function isSafeId(value: string): boolean {
  return SAFE_ID_REGEX.test(value);
}

export function isSafeFilename(value: string): boolean {
  return SAFE_FILENAME_REGEX.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
