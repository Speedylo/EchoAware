import { MSG_EMBED_REQUEST, MSG_CLUSTER_REQUEST } from '../shared/messageTypes.js';
import { getEmbedding } from './embedder.js';
import { runClustering } from './clusterer.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;
  switch (message.type) {
    case MSG_EMBED_REQUEST:
      getEmbedding(message.payload.text).then(sendResponse);
      return true;
    case MSG_CLUSTER_REQUEST:
      runClustering(message.payload.embeddings).then(sendResponse);
      return true;
  }
  return false;
});
