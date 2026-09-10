const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'PRINCE_SHUVO_MULTI_USER_MAINFRAME_2026';

app.use(express.json());
app.use(cookieParser());

// আপলোড ও ডাটাবেজ ডিরেক্টরি
const uploadDir = path.join(__dirname, 'uploads');
const dbFile = path.join(__dirname, 'users.json');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify([]));

// পাসওয়ার্ড হ্যাশ ফাংশন
function hashPassword(pass) {
    return crypto.createHash('sha256').update(pass + 'PRINCE_SALT').digest('hex');
}

// ইউজার ডাটা হেল্পার
function getUsers() {
    try {
        return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    } catch {
        return [];
    }
}
function saveUsers(users) {
    fs.writeFileSync(dbFile, JSON.stringify(users, null, 2));
}

// ইউজার ফোল্ডারের সেফ পাথ তৈরি (যাতে একজন অন্যের ফোল্ডারে ঢুকতে না পারে)
function getUserPath(username, relPath = '') {
    const cleanUser = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const userBaseDir = path.join(uploadDir, cleanUser);
    if (!fs.existsSync(userBaseDir)) fs.mkdirSync(userBaseDir, { recursive: true });

    const safeRel = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
    const target = path.join(userBaseDir, safeRel);

    if (!target.startsWith(userBaseDir)) return userBaseDir;
    return target;
}

// অথেনটিকেশন মিডলওয়্যার
const verifyAuth = (req, res, next) => {
    const token = req.cookies.ps_user_token;
    if (!token) return res.status(401).json({ success: false, message: 'লগইন প্রয়োজন' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({ success: false });
    }
};

// ফাইল আপলোড ইঞ্জিন (Multer)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const targetDir = getUserPath(req.user.username, req.body.folderPath || '');
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, Date.now() + '-' + cleanName);
    }
});
const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } });

// ১. রেজিস্ট্রেশন এপিআই (নতুন অ্যাকাউন্ট তৈরি)
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'সবগুলো তথ্য দিন!' });

    const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanUser.length < 3) return res.status(400).json({ success: false, message: 'ইউজারনেম কমপক্ষে ৩ অক্ষরের হতে হবে।' });
    if (password.length < 4) return res.status(400).json({ success: false, message: 'পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।' });

    const users = getUsers();
    if (users.find(u => u.username === cleanUser)) {
        return res.status(400).json({ success: false, message: 'এই ইউজারনেম ইতিমধ্যে নেওয়া হয়েছে!' });
    }

    const newUser = {
        username: cleanUser,
        password: hashPassword(password),
        createdAt: new Date().toISOString()
    };
    users.push(newUser);
    saveUsers(users);

    // ইউজার ডিরেক্টরি তৈরি
    getUserPath(cleanUser);

    res.json({ success: true, message: 'রেজিস্ট্রেশন সফল! এখন লগইন করুন।' });
});

// ২. লগইন এপিআই
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const cleanUser = (username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const users = getUsers();
    const user = users.find(u => u.username === cleanUser && u.password === hashPassword(password));

    if (!user) {
        return res.status(401).json({ success: false, message: 'ভুল ইউজারনেম অথবা পাসওয়ার্ড!' });
    }

    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('ps_user_token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true, username: user.username });
});

// ৩. সেশন চেক
app.get('/api/check', verifyAuth, (req, res) => {
    res.json({ success: true, username: req.user.username });
});

