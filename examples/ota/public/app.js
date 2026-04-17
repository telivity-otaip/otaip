/**
 * OTAIP Reference OTA — shared frontend utilities.
 *
 * Plain vanilla JavaScript. No frameworks, no build step.
 */

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Search for flights.
 * @param {{ origin: string, destination: string, date: string, returnDate?: string, passengers: number, cabinClass?: string }} params
 * @returns {Promise<{ offers: Array, totalFound: number, sources: string[] }>}
 */
async function searchFlights(params) {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Search request failed' }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Get offer details by ID.
 * @param {string} id
 * @returns {Promise<{ offer: object, fareRules: object }>}
 */
async function getOffer(id) {
  const res = await fetch(`/api/offers/${encodeURIComponent(id)}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to load offer' }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/** Show or hide the loading spinner. */
function showSpinner(show) {
  const el = document.getElementById('spinner');
  if (el) {
    el.setAttribute('aria-busy', show ? 'true' : 'false');
  }
}

/** Display an error message. */
function showError(message) {
  const container = document.getElementById('error-container');
  if (container) {
    container.innerHTML = `<div class="error-box">${escapeHtml(message)}</div>`;
  }
}

/** Clear error messages. */
function clearError() {
  const container = document.getElementById('error-container');
  if (container) {
    container.innerHTML = '';
  }
}

/** Escape HTML to prevent XSS. */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// URL param helpers
// ---------------------------------------------------------------------------

/** Get a query parameter value from the current URL. */
function getParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format an ISO datetime string to a short time (HH:MM).
 * @param {string} isoString
 * @returns {string}
 */
function formatTime(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return isoString;
  }
}

/**
 * Format an ISO datetime string to a readable date + time.
 * @param {string} isoString
 * @returns {string}
 */
function formatDateTime(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleString([], {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch {
    return isoString;
  }
}

/**
 * Format duration in minutes to "Xh Ym".
 * @param {number} minutes
 * @returns {string}
 */
function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
