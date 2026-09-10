const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'PRINCE_SHUVO_PRO_SECRET_KEY_9988';
const SECRET_CODE = process.env.SECRET_CODE || 'PRINCEHACK';

app.use(express.json());
app.use(cookieParser());

// আপলোড ডিরেক্টরি
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ডিরেক্টরি ট্রাভার্সাল ঠেকানোর সেফ-পাথ ফাংশন
function getSafePath(reqPath = '') {
    const safe = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    const resolved = path.join(uploadDir, safe);
    if (!resolved.startsWith(uploadDir)) return uploadDir;
    return resolved;
}

// রেট লিমিটার
const loginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'অনেকবার ভুল চেষ্টা করা হয়েছে! ১০ মিনিট পর ট্রাই করুন।' }
});

// অথেনটিকেশন চেক
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

// ফাইল আপলোড ইঞ্জিন (Multer)
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
const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } }); // ১ জিবি লিমিট

// ১. লগইন রুট
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
    return res.status(401).json({ success: false, message: 'সিক্রেট কোড সঠিক নয়!' });
});

// ২. সেশন চেক
app.get('/api/check', verifyAuth, (req, res) => res.json({ success: true }));

// ৩. ফাইল ও ফোল্ডারের তালিকা আনা
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

// ৪. নতুন ফোল্ডার তৈরি
app.post('/api/create-folder', verifyAuth, (req, res) => {
    const { folderName, currentPath } = req.body;
    if (!folderName) return res.status(400).json({ success: false, message: 'নাম দেওয়া হয়নি' });

    const cleanFolderName = folderName.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    const newDirPath = path.join(getSafePath(currentPath || ''), cleanFolderName);

    if (fs.existsSync(newDirPath)) {
        return res.status(400).json({ success: false, message: 'এই নামের ফোল্ডার ইতিমধ্যে রয়েছে!' });
    }

    fs.mkdirSync(newDirPath, { recursive: true });
    res.json({ success: true });
});

// ৫. ফাইল আপলোড
app.post('/api/upload', verifyAuth, upload.array('files'), (req, res) => {
    res.json({ success: true });
});

// ৬. ফাইল প্রদর্শন ও স্ট্রিমিং
app.get('/stream', verifyAuth, (req, res) => {
    const filePath = getSafePath(req.query.path || '');
    if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isDirectory()) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('পাওয়া যায়নি');
    }
});

// ৭. ফাইল বা ফোল্ডার ডিলিট
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

// ৮. লগআউট
app.post('/api/logout', (req, res) => {
    res.clearCookie('ps_token');
    res.json({ success: true });
});

