// The files chosen on the AI build's upload page, told apart (D-117): the plan (a photo, a scan or a PDF), the videos and the
// photos of the rooms. A browser often gives no type for an iPhone's HEIC or a .mov on Windows, so the name's extension
// counts too. What the build service would refuse (too many, too big) is left out here with a word, before any byte goes.

/** The most the service takes (home-twin-ai-build tools/uploads.ts). */
export const MOST_VIDEOS = 10;
export const MOST_PHOTOS = 80;
export const MOST_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
export const MOST_PHOTO_BYTES = 40 * 1024 * 1024;
export const MOST_PLAN_BYTES = 50 * 1024 * 1024;

const VIDEO_EXTENSION = /\.(mp4|mov|m4v|3gp|3g2|webm|mkv|avi|mts|m2ts)$/i;
const PHOTO_EXTENSION = /\.(jpe?g|png|webp|heic|heif|avif|gif|tiff?|bmp)$/i;
const PDF_EXTENSION = /\.pdf$/i;
// The pictures every browser shows; an HEIC or a TIFF only some do.
const SHOWN_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const SHOWN_EXTENSION = /\.(jpe?g|png|webp|gif|avif)$/i;

/** A file as this module reads it (a File, or a test's stand-in). */
export interface NamedFile {
  name: string;
  type: string;
  size: number;
}

/** What a chosen file is: a video, a photo, or neither. */
export function mediaKind(file: NamedFile): 'video' | 'photo' | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'photo';
  if (VIDEO_EXTENSION.test(file.name)) return 'video';
  if (PHOTO_EXTENSION.test(file.name)) return 'photo';
  return null;
}

/** Whether a file can be the plan: a photo or a scan of it, or a PDF. */
export const isPlanFile = (file: NamedFile): boolean =>
  mediaKind(file) === 'photo' || file.type === 'application/pdf' || PDF_EXTENSION.test(file.name);

/** Whether the browser can show the picture as it is (an HEIC or a PDF gets an icon instead). */
export const showable = (file: NamedFile): boolean =>
  SHOWN_TYPES.has(file.type) || SHOWN_EXTENSION.test(file.name);

/** The videos and photos of a choice, and what was left out of it and why. */
export interface SortedMedia<File extends NamedFile> {
  videos: File[];
  photos: File[];
  /** Over the most the service takes: these many were left out, the first ones are kept. */
  tooMany: number;
  /** Bigger than the service takes, by name. */
  tooBig: string[];
}

/** A choice of files sorted into videos and photos; anything else is not counted, more than the service takes left out. */
export function sortMedia<File extends NamedFile>(files: File[]): SortedMedia<File> {
  const sorted: SortedMedia<File> = {videos: [], photos: [], tooMany: 0, tooBig: []};
  for (const file of files) {
    const kind = mediaKind(file);
    if (!kind) continue;
    const most = kind === 'video' ? MOST_VIDEO_BYTES : MOST_PHOTO_BYTES;
    if (file.size > most) {
      sorted.tooBig.push(file.name);
      continue;
    }
    const list = kind === 'video' ? sorted.videos : sorted.photos;
    if (list.length >= (kind === 'video' ? MOST_VIDEOS : MOST_PHOTOS)) {
      sorted.tooMany++;
      continue;
    }
    list.push(file);
  }
  return sorted;
}

// Fewer photos than this, with no video, show too little of a home: the page says to add some, it never blocks the build.
export const FEW_PHOTOS = 3;
