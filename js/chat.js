import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onValue, set, get, serverTimestamp, off } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
let currentUser = null;
let currentChatId = null;
let chatRef = null;

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const proceed = (user) => {
    currentUser = user;
    document.getElementById('userAuthOverlay').style.display = 'none';
    document.getElementById('chatApp').style.display = 'flex';
    loadActiveChats();
};

// ... твой код сверху (hashPassword, app, db и т.д.) без изменений

function loadActiveChats() {
    onValue(ref(db, `active_chats/${currentUser.replace('@','')}`), (snap) => {
        const list = document.getElementById('activeChatsList');
        list.innerHTML = '<p style="font-size:0.7rem; margin-bottom:0.5rem;">Chats: </p>';
        const data = snap.val();
        if (data) {
            Object.entries(data).forEach(([id, info]) => {
                const d = document.createElement('div');
                // Добавляем класс chat-item для того самого "жмяканья"
                d.className = 'chat-item';
                // Убрал инлайновые стили, они теперь в CSS
                d.innerText = info.title;
                if (currentChatId === info.title) d.classList.add('active');
                d.onclick = () => openChat(info.title);
                list.appendChild(d);
            });
        }
    });
}

let newMessageCount = 0;
let lastReadTimestamp = Date.now();

// Следим, когда пользователь смотрит в чат
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        newMessageCount = 0;
        lastReadTimestamp = Date.now();
        document.title = "lev.net / chat";
    }
});

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
            let lastUser = null;
            let lastDate = null; // Флаг для даты

            Object.values(data).forEach(m => {
                const isMe = m.user === currentUser;
                const date = m.timestamp ? new Date(m.timestamp) : new Date();

                // Формируем строку даты DD.MM.YYYY
                const day = date.getDate().toString().padStart(2, '0');
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const year = date.getFullYear();
                const currentDateStr = `${day}.${month}.${year}`;

                // Если день сменился — рисуем палку
                if (currentDateStr !== lastDate) {
                    const dateDivider = document.createElement('div');
                    dateDivider.className = 'date-divider';
                    dateDivider.innerHTML = `<span>${currentDateStr}</span>`;
                    box.appendChild(dateDivider);
                    lastDate = currentDateStr;
                    lastUser = null; // Сбрасываем автора, чтобы имя показалось после даты
                }

                const timeStr = date.getHours().toString().padStart(2, '0') + ':' +
                                date.getMinutes().toString().padStart(2, '0');

                const wrapper = document.createElement('div');
                wrapper.className = `message-wrapper ${isMe ? 'sent' : 'received'}`;

                let authorHtml = '';
                if (m.user !== lastUser) {
                    authorHtml = `<div class="msg-name">${isMe ? '' : m.user}</div>`;
                }

                wrapper.innerHTML = `
                    <div class="message">
                        ${authorHtml}
                        <div class="msg-text">${m.text}</div>
                        <div class="msg-time">${timeStr}</div>
                    </div>
                `;

                box.appendChild(wrapper);
                lastUser = m.user;
            });
            box.scrollTop = box.scrollHeight;
        }
    });
}

// ... остальной код (sendMsg, клики и т.д.) оставляй как был

const sendMsg = () => {
    const inp = document.getElementById('msgInput');
    const txt = inp.value.trim();
    if (!txt || !currentChatId) return;

    let dbId = currentChatId.startsWith('@') ? [currentUser, currentChatId].sort().join('_').replace(/@/g, '') : currentChatId.replace('#', 'group_');

    push(ref(db, 'messages/' + dbId), { user: currentUser, text: txt, timestamp: serverTimestamp() });
    set(ref(db, `active_chats/${currentUser.replace('@','')}/${dbId}`), {title: currentChatId});
    if(currentChatId.startsWith('@')) set(ref(db, `active_chats/${currentChatId.replace('@','')}/${dbId}`), {title: currentUser});
    inp.value = '';
};

document.getElementById('menuToggle').onclick = () => document.getElementById('sidebar').classList.toggle('hidden');
document.getElementById('sendBtn').onclick = sendMsg;
document.getElementById('msgInput').onkeydown = (e) => { if(e.key === 'Enter') sendMsg(); };

document.getElementById('siteAuthBtn').onclick = () => {
    if (document.getElementById('sitePassInput').value === "314") {
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
    if (snap.exists() && snap.val().pass !== uPass) return alert("Nickname taken, wrong password!");
    if (!snap.exists()) await set(ref(db, 'users/' + uName.replace('@', '')), { pass: uPass });
    proceed(uName);
};

document.getElementById('chatSearch').onkeydown = (e) => {
    if (e.key === 'Enter') {
        let val = e.target.value.trim();
        if (!val) return;
        openChat(val.startsWith('@') || val.startsWith('#') ? val : '@' + val);
        e.target.value = '';
    }
};

document.getElementById('createGroupBtn').onclick = () => {
    let g = prompt("Group name:");
    if (g) openChat('#' + g.replace('#', ''));
};