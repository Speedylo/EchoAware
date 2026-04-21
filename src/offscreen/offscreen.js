import { MSG_EMBED_REQUEST, MSG_CLUSTER_REQUEST } from '../shared/messageTypes.js';
import { getEmbedding } from './embedder.js';
import { runClustering } from './clusterer.js';

function respondWith(promise, sendResponse, label) {
  promise
    .then(sendResponse)
    .catch((err) => {
      console.error(`[EchoAware offscreen] ${label} failed:`, err);
      sendResponse(null);
    });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return false;
  switch (message.type) {
    case MSG_EMBED_REQUEST:
      respondWith(getEmbedding(message.payload.text), sendResponse, 'embed');
      return true;
    case MSG_CLUSTER_REQUEST:
      respondWith(runClustering(message.payload.embeddings), sendResponse, 'cluster');
      return true;
  }
  return false;
});
