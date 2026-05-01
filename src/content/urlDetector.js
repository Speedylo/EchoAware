const WATCH_PATTERN = /^https:\/\/www\.youtube\.com\/watch\?.*v=/;

function isWatchUrl(url) {
  return WATCH_PATTERN.test(url);
}

export const urlDetector = {
  init(onNavigate) {
    // Per-navigation debounce: prevents yt-navigate-finish + pushState from
    // both firing for the same URL and starting two concurrent scrape loops.
    let _lastNotified = '';

    const maybeNotify = (url) => {
      if (!isWatchUrl(url) || url === _lastNotified) return;
      _lastNotified = url;
      onNavigate(url);
    };

    // Reset debounce at the start of each navigation so a revisited URL
    // (A → B → A) can be notified again for the second visit.
    window.addEventListener('yt-navigate-start', () => { _lastNotified = ''; });

    // Primary signal: YouTube navigation complete event.
    window.addEventListener('yt-navigate-finish', () => {
      maybeNotify(window.location.href);
    });

    // Secondary signal: fires when YouTube pushes data into the page shell —
    // catches cached/A-B-test routes where yt-navigate-finish is suppressed.
    window.addEventListener('yt-page-data-updated', () => {
      maybeNotify(window.location.href);
    });

    // Tertiary fallback: intercept history.pushState for environments where
    // neither YouTube event fires (certain A/B test page variants).
    // Guard prevents double-wrapping if the content script re-runs (extension
    // reload, BFCache restore) — without this, each re-run stacks another
    // wrapper and maybeNotify fires N times per real navigation.
    if (!history.pushState.__echoaware) {
      const originalPushState = history.pushState.bind(history);
      history.pushState = function (...args) {
        originalPushState(...args);
        maybeNotify(window.location.href);
      };
      history.pushState.__echoaware = true;
    }

    window.addEventListener('popstate', () => {
      maybeNotify(window.location.href);
    });

    // Handle the page that was already loaded when the content script was
    // injected. On a hard refresh or direct URL open, yt-navigate-finish fires
    // before document_idle, so the listener above would miss it.
    if (isWatchUrl(window.location.href)) {
      _lastNotified = window.location.href;
      onNavigate(window.location.href);
    }
  },

  isWatchUrl,
};
