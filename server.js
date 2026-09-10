const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'PRINCE_HACKER_MAINFRAME_VAULT_2026';
const SECRET_CODE = process.env.SECRET_CODE || 'PRINCEHACK';

app.use(express.json());
app.use(cookieParser());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

function getSafePath(reqPath = '') {
    const safe = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    const resolved = path.join(uploadDir, safe);
    if (!resolved.startsWith(uploadDir)) return uploadDir;
    return resolved;
}

const loginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: { success: false, message: '[ACCESS DENIED] বারবার ভুল এন্ট্রি! আইপি সাময়িকভাবে লক।' }
});

const verifyAuth = (req, res, next) => {
    const token = req.cookies.ps_token;
    if (!token) return res.status(401).json({ success: false });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.user === 'PRINCE_SHUVO') next();
        else res.status(403).json({ success: false });
    } catch (e) {
        res.status(401).json({ success: false });
    }
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const targetDir = getSafePath(req.body.folderPath || '');
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, Date.now() + '-' + cleanName);
    }
});
const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } });

app.post('/api/login', loginLimiter, (req, res) => {
    if (req.body.code === SECRET_CODE) {
        const token = jwt.sign({ user: 'PRINCE_SHUVO' }, JWT_SECRET, { expiresIn: '30d' });
        res.cookie('ps_token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000
        });
        return res.json({ success: true });
    }
    return res.status(401).json({ success: false, message: '[ERROR 403] অবৈধ সিক্রেট পাসকোড!' });
});

app.get('/api/check', verifyAuth, (req, res) => res.json({ success: true }));

app.get('/api/files', verifyAuth, (req, res) => {
    const relPath = req.query.path || '';
    const targetDir = getSafePath(relPath);

    if (!fs.existsSync(targetDir)) return res.status(404).json({ success: false });

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

app.post('/api/create-folder', verifyAuth, (req, res) => {
    const { folderName, currentPath } = req.body;
    if (!folderName) return res.status(400).json({ success: false, message: 'নাম দেওয়া হয়নি' });

    const cleanFolderName = folderName.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    const newDirPath = path.join(getSafePath(currentPath || ''), cleanFolderName);

    if (fs.existsSync(newDirPath)) {
        return res.status(400).json({ success: false, message: 'ফোল্ডারটি ইতিমধ্যে আছে!' });
    }

    fs.mkdirSync(newDirPath, { recursive: true });
    res.json({ success: true });
});

app.post('/api/upload', verifyAuth, upload.array('files'), (req, res) => {
    res.json({ success: true });
});

app.get('/stream', verifyAuth, (req, res) => {
    const filePath = getSafePath(req.query.path || '');
    if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isDirectory()) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Not Found');
    }
});

app.delete('/api/delete', verifyAuth, (req, res) => {
    const targetPath = getSafePath(req.body.path || '');
    if (targetPath === uploadDir) return res.status(400).json({ success: false });

    if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('ps_token');
    res.json({ success: true });
});

