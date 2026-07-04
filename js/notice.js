// notice.js - toast notice display.
// Plain presentation layer: this module intentionally has no i18n dependency.
// Callers must pass already-translated (t()-applied) message strings.

let noticeTimerId = null;

function ensureNoticeHost() {
  let host = document.getElementById('app-notice-host');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'app-notice-host';
  document.body.appendChild(host);
  return host;
}

export function showNotice(message, kind = 'error', durationMs = 4200) {
  const text = String(message || '').trim();
  if (!text) return;
  const host = ensureNoticeHost();
  host.innerHTML = '';

  const notice = document.createElement('div');
  notice.className = `app-notice app-notice-${kind}`;
  notice.textContent = text;
  host.appendChild(notice);

  if (noticeTimerId) {
    window.clearTimeout(noticeTimerId);
    noticeTimerId = null;
  }
  noticeTimerId = window.setTimeout(() => {
    notice.remove();
    noticeTimerId = null;
  }, durationMs);
}
