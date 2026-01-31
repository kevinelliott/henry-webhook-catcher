const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase config (for Vercel deployment)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const USE_SUPABASE = SUPABASE_URL && SUPABASE_KEY;

let supabase = null;
if (USE_SUPABASE) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('🔗 Using Supabase for storage');
}

// File-based storage for local dev
const DATA_DIR = process.env.DATA_DIR || './data';
const DATA_FILE = path.join(DATA_DIR, 'webhooks.json');
let localData = { endpoints: {}, requests: {} };

if (!USE_SUPABASE) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DATA_FILE)) {
    try {
      localData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.log('Starting with fresh local data');
    }
  }
  console.log('📁 Using file-based storage');
}

function saveLocalData() {
  if (!USE_SUPABASE) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(localData, null, 2));
  }
}

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.text({ limit: '10mb', type: '*/*' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Raw body capture
app.use((req, res, next) => {
  req.rawBody = '';
  if (req.headers['content-type'] && !req.headers['content-type'].includes('application/json')) {
    req.on('data', chunk => { req.rawBody += chunk.toString('utf8'); });
  }
  next();
});

// === STORAGE ABSTRACTION ===

async function createEndpoint(name) {
  const id = uuidv4().slice(0, 8);
  const endpoint = { id, name: name || `Endpoint ${id}`, created_at: new Date().toISOString() };
  
  if (USE_SUPABASE) {
    const { error } = await supabase.from('endpoints').insert(endpoint);
    if (error) throw error;
  } else {
    localData.endpoints[id] = endpoint;
    localData.requests[id] = [];
    saveLocalData();
  }
  return endpoint;
}

async function getEndpoints() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('endpoints').select('*');
    if (error) throw error;
    // Get request counts
    for (const ep of data) {
      const { count } = await supabase.from('requests').select('*', { count: 'exact', head: true }).eq('endpoint_id', ep.id);
      ep.requestCount = count || 0;
    }
    return data;
  } else {
    return Object.values(localData.endpoints).map(e => ({
      ...e,
      requestCount: localData.requests[e.id]?.length || 0
    }));
  }
}

async function getEndpoint(id) {
  if (USE_SUPABASE) {
    const { data: endpoint } = await supabase.from('endpoints').select('*').eq('id', id).single();
    if (!endpoint) return null;
    const { data: requests } = await supabase.from('requests').select('*').eq('endpoint_id', id).order('timestamp', { ascending: false }).limit(100);
    return { ...endpoint, requests: requests || [] };
  } else {
    const endpoint = localData.endpoints[id];
    if (!endpoint) return null;
    return { ...endpoint, requests: localData.requests[id] || [] };
  }
}

async function deleteEndpoint(id) {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('endpoints').delete().eq('id', id);
    return !error;
  } else {
    if (localData.endpoints[id]) {
      delete localData.endpoints[id];
      delete localData.requests[id];
      saveLocalData();
      return true;
    }
    return false;
  }
}

async function endpointExists(id) {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('endpoints').select('id').eq('id', id).single();
    return !!data;
  } else {
    return !!localData.endpoints[id];
  }
}

async function saveRequest(endpointId, requestData) {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('requests').insert({
      id: requestData.id,
      endpoint_id: endpointId,
      method: requestData.method,
      headers: requestData.headers,
      query: requestData.query,
      body: typeof requestData.body === 'string' ? requestData.body : JSON.stringify(requestData.body),
      raw_body: requestData.rawBody,
      ip: requestData.ip,
      timestamp: requestData.timestamp
    });
    if (error) throw error;
  } else {
    if (!localData.requests[endpointId]) localData.requests[endpointId] = [];
    localData.requests[endpointId].unshift(requestData);
    if (localData.requests[endpointId].length > 100) {
      localData.requests[endpointId] = localData.requests[endpointId].slice(0, 100);
    }
    saveLocalData();
  }
}

async function getRequest(requestId) {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('requests').select('*').eq('id', requestId).single();
    return data;
  } else {
    for (const [eid, requests] of Object.entries(localData.requests)) {
      const found = requests.find(r => r.id === requestId);
      if (found) return { ...found, endpoint_id: eid };
    }
    return null;
  }
}

async function clearRequests(endpointId) {
  if (USE_SUPABASE) {
    await supabase.from('requests').delete().eq('endpoint_id', endpointId);
  } else {
    localData.requests[endpointId] = [];
    saveLocalData();
  }
}

// === ROUTES ===

app.post('/api/endpoints', async (req, res) => {
  try {
    const endpoint = await createEndpoint(req.body.name);
    res.json(endpoint);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/endpoints', async (req, res) => {
  try {
    const endpoints = await getEndpoints();
    res.json(endpoints);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/endpoints/:id', async (req, res) => {
  try {
    const success = await deleteEndpoint(req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: 'Endpoint not found' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/endpoints/:id', async (req, res) => {
  try {
    const endpoint = await getEndpoint(req.params.id);
    if (!endpoint) return res.status(404).json({ error: 'Endpoint not found' });
    res.json(endpoint);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Webhook receiver
app.all('/webhook/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!(await endpointExists(id))) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }

    const requestData = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: { ...req.headers },
      query: req.query,
      body: req.body,
      rawBody: req.rawBody || null,
      ip: req.ip || req.connection?.remoteAddress
    };

    // Remove sensitive headers
    delete requestData.headers.authorization;
    delete requestData.headers.cookie;

    await saveRequest(id, requestData);

    res.json({ 
      success: true, 
      message: 'Webhook received',
      requestId: requestData.id,
      timestamp: requestData.timestamp
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Replay request
app.post('/api/requests/:requestId/replay', async (req, res) => {
  try {
    const original = await getRequest(req.params.requestId);
    if (!original) return res.status(404).json({ error: 'Request not found' });

    const replayData = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      method: original.method,
      headers: { ...original.headers, 'x-replay': 'true' },
      query: original.query,
      body: original.body,
      isReplay: true,
      originalRequestId: req.params.requestId,
      ip: '127.0.0.1 (replay)'
    };

    await saveRequest(original.endpoint_id, replayData);
    res.json({ success: true, message: 'Request replayed', replayId: replayData.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clear requests
app.delete('/api/endpoints/:id/requests', async (req, res) => {
  try {
    if (!(await endpointExists(req.params.id))) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    await clearRequests(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    storage: USE_SUPABASE ? 'supabase' : 'file',
    uptime: process.uptime()
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🪝 Webhook Catcher running on http://localhost:${PORT}`);
  });
}

module.exports = app;
