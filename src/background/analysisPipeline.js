import {
  MSG_EMBED_REQUEST,
  MSG_CLUSTER_REQUEST,
  MSG_STATE_UPDATED,
} from '../shared/messageTypes.js';
import { getStorageManager } from '../storage/StorageManager.js';
import { getConfig } from '../storage/configStore.js';
import { calculateSimpsonsDiversity } from './diversityCalculator.js';
import { triggerBadgeAlert, callOpenRouter } from './orchestrator.js';
import { MIN_VIDEOS_CALIBRATION, OFFSCREEN_HTML_PATH } from '../shared/constants.js';

const SESSION_ID_KEY = 'echoaware_session_id';

async function getOrCreateSessionId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SESSION_ID_KEY, (result) => {
      if (result[SESSION_ID_KEY]) { resolve(result[SESSION_ID_KEY]); return; }
      const id = `session_${Date.now()}`;
      chrome.storage.local.set({ [SESSION_ID_KEY]: id }, () => resolve(id));
    });
  });
}

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL(OFFSCREEN_HTML_PATH);
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url],
  });
  if (existing.length > 0) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_HTML_PATH,
    reasons: ['WORKERS'],
    justification: 'Run ML inference with Transformers.js in an offscreen document',
  });
}

export async function runAnalysisPipeline(metadata) {
  const [storage, sessionId] = await Promise.all([
    getStorageManager(),
    getOrCreateSessionId(),
  ]);

  // Deduplicate: skip if embedding already computed for this URL
  const existing = await storage.getVideoEntry(metadata.url);
  if (existing?.embedding) return;

  // Persist preliminary entry so video count is correct during embedding
  await storage.putVideoEntry({
    videoUrl: metadata.url,
    title: metadata.title ?? '',
    embedding: null,
    watchedAt: Date.now(),
    clusterId: null,
    sessionId,
  });

  await ensureOffscreenDocument();

  // Embed title + channel name for richer signal
  const embeddingText = [metadata.title, metadata.channelName].filter(Boolean).join(' ');
  const embedding = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: MSG_EMBED_REQUEST,
    payload: { text: embeddingText },
  });

  await storage.putVideoEntry({
    videoUrl: metadata.url,
    title: metadata.title ?? '',
    embedding,
    watchedAt: Date.now(),
    clusterId: null,
    sessionId,
  });

  const allVideos = await storage.getVideoEntriesBySession(sessionId);
  const embeddedVideos = allVideos.filter(v => v.embedding != null);

  if (embeddedVideos.length < MIN_VIDEOS_CALIBRATION) {
    await storage.putSessionState({
      sessionId,
      diversityScore: 0,
      alertState: 'calibrating',
      calibrationPhase: true,
      enrichmentStatus: 'idle',
      clusters: [],
    });
    chrome.runtime.sendMessage({ type: MSG_STATE_UPDATED }).catch(() => {});
    return;
  }

  // Run HDBSCAN clustering via offscreen document
  const embeddings = embeddedVideos.map(v => Array.from(v.embedding));
  const clusterAssignments = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: MSG_CLUSTER_REQUEST,
    payload: { embeddings },
  });

  // Write cluster IDs back to storage
  await Promise.all(
    clusterAssignments.map(({ videoIndex, clusterId }) =>
      storage.putVideoEntry({ ...embeddedVideos[videoIndex], clusterId })
    )
  );

  // Compute cluster sizes (ignore noise cluster -1)
  const sizeMap = new Map();
  for (const { clusterId } of clusterAssignments) {
    if (clusterId === -1) continue;
    sizeMap.set(clusterId, (sizeMap.get(clusterId) ?? 0) + 1);
  }
  const clusterSizes = [...sizeMap.entries()].map(([clusterId, size]) => ({ clusterId, size }));

  const { score, calibrating } = calculateSimpsonsDiversity(clusterSizes);

  const config = await getConfig();
  const isAlert = !calibrating && score < config.thresholdD;
  const alertState = calibrating ? 'calibrating' : isAlert ? 'alert' : 'healthy';

  const dominantClusterId = clusterSizes.reduce(
    (best, c) => c.size > (best?.size ?? -1) ? c : best, null
  )?.clusterId ?? null;

  const clusters = clusterSizes.map(({ clusterId }) => ({
    clusterId,
    topicLabel: '',
    isDominant: clusterId === dominantClusterId,
    escapeQueries: [],
  }));

  let enrichmentStatus = 'idle';

  if (isAlert) {
    enrichmentStatus = 'enriching';
    await storage.putSessionState({
      sessionId, diversityScore: score, alertState,
      calibrationPhase: false, enrichmentStatus, clusters,
    });

    const dominantIndices = new Set(
      clusterAssignments.filter(a => a.clusterId === dominantClusterId).map(a => a.videoIndex)
    );
    const dominantTitles = embeddedVideos
      .filter((_, i) => dominantIndices.has(i))
      .map(v => v.title);

    try {
      const enriched = await callOpenRouter(dominantTitles);
      const dominant = clusters.find(c => c.isDominant);
      if (dominant && enriched) {
        dominant.topicLabel = enriched.topicLabel ?? '';
        dominant.escapeQueries = (enriched.escapeQueries ?? []).map((q, i) => ({
          queryId: `q${i + 1}`,
          queryText: typeof q === 'string' ? q : (q.queryText ?? ''),
          isCopied: false,
        }));
      }
    } catch (err) {
      console.error('[EchoAware] OpenRouter enrichment failed:', err);
    }

    enrichmentStatus = 'done';
  }

  await storage.putSessionState({
    sessionId, diversityScore: score, alertState,
    calibrationPhase: false, enrichmentStatus, clusters,
  });

  await triggerBadgeAlert(score);
  chrome.runtime.sendMessage({ type: MSG_STATE_UPDATED }).catch(() => {});
}
