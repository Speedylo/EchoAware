const WATCH_PATTERN = /^https:\/\/www\.youtube\.com\/watch\?.*v=/;

function isWatchUrl(url) {
  return WATCH_PATTERN.test(url);
}

export const urlDetector = {
  /**
   * Start listening for YouTube SPA navigations.
   * Fires onNavigate(url) only for standard /watch?v= URLs.
   * @param {(url: string) => void} onNavigate
   */
  init(onNavigate) {
    const maybeNotify = (url) => {
      if (isWatchUrl(url)) onNavigate(url);
    };

    // YouTube fires this custom event on every SPA navigation
    window.addEventListener('yt-navigate-finish', () => {
      maybeNotify(window.location.href);
    });

    // Fallback: intercept history.pushState for environments where the
    // custom event doesn't fire (e.g. certain A/B test page variants)
    const originalPushState = history.pushState.bind(history);
    history.pushState = function (...args) {
      originalPushState(...args);
      maybeNotify(window.location.href);
    };

    window.addEventListener('popstate', () => {
      maybeNotify(window.location.href);
    });
  },

  isWatchUrl,
};
