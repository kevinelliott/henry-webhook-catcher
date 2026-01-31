// Webhook Catcher UI
let currentEndpoint = null;
let currentRequest = null;
let refreshInterval = null;

const endpointsList = document.getElementById('endpointsList');
const requestsList = document.getElementById('requestsList');
const stats = document.getElementById('stats');
const newEndpointBtn = document.getElementById('newEndpoint');
const clearRequestsBtn = document.getElementById('clearRequests');
const refreshRequestsBtn = document.getElementById('refreshRequests');
const detailModal = document.getElementById('detailModal');
const closeModal = document.getElementById('closeModal');
const modalBody = document.getElementById('modalBody');
const replayBtn = document.getElementById('replayBtn');
const copyBtn = document.getElementById('copyBtn');

// Initialize
async function init() {
  await loadEndpoints();
  updateStats();
  
  // Auto-refresh if endpoint selected
  refreshInterval = setInterval(() => {
    if (currentEndpoint) {
      loadRequests(currentEndpoint);
    }
  }, 3000);
}

// Load endpoints
async function loadEndpoints() {
  try {
    const res = await fetch('/api/endpoints');
    const endpoints = await res.json();
    renderEndpoints(endpoints);
  } catch (err) {
    endpointsList.innerHTML = '<p class="empty">Failed to load endpoints</p>';
  }
}

// Render endpoints list
function renderEndpoints(endpoints) {
  if (endpoints.length === 0) {
    endpointsList.innerHTML = '<p class="empty">No endpoints yet. Create one to start catching webhooks.</p>';
    return;
  }

  endpointsList.innerHTML = endpoints.map(e => `
    <div class="endpoint-item ${currentEndpoint === e.id ? 'active' : ''}" data-id="${e.id}">
      <div class="endpoint-name">
        ${e.name}
        <button class="btn btn-secondary" onclick="deleteEndpoint('${e.id}', event)">🗑️</button>
      </div>
      <div class="endpoint-url">/webhook/${e.id}</div>
      <div class="endpoint-meta">
        <span>${e.requestCount} requests</span>
        <span>${timeAgo(e.createdAt)}</span>
      </div>
      <div class="endpoint-actions">
        <button class="btn btn-secondary" onclick="copyUrl('${e.id}', event)">📋 Copy URL</button>
      </div>
    </div>
  `).join('');

  // Add click handlers
  document.querySelectorAll('.endpoint-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const id = item.dataset.id;
      selectEndpoint(id);
    });
  });
}

// Select endpoint
async function selectEndpoint(id) {
  currentEndpoint = id;
  clearRequestsBtn.disabled = false;
  
  // Update UI
  document.querySelectorAll('.endpoint-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  
  await loadRequests(id);
}

// Load requests for endpoint
async function loadRequests(endpointId) {
  try {
    const res = await fetch(`/api/endpoints/${endpointId}`);
    const data = await res.json();
    renderRequests(data.requests || []);
  } catch (err) {
    requestsList.innerHTML = '<p class="empty">Failed to load requests</p>';
  }
}

// Render requests list
function renderRequests(requests) {
  if (requests.length === 0) {
    requestsList.innerHTML = '<p class="empty">No requests captured yet. Send a webhook to get started.</p>';
    return;
  }

  requestsList.innerHTML = requests.map(r => {
    const preview = r.body ? JSON.stringify(r.body).slice(0, 80) : (r.rawBody?.slice(0, 80) || 'No body');
    return `
      <div class="request-item" data-id="${r.id}">
        <div class="request-header">
          <span class="method method-${r.method.toLowerCase()}">${r.method}</span>
          <span class="request-time">${timeAgo(r.timestamp)}</span>
          ${r.isReplay ? '<span class="badge">Replay</span>' : ''}
        </div>
        <div class="request-preview">${escapeHtml(preview)}${preview.length > 80 ? '...' : ''}</div>
      </div>
    `;
  }).join('');

  // Add click handlers
  document.querySelectorAll('.request-item').forEach(item => {
    item.addEventListener('click', () => {
      showRequestDetail(item.dataset.id);
    });
  });
}

// Show request detail modal
async function showRequestDetail(requestId) {
  if (!currentEndpoint) return;
  
  const res = await fetch(`/api/endpoints/${currentEndpoint}`);
  const data = await res.json();
  const request = data.requests.find(r => r.id === requestId);
  
  if (!request) return;
  
  currentRequest = request;
  
  const bodyContent = request.body 
    ? JSON.stringify(request.body, null, 2)
    : (request.rawBody || 'No body');

  modalBody.innerHTML = `
    <div class="detail-section">
      <h4>Overview</h4>
      <div class="detail-box">
        <strong>${request.method}</strong> ${request.url}<br>
        <strong>Time:</strong> ${new Date(request.timestamp).toLocaleString()}<br>
        <strong>IP:</strong> ${request.ip}<br>
        ${request.isReplay ? `<strong>Original Request:</strong> ${request.originalRequestId}<br>` : ''}
      </div>
    </div>

    <div class="detail-section">
      <h4>Headers</h4>
      <div class="detail-box">
        <table class="headers-table">
          ${Object.entries(request.headers).map(([k, v]) => `
            <tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>
          `).join('')}
        </table>
      </div>
    </div>

    ${Object.keys(request.query).length > 0 ? `
    <div class="detail-section">
      <h4>Query Parameters</h4>
      <div class="detail-box">
        <pre>${JSON.stringify(request.query, null, 2)}</pre>
      </div>
    </div>
    ` : ''}

    <div class="detail-section">
      <h4>Body</h4>
      <div class="detail-box">
        <pre>${escapeHtml(bodyContent)}</pre>
      </div>
    </div>
  `;
  
  detailModal.classList.add('active');
}

// Create new endpoint
async function createEndpoint() {
  const name = prompt('Endpoint name (optional):');
  if (name === null) return;
  
  try {
    const res = await fetch('/api/endpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || undefined })
    });
    
    const endpoint = await res.json();
    await loadEndpoints();
    selectEndpoint(endpoint.id);
    
    // Copy URL to clipboard
    copyUrl(endpoint.id);
  } catch (err) {
    alert('Failed to create endpoint');
  }
}