// ৪. ইউজারের ফাইল ও ফোল্ডার দেখা
app.get('/api/files', verifyAuth, (req, res) => {
    const relPath = req.query.path || '';
    const targetDir = getUserPath(req.user.username, relPath);

    fs.readdir(targetDir, { withFileTypes: true }, (err, items) => {
        if (err) return res.status(500).json({ success: false });

        const folders = [];
        const files = [];

        items.forEach(item => {
            const itemRelPath = path.join(relPath, item.name).replace(/\\/g, '/');
            if (item.isDirectory()) {
                folders.push({ name: item.name, path: itemRelPath });
            } else {
                const ext = path.extname(item.name).toLowerCase();
                let type = 'other';
                if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) type = 'image';
                if (['.mp4', '.mkv', '.webm', '.mov'].includes(ext)) type = 'video';
                files.push({
                    name: item.name,
                    path: itemRelPath,
                    type,
                    url: `/stream?path=${encodeURIComponent(itemRelPath)}`
                });
            }
        });

        res.json({ success: true, currentPath: relPath, folders, files: files.reverse() });
    });
});

// ৫. নতুন ফোল্ডার তৈরি
app.post('/api/create-folder', verifyAuth, (req, res) => {
    const { folderName, currentPath } = req.body;
    if (!folderName) return res.status(400).json({ success: false, message: 'নাম দিন' });

    const cleanFolder = folderName.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    const newDir = path.join(getUserPath(req.user.username, currentPath || ''), cleanFolder);

    if (fs.existsSync(newDir)) {
        return res.status(400).json({ success: false, message: 'ফোল্ডারটি ইতিমধ্যে আছে!' });
    }

    fs.mkdirSync(newDir, { recursive: true });
    res.json({ success: true });
});

// ৬. ফাইল আপলোড
app.post('/api/upload', verifyAuth, upload.array('files'), (req, res) => {
    res.json({ success: true });
});

// ৭. ফাইল স্ট্রিমিং (শুধু নিজের ফাইল দেখা যাবে)
app.get('/stream', verifyAuth, (req, res) => {
    const filePath = getUserPath(req.user.username, req.query.path || '');
    if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isDirectory()) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Not Found');
    }
});

