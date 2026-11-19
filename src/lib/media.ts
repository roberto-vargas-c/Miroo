import { getCloudflareContext } from "@opennextjs/cloudflare";

/** The subset of the R2 bucket API we use (avoids pulling Workers types into the Next app). */
export type MediaBucket = {
  put(key: string, value: ReadableStream | ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string, opts?: { range?: { offset: number; length?: number } | { suffix: number } }): Promise<
    { body: ReadableStream; size: number; range?: { offset?: number; length?: number } } | null
  >;
  delete(key: string): Promise<void>;
};

const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/** The R2 bucket for large uploads (videos), when the deployment has one bound as MEDIA. */
export function mediaBucket(): MediaBucket | null {
  if (!onWorkers) return null;
  try {
    return ((getCloudflareContext().env as { MEDIA?: MediaBucket }).MEDIA) ?? null;
  } catch {
    return null;
  }
}

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/ogg"];

/** Largest upload kept in Postgres. Object storage takes up to the Workers request limit. */
export const DB_MAX_BYTES = 25 * 1024 * 1024;
export const BUCKET_MAX_BYTES = 100 * 1024 * 1024;

/** Parses a single "bytes=a-b" range against a file of `size` bytes. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  let start: number, end: number;
  if (!m[1]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  if (start > end || start >= size) return null;
  return { start, end };
}
