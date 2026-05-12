const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'posts.json');
const BAN_FILE = path.join(__dirname, 'banned.json');

// Твой IP для администрирования
const ADMIN_IP = '92.126.3.48';

// Загрузка базы постов
let posts = [];
if (fs.existsSync(DB_FILE)) {
    try { posts = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { posts = []; }
}

// Загрузка базы забаненных IP
let bannedIPs = [];
if (fs.existsSync(BAN_FILE)) {
    try { bannedIPs = JSON.parse(fs.readFileSync(BAN_FILE, 'utf8')); } catch (e) { bannedIPs = []; }
}

const savePosts = () => fs.writeFileSync(DB_FILE, JSON.stringify(posts, null, 2), 'utf8');
const saveBanned = () => fs.writeFileSync(BAN_FILE, JSON.stringify(bannedIPs, null, 2), 'utf8');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Функция извлечения реального IP
const getUserIP = (req) => {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip === '::1' || ip === '::ffff:127.0.0.1') ip = '127.0.0.1';
    return ip;
};

// МИДЛВЕЙР ДЛЯ ПРОВЕРКИ БАНА
app.use((req, res, next) => {
    const ip = getUserIP(req);
    if (bannedIPs.includes(ip)) {
        return res.status(403).send('<body style="background:#000;color:#fff;font-family:monospace;display:flex;justify-content:center;align-items:center;height:100vh;"><h1>[ ACCESS DENIED: YOUR IP IS BANNED ]</h1></body>');
    }
    next();
});

// Автопингер Render
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => { if (RENDER_URL) http.get(RENDER_URL, (res) => {}).on('error', (e) => {}); }, 600000);

// API: Получить публичные посты
app.get('/api/posts', (req, res) => {
    res.json(posts.filter(p => p.type === 'public'));
});

// API: Получить конкретный пост по ID
app.get('/api/posts/:id', (req, res) => {
    const post = posts.find(p => p.id === req.params.id);
    if (post) res.json(post);
    else res.status(404).json({ error: '404 Not Found' });
});

// API: Создать пост (теперь сохраняет IP автора скрыто от всех в базе данных)
app.post('/api/posts', (req, res) => {
    const { title, description, type } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'Заполни поля' });
    
    const newPost = {
        id: Math.random().toString(36).substring(2, 11),
        title,
        description,
        type: type === 'private' ? 'private' : 'public',
        authorIP: getUserIP(req), // Привязываем IP автора внутри posts.json для бана
        date: new Date().toISOString()
    };
    
    posts.push(newPost);
    savePosts();
    res.json({ success: true, id: newPost.id });
});

// АДМИН-API: Удалить пост (Только для твоего IP)
app.delete('/api/admin/delete/:id', (req, res) => {
    const currentIP = getUserIP(req);
    if (currentIP !== ADMIN_IP && currentIP !== '127.0.0.1') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    posts = posts.filter(p => p.id !== req.params.id);
    savePosts();
    res.json({ success: true });
});

// АДМИН-API: Забанить автора поста по IP (Только для твоего IP)
app.post('/api/admin/ban/:id', (req, res) => {
    const currentIP = getUserIP(req);
    if (currentIP !== ADMIN_IP && currentIP !== '127.0.0.1') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    const targetPost = posts.find(p => p.id === req.params.id);
    if (targetPost && targetPost.authorIP) {
        // Добавляем IP автора в черный список, если его там еще нет
        if (!bannedIPs.includes(targetPost.authorIP)) {
            bannedIPs.push(targetPost.authorIP);
            saveBanned();
        }
        // Сразу вычищаем все его посты, чтобы не засоряли сайт
        posts = posts.filter(p => p.authorIP !== targetPost.authorIP);
        savePosts();
        res.json({ success: true, message: 'Пользователь забанен, посты удалены' });
    } else {
        res.status(404).json({ error: 'Пост или IP автора не найдены' });
    }
});

