import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onValue, set, get, serverTimestamp, off } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

// ─── Config ───────────────────────────────────────────────────────────────────

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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const messaging = getMessaging(app);

// ─── State ────────────────────────────────────────────────────────────────────

let currentUser = null;
let realUser = null;
let currentChatId = null;
let currentChatRef = null;
let selectedMsgId = null;
let selectedMsgText = null;
let isFirstLoad = true;
let reactionTargetMsgId = null;
let activeChatDbId = null;
const avatarCache = {};
window.feedSortMode = 'new';
const SYSTEM_CHAT_ID = 'system_broadcast';
const VAPID = 'BCVfZS0S7FdKxMoCSPxRv-026OJjJUdidX1UdFJVtr3xO9nAK1-nx408bKbjChgjyh3U9KOwyjE2gcdFROVclPA';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildChatDbId = (chatId) =>
    chatId.startsWith('#')
        ? 'group_' + chatId.replace('#', '')
        : [currentUser, chatId].sort().join('_').replace(/@/g, '');

const getActiveChatDbId = () => activeChatDbId;

const getAvatar = async (username) => {
    const key = username.replace('@', '');
    if (avatarCache[key] !== undefined) return avatarCache[key];
    const snap = await get(ref(db, `users/${key}/avatar`));
    avatarCache[key] = snap.val() || null;
    return avatarCache[key];
};

const makeAvatarEl = (url, username, size = 30) => {
    const letter = (username[1] || username[0] || '?').toUpperCase();
    if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;`;
        return img;
    }
    const div = document.createElement('div');
    div.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:var(--secondary);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:${size * 0.35}px;font-weight:900;color:#fff;`;
    div.innerText = letter;
    return div;
};

// ─── Auth & Tokens ────────────────────────────────────────────────────────────

const saveTokenToDb = (token) => {
    if (!currentUser) return;
    const userPath = currentUser.replace('@', '');
    const tokenKey = btoa(token).substring(0, 20).replace(/[/+=]/g, 'x');
    set(ref(db, `users/${userPath}/tokens/${tokenKey}`), token);
};

getToken(messaging, { vapidKey: VAPID })
    .then(token => { if (token) saveTokenToDb(token); })
    .catch(err => console.log('Messaging error:', err));

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const updateSettingsAvatar = (url) => {
    const img = document.getElementById('myAvatar');
    const placeholder = document.getElementById('myAvatarPlaceholder');
    document.getElementById('myUsername').innerText = currentUser;
    if (url) {
        img.src = url;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        img.style.display = 'none';
        placeholder.style.display = 'flex';
        placeholder.innerText = currentUser[1]?.toUpperCase() || '?';
    }
};

const proceed = (user) => {
    currentUser = user;
    realUser = user;
    document.getElementById('userAuthOverlay').style.display = 'none';
    document.getElementById('chatApp').style.display = 'flex';
    checkAdmin(user);
    loadActiveChats();
    getAvatar(user).then(url => updateSettingsAvatar(url));
};

// ─── Admin ────────────────────────────────────────────────────────────────────

function checkAdmin(user) {
    const panel = document.getElementById('adminPanel');
    if (!panel) return;
    if (realUser === '@admin') {
        panel.style.display = 'block';
        loadAllThreads();
    } else {
        panel.style.display = 'none';
    }
}

function loadAllThreads() {
    if (realUser !== '@admin') return;
    onValue(ref(db, 'messages'), (snap) => {
        const list = document.getElementById('allChatsList');
        list.innerHTML = '';
        const data = snap.val();
        if (!data) return;
        Object.keys(data).forEach(threadId => {
            const d = document.createElement('div');
            d.className = 'admin-btn';
            d.style.cssText = 'font-size:0.7rem;text-align:left;border-bottom:1px solid var(--border);padding:10px;';
            d.innerText = threadId.startsWith('group_')
                ? '#' + threadId.replace('group_', '')
                : threadId.split('_').join(' ↔ ');
            d.onclick = () => openChat(d.innerText, null, threadId);
            list.appendChild(d);
        });
    });
}

window.banUser = async () => {
    const userToBan = document.getElementById('banUserField').value.trim().replace('@', '');
    if (!userToBan || userToBan === 'admin') return await showCustomModal("Can't do that");
    if (await showCustomModal(`Ban ${userToBan}?`)) {
        await set(ref(db, `users/${userToBan}`), null);
        await showCustomModal(`${userToBan} has been nuked.`);
        document.getElementById('banUserField').value = '';
    }
};

