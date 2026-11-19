const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'vault_db.json');
const VAULT_DIR = path.join(__dirname, 'vault_data');

if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });

function getDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { return { users: {}, loginRequests: {}, files: [] }; }
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// 1. IP Check & Security Guard API
app.post('/api/v1/auth/ip-check', (req, res) => {
  const { phone, deviceId } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();

  if (!phone) return res.status(400).json({ ok: false, error: 'Phone number required' });

  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

  const db = getDB();
  if (!db.users) db.users = {};
  if (!db.loginRequests) db.loginRequests = {};

  const user = db.users[cleanPhone];

  // Pehli baar login -> Trusted IP & Device save karo
  if (!user) {
    db.users[cleanPhone] = {
      trustedIp: clientIp,
      trustedDeviceId: deviceId,
      registeredAt: new Date().toISOString()
    };
    saveDB(db);
    return res.json({ status: 'APPROVED', directLogin: true, ip: clientIp });
  }

  // IP ya Device MATCH -> Direct Login
  if (user.trustedIp === clientIp || (deviceId && user.trustedDeviceId === deviceId)) {
    user.trustedIp = clientIp;
    saveDB(db);
    return res.json({ status: 'APPROVED', directLogin: true, ip: clientIp });
  }

  // IP MISMATCH -> Approval Request generate karo
  const requestId = 'req_' + Date.now();
  db.loginRequests[requestId] = {
    phone: cleanPhone,
    attemptIp: clientIp,
    status: 'PENDING',
    createdAt: Date.now()
  };
  saveDB(db);

  return res.json({
    status: 'APPROVAL_REQUIRED',
    requestId: requestId,
    attemptIp: clientIp,
    message: 'New network detected. Approval prompt sent.'
  });
});

// 2. Asli Phone par check karna ki koi request aayi hai kya
app.get('/api/v1/auth/check-pending-approval/:phone', (req, res) => {
  let cleanPhone = req.params.phone.replace(/[^0-9]/g, '');
  if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

  const db = getDB();
  const requests = db.loginRequests || {};
  const pending = Object.keys(requests)
    .map(k => ({ id: k, ...requests[k] }))
    .find(r => r.phone === cleanPhone && r.status === 'PENDING');

  res.json({ ok: true, pendingRequest: pending || null });
});

// 3. Phone user jab "YES" ya "NO" dabaye
app.post('/api/v1/auth/respond-approval', (req, res) => {
  const { requestId, approved } = req.body;
  const db = getDB();

  if (!db.loginRequests || !db.loginRequests[requestId]) {
    return res.status(404).json({ ok: false, error: 'Request expired' });
  }

  const reqData = db.loginRequests[requestId];
  if (approved) {
    reqData.status = 'APPROVED';
    if (db.users[reqData.phone]) {
      db.users[reqData.phone].trustedIp = reqData.attemptIp;
    }
  } else {
    reqData.status = 'REJECTED';
  }

  saveDB(db);
  res.json({ ok: true, status: reqData.status });
});

// 4. Naye Device par status polling
app.get('/api/v1/auth/poll-status/:requestId', (req, res) => {
  const db = getDB();
  const reqData = (db.loginRequests || {})[req.params.requestId];
  if (!reqData) return res.status(404).json({ status: 'EXPIRED' });
  res.json({ status: reqData.status });
});

// Media Storage & Streaming Endpoints
app.post('/api/v1/upload', (req, res) => {
  const { appId, fileName } = req.query;
  const fileId = 'val_' + Date.now();
  const target = path.join(VAULT_DIR, fileId);
  const stream = fs.createWriteStream(target);
  req.pipe(stream);
  stream.on('finish', () => {
    const d = getDB();
    const stat = fs.statSync(target);
    if (!d.files) d.files = [];
    d.files.push({
      id: fileId,
      appId: appId || 'app_talksy',
      name: fileName || 'file',
      size: stat.size,
      type: req.headers['content-type'] || 'audio/mp4'
    });
    saveDB(d);
    res.json({ ok: true, fileId });
  });
});

app.get('/stream/:id', (req, res) => {
  const d = getDB();
  const file = (d.files || []).find(f => f.id === req.params.id);
  const target = path.join(VAULT_DIR, req.params.id);
  if (!file || !fs.existsSync(target)) return res.status(404).end('Not Found');
  const total = fs.statSync(target).size;
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
    res.writeHead(206, {
      'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
      'Accept-Ranges': 'bytes',
      'Content-Length': (end - start) + 1,
      'Content-Type': file.type
    });
    fs.createReadStream(target, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': total, 'Content-Type': file.type });
    fs.createReadStream(target).pipe(res);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('IP GUARD VAULT SERVER ONLINE ON ' + PORT));
