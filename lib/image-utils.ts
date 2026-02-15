import path from 'path';

const PNG_SIGNATURE = '89504e470d0a1a0a';

export function detectImageMimeType(
  imageData: Buffer,
  fallbackPath: string,
): 'image/png' | 'image/jpeg' {
  if (imageData.length >= 8 && imageData.subarray(0, 8).toString('hex') === PNG_SIGNATURE) {
    return 'image/png';
  }
  if (imageData.length >= 3 && imageData[0] === 0xff && imageData[1] === 0xd8 && imageData[2] === 0xff) {
    return 'image/jpeg';
  }

  const ext = path.extname(fallbackPath).toLowerCase();
  if (ext === '.png') return 'image/png';
  return 'image/jpeg';
}

export function resolveImageExtension(imageBuffer: Buffer, mimeType?: string): '.png' | '.jpg' {
  if (imageBuffer.length >= 8 && imageBuffer.subarray(0, 8).toString('hex') === PNG_SIGNATURE) {
    return '.png';
  }
  if (
    imageBuffer.length >= 3 &&
    imageBuffer[0] === 0xff &&
    imageBuffer[1] === 0xd8 &&
    imageBuffer[2] === 0xff
  ) {
    return '.jpg';
  }

  const normalizedMimeType = mimeType?.trim().toLowerCase();
  if (normalizedMimeType === 'image/png') return '.png';
  if (normalizedMimeType === 'image/jpeg' || normalizedMimeType === 'image/jpg') return '.jpg';
  return '.png';
}
