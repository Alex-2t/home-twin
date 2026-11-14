// What the browser can tell about the videos chosen on the AI build's upload page, before anything is sent: their length
// (the estimate follows it, D-094) and their size. A video likely to give a thin build — very short, or small and filmed
// upright — gets one gentle line under the tips. It never blocks the build: casual users film once, and the build works
// from what it gets.
import {t} from '../i18n/i18n.ts';

/** What the browser reads off a video file's metadata. */
export interface VideoFacts {
  seconds: number;
  /** The picture as shown, pixels (the browser applies a phone's rotation). */
  width: number;
  height: number;
}

/** Why a chosen video may give a thin build. */
export type VideoConcern = 'short' | 'small-upright';

// A video whose metadata the browser cannot read in this long counts as unknown.
const VIDEO_METADATA_MS = 5000;
// A whole home in less than this is a hurried pass: people film about 10–20 s a room, and a room left out stays empty.
const SHORT_VIDEO_SECONDS = 30;
// A picture whose shorter side is below this is below HD; filmed upright as well, the rooms' walls and furniture get few
// pixels across and fewer things are found.
const HD_SHORT_SIDE_PIXELS = 720;

/** The length and size of a video file, as the browser reads them; null when it cannot tell. */
export function videoFacts(file: File): Promise<VideoFacts | null> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (facts: VideoFacts | null): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(facts);
    };
    const timer = setTimeout(() => finish(null), VIDEO_METADATA_MS);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration)) return finish(null);
      finish({seconds: video.duration, width: video.videoWidth, height: video.videoHeight});
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}

/** Every video's facts, in order; a video the browser cannot read is null. */
export function videosFacts(files: File[]): Promise<(VideoFacts | null)[]> {
  return Promise.all(files.map(videoFacts));
}

/** The videos' length together, seconds; null when the browser cannot tell one of them. */
export function totalSeconds(facts: (VideoFacts | null)[]): number | null {
  let seconds = 0;
  for (const video of facts) {
    if (!video) return null;
    seconds += video.seconds;
  }
  return seconds;
}

/** Whether a video is below HD and filmed upright; a size the browser did not give (0) says nothing. */
function smallAndUpright(video: VideoFacts): boolean {
  if (!video.width || !video.height) return false;
  const upright = video.height > video.width;
  const belowHd = Math.min(video.width, video.height) < HD_SHORT_SIDE_PIXELS;
  return upright && belowHd;
}

/**
 * Why the chosen videos may give a thin build, or null. A short pass comes first: rooms it leaves out stay empty,
 * which matters more than a small picture. Unknown facts raise nothing.
 */
export function videoConcern(facts: (VideoFacts | null)[]): VideoConcern | null {
  if (!facts.length) return null;
  const seconds = totalSeconds(facts);
  if (seconds !== null && seconds < SHORT_VIDEO_SECONDS) return 'short';
  const known = facts.filter(video => video !== null);
  if (known.some(smallAndUpright)) return 'small-upright';
  return null;
}

/** The concern in words: what it may cost, and that the build can go ahead as it is. */
export function videoConcernText(concern: VideoConcern): string {
  if (concern === 'short') return t('A short video: rooms it skips stay empty. Fine to go ahead.');
  return t('Filmed upright in low resolution: some things may be missed. Fine to go ahead.');
}