// ৯. প্রফেশনাল ফ্রন্টএন্ড UI
app.get('*', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PRINCE SHUVO - Private Cloud</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-main: #090d16;
            --surface: #111827;
            --surface-card: #182234;
            --border: #243247;
            --accent: #10b981;
            --accent-glow: rgba(16, 185, 129, 0.25);
            --danger: #ef4444;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
        body { background: var(--bg-main); color: var(--text-main); min-height: 100vh; overflow-x: hidden; }
        .hidden { display: none !important; }

        /* Login Interface */
        .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: radial-gradient(circle at top, #18273f 0%, #090d16 100%); }
        .login-card { background: rgba(17, 24, 39, 0.85); backdrop-filter: blur(16px); border: 1px solid var(--border); border-radius: 20px; padding: 40px 30px; width: 100%; max-width: 390px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        .brand-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 14px; background: rgba(16, 185, 129, 0.12); color: var(--accent); border-radius: 50px; font-size: 11px; font-weight: 700; letter-spacing: 1px; margin-bottom: 20px; border: 1px solid rgba(16, 185, 129, 0.2); }
        .login-card h1 { font-size: 26px; font-weight: 800; letter-spacing: 1.5px; color: #fff; margin-bottom: 6px; }
        .login-card p { font-size: 13px; color: var(--text-muted); margin-bottom: 30px; }
        .input-group { position: relative; margin-bottom: 20px; }
        .input-group input { width: 100%; padding: 14px 18px; background: #0c121d; border: 1.5px solid var(--border); border-radius: 12px; color: #fff; font-size: 15px; outline: none; transition: 0.3s; text-align: center; letter-spacing: 1px; }
        .input-group input:focus { border-color: var(--accent); box-shadow: 0 0 15px var(--accent-glow); }
        .btn-primary { width: 100%; padding: 14px; background: var(--accent); color: #021a11; font-weight: 700; font-size: 14px; border: none; border-radius: 12px; cursor: pointer; transition: 0.3s; box-shadow: 0 4px 15px var(--accent-glow); }
        .btn-primary:hover { opacity: 0.95; transform: translateY(-1px); }

        /* Dashboard Header */
        header { background: rgba(17, 24, 39, 0.9); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 50; }
        .logo-box { display: flex; align-items: center; gap: 10px; }
        .logo-box span { font-weight: 800; font-size: 17px; letter-spacing: 1px; color: var(--text-main); }
        .logo-box .badge { background: var(--accent); color: #000; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 6px; }
        .btn-danger-sm { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; padding: 7px 14px; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer; }

        /* Main Container */
        .container { max-width: 1200px; margin: 0 auto; padding: 24px 20px 80px; }

        /* Actions Bar */
        .actions-bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 25px; }
        .btn-action { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer; border: none; transition: 0.2s; }
        .btn-upload { background: var(--accent); color: #021a11; }
        .btn-folder { background: var(--surface-card); border: 1px solid var(--border); color: #fff; }

        /* Breadcrumb Navigation */
        .breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); margin-bottom: 20px; overflow-x: auto; white-space: nowrap; padding-bottom: 6px; }
        .breadcrumb span { cursor: pointer; transition: 0.2s; }
        .breadcrumb span:hover { color: var(--accent); }
        .breadcrumb .current { color: #fff; font-weight: 600; }

        /* Section Title */
        .sec-title { font-size: 14px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 14px; }

        /* Folders Grid */
        .folders-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; margin-bottom: 25px; }
        .folder-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 15px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: 0.2s; }
        .folder-card:hover { border-color: var(--accent); background: var(--surface-card); transform: translateY(-2px); }
        .folder-info { display: flex; align-items: center; gap: 10px; overflow: hidden; }
        .folder-icon { font-size: 20px; color: #fbbf24; }
        .folder-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* Files Grid */
        .files-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
        .file-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; transition: 0.2s; }
        .file-card:hover { border-color: #3b82f6; transform: translateY(-3px); }
        .preview-area { height: 140px; background: #06090e; display: flex; align-items: center; justify-content: center; position: relative; cursor: pointer; overflow: hidden; }
        .preview-area img, .preview-area video { width: 100%; height: 100%; object-fit: cover; }
        .play-overlay { position: absolute; background: rgba(0,0,0,0.6); border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .file-details { padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; background: var(--surface); }
        .file-meta { overflow: hidden; }
        .file-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 90px; }
        .file-btns { display: flex; gap: 6px; }
        .icon-btn { background: none; border: none; font-size: 14px; cursor: pointer; padding: 4px; border-radius: 4px; }
        .icon-btn:hover { background: rgba(255,255,255,0.1); }

        /* Lightbox Preview Modal */
        .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.92); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
        .modal-content { max-width: 90%; max-height: 85vh; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; align-items: center; }
        .modal-content img, .modal-content video { max-width: 100%; max-height: 80vh; border-radius: 10px; }
        .modal-close { position: absolute; top: 20px; right: 25px; font-size: 28px; color: #fff; cursor: pointer; background: none; border: none; }
    </style>
</head>
<body>

    <!-- ১. প্রফেশনাল লগইন ভিউ -->
    <div id="loginView" class="login-wrap">
        <div class="login-card">
            <div class="brand-badge">🔒 SECURE VAULT</div>
            <h1>PRINCE SHUVO</h1>
            <p>আপনার সিক্রেট পাসকোডটি প্রবেশ করান</p>
            <form onsubmit="handleLogin(event)">
                <div class="input-group">
                    <input type="password" id="passCode" placeholder="Enter Secret Code..." required autocomplete="off">
                </div>
                <button type="submit" class="btn-primary" id="loginSubmitBtn">ড্রাইভে প্রবেশ করুন</button>
            </form>
            <div id="loginErr" style="color:var(--danger); font-size:13px; margin-top:15px;"></div>
        </div>
    </div>

    <!-- ২. ড্যাশবোর্ড ইন্টারফেস -->
    <div id="dashView" class="hidden">
        <header>
            <div class="logo-box">
                <span>PRINCE SHUVO</span>
                <span class="badge">PRO</span>
            </div>
            <button class="btn-danger-sm" onclick="logout()">লগআউট</button>
        </header>

        <main class="container">
            <!-- একশন বাটনসমূহ -->
            <div class="actions-bar">
                <div style="display:flex; gap:10px;">
                    <button class="btn-action btn-upload" onclick="document.getElementById('filePicker').click()">
                        ⬆ আপলোড ফাইল
                    </button>
                    <input type="file" id="filePicker" multiple accept="image/*,video/*" class="hidden" onchange="uploadSelected(this)">
                    <button class="btn-action btn-folder" onclick="promptNewFolder()">
                        📁 নতুন ফোল্ডার
                    </button>
                </div>
                <div id="uploadStatus" style="font-size:13px; color:var(--accent); font-weight:600;"></div>
            </div>

            <!-- ফোল্ডার পাথ নেভিগেশন (Breadcrumb) -->
            <div class="breadcrumb" id="breadcrumbNav"></div>

            <!-- ফোল্ডার সেকশন -->
            <div id="folderSec" class="hidden">
                <div class="sec-title">ফোল্ডারসমূহ</div>
                <div class="folders-grid" id="foldersGrid"></div>
            </div>

            <!-- ফাইল ও মিডিয়া সেকশন -->
            <div class="sec-title">ফাইল ও মিডিয়া</div>
            <div class="files-grid" id="filesGrid"></div>
        </main>
    </div>

    <!-- ৩. ছবি ও ভিডিও প্রিভিউ মোডাল -->
    <div id="previewModal" class="modal hidden" onclick="closePreview(event)">
        <button class="modal-close" onclick="closePreview()">&times;</button>
        <div class="modal-content" id="modalTarget" onclick="event.stopPropagation()"></div>
    </div>

    <script>
        let currentPath = '';

        // সেশন যাচাই
        async function checkAuth() {
            try {
                const res = await fetch('/api/check');
                const data = await res.json();
                if (data.success) showDashboard();
            } catch (e) {}
        }
        checkAuth();

        // লগইন ফাংশন
        async function handleLogin(e) {
            e.preventDefault();
            const btn = document.getElementById('loginSubmitBtn');
            const err = document.getElementById('loginErr');
            const code = document.getElementById('passCode').value;

            btn.textContent = 'ভেরিফাই হচ্ছে...';
            err.textContent = '';

            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            const data = await res.json();

            if (data.success) {
                showDashboard();
            } else {
                err.textContent = data.message || 'ভুল কোড!';
                btn.textContent = 'ড্রাইভে প্রবেশ করুন';
            }
        }

        function showDashboard() {
            document.getElementById('loginView').classList.add('hidden');
            document.getElementById('dashView').classList.remove('hidden');
            loadContent('');
        }

        // কনটেন্ট লোড
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
                    const card = document.createElement('div');
                    card.className = 'folder-card';
                    card.innerHTML = \`
                        <div class="folder-info" onclick="loadContent('\${f.path}')">
                            <span class="folder-icon">📁</span>
                            <span class="folder-name">\${f.name}</span>
                        </div>
                        <button class="icon-btn" style="color:var(--danger)" onclick="deleteItem('\${f.path}')">🗑️</button>
                    \`;
                    foldersGrid.appendChild(card);
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
                    card.className = 'file-card';

                    let mediaHtml = '<div style="font-size:32px;">📄</div>';
                    if (f.type === 'image') {
                        mediaHtml = \`<img src="\${f.url}" loading="lazy">\`;
                    } else if (f.type === 'video') {
                        mediaHtml = \`
                            <video src="\${f.url}#t=0.5"></video>
                            <div class="play-overlay">▶</div>
                        \`;
                    }

                    card.innerHTML = \`
                        <div class="preview-area" onclick="openPreview('\${f.url}', '\${f.type}')">
                            \${mediaHtml}
                        </div>
                        <div class="file-details">
                            <div class="file-meta">
                                <div class="file-name" title="\${f.name}">\${f.name.replace(/^[0-9]+-/, '')}</div>
                            </div>
                            <div class="file-btns">
                                <a href="\${f.url}" download class="icon-btn" style="text-decoration:none;">⬇</a>
                                <button class="icon-btn" style="color:var(--danger)" onclick="deleteItem('\${f.path}')">🗑️</button>
                            </div>
                        </div>
                    \`;
                    filesGrid.appendChild(card);
                });
            } else {
                filesGrid.innerHTML = '<p style="color:var(--text-muted); font-size:13px; grid-column: 1/-1;">কোনো ফাইল আপলোড করা নেই।</p>';
            }
        }

        // Breadcrumb পাথ নেভিগেশন
        function renderBreadcrumb(path) {
            const nav = document.getElementById('breadcrumbNav');
            nav.innerHTML = '<span onclick="loadContent(\\'\\')">🏠 Root</span>';
            if (!path) return;

            const parts = path.split('/');
            let accum = '';
            parts.forEach((p, idx) => {
                accum += (idx === 0 ? '' : '/') + p;
                const isLast = idx === parts.length - 1;
                const currentAccum = accum;
                nav.innerHTML += \` <span>/</span> <span class="\${isLast ? 'current' : ''}" onclick="loadContent('\${currentAccum}')">\${p}</span>\`;
            });
        }

        // ফোল্ডার তৈরি
        async function promptNewFolder() {
            const name = prompt('নতুন ফোল্ডারের নাম দিন:');
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

        // আপলোড
        async function uploadSelected(input) {
            if (!input.files.length) return;
            const status = document.getElementById('uploadStatus');
            status.textContent = 'আপলোড হচ্ছে... একটু অপেক্ষা করুন';

            const formData = new FormData();
            formData.append('folderPath', currentPath);
            for (let f of input.files) formData.append('files', f);

            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            status.textContent = '';
            input.value = '';
            if (data.success) loadContent(currentPath);
            else alert('আপলোড ব্যর্থ হয়েছে!');
        }

        // ডিলিট
        async function deleteItem(itemPath) {
            if (!confirm('সত্যিই এটি মুছে ফেলতে চান?')) return;
            await fetch('/api/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: itemPath })
            });
            loadContent(currentPath);
        }

        // প্রিভিউ লাইটবক্স
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

        function closePreview(e) {
            const modal = document.getElementById('previewModal');
            const target = document.getElementById('modalTarget');
            target.innerHTML = '';
            modal.classList.add('hidden');
        }

        // লগআউট
        async function logout() {
            await fetch('/api/logout', { method: 'POST' });
            location.reload();
        }
    </script>
</body>
</html>
    `);
});

app.listen(PORT, () => console.log('PRINCE SHUVO Cloud Pro running on ' + PORT));
