const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const SCRIPT_ID = "yt-api-script";

/** Parse a YouTube URL, short URL, playlist URL, or bare 11-char video ID. */
export function parseYouTubeUrl(input) {
  if (typeof input !== "string" || !input.trim()) return null;
  const raw = input.trim();

  if (VIDEO_ID.test(raw)) return { videoId: raw, listId: null };

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (!HOSTS.has(url.hostname.toLowerCase())) return null;

  let videoId = null;
  if (url.hostname.toLowerCase() === "youtu.be") {
    videoId = url.pathname.split("/")[1] || null;
  } else {
    videoId = url.searchParams.get("v");
    if (!videoId) {
      const match = url.pathname.match(
        /^\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{11})/,
      );
      videoId = match ? match[1] : null;
    }
  }

  if (videoId && !VIDEO_ID.test(videoId)) videoId = null;

  const listId = url.searchParams.get("list") || null;
  if (!videoId && !listId) return null;
  return { videoId, listId };
}

export function isValidYouTubeUrl(input) {
  return Boolean(parseYouTubeUrl(input));
}

/**
 * Load the YouTube IFrame API exactly once and preserve any existing
 * onYouTubeIframeAPIReady handler instead of overwriting it.
 */
export function loadYouTubeIframeAPI() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (window.__ytApiPromise) return window.__ytApiPromise;

  window.__ytApiPromise = new Promise((resolve, reject) => {
    const previousHandler = window.onYouTubeIframeAPIReady;

    const timeout = setTimeout(() => {
      reject(new Error("YouTube player timed out while loading"));
    }, 15000);

    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout);
      if (typeof previousHandler === "function") previousHandler();
      resolve(window.YT);
    };

    if (document.getElementById(SCRIPT_ID)) {
      // Script is present but callback may have already fired before this call.
      if (window.YT?.Player) {
        clearTimeout(timeout);
        resolve(window.YT);
      }
      return;
    }

    const tag = document.createElement("script");
    tag.id = SCRIPT_ID;
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    tag.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Could not load YouTube player"));
    };
    document.head.appendChild(tag);
  }).finally(() => {
    window.__ytApiPromise = null;
  });

  return window.__ytApiPromise;
}
