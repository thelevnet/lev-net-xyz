import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onValue, set, get, serverTimestamp, off } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
let currentUser = null;
let currentChatId = null;
let currentChatRef = null; // Для off()
let selectedMsgId = null;
let selectedMsgText = null;

// --- 1. ВСЕ ФУНКЦИИ ---

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
    document.getElementById('userAuthOverlay').style.display = 'none';
    document.getElementById('siteAuthOverlay').style.display = 'none';
    document.getElementById('chatApp').style.display = 'flex';
    loadActiveChats();
};

function openChat(id, targetMsgId = null) {
    if (currentChatRef) off(currentChatRef);
    currentChatId = id;
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

            Object.entries(data).forEach(([msgKey, m]) => {
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
                wrapper.id = "msg-" + msgKey; // Важно для скролла

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

                let timer;
                wrapper.ontouchstart = (e) => {
                    timer = setTimeout(() => showMenu(e.touches[0], msgKey, m.text, isMe), 400);
                };
                wrapper.ontouchend = () => clearTimeout(timer);

                let authorHtml = (m.user !== lastUser) ? `<div class="msg-name">${isMe ? '' : m.user}</div>` : '';

                wrapper.innerHTML = `
                    <div class="message card">
                        ${authorHtml}
                        <div class="msg-text">${content}</div>
                        <div class="msg-time">${timeStr}</div>
                    </div>`;

                box.appendChild(wrapper);
                lastUser = m.user;
            });

            // Логика перехода к сообщению
            if (targetMsgId) {
                setTimeout(() => {
                    const el = document.getElementById("msg-" + targetMsgId);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.classList.add('glow-msg');
                        setTimeout(() => el.classList.remove('glow-msg'), 2000);
                    }
                }, 200);
            } else {
                box.scrollTop = box.scrollHeight;
            }
        } else {
            box.innerHTML = '<div style="text-align:center; opacity:0.5; margin-top:20px;">No messages yet</div>';
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
    inp.style.height = '40px';
    document.getElementById('sendBtn').classList.remove('active');
};

// --- 2. ИНИЦИАЛИЗАЦИЯ ---

const init = () => {
    const savedSitePass = localStorage.getItem('siteAuth');
    const savedUser = localStorage.getItem('currentUser');
    if (savedSitePass === "314" && savedUser) proceed(savedUser);

    const area = document.getElementById('msgInput');
    area.addEventListener('input', () => {
        area.style.height = 'auto';
        area.style.height = (area.scrollHeight) + 'px';
    });

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

    document.getElementById('menuToggle').onclick = () => document.getElementById('sidebar').classList.toggle('hidden');
    document.getElementById('sendBtn').onclick = sendMsg;
    document.getElementById('msgInput').onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMsg();
        }
    };

    // --- ПОИСК ---
    const sInput = document.getElementById('chatSearch');
    const sSuggest = document.getElementById('searchSuggestions');

    sInput.oninput = async () => {
        const val = sInput.value.trim().toLowerCase();
        sSuggest.innerHTML = '';
        if (!val) { sSuggest.style.display = 'none'; return; }
        sSuggest.style.display = 'block';

        if (val.startsWith('@') || val.startsWith('#')) {
            const cleanVal = val.slice(1);
            const isUser = val.startsWith('@');
            const snap = await get(ref(db, isUser ? 'users' : 'messages'));
            const data = snap.val() || {};
            Object.keys(data).forEach(key => {
                const displayKey = key.replace('group_', '');
                if (displayKey.toLowerCase().includes(cleanVal)) {
                    const item = document.createElement('div');
                    item.className = 'chat-item';
                    item.innerText = isUser ? '@' + key : '#' + displayKey;
                    item.onclick = () => {
                        openChat(item.innerText);
                        sInput.value = '';
                        sSuggest.style.display = 'none';
                    };
                    sSuggest.appendChild(item);
                }
            });
        } else {
            const activeSnap = await get(ref(db, `active_chats/${currentUser.replace('@','')}`));
            const activeData = activeSnap.val() || {};
            for (let chatId in activeData) {
                const msgSnap = await get(ref(db, `messages/${chatId}`));
                const msgs = msgSnap.val() || {};
                Object.entries(msgs).forEach(([msgKey, m]) => {
                    if (m.text && m.text.toLowerCase().includes(val)) {
                        const item = document.createElement('div');
                        item.className = 'chat-item';
                        item.style.fontSize = '0.8rem';
                        item.innerHTML = `<b style="color:var(--link)">${activeData[chatId].title}:</b> ${m.text.substring(0, 30)}...`;
                        item.onclick = () => {
                            openChat(activeData[chatId].title, msgKey);
                            sSuggest.style.display = 'none';
                            sInput.value = '';
                        };
                        sSuggest.appendChild(item);
                    }
                });
            }
        }
    };

    window.addEventListener('click', (e) => { if (e.target !== sInput) sSuggest.style.display = 'none'; });

    document.getElementById('createGroupBtn').onclick = async () => {
        let g = prompt("Group name:").trim().replace(/#/, '');
        if (!g) return;
        openChat('#' + g);
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
        } catch (err) { alert("Upload failed"); }
        finally { btn.style.opacity = '1'; e.target.value = ''; }
    };
};

// --- ВСПОМОГАТЕЛЬНОЕ ---

const uploadImg = async (file) => {
    const apiKey = 'dd65b7ceefe40d82481e19dd95070333';
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, { method: 'POST', body: formData });
    const data = await res.json();
    return data.data.url;
};

const showMenu = (e, msgId, text, isMe) => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    selectedMsgId = msgId;
    selectedMsgText = text;
    const menu = document.getElementById('msgMenu');
    document.getElementById('editBtn').style.display = isMe ? 'flex' : 'none';
    document.getElementById('delBtn').style.display = isMe ? 'flex' : 'none';
    menu.style.display = 'flex';
    menu.style.visibility = 'hidden';
    const menuRect = menu.getBoundingClientRect();
    let x = e.clientX || (e.touches ? e.touches[0].clientX : 0);
    let y = e.clientY || (e.touches ? e.touches[0].clientY : 0);
    if (x + menuRect.width > window.innerWidth) x = window.innerWidth - menuRect.width - 15;
    if (y + menuRect.height > window.innerHeight) y = window.innerHeight - menuRect.height - 15;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.visibility = 'visible';
};

window.copyMsg = () => {
    navigator.clipboard.writeText(selectedMsgText);
    document.getElementById('msgMenu').style.display = 'none';
};

document.getElementById('delBtn').onclick = async () => {
    document.getElementById('msgMenu').style.display = 'none';
    if (await showCustomModal("Delete message?")) {
        let dbId = currentChatId.startsWith('#') ? 'group_' + currentChatId.replace('#', '') : [currentUser, currentChatId].sort().join('_').replace(/@/g, '');
        set(ref(db, `messages/${dbId}/${selectedMsgId}`), null);
    }
};

document.getElementById('editBtn').onclick = async () => {
    document.getElementById('msgMenu').style.display = 'none';
    const nt = await showCustomModal("Edit", true, selectedMsgText);
    if (nt && nt.trim() !== selectedMsgText) {
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
        const close = (val) => {
            modal.style.display = 'none';
            resolve(val);
        };
        document.getElementById('modalConfirm').onclick = () => close(showInput ? input.value : true);
        document.getElementById('modalCancel').onclick = () => close(null);
    });
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();