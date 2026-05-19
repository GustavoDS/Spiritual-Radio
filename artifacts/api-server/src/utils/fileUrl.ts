/**
 * Converts a local disk path to a publicly accessible URL path.
 * e.g. "uploads/audio/file.mp3" → "/uploads/audio/file.mp3"
 * e.g. "/home/runner/.../uploads/audio/file.mp3" → "/uploads/audio/file.mp3"
 */
export function filePathToUrl(diskPath: string): string {
  const normalized = diskPath.replace(/\\/g, "/");
  const idx = normalized.indexOf("uploads/");
  return idx === -1 ? `/${normalized}` : `/${normalized.slice(idx)}`;
}