// ৮. ডিলিট
app.delete('/api/delete', verifyAuth, (req, res) => {
    const userBaseDir = path.join(uploadDir, req.user.username);
    const targetPath = getUserPath(req.user.username, req.body.path || '');

    if (targetPath === userBaseDir) return res.status(400).json({ success: false });

    if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

// ৯. লগআউট
app.post('/api/logout', (req, res) => {
    res.clearCookie('ps_user_token');
    res.json({ success: true });
});

// ১০. কালারফুল হ্যাকার ইন্টারফেস
app.get('*', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PRINCE SHUVO // MULTI-CLOUD</title>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;800&family=Orbitron:wght@600;800;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-black: #040711;
            --neon-green: #00ff9d;
            --neon-cyan: #00f0ff;
            --neon-pink: #ff007f;
            --neon-purple: #9d4edd;
            --terminal-box: #0a1122;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'JetBrains Mono', monospace; }
        body {
            background-color: var(--bg-black);
            color: #d1d5db;
            min-height: 100vh;
            background-image: radial-gradient(rgba(0, 240, 255, 0.08) 1px, transparent 1px), radial-gradient(rgba(0, 255, 157, 0.05) 1px, var(--bg-black) 1px);
            background-size: 28px 28px;
            background-position: 0 0, 14px 14px;
            overflow-x: hidden;
        }
        .hidden { display: none !important; }

        /* Login & Register Card */
        .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .login-card {
            background: rgba(10, 17, 34, 0.95);
            backdrop-filter: blur(20px);
            border: 2px solid var(--neon-cyan);
            border-radius: 16px;
            padding: 35px 25px;
            width: 100%;
            max-width: 420px;
            box-shadow: 0 0 35px rgba(0, 240, 255, 0.3);
            text-align: center;
        }
        .login-card h1 {
            font-family: 'Orbitron', sans-serif;
            font-size: 26px;
            font-weight: 900;
            color: #fff;
            text-shadow: 0 0 10px var(--neon-green), 0 0 20px var(--neon-green);
            margin-bottom: 20px;
            letter-spacing: 2px;
        }
        .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
        .tab-btn { flex: 1; padding: 10px; background: #060913; border: 1px solid #1e293b; color: #94a3b8; font-weight: 700; border-radius: 6px; cursor: pointer; font-size: 12px; }
        .tab-btn.active { border-color: var(--neon-green); color: var(--neon-green); box-shadow: 0 0 10px rgba(0,255,157,0.3); }

        .cyber-input {
            width: 100%;
            padding: 13px;
            background: #060913;
            border: 2px solid #1e293b;
            color: var(--neon-green);
            font-size: 14px;
            border-radius: 8px;
            outline: none;
            margin-bottom: 15px;
            transition: 0.3s;
        }
        .cyber-input:focus { border-color: var(--neon-green); box-shadow: 0 0 12px rgba(0, 255, 157, 0.3); }
        .btn-hack {
            width: 100%;
            padding: 14px;
            background: linear-gradient(90deg, var(--neon-green), var(--neon-cyan));
            color: #030712;
            font-family: 'Orbitron', sans-serif;
            font-weight: 900;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            box-shadow: 0 0 20px rgba(0, 255, 157, 0.4);
        }

        /* Top Header */
        header {
            background: rgba(8, 13, 23, 0.95);
            backdrop-filter: blur(15px);
            border-bottom: 2px solid var(--neon-cyan);
            padding: 14px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 50;
            box-shadow: 0 0 20px rgba(0, 240, 255, 0.2);
        }
        .logo-title {
            font-family: 'Orbitron', sans-serif;
            font-weight: 900;
            font-size: 18px;
            color: var(--neon-green);
            text-shadow: 0 0 10px rgba(0, 255, 157, 0.6);
        }
        .hud-badges { display: flex; gap: 10px; align-items: center; }
        .badge-hud {
            font-size: 11px;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: 700;
            border: 1px solid var(--neon-green);
            color: var(--neon-green);
            background: rgba(0,255,157,0.1);
        }
        .btn-logout {
            background: rgba(255, 0, 127, 0.15);
            border: 1px solid var(--neon-pink);
            color: var(--neon-pink);
            padding: 6px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 700;
        }

        /* Container */
        .container { max-width: 1200px; margin: 0 auto; padding: 25px 15px 80px; }
        .actions-deck {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            justify-content: space-between;
            align-items: center;
            background: var(--terminal-box);
            padding: 16px 20px;
            border-radius: 12px;
            border: 1px solid rgba(0, 240, 255, 0.3);
            margin-bottom: 25px;
        }
        .btn-action {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 18px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 800;
            cursor: pointer;
            border: none;
            text-transform: uppercase;
        }
        .btn-upload-cyber { background: var(--neon-green); color: #030712; box-shadow: 0 0 15px rgba(0, 255, 157, 0.3); }
        .btn-folder-cyber { background: rgba(0, 240, 255, 0.1); color: var(--neon-cyan); border: 1px solid var(--neon-cyan); }

        .cyber-breadcrumb {
            background: #060913;
            padding: 10px 15px;
            border-radius: 8px;
            border-left: 4px solid var(--neon-green);
            font-size: 13px;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            gap: 8px;
            overflow-x: auto;
            white-space: nowrap;
        }
        .cyber-breadcrumb span { cursor: pointer; color: var(--neon-cyan); }
        .cyber-breadcrumb .active-path { color: #fff; font-weight: 700; }

        .section-header {
            font-size: 13px;
            font-weight: 800;
            color: var(--neon-green);
            text-transform: uppercase;
            letter-spacing: 2px;
            margin: 25px 0 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .section-header::after { content: ""; flex: 1; height: 1px; background: rgba(0,255,157,0.2); }

        /* Grids */
        .folders-matrix { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 15px; }
        .folder-node {
            background: linear-gradient(145deg, #0d1527, #070a14);
            border: 1px solid var(--neon-cyan);
            border-radius: 12px;
            padding: 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            transition: 0.2s;
        }
        .folder-node:hover { border-color: var(--neon-green); box-shadow: 0 0 15px rgba(0, 255, 157, 0.3); }
        .folder-info { display: flex; align-items: center; gap: 8px; overflow: hidden; }
        .folder-txt { font-size: 12px; font-weight: 700; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .files-matrix { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
        .cyber-card {
            background: #090e1c;
            border: 1px solid rgba(157, 78, 221, 0.4);
            border-radius: 12px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            transition: 0.2s;
        }
        .cyber-card:hover { border-color: var(--neon-pink); box-shadow: 0 0 20px rgba(255, 0, 127, 0.3); }
        .card-preview { height: 140px; background: #03050a; display: flex; align-items: center; justify-content: center; position: relative; cursor: pointer; }
        .card-preview img, .card-preview video { width: 100%; height: 100%; object-fit: cover; }
        .play-indicator { position: absolute; width: 40px; height: 40px; background: rgba(0,0,0,0.7); border: 2px solid var(--neon-green); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--neon-green); }
        .card-footer { padding: 10px; background: #0b1224; display: flex; justify-content: space-between; align-items: center; }
        .file-title { font-size: 11px; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 85px; }
        .btn-icon { background: none; border: none; font-size: 14px; cursor: pointer; text-decoration: none; padding: 2px; }

        /* Modal */
        .cyber-modal { position: fixed; inset: 0; background: rgba(3, 5, 10, 0.95); backdrop-filter: blur(15px); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
        .modal-body { max-width: 95%; max-height: 85vh; border: 2px solid var(--neon-green); border-radius: 12px; overflow: hidden; }
        .modal-body img, .modal-body video { max-width: 100%; max-height: 80vh; }
        .close-cyber { position: absolute; top: 25px; right: 30px; font-size: 28px; color: var(--neon-pink); background: none; border: none; cursor: pointer; }
    </style>
</head>
<body>

    <!-- ১. লগইন ও রেজিস্ট্রেশন ভিউ -->
    <div id="loginView" class="login-wrap">
        <div class="login-card">
            <h1>PRINCE SHUVO</h1>
            <div class="tabs">
                <button class="tab-btn active" id="tabLogin" onclick="switchAuthTab('login')">লগইন</button>
                <button class="tab-btn" id="tabReg" onclick="switchAuthTab('reg')">নতুন অ্যাকাউন্ট</button>
            </div>
            <form onsubmit="handleAuthSubmit(event)">
                <input type="text" id="authUsername" class="cyber-input" placeholder="[ইউজারনেম দিন...]" required autocomplete="off">
                <input type="password" id="authPassword" class="cyber-input" placeholder="[পাসওয়ার্ড দিন...]" required autocomplete="off">
                <button type="submit" class="btn-hack" id="authBtn">> প্রবেশ করুন_</button>
            </form>
            <div id="authMsg" style="font-size:12px; margin-top:15px; font-weight:700;"></div>
        </div>
    </div>

    <!-- ২. ড্যাশবোর্ড স্ক্রিন -->
    <div id="dashView" class="hidden">
        <header>
            <div class="logo-title">PRINCE SHUVO</div>
            <div class="hud-badges">
                <span class="badge-hud" id="hudUser">[AGENT: USER]</span>
                <button class="btn-logout" onclick="logout()">[LOGOUT]</button>
            </div>
        </header>

        <main class="container">
            <div class="actions-deck">
                <div style="display:flex; gap:10px;">
                    <button class="btn-action btn-upload-cyber" onclick="document.getElementById('filePicker').click()">
                        ⚡ ফাইল আপলোড
                    </button>
                    <input type="file" id="filePicker" multiple accept="image/*,video/*" class="hidden" onchange="uploadSelected(this)">
                    <button class="btn-action btn-folder-cyber" onclick="promptNewFolder()">
                        📁 + নতুন ফোল্ডার
                    </button>
                </div>
                <div id="uploadStatus" style="font-size:12px; color:var(--neon-green); font-weight:800;"></div>
            </div>

            <div class="cyber-breadcrumb" id="breadcrumbNav"></div>

            <div id="folderSec" class="hidden">
                <div class="section-header">// ফোল্ডারসমূহ</div>
                <div class="folders-matrix" id="foldersGrid"></div>
            </div>

            <div class="section-header">// ফাইল ও ভিডিও</div>
            <div class="files-matrix" id="filesGrid"></div>
        </main>
    </div>

    <!-- লাইটবক্স -->
    <div id="previewModal" class="cyber-modal hidden" onclick="closePreview()">
        <button class="close-cyber" onclick="closePreview()">✕</button>
        <div class="modal-body" id="modalTarget" onclick="event.stopPropagation()"></div>
    </div>

    <script>
        let currentAuthMode = 'login';
        let currentPath = '';

        function switchAuthTab(mode) {
            currentAuthMode = mode;
            document.getElementById('authMsg').textContent = '';
            if (mode === 'login') {
                document.getElementById('tabLogin').classList.add('active');
                document.getElementById('tabReg').classList.remove('active');
                document.getElementById('authBtn').textContent = '> প্রবেশ করুন_';
            } else {
                document.getElementById('tabReg').classList.add('active');
                document.getElementById('tabLogin').classList.remove('active');
                document.getElementById('authBtn').textContent = '> অ্যাকাউন্ট তৈরি করুন_';
            }
        }

        async function checkAuth() {
            try {
                const res = await fetch('/api/check');
                const data = await res.json();
                if (data.success) showDashboard(data.username);
            } catch (e) {}
        }
        checkAuth();

        async function handleAuthSubmit(e) {
            e.preventDefault();
            const username = document.getElementById('authUsername').value;
            const password = document.getElementById('authPassword').value;
            const msg = document.getElementById('authMsg');
            const btn = document.getElementById('authBtn');

            msg.textContent = 'অপেক্ষা করুন...';
            msg.style.color = 'var(--neon-green)';

            const endpoint = currentAuthMode === 'login' ? '/api/login' : '/api/register';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (data.success) {
                if (currentAuthMode === 'login') {
                    showDashboard(data.username);
                } else {
                    msg.textContent = data.message;
                    setTimeout(() => switchAuthTab('login'), 1000);
                }
            } else {
                msg.style.color = 'var(--neon-pink)';
                msg.textContent = data.message;
            }
        }

        function showDashboard(username) {
            document.getElementById('loginView').classList.add('hidden');
            document.getElementById('dashView').classList.remove('hidden');
            document.getElementById('hudUser').textContent = '[AGENT: ' + username.toUpperCase() + ']';
            loadContent('');
        }

        async function loadContent(path = '') {
            currentPath = path;
            renderBreadcrumb(path);

            const res = await fetch('/api/files?path=' + encodeURIComponent(path));
            const data = await res.json();
            if (!data.success) return;

            // ফোল্ডার
            const folderSec = document.getElementById('folderSec');
            const foldersGrid = document.getElementById('foldersGrid');
            foldersGrid.innerHTML = '';
            if (data.folders.length > 0) {
                folderSec.classList.remove('hidden');
                data.folders.forEach(f => {
                    const node = document.createElement('div');
                    node.className = 'folder-node';
                    node.innerHTML = \`
                        <div class="folder-info" onclick="loadContent('\${f.path}')">
                            <span style="color:var(--neon-cyan)">📁</span>
                            <span class="folder-txt">\${f.name}</span>
                        </div>
                        <button class="btn-icon" style="color:var(--neon-pink)" onclick="deleteItem('\${f.path}')">🗑️</button>
                    \`;
                    foldersGrid.appendChild(node);
                });
            } else {
                folderSec.classList.add('hidden');
            }

            // ফাইল
            const filesGrid = document.getElementById('filesGrid');
            filesGrid.innerHTML = '';
            if (data.files.length > 0) {
                data.files.forEach(f => {
                    const card = document.createElement('div');
                    card.className = 'cyber-card';

                    let mediaHtml = '<div style="font-size:36px;">📄</div>';
                    if (f.type === 'image') mediaHtml = \`<img src="\${f.url}" loading="lazy">\`;
                    if (f.type === 'video') mediaHtml = \`<video src="\${f.url}#t=0.5"></video><div class="play-indicator">▶</div>\`;

                    card.innerHTML = \`
                        <div class="card-preview" onclick="openPreview('\${f.url}', '\${f.type}')">\${mediaHtml}</div>
                        <div class="card-footer">
                            <div class="file-title" title="\${f.name}">\${f.name.replace(/^[0-9]+-/, '')}</div>
                            <div>
                                <a href="\${f.url}" download class="btn-icon" style="color:var(--neon-cyan)">⬇</a>
                                <button class="btn-icon" style="color:var(--neon-pink)" onclick="deleteItem('\${f.path}')">🗑️</button>
                            </div>
                        </div>
                    \`;
                    filesGrid.appendChild(card);
                });
            } else {
                filesGrid.innerHTML = '<p style="color:#64748b; font-size:12px; grid-column: 1/-1;">কোনো ফাইল নেই।</p>';
            }
        }

        function renderBreadcrumb(path) {
            const nav = document.getElementById('breadcrumbNav');
            nav.innerHTML = '<span onclick="loadContent(\\'\\')">🏠 MY_VAULT</span>';
            if (!path) return;

            const parts = path.split('/');
            let accum = '';
            parts.forEach((p, idx) => {
                accum += (idx === 0 ? '' : '/') + p;
                const isLast = idx === parts.length - 1;
                const currentAccum = accum;
                nav.innerHTML += \` <span style="color:#475569">/</span> <span class="\${isLast ? 'active-path' : ''}" onclick="loadContent('\${currentAccum}')">\${p}</span>\`;
            });
        }

        async function promptNewFolder() {
            const name = prompt('ফোল্ডারের নাম দিন:');
            if (!name) return;
            const res = await fetch('/api/create-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderName: name, currentPath })
            });
            const data = await res.json();
            if (data.success) loadContent(currentPath);
            else alert(data.message || 'ব্যর্থ হয়েছে');
        }

        async function uploadSelected(input) {
            if (!input.files.length) return;
            const status = document.getElementById('uploadStatus');
            status.textContent = 'আপলোড হচ্ছে...';

            const formData = new FormData();
            formData.append('folderPath', currentPath);
            for (let f of input.files) formData.append('files', f);

            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            status.textContent = '';
            input.value = '';
            if (data.success) loadContent(currentPath);
            else alert('আপলোড ব্যর্থ হয়েছে');
        }

        async function deleteItem(itemPath) {
            if (!confirm('মুছে ফেলতে চান?')) return;
            await fetch('/api/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: itemPath })
            });
            loadContent(currentPath);
        }

        function openPreview(url, type) {
            const modal = document.getElementById('previewModal');
            const target = document.getElementById('modalTarget');
            target.innerHTML = '';
            if (type === 'image') target.innerHTML = \`<img src="\${url}">\`;
            else if (type === 'video') target.innerHTML = \`<video src="\${url}" controls autoplay></video>\`;
            else { window.open(url, '_blank'); return; }
            modal.classList.remove('hidden');
        }

        function closePreview() {
            document.getElementById('previewModal').classList.add('hidden');
            document.getElementById('modalTarget').innerHTML = '';
        }

        async function logout() {
            await fetch('/api/logout', { method: 'POST' });
            location.reload();
        }
    </script>
</body>
</html>
    `);
});

app.listen(PORT, () => console.log('PRINCE SHUVO Multi-User Cloud running on ' + PORT));
