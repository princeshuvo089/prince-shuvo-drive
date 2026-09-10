const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'PRINCE_SHUVO_SUPER_SECRET_KEY_2026';
const SECRET_CODE = process.env.SECRET_CODE || 'PRINCEHACK';

app.use(express.json());
app.use(cookieParser());

// আপলোড ফোল্ডার
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ব্রুট-ফোর্স প্রোটেকশন (টানা ৫ বার ভুল কোড দিলে ১০ মিনিট ব্লক)
const loginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'অনেকবার ভুল চেষ্টা হয়েছে! ১০ মিনিট পর চেষ্টা করুন।' }
});

// অথেনটিকেশন চেক
const verifyAuth = (req, res, next) => {
    const token = req.cookies.ps_token;
    if (!token) return res.status(401).json({ success: false, message: 'লগইন প্রয়োজন!' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.user === 'PRINCE_SHUVO') next();
        else res.status(403).json({ success: false });
    } catch (e) {
        res.status(401).json({ success: false });
    }
};

// ফাইল স্টোরেজ কনফিগারেশন
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, Date.now() + '-' + cleanName);
    }
});
const upload = multer({ 
    storage,
    limits: { fileSize: 1024 * 1024 * 500 } // প্রতি ফাইলে সর্বোচ্চ ৫০০ এমবি
});

// ১. লগইন রুট (পাসওয়ার্ড সার্ভারেই গোপন থাকবে)
app.post('/api/login', loginLimiter, (req, res) => {
    const { code } = req.body;
    if (code === SECRET_CODE) {
        const token = jwt.sign({ user: 'PRINCE_SHUVO' }, JWT_SECRET, { expiresIn: '30d' });
        res.cookie('ps_token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000
        });
        return res.json({ success: true });
    }
    return res.status(401).json({ success: false, message: 'ভুল সিক্রেট কোড!' });
});

// ২. সেশন চেক
app.get('/api/check', verifyAuth, (req, res) => res.json({ success: true }));

// ৩. ফাইল আপলোড
app.post('/api/upload', verifyAuth, upload.array('files'), (req, res) => {
    res.json({ success: true, message: 'সফলভাবে আপলোড হয়েছে!' });
});

// ৪. ফাইলের লিস্ট দেখা
app.get('/api/files', verifyAuth, (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).json({ success: false });
        const list = files.map(file => {
            const ext = path.extname(file).toLowerCase();
            let type = 'file';
            if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) type = 'image';
            if (['.mp4', '.mkv', '.webm', '.mov'].includes(ext)) type = 'video';
            return { name: file, type, url: `/file/${file}` };
        });
        res.json({ success: true, files: list.reverse() });
    });
});

// ৫. ফাইল দেখানো ও ডাউনলোড
app.get('/file/:name', verifyAuth, (req, res) => {
    const filePath = path.join(uploadDir, req.params.name);
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(404).send('ফাইল পাওয়া যায়নি');
});

