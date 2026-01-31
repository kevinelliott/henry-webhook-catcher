const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || './data';
const DATA_FILE = path.join(DATA_DIR, 'webhooks.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load or initialize data
let data = { endpoints: {}, requests: {} };
if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.log('Starting with fresh data');
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.text({ limit: '10mb', type: '*/*' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Raw body capture for inspection
app.use((req, res, next) => {
  req.rawBody = '';
  if (req.headers['content-type'] && !req.headers['content-type'].includes('application/json')) {
    req.on('data', chunk => {
      req.rawBody += chunk.toString('utf8');
    });
  }
  next();
});

// Routes

// Create new endpoint
app.post('/api/endpoints', (req, res) => {
  const id = uuidv4().slice(0, 8);
  const endpoint = {
    id,
    createdAt: new Date().toISOString(),
    name: req.body.name || `Endpoint ${id}`,
    requestCount: 0
  };
  data.endpoints[id] = endpoint;
  data.requests[id] = [];
  saveData();
  res.json(endpoint);
});

// List endpoints
app.get('/api/endpoints', (req, res) => {
  const endpoints = Object.values(data.endpoints).map(e => ({
    ...e,
    requestCount: data.requests[e.id]?.length || 0
  }));
  res.json(endpoints);
});

// Delete endpoint
app.delete('/api/endpoints/:id', (req, res) => {
  const { id } = req.params;
  if (data.endpoints[id]) {
    delete data.endpoints[id];
    delete data.requests[id];
    saveData();
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Endpoint not found' });
  }
});

// Get endpoint details
app.get('/api/endpoints/:id', (req, res) => {
  const { id } = req.params;
  const endpoint = data.endpoints[id];
  if (!endpoint) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.json({
    ...endpoint,
    requests: data.requests[id] || []
  });
});

// Catch-all webhook handler
app.all('/webhook/:id', async (req, res) => {
  const { id } = req.params;
  
  if (!data.endpoints[id]) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }

  const requestData = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    headers: req.headers,
    query: req.query,
    body: req.body,
    rawBody: req.rawBody || null,
    ip: req.ip || req.connection.remoteAddress
  };

  // Remove sensitive headers
  delete requestData.headers.authorization;
  delete requestData.headers.cookie;

  if (!data.requests[id]) {
    data.requests[id] = [];
  }
  
  // Keep last 100 requests per endpoint
  data.requests[id].unshift(requestData);
  if (data.requests[id].length > 100) {
    data.requests[id] = data.requests[id].slice(0, 100);
  }
  
  saveData();

  // Respond with success
  res.json({ 
    success: true, 
    message: 'Webhook received',
    requestId: requestData.id,
    timestamp: requestData.timestamp
  });
});

// Replay a request
app.post('/api/requests/:requestId/replay', async (req, res) => {
  const { requestId } = req.params;
  
  // Find the request
  let originalRequest = null;
  let endpointId = null;
  
  for (const [eid, requests] of Object.entries(data.requests)) {
    const found = requests.find(r => r.id === requestId);
    if (found) {
      originalRequest = found;
      endpointId = eid;
      break;
    }
  }

  if (!originalRequest) {
    return res.status(404).json({ error: 'Request not found' });
  }

  const replayData = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    method: originalRequest.method,
    url: originalRequest.url,
    headers: { ...originalRequest.headers, 'x-replay': 'true' },
    query: originalRequest.query,
    body: originalRequest.body,
    isReplay: true,
    originalRequestId: requestId,
    ip: '127.0.0.1 (replay)'
  };

  data.requests[endpointId].unshift(replayData);
  saveData();

  res.json({ 
    success: true, 
    message: 'Request replayed',
    replayId: replayData.id
  });
});

// Clear endpoint requests
app.delete('/api/endpoints/:id/requests', (req, res) => {
  const { id } = req.params;
  if (data.endpoints[id]) {
    data.requests[id] = [];
    saveData();
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Endpoint not found' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    endpoints: Object.keys(data.endpoints).length
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🪝 Webhook Catcher running on http://localhost:${PORT}`);
});
