const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const VAULT_DIR = path.join(__dirname, 'vault_data');
const DB_FILE = path.join(__dirname, 'vault_db.json');

if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });

function getDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { return { apps: {}, files: [] }; }
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = getDB();
if (!db.apps['app_talksy']) {
  db.apps['app_talksy'] = {
    name: 'TalksyJi App',
    key: 'vk_live_' + crypto.randomBytes(12).toString('hex')
  };
  saveDB(db);
}

app.get('/dashboard', (req, res) => {
  const current = getDB();
  const appKeys = Object.keys(current.apps);
  let cards = '';
  appKeys.forEach(id => {
    const a = current.apps[id];
    const fList = current.files.filter(f => f.appId === id);
    let filesHtml = '';
    fList.forEach(f => {
      filesHtml += '<div style="background:#1f2937;padding:6px 10px;border-radius:6px;margin-top:6px;font-size:12px;display:flex;justify-content:space-between;">' +
        '<span>' + f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB)</span>' +
        '<a href="/stream/' + f.id + '" target="_blank" style="color:#38bdf8;font-weight:bold;text-decoration:none;">Stream &rarr;</a>' +
        '</div>';
    });
    cards += '<div style="background:#111827;border:1px solid #1f2937;border-radius:10px;padding:14px;margin-top:12px;">' +
      '<div style="display:flex;justify-content:space-between;"><b style="color:#38bdf8;">' + a.name + '</b><span style="background:#1e3a8a;color:#93c5fd;padding:2px 8px;border-radius:4px;font-size:11px;">' + id + '</span></div>' +
      '<div style="background:#030712;padding:8px;border-radius:6px;font-family:monospace;font-size:12px;color:#22c55e;margin:8px 0;word-break:break-all;">KEY: ' + a.key + '</div>' +
      '<div style="font-size:12px;color:#9ca3af;">Files: ' + fList.length + '</div>' +
      filesHtml +
      '</div>';
  });

  const fullHtml = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vault BaaS</title><style>body{background:#030712;color:#f9fafb;font-family:sans-serif;padding:16px;margin:0;}</style></head><body>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1f2937;padding-bottom:10px;"><h2 style="margin:0;color:#38bdf8;">Vault BaaS Console</h2><span style="color:#22c55e;font-size:12px;">● LIVE</span></div>' +
    '<div style="background:#111827;padding:12px;border-radius:10px;margin-top:12px;border:1px solid #1f2937;"><form action="/api/create-app" method="POST" style="display:flex;gap:6px;"><input name="name" placeholder="New App Name" required style="flex:1;background:#1f2937;border:1px solid #374151;color:#fff;padding:8px;border-radius:6px;"><button style="background:#2563eb;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-weight:bold;">Add App</button></form></div>' +
    cards +
    '<div style="margin-top:20px;text-align:center;"><a href="/upload" style="color:#38bdf8;font-size:13px;text-decoration:none;">+ Go to Direct Upload Page</a></div>' +
    '</body></html>';
  res.send(fullHtml);
});

app.post('/api/create-app', (req, res) => {
  const d = getDB();
  const id = 'app_' + Date.now().toString(36);
  d.apps[id] = { name: req.body.name, key: 'vk_live_' + crypto.randomBytes(12).toString('hex') };
  saveDB(d);
  res.redirect('/dashboard');
});

app.get('/upload', (req, res) => {
  const d = getDB();
  let opts = '';
  Object.keys(d.apps).forEach(id => {
    opts += '<option value="' + id + '">' + d.apps[id].name + ' (' + id + ')</option>';
  });
  const upHtml = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Upload</title><style>body{background:#030712;color:#fff;font-family:sans-serif;padding:16px;text-align:center;}.b{background:#111827;border:1px solid #1f2937;border-radius:14px;padding:20px;max-width:380px;margin:20px auto;}input,select{width:100%;margin:10px 0;padding:10px;background:#1f2937;border:1px solid #374151;color:#fff;border-radius:6px;box-sizing:border-box;}button{width:100%;background:#2563eb;color:#fff;border:none;padding:12px;border-radius:6px;font-weight:bold;cursor:pointer;}</style></head><body><div class="b"><h3 style="margin:0;color:#38bdf8;">Upload to Cloud Vault</h3><input type="file" id="f"><select id="appId">' + opts + '</select><button id="btn" onclick="up()">Upload</button><div id="m" style="margin-top:12px;font-size:13px;color:#38bdf8;"></div><div style="margin-top:16px;"><a href="/dashboard" style="color:#9ca3af;font-size:12px;text-decoration:none;">&larr; Back to Dashboard</a></div></div><script>async function up(){const f=document.getElementById("f").files[0];if(!f)return alert("Choose file!");const btn=document.getElementById("btn");const m=document.getElementById("m");btn.disabled=true;m.innerText="Uploading to Vault...";const app=document.getElementById("appId").value;const r=await fetch("/api/v1/upload?appId="+app+"&fileName="+encodeURIComponent(f.name),{method:"POST",headers:{"Content-Type":f.type||"application/octet-stream"},body:f});const res=await r.json();if(res.ok){m.innerHTML="<b style=color:#22c55e;>Uploaded Successfully!</b>";setTimeout(()=>location.href="/dashboard",800);}else{m.innerText="Upload Failed";btn.disabled=false;}}</script></body></html>';
  res.send(upHtml);
});

app.post('/api/v1/upload', (req, res) => {
  const { appId, fileName } = req.query;
  const fileId = 'val_' + Date.now();
  const target = path.join(VAULT_DIR, fileId);
  const stream = fs.createWriteStream(target);
  req.pipe(stream);
  stream.on('finish', () => {
    const d = getDB();
    const stat = fs.statSync(target);
    d.files.push({
      id: fileId,
      appId: appId || 'app_talksy',
      name: fileName || 'file',
      size: stat.size,
      type: req.headers['content-type'] || 'video/mp4'
    });
    saveDB(d);
    res.json({ ok: true, fileId });
  });
});

app.get('/stream/:id', (req, res) => {
  const d = getDB();
  const file = d.files.find(f => f.id === req.params.id);
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

app.listen(3000, '0.0.0.0', () => console.log('ONLINE_READY'));