// ৬. ফাইল মুছে ফেলা
app.delete('/api/file/:name', verifyAuth, (req, res) => {
    const filePath = path.join(uploadDir, req.params.name);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

// ৭. লগআউট
app.post('/api/logout', (req, res) => {
    res.clearCookie('ps_token');
    res.json({ success: true });
});

// ৮. সম্পূর্ণ ফ্রন্টএন্ড UI (PRINCE SHUVO)
app.get('*', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PRINCE SHUVO - Cloud Drive</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: #0a0e17; color: #e2e8f0; min-height: 100vh; }
        .hidden { display: none !important; }
        .center-wrap { display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
        .login-box { background: #131b2e; border: 1px solid #1e293b; border-radius: 16px; padding: 35px 25px; width: 100%; max-width: 380px; text-align: center; box-shadow: 0 0 25px rgba(0, 255, 170, 0.15); }
        .login-box h1 { color: #00ffaa; font-size: 26px; letter-spacing: 2px; margin-bottom: 5px; }
        .login-box p { color: #94a3b8; font-size: 13px; margin-bottom: 25px; }
        input[type="password"] { width: 100%; padding: 14px; background: #0a0e17; border: 1px solid #334155; border-radius: 8px; color: #fff; font-size: 16px; text-align: center; margin-bottom: 15px; outline: none; }
        input[type="password"]:focus { border-color: #00ffaa; }
        .btn { width: 100%; padding: 14px; background: #00ffaa; color: #050811; font-weight: bold; font-size: 15px; border: none; border-radius: 8px; cursor: pointer; transition: 0.2s; }
        .btn:hover { background: #00cc88; }
        .err-msg { color: #ff5555; font-size: 13px; margin-top: 12px; }
        
        header { background: #131b2e; border-bottom: 1px solid #1e293b; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 10; }
        header h2 { color: #00ffaa; font-size: 18px; letter-spacing: 1px; }
        .btn-logout { background: #ef4444; color: white; padding: 8px 14px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; }
        .upload-section { background: #131b2e; margin: 20px; padding: 20px; border-radius: 12px; border: 1px dashed #334155; text-align: center; }
        .upload-section input { margin-bottom: 15px; color: #94a3b8; width: 100%; }
        .container { padding: 0 20px 40px; }
        .container h3 { font-size: 16px; color: #94a3b8; margin-bottom: 15px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px; }
        .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
        .card img, .card video { width: 100%; height: 140px; object-fit: cover; background: #000; }
        .card .file-icon { height: 140px; display: flex; align-items: center; justify-content: center; font-size: 30px; background: #0a0e17; }
        .actions { padding: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
        .actions a { color: #00ffaa; text-decoration: none; font-weight: bold; }
        .del-btn { background: #ef4444; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px; }
    </style>
</head>
<body>
    <div id="loginView" class="center-wrap">
        <div class="login-box">
            <h1>PRINCE SHUVO</h1>
            <p>Protected Private Drive</p>
            <input type="password" id="passCode" placeholder="Enter Secret Code...">
            <button class="btn" onclick="login()">ড্রাইভে প্রবেশ করুন</button>
            <div id="errMsg" class="err-msg"></div>
        </div>
    </div>

    <div id="dashView" class="hidden">
        <header>
            <h2>PRINCE SHUVO</h2>
            <button class="btn-logout" onclick="logout()">লগআউট</button>
        </header>
        <div class="upload-section">
            <input type="file" id="fileSelector" multiple accept="image/*,video/*">
            <button class="btn" id="upBtn" onclick="uploadFiles()">ফাইল আপলোড করুন</button>
            <div id="upStatus" style="font-size:13px; margin-top:10px; color:#00ffaa;"></div>
        </div>
        <div class="container">
            <h3>সংরক্ষিত ফাইলসমূহ</h3>
            <div id="fileGrid" class="grid"></div>
        </div>
    </div>

    <script>
        async function checkSession() {
            const res = await fetch('/api/check');
            const data = await res.json();
            if(data.success) showDashboard();
        }
        checkSession();

        async function login() {
            const code = document.getElementById('passCode').value;
            const err = document.getElementById('errMsg');
            err.textContent = 'যাচাই করা হচ্ছে...';
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            const data = await res.json();
            if(data.success) {
                err.textContent = '';
                showDashboard();
            } else {
                err.textContent = data.message || 'ভুল কোড!';
            }
        }

        function showDashboard() {
            document.getElementById('loginView').classList.add('hidden');
            document.getElementById('dashView').classList.remove('hidden');
            loadFiles();
        }

        async function uploadFiles() {
            const input = document.getElementById('fileSelector');
            const status = document.getElementById('upStatus');
            if(!input.files.length) return alert('কোনো ফাইল সিলেক্ট করেননি!');
            
            const formData = new FormData();
            for(let f of input.files) formData.append('files', f);
            
            status.textContent = 'আপলোড হচ্ছে... একটু অপেক্ষা করুন';
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if(data.success) {
                status.textContent = '';
                input.value = '';
                loadFiles();
            } else {
                status.textContent = 'আপলোড ব্যর্থ হয়েছে!';
            }
        }

        async function loadFiles() {
            const grid = document.getElementById('fileGrid');
            const res = await fetch('/api/files');
            const data = await res.json();
            grid.innerHTML = '';
            if(data.success && data.files.length) {
                data.files.forEach(f => {
                    let media = '<div class="file-icon">📁</div>';
                    if(f.type === 'image') media = '<img src="' + f.url + '" loading="lazy" />';
                    if(f.type === 'video') media = '<video src="' + f.url + '" controls></video>';
                    
                    grid.innerHTML += \`
                        <div class="card">
                            \${media}
                            <div class="actions">
                                <a href="\${f.url}" download>ডাউনলোড</a>
                                <button class="del-btn" onclick="del('\${f.name}')">মুছুন</button>
                            </div>
                        </div>
                    \`;
                });
            } else {
                grid.innerHTML = '<p style="color:#64748b; font-size:13px;">কোনো ফাইল আপলোড করা নেই।</p>';
            }
        }

        async function del(name) {
            if(!confirm('মুছে ফেলতে চান?')) return;
            await fetch('/api/file/' + name, { method: 'DELETE' });
            loadFiles();
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

app.listen(PORT, () => {
    console.log('PRINCE SHUVO Cloud is running on port ' + PORT);
});
