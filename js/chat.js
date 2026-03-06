import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onValue, set, get, serverTimestamp, off } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";
const firebaseConfig = {
    apiKey: "AIzaSyACwWS7Q03oipjC4issm3WIy8k_OkSiUiM",
    databaseURL: "https://levnetxyz-default-rtdb.europe-west1.firebasedatabase.app",
    authDomain: "levnetxyz.firebaseapp.com",
    projectId: "levnetxyz",
    storageBucket: "levnetxyz.firebasestorage.app",
    messagingSenderId: "223875022110",
    appId: "1:223875022110:web:8b4282b3ce3f19020cdd0f",
    measurementId: "G-XK20LGP6FQ"
};

// --- Инициализация ---
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const messaging = getMessaging(app);

let currentUser = null;
let currentChatId = null;
let currentChatRef = null;
let selectedMsgId = null;
let selectedMsgText = null;
let isFirstLoad = true;

// --- Уведомления и Токены ---
const saveTokenToDb = (token) => {
    if (!currentUser) return;
    const userPath = currentUser.replace('@', '');
    // Используем хеш от токена как ключ, чтобы не дублировать
    const tokenKey = btoa(token).substring(0, 20).replace(/\//g, '_');
    set(ref(db, `users/${userPath}/tokens/${tokenKey}`), token);
};

getToken(messaging, { vapidKey: 'BCVfZS0S7FdKxMoCSPxRv-026OJjJUdidX1UdFJVtr3xO9nAK1-nx408bKbjChgjyh3U9KOwyjE2gcdFROVclPA' })
    .then((token) => {
        if (token) {
            console.log("Token ok:", token);
            saveTokenToDb(token);
        }
    }).catch(err => console.log('Messaging error:', err));

if (Notification.permission !== "granted") {
    Notification.requestPermission();
}

// --- Функции чата ---
const translateText = async (pair, text) => {
    try {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`);
        const data = await res.json();
        return data.responseData.translatedText;
    } catch (e) { return text; }
};

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function loadActiveChats() {
    if (!currentUser) return;
    onValue(ref(db, `active_chats/${currentUser.replace('@','')}`), (snap) => {
        const list = document.getElementById('activeChatsList');
        list.innerHTML = '';
        const data = snap.val();
        if (data) {
            Object.entries(data).forEach(([id, info]) => {
                const d = document.createElement('div');
                d.className = 'chat-item';
                d.innerText = info.title;
                if (currentChatId === info.title) d.classList.add('active');
                d.onclick = () => openChat(info.title);
                list.appendChild(d);
            });
        }
    });
}

const proceed = (user) => {
    currentUser = user;
    document.getElementById('userAuthOverlay').style.display = 'none';
    document.getElementById('siteAuthOverlay').style.display = 'none';
    document.getElementById('chatApp').style.display = 'flex';
    loadActiveChats();
};

function openChat(id, targetMsgId = null) {
    if (currentChatRef) off(currentChatRef);
    currentChatId = id;
    isFirstLoad = true;
    document.getElementById('chatTitle').innerText = " " + id;
    if (window.innerWidth <= 600) document.getElementById('sidebar').classList.add('hidden');

    let dbId = id.startsWith('#')
        ? 'group_' + id.replace('#', '')
        : [currentUser, id].sort().join('_').replace(/@/g, '');

    currentChatRef = ref(db, 'messages/' + dbId);

    onValue(currentChatRef, (snap) => {
        const box = document.getElementById('chatBox');
        box.innerHTML = '';
        const data = snap.val();

        if (data) {
            let lastUser = null, lastDate = null;
            const entries = Object.entries(data);

            entries.forEach(([msgKey, m]) => {
                const isMe = m.user === currentUser;
                const date = m.timestamp ? new Date(m.timestamp) : new Date();
                const currentDateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

                if (currentDateStr !== lastDate) {
                    const div = document.createElement('div');
                    div.className = 'date-divider';
                    div.innerHTML = `<span>${currentDateStr}</span>`;
                    box.appendChild(div);
                    lastDate = currentDateStr;
                    lastUser = null;
                }

                const timeStr = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
                const wrapper = document.createElement('div');
                wrapper.className = `message-wrapper ${isMe ? 'sent' : 'received'}`;
                wrapper.id = "msg-" + msgKey;

                let content = m.text || '';
                if (content.startsWith('IMG_URL:')) {
                    const url = content.replace('IMG_URL:', '');
                    content = `<img src="${url}" style="max-width:100%; border-radius:8px; cursor:pointer; display:block;" onclick="window.open('${url}')">`;
                } else {
                    const urlRegex = /(https?:\/\/[^\s]+)/g;
                    content = content.replace(urlRegex, (url) => `<a href="${url}" target="_blank" style="color:inherit; text-decoration:underline;">${url}</a>`);
                    content = content.replace(/(@[a-zA-Z0-9_]+)/g, '<span class="mention">$1</span>');
                }

                wrapper.oncontextmenu = (e) => showMenu(e, msgKey, m.text, isMe);

                let authorHtml = (m.user !== lastUser) ? `<div class="msg-name">${isMe ? '' : m.user}</div>` : '';
                wrapper.innerHTML = `<div class="message card">${authorHtml}<div class="msg-text">${content}</div><div class="msg-time">${timeStr}</div></div>`;
                box.appendChild(wrapper);
                lastUser = m.user;
            });

            // Уведомление о новом сообщении
            const lastMsg = entries[entries.length - 1][1];
            isFirstLoad = false;

            if (targetMsgId) {
                setTimeout(() => {
                    const el = document.getElementById("msg-" + targetMsgId);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.classList.add('glow-msg');
                        setTimeout(() => el.classList.remove('glow-msg'), 2000);
                    }
                    targetMsgId = null;
                }, 200);
            } else {
                box.scrollTop = box.scrollHeight;
            }
        } else {
            box.innerHTML = '<div style="text-align:center; opacity:0.5; margin-top:20px;">No messages yet</div>';
            isFirstLoad = false;
        }
    });
}

const sendMsg = async () => {
    const inp = document.getElementById('msgInput');
    let txt = inp.value.trim();
    if (!txt || !currentChatId) return;

    if (txt.startsWith('/translate ')) {
        const parts = txt.split(' ');
        if (parts.length >= 3) {
            const mode = parts[1].toLowerCase();
            const originalText = parts.slice(2).join(' ');
            let pair = mode === 'de' ? 'en|de' : (mode === 'en' ? 'de|en' : `autodetect|${mode}`);
            const btn = document.getElementById('sendBtn');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            txt = await translateText(pair, originalText);
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        }
    }

    const isGroup = currentChatId.startsWith('#');
    const targetId = currentChatId.replace(/[@#]/g, '');
    let dbId = isGroup ? 'group_' + targetId : [currentUser, currentChatId].sort().join('_').replace(/@/g, '');

    push(ref(db, 'messages/' + dbId), { user: currentUser, text: txt, timestamp: serverTimestamp() });
    set(ref(db, `active_chats/${currentUser.replace('@','')}/${dbId}`), {title: currentChatId});
    if(!isGroup) set(ref(db, `active_chats/${targetId}/${dbId}`), {title: currentUser});

    inp.value = '';
    inp.style.height = '50px';
    document.getElementById('sendBtn').classList.remove('active');
};

// --- Инициализация интерфейса ---
const init = () => {
    const savedSitePass = localStorage.getItem('siteAuth');
    const savedUser = localStorage.getItem('currentUser');
    if (savedSitePass === "314" && savedUser) proceed(savedUser);

    const area = document.getElementById('msgInput');
    const cmdBox = document.getElementById('cmdSuggestions');
    const commands = ['/translate de ', '/translate en '];

    // Тема
    const themeBtn = document.getElementById('themeToggle');
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    themeBtn.innerHTML = currentTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';

    themeBtn.onclick = () => {
        const newTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeBtn.innerHTML = newTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    };

    area.oninput = () => {
        const val = area.value;
        cmdBox.innerHTML = '';
        if (val.startsWith('/')) {
            const matches = commands.filter(c => c.startsWith(val));
            if (matches.length > 0 && val !== matches[0]) {
                matches.forEach(match => {
                    const d = document.createElement('div');
                    d.className = 'suggest-item';
                    d.innerText = match;
                    d.onclick = () => { area.value = match; cmdBox.style.display = 'none'; area.focus(); };
                    cmdBox.appendChild(d);
                });
                cmdBox.style.display = 'block';
            } else cmdBox.style.display = 'none';
        } else cmdBox.style.display = 'none';

        area.style.height = 'auto';
        area.style.height = area.scrollHeight + 'px';
        const btn = document.getElementById('sendBtn');
        if (val.trim().length > 0 && currentChatId) btn.classList.add('active');
        else btn.classList.remove('active');
    };

    document.getElementById('logoutBtn').onclick = () => { localStorage.clear(); location.reload(); };

    document.getElementById('siteAuthBtn').onclick = () => {
        if (document.getElementById('sitePassInput').value === "314") {
            localStorage.setItem('siteAuth', "314");
            document.getElementById('siteAuthOverlay').style.display = 'none';
            document.getElementById('userAuthOverlay').style.display = 'flex';
        } else alert("Wrong password!");
    };

    document.getElementById('userAuthBtn').onclick = async () => {
        let uName = document.getElementById('loginUser').value.trim().replace('@', '');
        const uPassRaw = document.getElementById('loginPass').value.trim();
        if (uName.length < 2 || !uPassRaw) return alert("Fill in everything!");
        const uPass = await hashPassword(uPassRaw);
        uName = '@' + uName;
        const snap = await get(ref(db, 'users/' + uName.replace('@', '')));
        if (snap.exists() && snap.val().pass !== uPass) return alert("Wrong password!");
        if (!snap.exists()) await set(ref(db, 'users/' + uName.replace('@', '')), { pass: uPass });
        localStorage.setItem('currentUser', uName);
        proceed(uName);
    };

    document.getElementById('menuToggle').onclick = () => document.getElementById('sidebar').classList.toggle('hidden');
    document.getElementById('sendBtn').onclick = sendMsg;
    area.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };

    // Поиск
    const sInput = document.getElementById('chatSearch');
    const sSuggest = document.getElementById('searchSuggestions');
    sInput.oninput = async () => {
        const val = sInput.value.trim().toLowerCase();
        sSuggest.innerHTML = '';
        if (!val) { sSuggest.style.display = 'none'; return; }
        sSuggest.style.display = 'block';

        if (val.startsWith('@') || val.startsWith('#')) {
            const isUser = val.startsWith('@');
            const snap = await get(ref(db, isUser ? 'users' : 'messages'));
            Object.keys(snap.val() || {}).forEach(key => {
                const display = key.replace('group_', '');
                if (display.toLowerCase().includes(val.slice(1))) {
                    const item = document.createElement('div');
                    item.className = 'chat-item';
                    item.innerText = isUser ? '@' + key : '#' + display;
                    item.onclick = () => { openChat(item.innerText); sInput.value = ''; sSuggest.style.display = 'none'; };
                    sSuggest.appendChild(item);
                }
            });
        }
    };

    document.getElementById('createGroupBtn').onclick = () => {
        let g = prompt("Group name:").trim().replace(/#/, '');
        if (g) openChat('#' + g);
    };

    document.getElementById('imgInput').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file || !currentChatId) return;
        const btn = e.target.parentElement;
        btn.style.opacity = '0.5';
        try {
            const url = await uploadImg(file);
            let dbId = currentChatId.startsWith('#') ? 'group_' + currentChatId.replace('#', '') : [currentUser, currentChatId].sort().join('_').replace(/@/g, '');
            push(ref(db, 'messages/' + dbId), { user: currentUser, text: `IMG_URL:${url}`, timestamp: serverTimestamp() });
        } catch { alert("Upload failed"); }
        finally { btn.style.opacity = '1'; e.target.value = ''; }
    };
};

const uploadImg = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=dd65b7ceefe40d82481e19dd95070333`, { method: 'POST', body: formData });
    const data = await res.json();
    return data.data.url;
};

const showMenu = (e, msgId, text, isMe) => {
    if (e.cancelable) e.preventDefault();
    selectedMsgId = msgId;
    selectedMsgText = text;
    const menu = document.getElementById('msgMenu');
    document.getElementById('editBtn').style.display = isMe ? 'flex' : 'none';
    document.getElementById('delBtn').style.display = isMe ? 'flex' : 'none';
    menu.style.display = 'flex';
    let x = e.clientX || (e.touches ? e.touches[0].clientX : 0);
    let y = e.clientY || (e.touches ? e.touches[0].clientY : 0);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
};

window.copyMsg = () => { navigator.clipboard.writeText(selectedMsgText); document.getElementById('msgMenu').style.display = 'none'; };

document.getElementById('delBtn').onclick = async () => {
    document.getElementById('msgMenu').style.display = 'none';
    if (await showCustomModal("Delete?")) {
        let dbId = currentChatId.startsWith('#') ? 'group_' + currentChatId.replace('#', '') : [currentUser, currentChatId].sort().join('_').replace(/@/g, '');
        set(ref(db, `messages/${dbId}/${selectedMsgId}`), null);
    }
};

document.getElementById('editBtn').onclick = async () => {
    document.getElementById('msgMenu').style.display = 'none';
    const nt = await showCustomModal("Edit", true, selectedMsgText);
    if (nt) {
        let dbId = currentChatId.startsWith('#') ? 'group_' + currentChatId.replace('#', '') : [currentUser, currentChatId].sort().join('_').replace(/@/g, '');
        set(ref(db, `messages/${dbId}/${selectedMsgId}/text`), nt.trim());
    }
};

const showCustomModal = (title, showInput = false, defaultValue = "") => {
    return new Promise((resolve) => {
        const modal = document.getElementById('customModal');
        const input = document.getElementById('modalInput');
        document.getElementById('modalTitle').innerText = title;
        input.style.display = showInput ? 'block' : 'none';
        input.value = defaultValue;
        modal.style.display = 'flex';
        document.getElementById('modalConfirm').onclick = () => { modal.style.display = 'none'; resolve(showInput ? input.value : true); };
        document.getElementById('modalCancel').onclick = () => { modal.style.display = 'none'; resolve(null); };
    });
};

init();
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then((registration) => {
            console.log('SW registered:', registration.scope);
            // Только после регистрации воркера пробуем получить токен
        })
        .catch((err) => {
            console.log('SW registration failed:', err);
        });
}