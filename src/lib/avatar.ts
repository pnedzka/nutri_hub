import { AVATAR_SIDE } from '../../shared/profile.ts';

/** A profile photo prepared in the browser: the middle square of the picture, AVATAR_SIDE px, JPEG. */
export async function prepareAvatar(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This file cannot be read as a photo. Use JPEG, PNG or WebP.');
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(AVATAR_SIDE, side);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser cannot prepare photos.');
  // JPEG has no transparency: transparent parts of a PNG become white, not black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new Error('The photo could not be prepared.');
  return blob;
}
