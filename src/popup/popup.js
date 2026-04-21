import { getStorageManager } from '../storage/StorageManager.js';
import { MSG_STATE_UPDATED } from '../shared/messageTypes.js';

const SESSION_ID_KEY = 'echoaware_session_id';

function showState(stateId) {
  document.querySelectorAll('.state').forEach(el => el.classList.remove('active'));
  document.getElementById(stateId)?.classList.add('active');
}

export function renderCalibrating(videoCount) {
  const counter = document.getElementById('video-count');
  if (counter) counter.textContent = videoCount;
  showState('state-calibrating');
}

export function renderHealthy(score) {
  const pct = Math.round(score * 100);
  const el = document.getElementById('diversity-score');
  if (el) el.textContent = `Diversity score: ${pct}%`;
  showState('state-healthy');
}

export function renderAlert(state, representativeTitles = []) {
  const pct = Math.round(state.diversityScore * 100);
  const alertScoreEl = document.getElementById('alert-score');
  if (alertScoreEl) alertScoreEl.textContent = `Diversity score: ${pct}%`;

  const dominant = state.clusters?.find(c => c.isDominant);
  const enriching = state.enrichmentStatus === 'enriching';

  const topicLabelEl = document.getElementById('topic-label');
  if (topicLabelEl) {
    topicLabelEl.textContent = enriching
      ? 'Analysing...'
      : (dominant?.topicLabel || 'Echo chamber detected');
  }

  const titlesList = document.getElementById('representative-titles');
  if (titlesList) {
    titlesList.innerHTML = '';
    if (representativeTitles.length > 0) {
      titlesList.removeAttribute('hidden');
      for (const title of representativeTitles) {
        const li = document.createElement('li');
        li.className = 'representative-title';
        li.textContent = title;
        titlesList.appendChild(li);
      }
    } else {
      titlesList.setAttribute('hidden', '');
    }
  }

  const list = document.getElementById('escape-queries');
  if (list) {
    list.innerHTML = '';
    if (!enriching) {
      const queries = dominant?.escapeQueries ?? [];
      if (queries.length === 0) {
        const li = document.createElement('li');
        li.className = 'escape-unavailable';
        li.textContent = 'Suggestions unavailable right now — try again shortly.';
        list.appendChild(li);
      } else {
        for (const query of queries) {
          const li = document.createElement('li');
          li.className = 'escape-query';

          const span = document.createElement('span');
          span.className = 'query-text';
          span.textContent = query.queryText;

          const btn = document.createElement('button');
          btn.className = query.isCopied ? 'copy-btn copied' : 'copy-btn';
          btn.textContent = query.isCopied ? 'Copied!' : 'Copy';
          btn.addEventListener('click', () => {
            navigator.clipboard.writeText(query.queryText).then(() => {
              btn.textContent = 'Copied!';
              btn.classList.add('copied');
            });
          });

          li.appendChild(span);
          li.appendChild(btn);
          list.appendChild(li);
        }
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
    renderAlert(fullState, dominantVideos.map(v => v.title));
    return;
  }

  renderHealthy(fullState.diversityScore);
}

document.addEventListener('DOMContentLoaded', () => {
  render();
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MSG_STATE_UPDATED) render();
  });
});
