import { getStorageManager } from '../storage/StorageManager.js';
import { MSG_STATE_UPDATED } from '../shared/messageTypes.js';

const SESSION_ID_KEY = 'echoaware_session_id';
const REPRESENTATIVE_TITLE_COUNT = 3;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 52;

// Discrete bands rather than a smooth lerp: anything below 70% reads as red
// (echo chamber territory), 70–80% as yellow (mediocre), 80%+ as green.
function getScoreColor(score) {
  const pct = Math.round(score * 100);
  if (pct < 70) return '#E53935';
  if (pct < 80) return '#F9A825';
  return '#2E7D32';
}

function setGaugeArc(arcEl, fraction, color) {
  if (!arcEl) return;
  const f = Math.max(0, Math.min(1, fraction));
  arcEl.style.strokeDasharray = String(GAUGE_CIRCUMFERENCE);
  arcEl.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - f));
  if (color) arcEl.style.stroke = color;
}

// Pick the k videos closest to the cluster centroid — the most prototypical
// members of the echo chamber. Falls back to first-k when embeddings are missing.
function pickRepresentativeTitles(videos, k = REPRESENTATIVE_TITLE_COUNT) {
  const withEmbedding = videos.filter(v => v.embedding && v.embedding.length > 0);
  if (withEmbedding.length === 0) {
    return [...new Set(videos.map(v => v.title).filter(Boolean))].slice(0, k);
  }

  const dim = withEmbedding[0].embedding.length;
  const centroid = new Float32Array(dim);
  for (const v of withEmbedding) {
    for (let i = 0; i < dim; i++) centroid[i] += v.embedding[i];
  }
  for (let i = 0; i < dim; i++) centroid[i] /= withEmbedding.length;

  const dot = (a, b) => {
    let s = 0;
    for (let i = 0; i < dim; i++) s += a[i] * b[i];
    return s;
  };
  const norm = (a) => Math.sqrt(dot(a, a)) || 1;
  const centroidNorm = norm(centroid);

  const ranked = withEmbedding
    .map(v => ({ title: v.title, score: dot(v.embedding, centroid) / (norm(v.embedding) * centroidNorm) }))
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  const titles = [];
  for (const { title } of ranked) {
    if (!title || seen.has(title)) continue;
    seen.add(title);
    titles.push(title);
    if (titles.length >= k) break;
  }
  return titles;
}

// Tracks whether the user has revealed escape queries this popup session.
// Persists across MSG_STATE_UPDATED re-renders until the popup is closed.
let _bubbleBroken = false;

function showState(stateId) {
  document.querySelectorAll('.state').forEach(el => el.classList.remove('active'));
  document.getElementById(stateId)?.classList.add('active');
}

export function renderCalibrating(videoCount) {
  const counter = document.getElementById('video-count');
  if (counter) counter.textContent = videoCount;
  const calibCount = document.getElementById('calib-count');
  if (calibCount) calibCount.textContent = videoCount;
  setGaugeArc(document.getElementById('calib-arc'), Math.min(videoCount, 5) / 5);
  showState('state-calibrating');
}

export function renderHealthy(score) {
  const pct = Math.round(score * 100);
  const el = document.getElementById('diversity-score');
  if (el) el.textContent = `${pct}%`;
  setGaugeArc(document.getElementById('healthy-arc'), score, getScoreColor(score));
  showState('state-healthy');
}

export function renderBorderline(score) {
  const pct = Math.round(score * 100);
  const el = document.getElementById('borderline-score');
  if (el) el.textContent = `${pct}%`;
  setGaugeArc(document.getElementById('borderline-arc'), score, getScoreColor(score));
  showState('state-borderline');
}

