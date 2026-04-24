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

// MV3 terminates idle service workers at ~30s. Model download + LLM call
// routinely exceed that, so keep the worker alive for the pipeline's duration.
function startKeepalive() {
  if (typeof chrome?.runtime?.getPlatformInfo !== 'function') return () => {};
  const id = setInterval(() => { chrome.runtime.getPlatformInfo().catch(() => {}); }, 20_000);
  return () => clearInterval(id);
}

async function sendToOffscreen(message, label) {
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (response == null) {
      console.error(`[EchoAware] ${label} returned no response`);
      return null;
    }
    return response;
  } catch (err) {
    console.error(`[EchoAware] ${label} sendMessage failed:`, err);
    return null;
  }
}

// Serialize pipeline runs so concurrent VIDEO_NAVIGATED messages don't race
// on SESSION_STATE writes. Each caller still sees its own promise resolve.
let _queueTail = Promise.resolve();
export function runAnalysisPipeline(metadata) {
  const next = _queueTail.then(() => _run(metadata));
  _queueTail = next.catch(() => {}); // tail swallows errors so queue never stalls
  return next;
}


async function _run(metadata) {
  const stopKeepalive = startKeepalive();
  try {
    await _runInner(metadata);
  } finally {
    stopKeepalive();
  }
}

async function _runInner(metadata) {
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

  // Title only: channel names inject cross-topic noise that splits topically-similar videos.
  const embedding = await sendToOffscreen({
    target: 'offscreen',
    type: MSG_EMBED_REQUEST,
    payload: { text: metadata.title ?? '' },
  }, 'embed');

  if (!Array.isArray(embedding) || embedding.length === 0) {
    // Leave the preliminary entry in place so the next navigation retries.
    return;
  }

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
      enrichmentError: null,
      clusters: [],
    });
    chrome.runtime.sendMessage({ type: MSG_STATE_UPDATED }).catch(() => {});
    return;
  }

  const embeddings = embeddedVideos.map(v => Array.from(v.embedding));
  const clusterAssignments = await sendToOffscreen({
    target: 'offscreen',
    type: MSG_CLUSTER_REQUEST,
    payload: { embeddings },
  }, 'cluster');

  if (!Array.isArray(clusterAssignments) || clusterAssignments.length === 0) return;

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

  // Carry enrichment forward from the previous run so we don't re-hit OpenRouter
  // on every new video (which exhausts the 50/day free-tier quota almost instantly).
  const prevState = await storage.getSessionState(sessionId);
  const prevByCluster = new Map(
    (prevState?.clusters ?? []).map(c => [c.clusterId, c])
  );

  const clusters = clusterSizes.map(({ clusterId }) => {
    const prev = prevByCluster.get(clusterId);
    return {
      clusterId,
      topicLabel: prev?.topicLabel ?? '',
      isDominant: clusterId === dominantClusterId,
      escapeQueries: prev?.escapeQueries ?? [],
    };
  });

  let enrichmentStatus = 'idle';
  let enrichmentError = null;

  const dominant = clusters.find(c => c.isDominant);
  const needsEnrichment = isAlert && dominant
    && (!dominant.topicLabel || dominant.escapeQueries.length === 0);

  if (isAlert && !needsEnrichment) {
    // Dominant cluster already enriched on a previous run — reuse it.
    enrichmentStatus = 'done';
  }

  if (needsEnrichment) {
    enrichmentStatus = 'enriching';
    await storage.putSessionState({
      sessionId, diversityScore: score, alertState,
      calibrationPhase: false, enrichmentStatus, enrichmentError: null, clusters,
      enrichmentStartedAt: Date.now(),
    });
    chrome.runtime.sendMessage({ type: MSG_STATE_UPDATED }).catch(() => {});

    const dominantIndices = new Set(
      clusterAssignments.filter(a => a.clusterId === dominantClusterId).map(a => a.videoIndex)
    );
    const dominantTitles = embeddedVideos
      .filter((_, i) => dominantIndices.has(i))
      .map(v => v.title);

    try {
      const enriched = await callOpenRouter(dominantTitles);
      if (enriched) {
        dominant.topicLabel = enriched.topicLabel ?? '';
        dominant.escapeQueries = (enriched.escapeQueries ?? []).map((q, i) => ({
          queryId: `q${i + 1}`,
          queryText: typeof q === 'string' ? q : (q.queryText ?? ''),
          isCopied: false,
        }));
      }
      enrichmentStatus = 'done';
    } catch (err) {
      console.error('[EchoAware] OpenRouter enrichment failed:', err);
      enrichmentStatus = 'error';
      enrichmentError = err?.message ?? String(err);
    }
  }

  await storage.putSessionState({
    sessionId, diversityScore: score, alertState,
    calibrationPhase: false, enrichmentStatus, enrichmentError, clusters,
  });

  await triggerBadgeAlert(score);
  chrome.runtime.sendMessage({ type: MSG_STATE_UPDATED }).catch(() => {});
}