app.get('*', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PRINCE SHUVO // CLOUD MAINFRAME</title>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;800&family=Orbitron:wght@600;800;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-black: #05070d;
            --neon-green: #00ff9d;
            --neon-cyan: #00f0ff;
            --neon-pink: #ff007f;
            --neon-purple: #9d4edd;
            --terminal-box: #0b111e;
            --border-glow: rgba(0, 255, 157, 0.3);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'JetBrains Mono', monospace; }
        body {
            background-color: var(--bg-black);
            color: #d1d5db;
            min-height: 100vh;
            background-image: radial-gradient(rgba(0, 240, 255, 0.08) 1px, transparent 1px), radial-gradient(rgba(0, 255, 157, 0.05) 1px, var(--bg-black) 1px);
            background-size: 30px 30px;
            background-position: 0 0, 15px 15px;
            overflow-x: hidden;
        }
        .hidden { display: none !important; }

        /* Glowing Hacker Login */
        .login-wrap {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .login-card {
            background: rgba(11, 17, 30, 0.92);
            backdrop-filter: blur(20px);
            border: 2px solid var(--neon-cyan);
            border-radius: 16px;
            padding: 40px 30px;
            width: 100%;
            max-width: 420px;
            box-shadow: 0 0 35px rgba(0, 240, 255, 0.35), inset 0 0 20px rgba(0, 240, 255, 0.1);
            text-align: center;
            position: relative;
        }
        .login-card::before {
            content: "ROOT@PRINCE_MAINFRAME";
            position: absolute;
            top: -12px;
            left: 20px;
            background: var(--bg-black);
            color: var(--neon-cyan);
            font-size: 11px;
            padding: 2px 10px;
            border: 1px solid var(--neon-cyan);
            border-radius: 4px;
            font-weight: 800;
        }
        .login-card h1 {
            font-family: 'Orbitron', sans-serif;
            font-size: 28px;
            font-weight: 900;
            color: #fff;
            text-shadow: 0 0 10px var(--neon-green), 0 0 20px var(--neon-green);
            margin: 10px 0 5px;
            letter-spacing: 2px;
        }
        .badge-status {
            display: inline-block;
            color: var(--neon-green);
            font-size: 12px;
            margin-bottom: 25px;
            background: rgba(0, 255, 157, 0.1);
            padding: 4px 12px;
            border-radius: 20px;
            border: 1px solid rgba(0, 255, 157, 0.4);
            animation: pulse 2s infinite;
        }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .cyber-input {
            width: 100%;
            padding: 15px;
            background: #060911;
            border: 2px solid #1e293b;
            color: var(--neon-green);
            font-size: 17px;
            text-align: center;
            border-radius: 8px;
            outline: none;
            margin-bottom: 20px;
            transition: 0.3s;
            letter-spacing: 3px;
        }
        .cyber-input:focus {
            border-color: var(--neon-green);
            box-shadow: 0 0 15px rgba(0, 255, 157, 0.4);
        }
        .btn-hack {
            width: 100%;
            padding: 15px;
            background: linear-gradient(90deg, var(--neon-green), var(--neon-cyan));
            color: #030712;
            font-family: 'Orbitron', sans-serif;
            font-weight: 900;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            letter-spacing: 1.5px;
            box-shadow: 0 0 20px rgba(0, 255, 157, 0.4);
            transition: 0.2s;
        }
        .btn-hack:hover {
            transform: scale(1.02);
            box-shadow: 0 0 30px rgba(0, 240, 255, 0.6);
        }

        /* Top HUD Header */
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
            font-size: 19px;
            color: var(--neon-green);
            text-shadow: 0 0 10px rgba(0, 255, 157, 0.6);
            letter-spacing: 1px;
        }
        .hud-badges {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .badge-hud {
            font-size: 11px;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: 700;
            border: 1px solid currentColor;
        }
        .b-green { color: var(--neon-green); border-color: var(--neon-green); background: rgba(0,255,157,0.1); }
        .b-purple { color: var(--neon-purple); border-color: var(--neon-purple); background: rgba(157,78,221,0.1); }
        .btn-logout {
            background: rgba(255, 0, 127, 0.15);
            border: 1px solid var(--neon-pink);
            color: var(--neon-pink);
            font-weight: 700;
            padding: 6px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            transition: 0.2s;
        }
        .btn-logout:hover { background: var(--neon-pink); color: #fff; box-shadow: 0 0 15px var(--neon-pink); }

        /* Main Workspace */
        .container { max-width: 1200px; margin: 0 auto; padding: 25px 15px 80px; }

        /* Actions Deck */
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
            box-shadow: 0 0 15px rgba(0, 240, 255, 0.1);
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
            transition: 0.2s;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .btn-upload-cyber {
            background: var(--neon-green);
            color: #030712;
            border: none;
            box-shadow: 0 0 15px rgba(0, 255, 157, 0.4);
        }
        .btn-folder-cyber {
            background: rgba(0, 240, 255, 0.1);
            color: var(--neon-cyan);
            border: 1px solid var(--neon-cyan);
            box-shadow: 0 0 15px rgba(0, 240, 255, 0.2);
        }
        .btn-action:hover { transform: translateY(-2px); }

        /* Terminal Breadcrumb */
        .cyber-breadcrumb {
            background: #060911;
            padding: 10px 15px;
            border-radius: 8px;
            border-left: 4px solid var(--neon-green);
            font-size: 13px;
            color: #94a3b8;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            gap: 8px;
            overflow-x: auto;
            white-space: nowrap;
        }
        .cyber-breadcrumb span { cursor: pointer; color: var(--neon-cyan); }
        .cyber-breadcrumb .active-path { color: #fff; font-weight: 700; }

        /* Headers */
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

        /* Folders Matrix */
        .folders-matrix {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 15px;
        }
        .folder-node {
            background: linear-gradient(145deg, #0d1527, #070a14);
            border: 1px solid var(--neon-cyan);
            border-radius: 12px;
            padding: 15px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            box-shadow: 0 0 10px rgba(0, 240, 255, 0.1);
            transition: 0.3s;
        }
        .folder-node:hover {
            border-color: var(--neon-green);
            transform: translateY(-3px);
            box-shadow: 0 0 20px rgba(0, 255, 157, 0.3);
        }
        .folder-info { display: flex; align-items: center; gap: 10px; overflow: hidden; }
        .folder-ico { color: var(--neon-cyan); font-size: 20px; }
        .folder-txt { font-size: 13px; font-weight: 700; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* Files Matrix */
        .files-matrix {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 18px;
        }
        .cyber-card {
            background: #090e1c;
            border: 1px solid rgba(157, 78, 221, 0.4);
            border-radius: 12px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 0 15px rgba(157, 78, 221, 0.15);
            transition: 0.3s;
        }
        .cyber-card:hover {
            border-color: var(--neon-pink);
            transform: translateY(-4px);
            box-shadow: 0 0 25px rgba(255, 0, 127, 0.3);
        }
        .card-preview {
            height: 140px;
            background: #03050a;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            cursor: pointer;
        }
        .card-preview img, .card-preview video { width: 100%; height: 100%; object-fit: cover; }
        .play-indicator {
            position: absolute;
            width: 44px;
            height: 44px;
            background: rgba(0,0,0,0.7);
            border: 2px solid var(--neon-green);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--neon-green);
            box-shadow: 0 0 15px var(--neon-green);
        }
        .card-footer {
            padding: 12px;
            background: #0b1224;
            border-top: 1px solid rgba(255,255,255,0.05);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .file-title {
            font-size: 11px;
            color: #cbd5e1;
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            width: 85px;
        }
        .btn-icon {
            background: none;
            border: none;
            font-size: 14px;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            transition: 0.2s;
            text-decoration: none;
        }
        .btn-down { color: var(--neon-cyan); }
        .btn-down:hover { text-shadow: 0 0 10px var(--neon-cyan); }
        .btn-del { color: var(--neon-pink); }
        .btn-del:hover { text-shadow: 0 0 10px var(--neon-pink); }

        /* Modal Lightbox */
        .cyber-modal {
            position: fixed;
            inset: 0;
            background: rgba(3, 5, 10, 0.95);
            backdrop-filter: blur(15px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
            padding: 20px;
        }
        .modal-body {
            max-width: 95%;
            max-height: 85vh;
            border: 2px solid var(--neon-green);
            box-shadow: 0 0 40px rgba(0, 255, 157, 0.4);
            border-radius: 12px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #000;
        }
        .modal-body img, .modal-body video { max-width: 100%; max-height: 80vh; }
        .close-cyber {
            position: absolute;
            top: 25px;
            right: 30px;
            font-size: 30px;
            color: var(--neon-pink);
            background: none;
            border: none;
            cursor: pointer;
            font-weight: bold;
            text-shadow: 0 0 15px var(--neon-pink);
        }
    </style>
</head>
<body>

    <!-- হ্যাকার লগইন স্ক্রিন -->
    <div id="loginView" class="login-wrap">
        <div class="login-card">
            <h1>PRINCE SHUVO</h1>
            <div class="badge-status">● SYSTEM: ENCRYPTED // PORT: 3000</div>
            <form onsubmit="handleLogin(event)">
                <input type="password" id="passCode" class="cyber-input" placeholder="[PASSKEY]" required autocomplete="off">
                <button type="submit" class="btn-hack" id="loginBtn">> INITIATE ACCESS_</button>
            </form>
            <div id="loginMsg" style="color:var(--neon-pink); font-size:12px; margin-top:15px; font-weight:700;"></div>
        </div>
    </div>

    <!-- ড্যাশবোর্ড স্ক্রিন -->
    <div id="dashView" class="hidden">
        <header>
            <div class="logo-title">PRINCE SHUVO // CLOUD</div>
            <div class="hud-badges">
                <span class="badge-hud b-green">[ROOT_ONLINE]</span>
                <span class="badge-hud b-purple">[AES-256]</span>
                <button class="btn-logout" onclick="logout()">[TERMINATE]</button>
            </div>
        </header>

        <main class="container">
            <div class="actions-deck">
                <div style="display:flex; gap:10px;">
                    <button class="btn-action btn-upload-cyber" onclick="document.getElementById('filePicker').click()">
                        ⚡ UPLOAD DATA
                    </button>
                    <input type="file" id="filePicker" multiple accept="image/*,video/*" class="hidden" onchange="uploadSelected(this)">
                    <button class="btn-action btn-folder-cyber" onclick="promptNewFolder()">
                        📁 + MKDIR
                    </button>
                </div>
                <div id="uploadStatus" style="font-size:12px; color:var(--neon-green); font-weight:800;"></div>
            </div>

            <!-- Breadcrumb Navigation -->
            <div class="cyber-breadcrumb" id="breadcrumbNav"></div>

            <!-- ফোল্ডার সেকশন -->
            <div id="folderSec" class="hidden">
                <div class="section-header">// ACTIVE_DIRECTORIES</div>
                <div class="folders-matrix" id="foldersGrid"></div>
            </div>

            <!-- ফাইল সেকশন -->
            <div class="section-header">// STORED_PAYLOADS & MEDIA</div>
            <div class="files-matrix" id="filesGrid"></div>
        </main>
    </div>

    <!-- লাইটবক্স প্রিভিউ মোডাল -->
    <div id="previewModal" class="cyber-modal hidden" onclick="closePreview()">
        <button class="close-cyber" onclick="closePreview()">✕ [CLOSE]</button>
        <div class="modal-body" id="modalTarget" onclick="event.stopPropagation()"></div>
    </div>

    <script>
        let currentPath = '';

        async function checkAuth() {
            try {
                const res = await fetch('/api/check');
                const data = await res.json();
                if (data.success) showDashboard();
            } catch (e) {}
        }
        checkAuth();

        async function handleLogin(e) {
            e.preventDefault();
            const btn = document.getElementById('loginBtn');
            const msg = document.getElementById('loginMsg');
            const code = document.getElementById('passCode').value;

            btn.textContent = '> DECRYPTING PASSKEY...';
            msg.textContent = '';

            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            const data = await res.json();

            if (data.success) {
                showDashboard();
            } else {
                msg.textContent = data.message || '[INVALID PASSKEY]';
                btn.textContent = '> INITIATE ACCESS_';
            }
        }

        function showDashboard() {
            document.getElementById('loginView').classList.add('hidden');
            document.getElementById('dashView').classList.remove('hidden');
            loadContent('');
        }

        async function loadContent(path = '') {
            currentPath = path;
            renderBreadcrumb(path);

            const res = await fetch('/api/files?path=' + encodeURIComponent(path));
            const data = await res.json();
            if (!data.success) return;

            // ফোল্ডার রেন্ডার
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
                            <span class="folder-ico">📁</span>
                            <span class="folder-txt">\${f.name}</span>
                        </div>
                        <button class="btn-icon btn-del" onclick="deleteItem('\${f.path}')">🗑️</button>
                    \`;
                    foldersGrid.appendChild(node);
                });
            } else {
                folderSec.classList.add('hidden');
            }

            // ফাইল রেন্ডার
            const filesGrid = document.getElementById('filesGrid');
            filesGrid.innerHTML = '';
            if (data.files.length > 0) {
                data.files.forEach(f => {
                    const card = document.createElement('div');
                    card.className = 'cyber-card';

                    let mediaHtml = '<div style="font-size:36px;">📄</div>';
                    if (f.type === 'image') {
                        mediaHtml = \`<img src="\${f.url}" loading="lazy">\`;
                    } else if (f.type === 'video') {
                        mediaHtml = \`
                            <video src="\${f.url}#t=0.5"></video>
                            <div class="play-indicator">▶</div>
                        \`;
                    }

                    card.innerHTML = \`
                        <div class="card-preview" onclick="openPreview('\${f.url}', '\${f.type}')">
                            \${mediaHtml}
                        </div>
                        <div class="card-footer">
                            <div class="file-title" title="\${f.name}">\${f.name.replace(/^[0-9]+-/, '')}</div>
                            <div>
                                <a href="\${f.url}" download class="btn-icon btn-down">⬇</a>
                                <button class="btn-icon btn-del" onclick="deleteItem('\${f.path}')">🗑️</button>
                            </div>
                        </div>
                    \`;
                    filesGrid.appendChild(card);
                });
            } else {
                filesGrid.innerHTML = '<p style="color:#64748b; font-size:12px; grid-column: 1/-1;">// NO_PAYLOADS_FOUND_IN_NODE</p>';
            }
        }

        function renderBreadcrumb(path) {
            const nav = document.getElementById('breadcrumbNav');
            nav.innerHTML = '<span onclick="loadContent(\\'\\')">SYS:\\ROOT</span>';
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
            const name = prompt('[NEW_NODE] ফোল্ডারের নাম দিন:');
            if (!name) return;
            const res = await fetch('/api/create-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderName: name, currentPath })
            });
            const data = await res.json();
            if (data.success) loadContent(currentPath);
            else alert(data.message || 'ব্যর্থ হয়েছে!');
        }

        async function uploadSelected(input) {
            if (!input.files.length) return;
            const status = document.getElementById('uploadStatus');
            status.textContent = '> ENCRYPTING & UPLOADING DATA...';

            const formData = new FormData();
            formData.append('folderPath', currentPath);
            for (let f of input.files) formData.append('files', f);

            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            status.textContent = '';
            input.value = '';
            if (data.success) loadContent(currentPath);
            else alert('[UPLOAD_FAILED]');
        }

        async function deleteItem(itemPath) {
            if (!confirm('[PURGE] সত্যিই এটি মুছে ফেলতে চান?')) return;
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

            if (type === 'image') {
                target.innerHTML = \`<img src="\${url}">\`;
            } else if (type === 'video') {
                target.innerHTML = \`<video src="\${url}" controls autoplay></video>\`;
            } else {
                window.open(url, '_blank');
                return;
            }
            modal.classList.remove('hidden');
        }

        function closePreview() {
            const modal = document.getElementById('previewModal');
            document.getElementById('modalTarget').innerHTML = '';
            modal.classList.add('hidden');
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

app.listen(PORT, () => console.log('PRINCE SHUVO Cloud Mainframe running on ' + PORT));