window.genInvite = async () => {
    const code = document.getElementById('newInviteField').value.trim();
    if (!code) return await showCustomModal("Enter code");
    await set(ref(db, `invites/${code}`), true);
    await showCustomModal(`Invite ${code} is now active.`);
    document.getElementById('newInviteField').value = '';
};

window.sendGlobalMsg = async () => {
    const txt = await showCustomModal("Global Announcement:", true);
    if (!txt) return;
    push(ref(db, `messages/${SYSTEM_CHAT_ID}`), { user: '📢 SYSTEM', text: txt, timestamp: serverTimestamp() });
    const snap = await get(ref(db, 'users'));
    Object.keys(snap.val() || {}).forEach(username => {
        set(ref(db, `active_chats/${username}/${SYSTEM_CHAT_ID}`), { title: '📢 System' });
    });
};

window.deleteEntireChat = async () => {
    if (!currentChatId || currentChatId === 'GLOBAL_FEED') return await showCustomModal("Select a real chat first");
    if (await showCustomModal("DELETE ALL MESSAGES?")) {
        await set(ref(db, `messages/${getActiveChatDbId()}`), null);
        await showCustomModal("Nuked.");
    }
};

window.changeMyName = async () => {
    const n = await showCustomModal("Act as @username:", true);
    if (!n?.startsWith('@')) return;
    currentUser = n;
    await showCustomModal(`Now acting as ${n}`);
};

window.changeAvatar = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const url = await uploadImg(file);
        const key = currentUser.replace('@', '');
        await set(ref(db, `users/${key}/avatar`), url);
        avatarCache[key] = url;
        updateSettingsAvatar(url);
        await showCustomModal("Avatar updated!");
    };
    input.click();
};

// ─── Chat List ────────────────────────────────────────────────────────────────