// Экран просмотра отдельного поста по ссылке
app.get('/post/:id', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ПРОСМОТР ПОСТА</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Courier New', monospace; }
        body { background: #000; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
        #anim-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #000; display: flex; justify-content: center; align-items: center; z-index: 10; transition: opacity 0.5s ease, visibility 0.5s; }
        .mask-logo { width: 260px; height: 260px; }
        .crypto-box { display: none; background: #000; border: 2px solid #fff; padding: 30px; max-width: 700px; width: 100%; text-align: justify; opacity: 0; transition: opacity 0.5s ease; }
        .post-title { font-size: 24px; font-weight: bold; margin-bottom: 15px; border-bottom: 1px solid #fff; padding-bottom: 10px; }
        .post-desc { font-size: 16px; white-space: pre-wrap; line-height: 1.6; }
        .btn { display: block; width: 100%; background: transparent; border: 2px solid #fff; color: #fff; padding: 12px; margin-top: 20px; cursor: pointer; text-align: center; text-decoration: none; font-size: 16px; }
        .btn:hover { background: #fff; color: #000; }
    </style>
</head>
<body>
    <div id="anim-overlay">
        <svg class="mask-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <path d="M15,12 C15,12 25,7 50,7 C75,7 85,12 85,12 L85,25 C85,55 70,82 50,93 C30,82 15,55 15,25 Z" fill="#000" stroke="#fff" stroke-width="2.5"/>
            <path d="M22,26 C30,24 38,20 46,23 C40,25 32,29 22,26 Z" fill="#fff"/>
            <path d="M78,26 C70,24 62,20 54,23 C60,25 68,29 78,26 Z" fill="#fff"/>
            <rect x="3" y="28" width="94" height="15" fill="#000" stroke="#fff" stroke-width="2.5" transform="rotate(-4 50 35)"/>
            <path d="M30,62 C35,54 45,52 50,59 C55,52 65,54 70,62 C65,70 35,70 30,62 Z" fill="#fff"/>
            <path d="M47,75 L53,75 L54,88 L46,88 Z" fill="#fff"/>
        </svg>
    </div>
    <div class="crypto-box" id="post-content">
        <div class="post-title" id="t">Синхронизация...</div>
        <div class="post-desc" id="d">...</div>
        <a href="/" class="btn">[ ВЕРНУТЬСЯ НА ГЛАВНУЮ ]</a>
    </div>
    <script>
        const postId = window.location.pathname.split('/').pop();
        async function loadPost() {
            let res = await fetch('/api/posts/' + postId);
            let data = res.ok ? await res.json() : { title: "404 NOT FOUND", description: "Архив не найден или удален." };
            document.getElementById('t').innerText = data.title;
            document.getElementById('d').innerText = data.description;
            setTimeout(() => {
                const overlay = document.getElementById('anim-overlay');
                overlay.style.opacity = '0'; overlay.style.visibility = 'hidden';
                const content = document.getElementById('post-content');
                content.style.display = 'block'; setTimeout(() => content.style.opacity = '1', 50);
            }, 2000);
        }
        loadPost();
    </script>
</body>
</html>
    `);
});

// Главный вход на сайт
app.get('*', (req, res) => {
    const userIP = getUserIP(req);
    // Проверка, является ли зашедший админом (для передачи флага в JS)
    const isAdmin = (userIP === ADMIN_IP || userIP === '127.0.0.1') ? 'true' : 'false';

    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ANONYMOUS ARCHIVE</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Courier New', monospace; user-select: none; }
        body { background-color: #000; color: #fff; min-height: 100vh; padding: 20px; display: flex; justify-content: center; align-items: center; }
        
        #auth-screen { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 750px; transition: opacity 0.4s ease; }
        .mask-wrapper { width: 280px; height: 280px; margin-bottom: 25px; animation: rotatingMask 14s infinite linear; }
        @keyframes rotatingMask { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .mask-logo { width: 100%; height: 100%; }
        .crypto-box { background: #000; border: 2px solid #fff; padding: 25px; text-align: justify; line-height: 1.6; font-size: 15px; margin-bottom: 25px; }
        .ip-placeholder { font-weight: bold; background: #fff; color: #000; padding: 0px 4px; }
        .btn { display: block; width: 100%; background: transparent; border: 2px solid #fff; color: #fff; padding: 15px; font-size: 18px; cursor: pointer; text-transform: uppercase; font-weight: bold; }
        .btn:hover { background: #fff; color: #000; }

        #main-interface { display: none; width: 100%; max-width: 1150px; opacity: 0; transition: opacity 0.5s ease; }
        .header-panel { border-bottom: 2px solid #fff; padding-bottom: 15px; margin-bottom: 25px; text-align: center; }
        .layout-grid { display: grid; grid-template-columns: 240px 1fr 240px; gap: 25px; }
        .side-nav, .side-model { border: 2px solid #fff; padding: 20px; height: fit-content; background: #000; }
        .central-block { border: 2px solid #fff; padding: 25px; min-height: 550px; background: #000; }
        .nav-btn { display: block; width: 100%; background: transparent; border: 1px solid #fff; color: #fff; padding: 12px; margin-bottom: 15px; cursor: pointer; font-size: 14px; text-transform: uppercase; }
        .nav-btn:hover { background: #fff; color: #000; }

        /* Посты */
        .post-card { border: 1px dashed #fff; padding: 15px; margin-bottom: 20px; position: relative; }
        .post-card:hover { border-style: solid; background: #111; }
        .p-title { font-size: 18px; font-weight: bold; margin-bottom: 8px; text-decoration: underline; padding-right: 180px; }
        .p-desc { font-size: 14px; color: #ccc; white-space: pre-wrap; }
        
        /* Кнопки модератора (Скрыты по дефолту) */
        .admin-controls { display: none; position: absolute; top: 12px; right: 12px; gap: 8px; }
        .adm-btn { background: #000; border: 1px solid #fff; color: #fff; padding: 4px 8px; font-size: 11px; cursor: pointer; font-family: inherit; font-weight: bold; }
        .adm-btn:hover { background: #fff; color: #000; }
        .ban-btn:hover { background: #ff0000; color: #000; border-color: #ff0000; }

        .input-group { margin-bottom: 20px; }
        .input-group label { display: block; margin-bottom: 8px; font-size: 14px; }
        .field { width: 100%; background: #000; border: 1px solid #fff; color: #fff; padding: 12px; font-family: inherit; font-size: 14px; }
        
        @media(max-width: 950px) {
            .layout-grid { grid-template-columns: 1fr; }
            .side-model { display: none; }
            .side-nav { order: 2; }
            .central-block { order: 1; }
            .p-title { padding-right: 0; margin-bottom: 45px; }
            .admin-controls { top: auto; bottom: 12px; left: 12px; right: auto; }
        }
    </style>
</head>
<body>

    <div id="auth-screen">
        <div class="mask-wrapper">
            <svg class="mask-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <path d="M15,12 C15,12 25,7 50,7 C75,7 85,12 85,12 L85,25 C85,55 70,82 50,93 C30,82 15,55 15,25 Z" fill="#000" stroke="#fff" stroke-width="2.5"/>
                <path d="M22,26 C30,24 38,20 46,23 C40,25 32,29 22,26 Z" fill="#fff"/>
                <path d="M78,26 C70,24 62,20 54,23 C60,25 68,29 78,26 Z" fill="#fff"/>
                <rect x="3" y="28" width="94" height="15" fill="#000" stroke="#fff" stroke-width="2.5" transform="rotate(-4 50 35)"/>
                <path d="M30,62 C35,54 45,52 50,59 C55,52 65,54 70,62 C65,70 35,70 30,62 Z" fill="#fff"/>
                <path d="M47,75 L53,75 L54,88 L46,88 Z" fill="#fff"/>
            </svg>
        </div>
        <div class="crypto-box">
            Здравствуйте, что бы вы могли делать посты, вы должны подтвердить что ваш ip будет использован для того, что бы вы могли писать посты, ведь любой тот кто не подтвердит ip (не покажет его), не сможет писать, советую вам использовать VPN если вы не хотите показывать свой ip. Но ваш Ip не будет виден Администраторам, а только в легальных целях для отправки сообщение, ваш ip нам не нужен, ведь даже без вашего согласия мы видем ваш айпи (<span class="ip-placeholder">${userIP}</span>) просто нажми кнопку согласиться:)
        </div>
        <button class="btn" onclick="registerUserNode()">[ СОГЛАСИТЬСЯ ]</button>
    </div>

    <div id="main-interface">
        <div class="header-panel">
            <h1>БОРТОВОЙ ЖУРНАЛ ДЕЦЕНТРАЛИЗОВАННОЙ СЕТИ ${isAdmin === 'true' ? ' // MODE: ADMIN' : ''}</h1>
        </div>
        <div class="layout-grid">
            <div class="side-nav">
                <button class="nav-btn" onclick="switchTab('catalog')">Каталог статей</button>
                <button class="nav-btn" onclick="switchTab('create')">Создать пост</button>
            </div>
            <div class="central-block">
                <div id="tab-catalog">
                    <h3 style="margin-bottom:20px; text-transform:uppercase; border-bottom: 1px solid #fff; padding-bottom: 5px;">Публичный архив постов</h3>
                    <div id="posts-list">Запрос к базе постов...</div>
                </div>
                <div id="tab-create" style="display:none;">
                    <h3 style="margin-bottom:20px; text-transform:uppercase; border-bottom: 1px solid #fff; padding-bottom: 5px;">Шифрование новой записи</h3>
                    <div class="input-group">
                        <label>ТИП ДОСТУПНОСТИ:</label>
                        <select class="field" id="p-type">
                            <option value="public">ПУБЛИЧНЫЙ (ВИДЕН В ОБЩЕМ КАТАЛОГЕ)</option>
                            <option value="private">ЧАСТНЫЙ (ДОСТУП ТОЛЬКО ПО ПРЯМОЙ ССЫЛКЕ)</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>ЗАГОЛОВОК СТАТЬИ:</label>
                        <input type="text" class="field" id="p-title" placeholder="Укажите тему...">
                    </div>
                    <div class="input-group">
                        <label>ТЕКСТ СТАТЬИ:</label>
                        <textarea class="field" id="p-desc" rows="12" placeholder="Напишите текст..."></textarea>
                    </div>
                    <button class="btn" onclick="publishEntry()">[ ОПУБЛИКОВАТЬ И СКОПИРОВАТЬ ССЫЛКУ ]</button>
                </div>
            </div>
            <div class="side-model">
                <h4 style="text-align:center; font-size:12px; margin-bottom:15px; letter-spacing: 1px;">NODE: ONLINE</h4>
                <div style="width:100%; height:160px; display:flex; justify-content:center; align-items:center;">
                    <svg style="width:130px; height:130px; animation: rotatingMask 25s infinite linear;" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15,12 C15,12 25,7 50,7 C75,7 85,12 85,12 L85,25 C85,55 70,82 50,93 C30,82 15,55 15,25 Z" fill="#000" stroke="#fff" stroke-width="2.5"/>
                        <rect x="3" y="28" width="94" height="15" fill="#000" stroke="#fff" stroke-width="2.5" transform="rotate(-4 50 35)"/>
                        <path d="M30,62 C35,54 45,52 50,59 C55,52 65,54 70,62 C65,70 35,70 30,62 Z" fill="#fff"/>
                        <path d="M47,75 L53,75 L54,88 L46,88 Z" fill="#fff"/>
                    </svg>
                </div>
                <p style="font-size:11px; text-align:center; margin-top:15px; color:#aaa; line-height: 1.4;">Локальное кэширование Render оптимизировано.</p>
            </div>
        </div>
    </div>

    <script>
        const IS_ADMIN = ${isAdmin};

        function registerUserNode() {
            document.getElementById('auth-screen').style.display = 'none';
            const mainInterface = document.getElementById('main-interface');
            mainInterface.style.display = 'block';
            setTimeout(() => mainInterface.style.opacity = '1', 50);
            loadData();
        }

        function switchTab(tab) {
            if(tab === 'catalog') {
                document.getElementById('tab-catalog').style.display = 'block';
                document.getElementById('tab-create').style.display = 'none';
                loadData();
            } else {
                document.getElementById('tab-catalog').style.display = 'none';
                document.getElementById('tab-create').style.display = 'block';
            }
        }

        async function loadData() {
            try {
                let res = await fetch('/api/posts');
                let data = await res.json();
                let container = document.getElementById('posts-list');
                container.innerHTML = '';
                
                if(data.length === 0) {
                    container.innerHTML = '<p style="color:#666; font-size:14px; text-align:center; margin-top:30px;">Публичный каталог пуст.</p>';
                    return;
                }
                
                data.reverse().forEach(p => {
                    let div = document.createElement('div');
                    div.className = 'post-card';
                    
                    // Клик открывает пост только при нажатии на контент, но не на админ-кнопки
                    div.onclick = (e) => {
                        if(!e.target.classList.contains('adm-btn')) window.open('/post/' + p.id, '_blank');
                    };

                    // Генерируем разметку
                    let adminMarkup = '';
                    if(IS_ADMIN) {
                        adminMarkup = `
                            <div class="admin-controls" style="display:flex;">
                                <button class="adm-btn" onclick="deletePost('\${p.id}')">УДАЛИТЬ</button>
                                <button class="adm-btn ban-btn" onclick="banUser('\${p.id}')">ЗАБЛОКИРОВАТЬ</button>
                            </div>
                        `;
                    }

                    div.innerHTML = `
                        <div class="p-title">\${p.title}</div>
                        <div class="p-desc">\${p.description.substring(0,180)}...</div>
                        \${adminMarkup}
                    `;
                    container.appendChild(div);
                });
            } catch(e) {}
        }

        // Админ-функция: Удалить пост
        async function deletePost(id) {
            if(!confirm('Удалить эту запись безвозвратно?')) return;
            let res = await fetch('/api/admin/delete/' + id, { method: 'DELETE' });
            if(res.ok) loadData();
            else alert('Ошибка удаления.');
        }

        // Админ-функция: Бан по IP
        async function banUser(id) {
            if(!confirm('Заблокировать создателя посты навсегда и очистить его посты?')) return;
            let res = await fetch('/api/admin/ban/' + id, { method: 'POST' });
            if(res.ok) {
                alert('Нарушитель заблокирован по IP!');
                loadData();
            } else {
                alert('Ошибка выполнения бана.');
            }
        }

        async function publishEntry() {
            let title = document.getElementById('p-title').value;
            let description = document.getElementById('p-desc').value;
            let type = document.getElementById('p-type').value;

            if(!title || !description) return alert('Пожалуйста, заполните поля заголовка и контента!');

            let res = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description, type })
            });
            let data = await res.json();
            if(data.success) {
                let link = window.location.origin + '/post/' + data.id;
                navigator.clipboard.writeText(link).then(() => {
                    alert('Пост опубликован! Прямая ссылка автоматически скопирована:\\n' + link);
                    document.getElementById('p-title').value = '';
                    document.getElementById('p-desc').value = '';
                    switchTab('catalog');
                }).catch(() => {
                    alert('Пост добавлен! Твоя ссылка:\\n' + link);
                });
            }
        }
    </script>
</body>
</html>
    `);
});

app.listen(PORT, () => {
    console.log(`[Node Server] Started on port ${PORT}`);
});
