import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onValue, set, get, serverTimestamp, off } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
let currentUser = null;
let currentChatId = null;
let chatRef = null;


// --- 1. ВСЕ ФУНКЦИИ (ОБЪЯВЛЯЕМ СРАЗУ) ---

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
        list.innerHTML = '<p style="font-size:0.7rem; margin-bottom:0.5rem;">Chats: </p>';
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
    const uOver = document.getElementById('userAuthOverlay');
    const sOver = document.getElementById('siteAuthOverlay');
    if (uOver) uOver.style.display = 'none';
    if (sOver) sOver.style.display = 'none';
    document.getElementById('chatApp').style.display = 'flex';
    loadActiveChats();
};

function openChat(id) {
    if (chatRef) off(chatRef);
    currentChatId = id;
    document.getElementById('chatTitle').innerText = " " + id;
    if (window.innerWidth <= 600) document.getElementById('sidebar').classList.add('hidden');
    loadActiveChats();
    let dbId = id.startsWith('@') ? [currentUser, id].sort().join('_').replace(/@/g, '') : id.replace('#', 'group_');
    chatRef = ref(db, 'messages/' + dbId);
    onValue(chatRef, (snap) => {
        const box = document.getElementById('chatBox');
        box.innerHTML = '';
        const data = snap.val();
        if (data) {
            let lastUser = null, lastDate = null;
            Object.values(data).forEach(m => {
                const isMe = m.user === currentUser;
                const date = m.timestamp ? new Date(m.timestamp) : new Date();
                const currentDateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
                if (currentDateStr !== lastDate) {
                    const div = document.createElement('div');
                    div.className = 'date-divider';
                    div.innerHTML = `<span>${currentDateStr}</span>`;
                    box.appendChild(div);
                    lastDate = currentDateStr; lastUser = null;
                }
                const timeStr = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
                const wrapper = document.createElement('div');
                wrapper.className = `message-wrapper ${isMe ? 'sent' : 'received'}`;
                let content = m.text;
                if (content && content.startsWith('IMG_URL:')) {
                    const url = content.replace('IMG_URL:', '');
                    content = `<img src="${url}" style="max-width:100%; border-radius:8px; cursor:pointer; display:block;" onclick="window.open('${url}')">`;
                }

                let authorHtml = (m.user !== lastUser) ? `<div class="msg-name">${isMe ? '' : m.user}</div>` : '';
                wrapper.innerHTML = `<div class="message">${authorHtml}<div class="msg-text">${content}</div><div class="msg-time">${timeStr}</div></div>`;
                // КОНЕЦ ВСТАВКИ

                box.appendChild(wrapper);
                lastUser = m.user;
            });
            box.scrollTop = box.scrollHeight;
        }
    });
}

const sendMsg = async () => {
    const inp = document.getElementById('msgInput');
    const txt = inp.value.trim();
    if (!txt || !currentChatId) return;
    const isGroup = currentChatId.startsWith('#');
    const targetId = currentChatId.replace(/[@#]/g, '');
    if (!isGroup) {
        const userSnap = await get(ref(db, 'users/' + targetId));
        if (!userSnap.exists()) return alert("User not found");
    }
    let dbId = isGroup ? 'group_' + targetId : [currentUser, currentChatId].sort().join('_').replace(/@/g, '');
    push(ref(db, 'messages/' + dbId), { user: currentUser, text: txt, timestamp: serverTimestamp() });
    set(ref(db, `active_chats/${currentUser.replace('@','')}/${dbId}`), {title: currentChatId});
    if(!isGroup) set(ref(db, `active_chats/${targetId}/${dbId}`), {title: currentUser});
    inp.value = '';
    document.getElementById('sendBtn').classList.remove('active');
};

// --- 2. ЛОГИКА АВТОРИЗАЦИИ И АВТОЛОГИНА ---

const init = () => {
    const savedSitePass = localStorage.getItem('siteAuth');
    const savedUser = localStorage.getItem('currentUser');

    if (savedSitePass === "314" && savedUser) {
        proceed(savedUser);
    }

    document.getElementById('logoutBtn').onclick = () => {
        localStorage.clear();
        location.reload();
    };

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

    // Интерфейс
    document.getElementById('menuToggle').onclick = () => document.getElementById('sidebar').classList.toggle('hidden');
    document.getElementById('sendBtn').onclick = sendMsg;
    document.getElementById('msgInput').onkeydown = (e) => { if(e.key === 'Enter') sendMsg(); };

    document.getElementById('chatSearch').onkeydown = async (e) => {
        if (e.key === 'Enter') {
            let val = e.target.value.trim();
            if (!val) return;
            const isGroup = val.startsWith('#'), cleanId = val.replace(/[@#]/g, '');
            const snap = await get(ref(db, isGroup ? 'messages/group_' + cleanId : 'users/' + cleanId));
            if (snap.exists()) openChat(val); else alert("Not found");
            e.target.value = '';
        }
    };

    document.getElementById('createGroupBtn').onclick = async () => {
        let g = prompt("Group name:").trim().replace(/#/, '');
        if (!g) return;
        const gRef = ref(db, 'messages/group_' + g);
        const snap = await get(gRef);
        openChat('#' + g);
    };

    document.getElementById('msgInput').addEventListener('input', (e) => {
        const btn = document.getElementById('sendBtn');
        btn.classList.toggle('active', e.target.value.trim().length > 0 && currentChatId);
    });
    document.getElementById('imgInput').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file || !currentChatId) return;

        const btn = e.target.parentElement;
        btn.style.opacity = '0.5'; // Визуальный лоадер

        try {
            const url = await uploadImg(file);
            // Отправляем как обычное сообщение, но с пометкой или просто ссылкой
            let dbId = currentChatId.startsWith('#') ? 'group_' + currentChatId.replace('#', '') : [currentUser, currentChatId].sort().join('_').replace(/@/g, '');
            push(ref(db, 'messages/' + dbId), {
                user: currentUser,
                text: `IMG_URL:${url}`,
                timestamp: serverTimestamp()
            });
        } catch (err) {
            alert("Upload failed");
        } finally {
            btn.style.opacity = '1';
            e.target.value = '';
        }
    };
};

// Запуск
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

const uploadImg = async (file) => {
    const apiKey = 'dd65b7ceefe40d82481e19dd95070333';
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData
    });
    const data = await res.json();
    return data.data.url; // Прямая ссылка на картинку
};