function loadActiveChats() {
    if (!currentUser) return;
    onValue(ref(db, `active_chats/${currentUser.replace('@', '')}`), (snap) => {
        const list = document.getElementById('activeChatsList');
        list.innerHTML = '';
        const data = snap.val();
        if (!data) return;

        Object.entries(data).forEach(([id, info]) => {
            const d = document.createElement('div');
            d.className = 'chat-item';
            d.style.cssText = 'display:flex;align-items:center;gap:10px;';
            d.onclick = () => openChat(info.title);
            if (currentChatId === info.title) d.classList.add('active');

            const avatarEl = makeAvatarEl(null, info.title, 28);
            const nameEl = document.createElement('span');
            nameEl.innerText = info.title;
            nameEl.style.flex = '1';

            if (!info.title.startsWith('#') && info.title.startsWith('@')) {
                getAvatar(info.title).then(url => {
                    if (url) avatarEl.replaceWith(makeAvatarEl(url, info.title, 28));
                });
            }

            d.appendChild(avatarEl);
            d.appendChild(nameEl);
            list.appendChild(d);
        });
    });
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

function openChat(id, targetMsgId = null, forceDbId = null) {
    document.getElementById('chatBox').classList.remove('feed-mode');
    if (currentChatRef) off(currentChatRef);
    currentChatId = id;
    isFirstLoad = true;

    document.getElementById('chatTitle').innerText = ' ' + id;
    if (window.innerWidth <= 600) document.getElementById('sidebar').classList.add('hidden');

    activeChatDbId = forceDbId || buildChatDbId(id);
    currentChatRef = ref(db, 'messages/' + activeChatDbId);

    const isSystemChat = activeChatDbId === SYSTEM_CHAT_ID && realUser !== '@admin';
    document.querySelector('.input-row').style.display = isSystemChat ? 'none' : 'flex';

    onValue(currentChatRef, (snap) => {
        const box = document.getElementById('chatBox');
        box.innerHTML = '';
        const data = snap.val();

        if (!data) {
            box.innerHTML = '<div style="text-align:center;opacity:0.5;margin-top:20px;">No messages yet</div>';
            isFirstLoad = false;
            return;
        }

        let lastUser = null, lastDate = null;

        Object.entries(data).forEach(([msgKey, m]) => {
            const isMe = m.user === currentUser;
            const date = m.timestamp ? new Date(m.timestamp) : new Date();
            const dateStr = `${date.getDate().toString().padStart(2,'0')}.${(date.getMonth()+1).toString().padStart(2,'0')}.${date.getFullYear()}`;
            const timeStr = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;

            if (dateStr !== lastDate) {
                const div = document.createElement('div');
                div.className = 'date-divider';
                div.innerHTML = `<span>${dateStr}</span>`;
                box.appendChild(div);
                lastDate = dateStr;
                lastUser = null;
            }

            const wrapper = document.createElement('div');
            wrapper.className = `message-wrapper ${isMe ? 'sent' : 'received'} ${m.user === '@admin' ? 'admin-msg' : ''}`;
            wrapper.id = 'msg-' + msgKey;

            let content = m.text || '';
            if (content.startsWith('IMG_URL:')) {
                const url = content.replace('IMG_URL:', '');
                content = `<img src="${url}" style="max-width:100%;border-radius:8px;cursor:pointer;display:block;" onclick="window.openImg('${url}')">`;
            } else {
                content = content
                    .replace(/(https?:\/\/[^\s]+)/g, url => `<a href="${url}" target="_blank" style="color:inherit;text-decoration:underline;">${url}</a><div style="position:relative;margin-top:6px;border-radius:8px;overflow:hidden;background:#fff;"><iframe src="${url}" style="width:100%;height:200px;border:none;display:block;" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms"></iframe><div onclick="window.openIframe('${url}')" style="position:absolute;top:0;left:0;width:100%;height:100%;cursor:pointer;z-index:1;"></div></div>`)
                    .replace(/(@[a-zA-Z0-9_]+)/g, '<span class="mention" style="cursor:pointer" onclick="openChat(\'$1\')">$1</span>');
            }

            let touchTimer;
            wrapper.addEventListener('touchstart', (e) => {
                touchTimer = setTimeout(() => {
                    reactionTargetMsgId = msgKey;
                    showMenu(e, msgKey, m.text, isMe);
                    touchTimer = null;
                }, 600);
            }, { passive: true });
            wrapper.addEventListener('touchend', () => { if (touchTimer) clearTimeout(touchTimer); });
            wrapper.addEventListener('touchmove', () => { if (touchTimer) clearTimeout(touchTimer); });
            wrapper.oncontextmenu = (e) => { e.preventDefault(); reactionTargetMsgId = msgKey; showMenu(e, msgKey, m.text, isMe); };
            wrapper.onclick = () => { document.getElementById('msgMenu').style.display = 'none'; };

            let reactionsHtml = '<div class="reactions-container">';
            if (m.reactions) {
                const counts = {};
                Object.values(m.reactions).forEach(emoji => { counts[emoji] = (counts[emoji] || 0) + 1; });
                Object.entries(counts).forEach(([emoji, count]) => {
                    reactionsHtml += `<div class="reaction-badge">${emoji}${count > 1 ? ' ' + count : ''}</div>`;
                });
            }
            reactionsHtml += '</div>';

            const isGroup = currentChatId.startsWith('#');
            const authorHtml = '';

            wrapper.innerHTML = `
                <div class="message card">
                    ${authorHtml}
                    <div class="msg-text">${content}</div>
                    ${reactionsHtml}
                    <div class="msg-time">${timeStr}</div>
                </div>
            `;

            if (!isMe && m.user !== lastUser) {
                const avatarRow = document.createElement('div');
                avatarRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:2px;padding-left:2px;';

                const avatarEl = makeAvatarEl(null, m.user, 20);
                const nameEl = document.createElement('span');
                nameEl.style.cssText = 'font-size:0.72rem;font-weight:900;color:var(--link);';
                nameEl.innerText = m.user;
                avatarRow.style.cursor = 'pointer';
                avatarRow.onclick = (e) => { e.stopPropagation(); openChat(m.user); };

                avatarRow.appendChild(avatarEl);
                avatarRow.appendChild(nameEl);

                // Вставляем строку с аватаркой ПЕРЕД wrapper в box
                box.appendChild(avatarRow);

                getAvatar(m.user).then(url => {
                    if (url) avatarEl.replaceWith(makeAvatarEl(url, m.user, 20));
                });
            }

            box.appendChild(wrapper);
            lastUser = m.user;
        });

        isFirstLoad = false;

        if (targetMsgId) {
            setTimeout(() => {
                const el = document.getElementById('msg-' + targetMsgId);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('glow-msg');
                    setTimeout(() => el.classList.remove('glow-msg'), 2000);
                }
            }, 200);
        } else {
            box.scrollTop = box.scrollHeight;
        }
    });
}
window.openChat = openChat;
// ─── Send ─────────────────────────────────────────────────────────────────────

