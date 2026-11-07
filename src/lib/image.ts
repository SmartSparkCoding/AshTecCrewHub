/**
 * Shrinks a picture in the browser before it is uploaded.
 *
 * A phone photo is several megabytes and a profile picture is shown at 40px, so
 * uploading the original wastes the member's data and the crew's storage. This
 * redraws it at most `max` pixels on the long edge as a JPEG. If the browser
 * cannot decode the file we hand back the original and let the upload fail
 * loudly rather than silently saving nothing.
 */
export async function shrinkImage(file: File, max = 512): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}
