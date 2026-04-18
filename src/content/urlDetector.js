const WATCH_PATTERN  = /^https:\/\/www\.youtube\.com\/watch\?.*v=/;
const SHORTS_PATTERN = /^https:\/\/www\.youtube\.com\/shorts\//;

export const urlDetector = {
  init(onNavigate) { throw new Error('Not implemented'); },
  isWatchUrl(url)  { return WATCH_PATTERN.test(url) || SHORTS_PATTERN.test(url); },
};