const sendMsg = async () => {
    const inp = document.getElementById('msgInput');
    let txt = inp.value.trim();
    if (!txt || !currentChatId) return;

    if (currentChatId === 'GLOBAL_FEED') {
        push(ref(db, 'feed'), { user: currentUser, text: txt, votes: 0, timestamp: serverTimestamp() });
        inp.value = '';
        return;
    }

    if (txt.startsWith('/translate ')) {
        const parts = txt.split(' ');
        if (parts.length >= 3) {
            const mode = parts[1].toLowerCase();
            const originalText = parts.slice(2).join(' ');
            const pair = mode === 'de' ? 'en|de' : (mode === 'en' ? 'de|en' : `autodetect|${mode}`);
            const btn = document.getElementById('sendBtn');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            txt = await translateText(pair, originalText);
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        }
    }

    const isGroup = currentChatId.startsWith('#');
    const targetId = currentChatId.replace(/[@#]/g, '');
    const dbId = activeChatDbId || (isGroup
        ? 'group_' + targetId
        : [currentUser, currentChatId].sort().join('_').replace(/@/g, ''));

    push(ref(db, 'messages/' + dbId), { user: currentUser, text: txt, timestamp: serverTimestamp() });

    if (!activeChatDbId) {
        if (isGroup) set(ref(db, `groups/${dbId}/members/${currentUser.replace('@', '')}`), true);
        set(ref(db, `active_chats/${currentUser.replace('@', '')}/${dbId}`), { title: currentChatId });
        if (!isGroup) set(ref(db, `active_chats/${targetId}/${dbId}`), { title: currentUser });
    }

    inp.value = '';
    inp.style.height = '50px';
    document.getElementById('sendBtn').classList.remove('active');
};
window.openIframe = (url) => {
    const overlay = document.createElement('div');
    overlay.id = 'iframeOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:99999;display:flex;flex-direction:column;';
    overlay.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 15px;background:var(--surface);border-bottom:2px solid var(--border);flex-shrink:0;">
            <button onclick="document.getElementById('iframeOverlay').remove()" style="border:2px solid var(--border);background:var(--surface);border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:1rem;color:var(--text-1);display:flex;align-items:center;justify-content:center;">✕</button>
            <a href="${url}" target="_blank" style="font-size:0.8rem;color:var(--link);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${url}</a>
        </div>
        <iframe src="${url}" style="flex:1;border:none;background:#fff;" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
    `;
    document.body.appendChild(overlay);
};
window.openImg = (url) => {
    const overlay = document.createElement('div');
    overlay.id = 'imgOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:99999;display:flex;flex-direction:column;background:rgba(0,0,0,0.9);';
    overlay.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 15px;background:var(--surface);border-bottom:2px solid var(--border);flex-shrink:0;">
            <button onclick="document.getElementById('imgOverlay').remove()" style="border:2px solid var(--border);background:var(--surface);border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:1rem;color:var(--text-1);display:flex;align-items:center;justify-content:center;">✕</button>
            <a href="${url}" target="_blank" style="font-size:0.8rem;color:var(--link);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${url}</a>
        </div>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px;">
            <img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;">
        </div>
    `;
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
};
// ─── Feed ─────────────────────────────────────────────────────────────────────

window.renderComments = (postId, comments, parentId = 'root', depth = 0) => {
    if (!comments) return '';
    const indent = Math.min(depth * 12, 48);
    return Object.entries(comments)
        .filter(([_, c]) => c.parentId === parentId)
        .map(([id, c]) => `
            <div class="comment-branch" data-id="${id}" style="margin-left:${indent}px;border-left:2px solid var(--border);padding-left:10px;margin-top:8px;">
                <div style="font-size:0.75rem;margin-bottom:2px;"><b style="color:var(--link)">${c.user}</b></div>
                <div class="comment-text" style="font-size:0.85rem;margin:2px 0;white-space:pre-wrap;">${c.text}</div>
                <div style="display:flex;gap:10px;font-size:0.7rem;opacity:0.6;margin-top:4px;">
                    <span onclick="window.openReplyBox('${postId}','${id}')" style="cursor:pointer;font-weight:bold;">Reply</span>
                    ${c.user === currentUser ? `<span onclick="window.openEditBox('${postId}','${id}')" style="cursor:pointer;font-weight:bold;">Edit</span>` : ''}
                </div>
                <div id="reply-box-${id}" style="display:none;margin-top:6px;">
                    <textarea placeholder="Reply..." style="width:100%;font-size:0.8rem;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text-1);resize:none;outline:none;font-family:var(--font-main);" rows="2"
                        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.submitReply('${postId}','${id}',this)}"></textarea>
                    <div style="display:flex;gap:6px;margin-top:4px;">
                        <button onclick="window.submitReply('${postId}','${id}',this.parentElement.previousElementSibling)" style="font-size:0.75rem;padding:3px 10px;border-radius:6px;border:1px solid var(--link);background:var(--link);color:#fff;cursor:pointer;">Send</button>
                        <button onclick="document.getElementById('reply-box-${id}').style.display='none'" style="font-size:0.75rem;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-2);cursor:pointer;">Cancel</button>
                    </div>
                </div>
                <div id="edit-box-${id}" style="display:none;margin-top:6px;">
                    <textarea style="width:100%;font-size:0.8rem;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text-1);resize:none;outline:none;font-family:var(--font-main);" rows="2"
                        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.submitEdit('${postId}','${id}',this)}">${c.text}</textarea>
                    <div style="display:flex;gap:6px;margin-top:4px;">
                        <button onclick="window.submitEdit('${postId}','${id}',this.parentElement.previousElementSibling)" style="font-size:0.75rem;padding:3px 10px;border-radius:6px;border:1px solid var(--link);background:var(--link);color:#fff;cursor:pointer;">Save</button>
                        <button onclick="document.getElementById('edit-box-${id}').style.display='none'" style="font-size:0.75rem;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-2);cursor:pointer;">Cancel</button>
                    </div>
                </div>
                ${window.renderComments(postId, comments, id, depth + 1)}
            </div>
        `).join('');
};

window.openReplyBox = (postId, commentId) => {
    document.querySelectorAll('[id^="reply-box-"],[id^="edit-box-"]').forEach(el => el.style.display = 'none');
    const box = document.getElementById(`reply-box-${commentId}`);
    if (box) { box.style.display = 'block'; box.querySelector('textarea').focus(); }
};

window.openEditBox = (postId, commentId) => {
    document.querySelectorAll('[id^="reply-box-"],[id^="edit-box-"]').forEach(el => el.style.display = 'none');
    const box = document.getElementById(`edit-box-${commentId}`);
    if (box) { box.style.display = 'block'; box.querySelector('textarea').focus(); }
};

window.submitReply = (postId, parentId, textarea) => {
    const txt = textarea.value.trim();
    if (!txt) return;
    push(ref(db, `feed/${postId}/comments`), { user: currentUser, text: txt, parentId, timestamp: serverTimestamp() });
    textarea.value = '';
    const box = document.getElementById(`reply-box-${parentId}`);
    if (box) box.style.display = 'none';
};

window.submitEdit = (postId, commentId, textarea) => {
    const txt = textarea.value.trim();
    if (!txt) return;
    set(ref(db, `feed/${postId}/comments/${commentId}/text`), txt);
    const box = document.getElementById(`edit-box-${commentId}`);
    if (box) box.style.display = 'none';
};

window.upvote = (postId) => {
    const userKey = currentUser.replace('@', '');
    const vRef = ref(db, `feed/${postId}/voters/${userKey}`);
    const countRef = ref(db, `feed/${postId}/votes`);
    get(vRef).then(snap => {
        if (snap.exists()) {
            set(vRef, null);
            get(countRef).then(s => set(countRef, Math.max(0, (s.val() || 1) - 1)));
        } else {
            set(vRef, true);
            get(countRef).then(s => set(countRef, (s.val() || 0) + 1));
        }
    });
};

window.openFeed = () => {
    if (currentChatRef) off(currentChatRef);
    currentChatId = 'GLOBAL_FEED';

    document.getElementById('chatTitle').innerHTML = `
        Feed
        <span onclick="window.feedSortMode='new';window.openFeed()" style="cursor:pointer;font-size:0.7rem;margin-left:10px;color:${window.feedSortMode==='new'?'var(--link)':'var(--text-3)'}">New</span>
        <span onclick="window.feedSortMode='top';window.openFeed()" style="cursor:pointer;font-size:0.7rem;margin-left:5px;color:${window.feedSortMode==='top'?'var(--link)':'var(--text-3)'}">Top</span>
    `;

    const box = document.getElementById('chatBox');
    box.classList.add('feed-mode');

    onValue(ref(db, 'feed'), (snap) => {
        box.innerHTML = '';
        const data = snap.val();
        if (!data) {
            box.innerHTML = '<div style="text-align:center;opacity:0.5;margin-top:20px;">No posts yet</div>';
            return;
        }

        let posts = Object.entries(data);
        posts = window.feedSortMode === 'top'
            ? posts.sort((a, b) => (b[1].votes || 0) - (a[1].votes || 0))
            : posts.reverse();

        posts.forEach(([id, p]) => {
            const card = document.createElement('div');
            card.className = 'post-card';
            const commsHtml = window.renderComments(id, p.comments, 'root');
            card.innerHTML = `
                <div class="post-user">${p.user}</div>
                <div class="post-content">${p.text}</div>
                <div class="post-actions">
                    <div class="action-btn" onclick="window.upvote('${id}')"><i class="fa-solid fa-arrow-up"></i> ${p.votes || 0}</div>
                    <div class="action-btn" onclick="window.openReplyBox('${id}','root-${id}')"><i class="fa-solid fa-comment"></i> Comment</div>
                </div>
                <div id="reply-box-root-${id}" style="display:none;margin-top:8px;">
                    <textarea placeholder="Write a comment..." style="width:100%;font-size:0.85rem;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text-1);resize:none;outline:none;font-family:var(--font-main);" rows="2"
                        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.submitReply('${id}','root',this)}"></textarea>
                    <div style="display:flex;gap:6px;margin-top:4px;">
                        <button onclick="window.submitReply('${id}','root',this.parentElement.previousElementSibling)" style="font-size:0.75rem;padding:3px 10px;border-radius:6px;border:1px solid var(--link);background:var(--link);color:#fff;cursor:pointer;">Send</button>
                        <button onclick="document.getElementById('reply-box-root-${id}').style.display='none'" style="font-size:0.75rem;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-2);cursor:pointer;">Cancel</button>
                    </div>
                </div>
                <div class="comments-section" style="${commsHtml ? '' : 'display:none;'}">${commsHtml}</div>
            `;
            box.appendChild(card);
        });
    });
};

// ─── Context Menu ─────────────────────────────────────────────────────────────

const showMenu = (e, msgId, text, isMe) => {
    if (e.cancelable) e.preventDefault();
    selectedMsgId = msgId;
    selectedMsgText = text;
    const menu = document.getElementById('msgMenu');
    const canTouch = isMe || realUser === '@admin';
    document.getElementById('editBtn').style.display = canTouch ? 'flex' : 'none';
    document.getElementById('delBtn').style.display = canTouch ? 'flex' : 'none';

    menu.style.visibility = 'hidden';
    menu.style.display = 'flex';

    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    let x = e.clientX || (e.touches?.[0]?.clientX ?? 0);
    let y = e.clientY || (e.touches?.[0]?.clientY ?? 0);

    if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 10;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 10;
    if (x < 10) x = 10;
    if (y < 10) y = 10;

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
    if (await showCustomModal("Delete?")) {
        set(ref(db, `messages/${getActiveChatDbId()}/${selectedMsgId}`), null);
    }
};

document.getElementById('editBtn').onclick = async () => {
    document.getElementById('msgMenu').style.display = 'none';
    const nt = await showCustomModal("Edit", true, selectedMsgText);
    if (nt) set(ref(db, `messages/${getActiveChatDbId()}/${selectedMsgId}/text`), nt.trim());
};

document.addEventListener('click', () => { document.getElementById('msgMenu').style.display = 'none'; });

// ─── Reactions ────────────────────────────────────────────────────────────────

window.setReaction = (emoji) => {
    if (!reactionTargetMsgId || !currentChatId) return;
    const userKey = currentUser.replace('@', '');
    const reactionRef = ref(db, `messages/${getActiveChatDbId()}/${reactionTargetMsgId}/reactions/${userKey}`);
    get(reactionRef).then(snap => { set(reactionRef, snap.val() === emoji ? null : emoji); });
    document.getElementById('msgMenu').style.display = 'none';
};

// ─── Modal ────────────────────────────────────────────────────────────────────

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

// ─── Utils ────────────────────────────────────────────────────────────────────

const translateText = async (pair, text) => {
    try {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`);
        const data = await res.json();
        return data.responseData.translatedText;
    } catch { return text; }
};

const uploadImg = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=dd65b7ceefe40d82481e19dd95070333`, { method: 'POST', body: formData });
    const data = await res.json();
    return data.data.url;
};

// ─── Init ─────────────────────────────────────────────────────────────────────

const init = () => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        proceed(savedUser);
    } else {
        document.getElementById('userAuthOverlay').style.display = 'flex';
    }

    const themeBtn = document.getElementById('themeToggle');

    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    themeBtn.innerHTML = currentTheme === 'dark' ? '<i class="fa-solid fa-sun"></i> Theme' : '<i class="fa-solid fa-moon"></i> Theme';
    themeBtn.onclick = () => {
        const newTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeBtn.innerHTML = newTheme === 'dark' ? '<i class="fa-solid fa-sun"></i> Theme' : '<i class="fa-solid fa-moon"></i> Theme';
    };
    // ─── Accent ───────────────────────────────────────────────────────────────────
    const applyAccent = (accent) => {
        document.documentElement.setAttribute('data-accent', accent);
        document.querySelectorAll('.accent-swatch').forEach(s =>
            s.classList.toggle('active', s.dataset.accent === accent)
        );
    };

    const savedAccent = localStorage.getItem('accent') || 'cyan';
    applyAccent(savedAccent);

    document.getElementById('accentPicker').addEventListener('click', (e) => {
        const swatch = e.target.closest('.accent-swatch');
        if (!swatch) return;
        const accent = swatch.dataset.accent;
        localStorage.setItem('accent', accent);
        applyAccent(accent);
    });

    const area = document.getElementById('msgInput');
    area.oninput = async () => {
        area.style.height = 'auto';
        area.style.height = area.scrollHeight + 'px';
        const btn = document.getElementById('sendBtn');
        if (area.value.trim().length > 0 && currentChatId) btn.classList.add('active');
        else btn.classList.remove('active');

        const val = area.value;
        const cmd = document.getElementById('cmdSuggestions');
        cmd.innerHTML = '';

        if (val.startsWith('/')) {
            const commands = [
                { cmd: '/translate de', desc: '<br>Translate to German' },
                { cmd: '/translate en', desc: '<br>Translate to English' },
            ];
            const filter = val.toLowerCase();
            const matches = commands.filter(c => c.cmd.startsWith(filter));
            if (matches.length) {
                cmd.style.display = 'block';
                matches.forEach(c => {
                    const item = document.createElement('div');
                    item.className = 'suggest-item';
                    item.innerHTML = `<b>${c.cmd}</b> <span style="opacity:0.5;font-size:0.8rem">${c.desc}</span>`;
                    item.onclick = () => { area.value = c.cmd + ' '; cmd.style.display = 'none'; area.focus(); };
                    cmd.appendChild(item);
                });
            } else { cmd.style.display = 'none'; }
            return;
        }

        // @ автодополнение — ищем последний @ в тексте
        const atMatch = val.match(/@([a-zA-Z0-9_]*)$/);
        if (atMatch) {
            const query = atMatch[1].toLowerCase();
            const snap = await get(ref(db, 'users'));
            const users = Object.keys(snap.val() || {}).filter(u => u.toLowerCase().includes(query) && '@'+u !== currentUser);
            if (users.length) {
                cmd.style.display = 'block';
                users.slice(0, 5).forEach(u => {
                    const item = document.createElement('div');
                    item.className = 'suggest-item';
                    item.innerHTML = `<b>@${u}</b>`;
                    item.onclick = () => {
                        area.value = val.replace(/@([a-zA-Z0-9_]*)$/, '@' + u + ' ');
                        cmd.style.display = 'none';
                        area.focus();
                    };
                    cmd.appendChild(item);
                });
            } else { cmd.style.display = 'none'; }
            return;
        }

        cmd.style.display = 'none';
    };
    area.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };

    document.getElementById('openSystemBtn').onclick = () => openChat('📢 System', null, SYSTEM_CHAT_ID);
    document.getElementById('settingsBtn').onclick = () => document.getElementById('settingsPanel').classList.toggle('hidden');
    document.getElementById('logoutBtn').onclick = () => { localStorage.clear(); location.reload(); };
    document.getElementById('menuToggle').onclick = () => document.getElementById('sidebar').classList.toggle('hidden');
    document.getElementById('sendBtn').onclick = sendMsg;
    document.getElementById('openFeedBtn').onclick = window.openFeed;
    document.getElementById('createGroupBtn').onclick = async () => {
        const g = await showCustomModal("Group name:", true);
        if (g) openChat('#' + g.trim().replace(/#/g, ''));
    };

    document.getElementById('userAuthBtn').onclick = async () => {
        const rawName = document.getElementById('loginUser').value.trim().replace('@', '');
        const uPassRaw = document.getElementById('loginPass').value.trim();

        if (rawName.length < 3) return await showCustomModal("Name too short! Min 3 characters.");
        if (!uPassRaw) return await showCustomModal("Fill in password!");

        const uPass = await hashPassword(uPassRaw);
        const uName = '@' + rawName;
        const userRef = ref(db, 'users/' + rawName);
        const snap = await get(userRef);

        if (snap.exists()) {
            if (snap.val().pass !== uPass) return await showCustomModal("Wrong password!");
        } else {
            const inviteCode = await showCustomModal("New account? Enter Invite Code:", true);
            const invSnap = await get(ref(db, `invites/${inviteCode}`));
            if (!invSnap.exists()) return await showCustomModal("Invalid or used invite code!");
            if (!/^[a-zA-Z0-9]+$/.test(rawName)) return await showCustomModal("Only letters and numbers allowed!");
            const forbidden = ['admin', 'owner', 'system', 'root'];
            if (forbidden.some(word => rawName.toLowerCase().includes(word))) return await showCustomModal("Forbidden name!");
            await set(userRef, { pass: uPass });
            await set(ref(db, `invites/${inviteCode}`), null);
        }

        localStorage.setItem('currentUser', uName);
        proceed(uName);
    };

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
        } else {
            const myChatsSnap = await get(ref(db, `active_chats/${currentUser.replace('@', '')}`));
            const myChats = myChatsSnap.val() || {};
            const msgsSnap = await get(ref(db, 'messages'));
            const allMessages = msgsSnap.val() || {};
            Object.keys(myChats).forEach(chatDbId => {
                const msgs = allMessages[chatDbId];
                if (!msgs) return;
                Object.entries(msgs).forEach(([msgId, m]) => {
                    if (m.text && m.text.toLowerCase().includes(val)) {
                        const item = document.createElement('div');
                        item.className = 'chat-item search-result';
                        const chatTitle = myChats[chatDbId].title;
                        item.innerHTML = `
                            <div style="font-size:0.8em;color:var(--link);">в ${chatTitle}</div>
                            <div style="font-weight:bold;">${m.user}:</div>
                            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.text}</div>
                        `;
                        item.onclick = () => { openChat(chatTitle, msgId); sInput.value = ''; sSuggest.style.display = 'none'; };
                        sSuggest.appendChild(item);
                    }
                });
            });
        }
    };

    document.getElementById('imgInput').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file || !currentChatId) return;
        const btn = e.target.parentElement;
        btn.style.opacity = '0.5';
        try {
            const url = await uploadImg(file);
            push(ref(db, 'messages/' + getActiveChatDbId()), { user: currentUser, text: `IMG_URL:${url}`, timestamp: serverTimestamp() });
        } catch { await showCustomModal("Upload failed"); }
        finally { btn.style.opacity = '1'; e.target.value = ''; }
    };

    get(ref(db, 'invites/')).then(snap => {
        if (!snap.exists()) set(ref(db, 'invites/'), true);
    });
};

// ─── Service Worker ───────────────────────────────────────────────────────────

window.addEventListener('load', () => {
    if (!('serviceWorker' in navigator)) { console.warn('SW not supported'); return; }
    navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
        .then((reg) => {
            console.log('SW registered:', reg.scope);
            if (currentUser) {
                getToken(messaging, { vapidKey: VAPID, serviceWorkerRegistration: reg })
                    .then(token => { if (token) saveTokenToDb(token); })
                    .catch(err => console.log('Token error:', err));
            }
        })
        .catch(err => console.log('SW registration failed:', err));
});

init();