export function renderAlert(state, representativeTitles = []) {
  const pct = Math.round(state.diversityScore * 100);
  const alertScoreEl = document.getElementById('alert-score');
  if (alertScoreEl) alertScoreEl.textContent = `${pct}%`;
  setGaugeArc(
    document.getElementById('alert-arc'),
    state.diversityScore,
    getScoreColor(state.diversityScore),
  );

  const dominant = state.clusters?.find(c => c.isDominant);
  const enriching = state.enrichmentStatus === 'enriching';
  const enrichingStale = enriching && state.enrichmentStartedAt
    && (Date.now() - state.enrichmentStartedAt > 90_000);
  const errored = state.enrichmentStatus === 'error';

  const topicLabelEl = document.getElementById('topic-label');
  if (topicLabelEl) {
    topicLabelEl.textContent = enrichingStale
      ? 'Analysis timed out'
      : enriching
        ? 'Analysing...'
        : (dominant?.topicLabel || 'Echo chamber detected');
  }

  const titlesList = document.getElementById('representative-titles');
  if (titlesList) {
    titlesList.innerHTML = '';
    const uniqueTitles = [...new Set(representativeTitles)];
    if (uniqueTitles.length > 0) {
      titlesList.removeAttribute('hidden');
      for (const title of uniqueTitles) {
        const li = document.createElement('li');
        li.className = 'representative-title';
        li.textContent = title;
        titlesList.appendChild(li);
      }
    } else {
      titlesList.setAttribute('hidden', '');
    }
  }

  // Button: visible and enabled only while queries are still hidden and ready.
  const breakBtn = document.getElementById('break-bubble-btn');
  if (breakBtn) {
    breakBtn.hidden = _bubbleBroken;
    breakBtn.disabled = enriching && !enrichingStale;
    breakBtn.textContent = (enriching && !enrichingStale) ? 'Analysing…' : 'Break the bubble';
  }

  // Queries wrap: hidden until the user clicks the button.
  const queriesWrap = document.getElementById('escape-queries-wrap');
  if (queriesWrap) queriesWrap.hidden = !_bubbleBroken;

  // Always populate the list so it's ready when revealed.
  const list = document.getElementById('escape-queries');
  if (list) {
    list.innerHTML = '';
    const queries = dominant?.escapeQueries ?? [];
    if (queries.length === 0) {
      const li = document.createElement('li');
      li.className = 'escape-unavailable';
      if (enrichingStale) {
        li.textContent = 'Analysis did not complete — watch another video to retry.';
      } else if (enriching) {
        li.textContent = 'Suggestions are being generated…';
      } else if (errored) {
        li.textContent = state.enrichmentError || 'Suggestions unavailable — enrichment failed.';
      } else {
        li.textContent = 'Suggestions unavailable right now — try again shortly.';
      }
      list.appendChild(li);
    } else {
      for (const query of queries) {
        const li = document.createElement('li');
        li.className = 'escape-query';

        const span = document.createElement('span');
        span.className = 'query-text';
        span.textContent = query.queryText;

        const btn = document.createElement('button');
        btn.className = 'search-btn';
        btn.textContent = 'Search';
        btn.addEventListener('click', async () => {
          const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.queryText)}`;
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab?.id) {
            chrome.tabs.update(activeTab.id, { url: searchUrl });
          } else {
            chrome.tabs.create({ url: searchUrl });
          }
          window.close();
        });

        li.appendChild(span);
        li.appendChild(btn);
        list.appendChild(li);
      }
    }
  }

  showState('state-alert');
}

async function getSessionId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SESSION_ID_KEY, (result) => {
      resolve(result[SESSION_ID_KEY] ?? null);
    });
  });
}

export async function render() {
  const sessionId = await getSessionId();
  if (!sessionId) {
    renderCalibrating(0);
    return;
  }

  const storage = await getStorageManager();
  const [fullState, allVideos] = await Promise.all([
    storage.getSessionState(sessionId),
    storage.getVideoEntriesBySession(sessionId),
  ]);

  if (!fullState || fullState.alertState === 'calibrating') {
    renderCalibrating(allVideos.length);
    return;
  }

  if (fullState.alertState === 'alert') {
    const dominantClusterId = fullState.clusters?.find(c => c.isDominant)?.clusterId;
    const dominantVideos = dominantClusterId != null
      ? allVideos.filter(v => v.clusterId === dominantClusterId)
      : [];
    renderAlert(fullState, pickRepresentativeTitles(dominantVideos));
    return;
  }

  if (fullState.alertState === 'borderline') {
    renderBorderline(fullState.diversityScore);
    return;
  }

  renderHealthy(fullState.diversityScore);
}

document.addEventListener('DOMContentLoaded', () => {
  render();
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MSG_STATE_UPDATED) render();
  });
  document.getElementById('break-bubble-btn')?.addEventListener('click', () => {
    _bubbleBroken = true;
    const btn = document.getElementById('break-bubble-btn');
    if (btn) btn.hidden = true;
    const wrap = document.getElementById('escape-queries-wrap');
    if (wrap) wrap.hidden = false;
  });
});