// Delete endpoint
async function deleteEndpoint(id, event) {
  event.stopPropagation();
  if (!confirm('Delete this endpoint and all its requests?')) return;
  
  try {
    await fetch(`/api/endpoints/${id}`, { method: 'DELETE' });
    if (currentEndpoint === id) {
      currentEndpoint = null;
      clearRequestsBtn.disabled = true;
      requestsList.innerHTML = '<p class="empty">Select an endpoint to view captured requests.</p>';
    }
    await loadEndpoints();
    updateStats();
  } catch (err) {
    alert('Failed to delete endpoint');
  }
}

// Clear requests
async function clearRequests() {
  if (!currentEndpoint) return;
  if (!confirm('Clear all requests for this endpoint?')) return;
  
  try {
    await fetch(`/api/endpoints/${currentEndpoint}/requests`, { method: 'DELETE' });
    await loadRequests(currentEndpoint);
    await loadEndpoints();
    updateStats();
  } catch (err) {
    alert('Failed to clear requests');
  }
}

// Replay request
async function replayRequest() {
  if (!currentRequest) return;
  
  try {
    const res = await fetch(`/api/requests/${currentRequest.id}/replay`, {
      method: 'POST'
    });
    
    const data = await res.json();
    alert(`Replayed! New request ID: ${data.replayId.slice(0, 8)}`);
    
    if (currentEndpoint) {
      await loadRequests(currentEndpoint);
    }
  } catch (err) {
    alert('Failed to replay request');
  }
}

// Copy URL to clipboard
function copyUrl(endpointId, event) {
  if (event) event.stopPropagation();
  const url = `${window.location.origin}/webhook/${endpointId}`;
  navigator.clipboard.writeText(url);
  showToast('URL copied!');
}

// Copy as cURL
function copyAsCurl() {
  if (!currentRequest) return;
  
  const headers = Object.entries(currentRequest.headers)
    .filter(([k]) => !['host', 'content-length'].includes(k.toLowerCase()))
    .map(([k, v]) => `-H "${k}: ${v}"`)
    .join(' ');
  
  const body = currentRequest.body 
    ? `-d '${JSON.stringify(currentRequest.body)}'` 
    : (currentRequest.rawBody ? `-d '${currentRequest.rawBody}'` : '');
  
  const curl = `curl -X ${currentRequest.method} ${headers} ${body} "${window.location.origin}/webhook/${currentEndpoint}"`;
  
  navigator.clipboard.writeText(curl);
  showToast('cURL copied!');
}

// Update stats
function updateStats() {
  fetch('/health')
    .then(r => r.json())
    .then(data => {
      stats.textContent = `${data.endpoints} endpoints • uptime ${formatUptime(data.uptime)}`;
    })
    .catch(() => {});
}

// Helpers
function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--success);
    color: #000;
    padding: 12px 20px;
    border-radius: var(--radius);
    font-weight: 500;
    z-index: 2000;
    animation: fadeIn 0.3s;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

// Event listeners
newEndpointBtn.addEventListener('click', createEndpoint);
clearRequestsBtn.addEventListener('click', clearRequests);
refreshRequestsBtn.addEventListener('click', () => {
  if (currentEndpoint) loadRequests(currentEndpoint);
});
closeModal.addEventListener('click', () => detailModal.classList.remove('active'));
detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) detailModal.classList.remove('active');
});
replayBtn.addEventListener('click', replayRequest);
copyBtn.addEventListener('click', copyAsCurl);

// Start
init();
