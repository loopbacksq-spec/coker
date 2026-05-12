const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'posts.json');

// Инициализация легковесной базы данных в файле
let posts = [];
if (fs.existsSync(DB_FILE)) {
    try {
        posts = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        posts = [];
    }
}

const savePosts = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(posts, null, 2), 'utf8');
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Функция автопинга для Render (чтобы сервер не засыпал)
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => {
    if (RENDER_URL) {
        http.get(RENDER_URL, (res) => {
            console.log(`[Auto-Ping] Статус: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error('[Auto-Ping] Ошибка:', err.message);
        });
    }
}, 600000); // 10 минут

// API: Получить все публичные посты
app.get('/api/posts', (req, res) => {
    const publicPosts = posts.filter(p => p.type === 'public');
    res.json(publicPosts);
});

// API: Получить конкретный пост по ID (включая приватные)
app.get('/api/posts/:id', (req, res) => {
    const post = posts.find(p => p.id === req.params.id);
    if (post) res.json(post);
    else res.status(404).json({ error: 'Пост не найден' });
});

// API: Создать пост
app.post('/api/posts', (req, res) => {
    const { title, description, type } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'Заполните поля' });
    
    const newPost = {
        id: Math.random().toString(36).substring(2, 11),
        title,
        description,
        type: type === 'private' ? 'private' : 'public',
        date: new Date().toISOString()
    };
    
    posts.push(newPost);
    savePosts();
    res.json({ success: true, id: newPost.id });
});

// Отдача фронтенда (Все в одном файле)
app.get('*', (req, res) => {
    // Если это прямой переход по ссылке на пост (например /post/id)
    const postMatch = req.path.match(/\/post\/([a-z0-9]+)/);
    let targetPostId = postMatch ? postMatch[1] : '';

    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ANONYMOUS NETWORK</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Share Tech Mono', monospace;
            user-select: none;
        }
        body, html {
            background-color: #050505;
            color: #00ff00;
            overflow-x: hidden;
            height: 100%;
        }
        /* Стили кастомного скроллбара */
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #000; }
        ::-webkit-scrollbar-thumb { background: #00ff00; }

        /* Экраны */
        .screen {
            display: none;
            min-height: 100vh;
            position: relative;
            z-index: 2;
        }
        .active { display: flex; flex-direction: column; }

        /* Задний фон с матрицей/сеткой */
        #canvas-3d {
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            z-index: 1;
            pointer-events: none;
        }

        /* Хакерский интро-экран */
        #intro-screen {
            justify-content: center;
            align-items: center;
            background: #000;
        }
        .terminal-loader {
            font-size: 24px;
            text-shadow: 0 0 10px #00ff00;
            border-right: 3px solid #00ff00;
            white-space: nowrap;
            animation: blink 0.75s step-end infinite;
            max-width: fit-content;
        }

        /* Экран верификации IP */
        #auth-screen {
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .crypto-box {
            background: rgba(0,0,0,0.9);
            border: 1px solid #00ff00;
            box-shadow: 0 0 20px rgba(0,255,0,0.2);
            padding: 30px;
            max-width: 600px;
            width: 100%;
            text-align: justify;
            line-height: 1.5;
        }
        .crypto-box h2 { text-align: center; margin-bottom: 15px; color: #fff; text-shadow: 0 0 5px #00ff00; }
        .btn {
            display: block;
            width: 100%;
            background: transparent;
            border: 1px solid #00ff00;
            color: #00ff00;
            padding: 12px;
            font-size: 18px;
            cursor: pointer;
            margin-top: 20px;
            transition: all 0.3s;
            text-shadow: 0 0 3px #00ff00;
        }
        .btn:hover {
            background: #00ff00;
            color: #000;
            box-shadow: 0 0 15px #00ff00;
        }

        /* Главный экран (МЕНЮ) */
        #main-screen {
            display: none;
            padding: 20px;
        }
        header {
            border-bottom: 1px solid #00ff00;
            padding-bottom: 15px;
            margin-bottom: 20px;
            text-align: center;
        }
        .layout {
            display: grid;
            grid-template-columns: 250px 1fr 250px;
            gap: 20px;
            flex: 1;
        }
        /* Адаптивность под телефоны */
        @media(max-width: 900px) {
            .layout { grid-template-columns: 1fr; }
            .side-panel { order: 2; }
            .main-content { order: 1; }
            #side-3d-container { display: none; }
        }

        .side-panel {
            background: rgba(0,0,0,0.8);
            border: 1px solid #00ff00;
            padding: 15px;
            height: fit-content;
        }
        .main-content {
            background: rgba(0,0,0,0.8);
            border: 1px solid #00ff00;
            padding: 20px;
            min-height: 500px;
        }

        /* Посты */
        .post-card {
            border: 1px dashed #00ff00;
            padding: 15px;
            margin-bottom: 15px;
            background: rgba(5,5,5,0.6);
            cursor: pointer;
            transition: 0.2s;
        }
        .post-card:hover { border-style: solid; box-shadow: 0 0 8px rgba(0,255,0,0.3); }
        .post-title { font-size: 20px; color: #fff; margin-bottom: 5px; }
        .post-desc { color: #88ff88; font-size: 14px; white-space: pre-wrap; }

        /* Форма */
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; }
        .form-control {
            width: 100%;
            background: #000;
            border: 1px solid #00ff00;
            color: #00ff00;
            padding: 10px;
            font-family: inherit;
        }
        select.form-control { color-scheme: dark; }

        /* Экран просмотра по ссылке */
        #view-screen {
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        #link-loading {
            font-size: 30px;
            text-align: center;
            animation: pulse 1s infinite alternate;
        }
        #opened-post { display: none; width: 100%; max-width: 700px; }

        @keyframes blink { 50% { border-color: transparent; } }
        @keyframes pulse { from { opacity: 0.3; } to { opacity: 1; } }
    </style>
</head>
<body>

    <div id="canvas-3d"></div>

    <div id="intro-screen" class="screen active">
        <div class="terminal-loader" id="loader-text"></div>
    </div>

    <div id="auth-screen" class="screen">
        <div class="crypto-box">
            <h2>ВЕРИФИКАЦИЯ УЗЛА</h2>
            <p>Здравствуйте, чтобы вы могли делать посты, вы должны подтвердить что ваш ip будет использован для того, чтобы вы могли писать посты, ведь любой тот кто не подтвердит ip (не покажет его), не сможет писать, советую вам использовать VPN если вы не хотите показывать свой ip. Но ваш Ip не будет виден Администраторам, а только в легальных целях для отправки сообщение, ваш ip нам не нужен, ведь даже без вашего согласия мы видем ваш айпи (айпи пользователя) просто нажми кнопку согласиться :)</p>
            <button class="btn" onclick="acceptIp()">[ ПОДТВЕРДИТЬ IP И СВЯЗЬ ]</button>
        </div>
    </div>

    <div id="main-screen" class="screen">
        <header>
            <h1>ANONYMOUS ARCHIVE v1.0.4</h1>
            <p id="user-ip-display" style="color:#666; font-size:12px; margin-top:5px;"></p>
        </header>
        <div class="layout">
            <div class="side-panel">
                <h3>НАВИГАЦИЯ</h3>
                <button class="btn" onclick="showSection('catalog')">КАТАЛОГ ПОСТОВ</button>
                <button class="btn" onclick="showSection('create')">СОЗДАТЬ ПОСТ</button>
            </div>
            
            <div class="main-content">
                <div id="sec-catalog">
                    <h2 style="margin-bottom: 15px; border-bottom: 1px dashed #00ff00;">ПУБЛИЧНЫЕ СТАТЬИ</h2>
                    <div id="posts-container">Загрузка архивов...</div>
                </div>

                <div id="sec-create" style="display:none;">
                    <h2 style="margin-bottom: 15px; border-bottom: 1px dashed #00ff00;">ЗАПИСАТЬ В МАНИФЕСТ</h2>
                    <div class="form-group">
                        <label>ТИП СТАТЬИ:</label>
                        <select class="form-control" id="post-type">
                            <option value="public">ПУБЛИЧНЫЙ (В КАТАЛОГ)</option>
                            <option value="private">ЧАСТНЫЙ (ТОЛЬКО ПО ССЫЛКЕ)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>НАЗВАНИЕ СТАТЬИ:</label>
                        <input type="text" class="form-control" id="post-title" placeholder="Квантовый шифр...">
                    </div>
                    <div class="form-group">
                        <label>ТЕКСТ / ОПИСАНИЕ:</label>
                        <textarea class="form-control" id="post-desc" rows="8" placeholder="Введите ваш текст здесь..."></textarea>
                    </div>
                    <button class="btn" onclick="submitPost()">[ ОПУБЛИКОВАТЬ И СКОПИРОВАТЬ ССЫЛКУ ]</button>
                </div>
            </div>

            <div class="side-panel" id="side-3d-container">
                <h3 style="text-align:center;margin-bottom:10px;">NODE_STATUS</h3>
                <div style="border: 1px solid #00ff00; height: 180px; position:relative; background:#000;" id="mini-3d-box">
                    </div>
                <p style="font-size:12px; margin-top:10px; color:#55ff55; text-align:center;">ОБЪЕКТ: АНОНИМУС<br>СТАТУС: АКТИВЕН</p>
            </div>
        </div>
    </div>

    <div id="view-screen" class="screen">
        <div id="link-loading">ПОДКЛЮЧЕНИЕ К ЗАШИФРОВАННОМУ УЗЛУ...</div>
        <div class="crypto-box" id="opened-post">
            <h2 id="view-title">Название поста</h2>
            <div id="view-desc" class="post-desc" style="color:#fff; font-size:16px; margin-top:15px; border-top:1px dashed #00ff00; padding-top:15px;"></div>
            <button class="btn" onclick="window.location.href='/'">[ ПЕРЕЙТИ НА ГЛАВНУЮ ]</button>
        </div>
    </div>


    <script>
        const targetPostId = "${targetPostId}"; // Передается сервером
        let audioCtx = null;

        // 1. Хакерский печатный текст (Intro)
        const introText = "INITIALIZING ANONYMOUS SYSTEM NETWORK V.2026... DONE.\\nACCESSING DECENTRALIZED COMPILER... DONE.\\nREADY FOR INCOMING CONNECTION...";
        let charIndex = 0;
        function typeWriter() {
            if (charIndex < introText.length) {
                let char = introText.charAt(charIndex);
                document.getElementById("loader-text").innerHTML += char === '\\n' ? '<br>' : char;
                charIndex++;
                setTimeout(typeWriter, 30);
            } else {
                setTimeout(() => {
                    document.getElementById('intro-screen').classList.remove('active');
                    if(targetPostId) {
                        initDirectView();
                    } else {
                        document.getElementById('auth-screen').classList.add('active');
                    }
                }, 1500);
            }
        }
        window.onload = typeWriter;

        // 2. Генератор процедурной спокойной музыки с битами (Web Audio API - без файлов!)
        function startBeats() {
            if (audioCtx) return;
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // Функция синтеза простого глухого бита (Sub-Bass Kick)
            function playKick(time) {
                let osc = audioCtx.createOscillator();
                let gain = audioCtx.createGain();
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.frequency.setValueAtTime(120, time);
                osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.3);
                gain.gain.setValueAtTime(0.3, time);
                gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
                osc.start(time); osc.stop(time + 0.3);
            }

            // Атмосферный задний эмбиент-пад
            function playPad(time, freq) {
                let osc = audioCtx.createOscillator();
                let gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.frequency.setValueAtTime(freq, time);
                gain.gain.setValueAtTime(0, time);
                gain.gain.linearRampToValueAtTime(0.08, time + 1);
                gain.gain.linearRampToValueAtTime(0, time + 4);
                osc.start(time); osc.stop(time + 4);
            }

            let lookAhead = 0;
            setInterval(() => {
                let now = audioCtx.currentTime;
                if(lookAhead < now + 2) {
                    if(lookAhead === 0) lookAhead = now;
                    // Цикл битов каждые 0.8 секунд
                    playKick(lookAhead);
                    playKick(lookAhead + 0.4);
                    if(Math.random() > 0.6) playPad(lookAhead, 110); // Нота Ля
                    if(Math.random() > 0.7) playPad(lookAhead + 0.8, 130.8); // Нота До
                    lookAhead += 0.8;
                }
            }, 500);
        }

        // Кнопка согласия IP
        function acceptIp() {
            startBeats();
            document.getElementById('auth-screen').classList.remove('active');
            document.getElementById('main-screen').classList.add('active');
            
            // Имитируем получение IP юзера
            document.getElementById('user-ip-display').innerText = "ВАШ ВЕРИФИЦИРОВАННЫЙ СЕТЕВОЙ АДРЕС: " + 
                Math.floor(Math.random() * 255) + "." + Math.floor(Math.random() * 255) + "." + Math.floor(Math.random() * 255) + "." + Math.floor(Math.random() * 255);
            
            loadPosts();
        }

        // Переключение табов в главном меню
        function showSection(sec) {
            if(sec === 'catalog') {
                document.getElementById('sec-catalog').style.display = 'block';
                document.getElementById('sec-create').style.display = 'none';
                loadPosts();
            } else {
                document.getElementById('sec-catalog').style.display = 'none';
                document.getElementById('sec-create').style.display = 'block';
            }
        }

        // Получить посты с сервера
        async function loadPosts() {
            try {
                let res = await fetch('/api/posts');
                let data = await res.json();
                let container = document.getElementById('posts-container');
                container.innerHTML = '';
                if(data.length === 0) {
                    container.innerHTML = '<p style="color:#555;">Публичных записей пока нет...</p>';
                    return;
                }
                data.reverse().forEach(post => {
                    let card = document.createElement('div');
                    card.className = 'post-card';
                    card.onclick = () => window.location.href = '/post/' + post.id;
                    card.innerHTML = \`<div class="post-title">\${post.title}</div><div class="post-desc">\${post.description.substring(0, 150)}...</div>\`;
                    container.appendChild(card);
                });
            } catch(e) {
                console.error(e);
            }
        }

        // Создание поста
        async function submitPost() {
            let title = document.getElementById('post-title').value;
            let description = document.getElementById('post-desc').value;
            let type = document.getElementById('post-type').value;

            if(!title || !description) return alert('Заполните название и текст статьи!');

            let res = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description, type })
            });
            let data = await res.json();
            if(data.success) {
                let postUrl = window.location.origin + '/post/' + data.id;
                
                // Копирование в буфер обмена
                navigator.clipboard.writeText(postUrl).then(() => {
                    alert('Успешно! Ссылка скопирована в буфер обмена:\\n' + postUrl);
                    document.getElementById('post-title').value = '';
                    document.getElementById('post-desc').value = '';
                    showSection('catalog');
                }).catch(() => {
                    alert('Создано! Ссылка: ' + postUrl);
                });
            }
        }

        // 3. Логика прямого перехода по ссылке (2 секунды задержка с 3D)
        async function initDirectView() {
            document.getElementById('view-screen').classList.add('active');
            startBeats();

            // Запрашиваем пост заранее
            let res = await fetch('/api/posts/' + targetPostId);
            let post = res.ok ? await res.json() : null;

            // Кастомный таймер анимации маски на 2 секунды
            setTimeout(() => {
                document.getElementById('link-loading').style.transition = '0.5s';
                document.getElementById('link-loading').style.opacity = '0';
                
                setTimeout(() => {
                    document.getElementById('link-loading').style.display = 'none';
                    let postBox = document.getElementById('opened-post');
                    postBox.style.display = 'block';
                    
                    if(post) {
                        document.getElementById('view-title').innerText = post.title;
                        document.getElementById('view-desc').innerText = post.description;
                    } else {
                        document.getElementById('view-title').innerText = "ОШИБКА 404";
                        document.getElementById('view-desc').innerText = "Архив поврежден, удален или никогда не существовал в этой ноде.";
                    }
                }, 500);

            }, 2000);
        }

        // ==========================================
        // 4. ТРЁХМЕРНАЯ ГРАФИКА THREE.JS (МАСКА АНОНИМУСА)
        // Имитируем культовую 3D-маску с помощью геометрических форм, чтобы всё работало без внешних файлов!
        // ==========================================
        let scene, camera, renderer, maskGroup;

        function init3D() {
            const container = document.getElementById('canvas-3d');
            scene = new THREE.Scene();
            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.z = 5;

            renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            container.appendChild(renderer.domElement);

            // Создаем кастомную маску Гая Фокса процедурно из полигонов
            maskGroup = new THREE.Group();

            // Лицо (Белая основа)
            const faceGeo = new THREE.ConeGeometry(1.4, 2, 6);
            const faceMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee, wireframe: true });
            const face = new THREE.Mesh(faceGeo, faceMat);
            face.rotation.x = Math.PI;
            maskGroup.add(face);

            // Щеки (Узнаваемый румянец)
            const cheekMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
            const cheekGeo = new THREE.SphereGeometry(0.2, 8, 8);
            const cheekL = new THREE.Mesh(cheekGeo, cheekMat); cheekL.position.set(-0.6, -0.1, 0.6);
            const cheekR = new THREE.Mesh(cheekGeo, cheekMat); cheekR.position.set(0.6, -0.1, 0.6);
            maskGroup.add(cheekL, cheekR);

            // Усы и Бородка (Черные элементы)
            const mustacheMat = new THREE.MeshBasicMaterial({ color: 0x111111, wireframe: false });
            const mustacheGeo = new THREE.BoxGeometry(1.2, 0.15, 0.2);
            const mustache = new THREE.Mesh(mustacheGeo, mustacheMat);
            mustache.position.set(0, -0.5, 0.8);
            maskGroup.add(mustache);

            const beardGeo = new THREE.ConeGeometry(0.15, 0.6, 4);
            const beard = new THREE.Mesh(beardGeo, mustacheMat);
            beard.position.set(0, -1.1, 0.6);
            maskGroup.add(beard);

            // Глаза (Прорези)
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const eyeGeo = new THREE.BoxGeometry(0.25, 0.08, 0.2);
            const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.4, 0.3, 0.7); eyeL.rotation.z = 0.2;
            const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.4, 0.3, 0.7); eyeR.rotation.z = -0.2;
            maskGroup.add(eyeL, eyeR);

            scene.add(maskGroup);

            // Добавим немного зеленой хакерской матрицы на фон
            const gridGeo = new THREE.BufferGeometry();
            const gridPoints = [];
            for(let i=0; i<300; i++) {
                gridPoints.push((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15);
            }
            gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
            const gridMat = new THREE.PointsMaterial({ color: 0x00ff00, size: 0.05 });
            const grid = new THREE.Points(gridGeo, gridMat);
            scene.add(grid);

            // Анимация вращения
            function animate() {
                requestAnimationFrame(animate);
                
                // Если мы на главном экране и открыт каталог, маска смещается немного назад/вбок
                maskGroup.rotation.y += 0.015;
                maskGroup.rotation.x = Math.sin(Date.now() * 0.001) * 0.1;

                renderer.render(scene, camera);
            }
            animate();
        }

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        init3D();
    </script>
</body>
</html>
    `);
});

app.listen(PORT, () => {
    console.log(`[Server] Запущен на порту \${PORT}`);
    console.log(`[Server] Внешний URL автопинга: \${RENDER_URL}`);
});
