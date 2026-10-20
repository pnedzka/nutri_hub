import { IMAGE_MAX_SIDE } from '../../../shared/news';

/** A photo made smaller in the browser before upload: at most IMAGE_MAX_SIDE px on the longer side, JPEG. */
export async function preparePhoto(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`${file.name}: this file cannot be read as a photo. Use JPEG, PNG or WebP.`);
  }
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser cannot prepare photos.');
  // JPEG has no transparency: transparent parts of a PNG become white, not black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error(`${file.name}: the photo could not be prepared.`);
  return { blob, width, height };
}
