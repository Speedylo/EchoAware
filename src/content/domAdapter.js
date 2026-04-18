// ONLY file that touches raw YouTube CSS selectors.
// Update here when YouTube changes its DOM structure.
export const DOM_SELECTORS = {
  videoTitle:  'h1.ytd-watch-metadata yt-formatted-string',
  channelName: 'ytd-channel-name yt-formatted-string#text',
  description: '#description-inline-expander yt-attributed-string',
};
