import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onValue, set, get, serverTimestamp, off, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
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

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const messaging = getMessaging(app);
export { ref, push, onValue, set, get, serverTimestamp, off, remove, getToken };

export const SYSTEM_CHAT_ID = 'system_broadcast';
export const VAPID = 'BCVfZS0S7FdKxMoCSPxRv-026OJjJUdidX1UdFJVtr3xO9nAK1-nx408bKbjChgjyh3U9KOwyjE2gcdFROVclPA';
export const CLOUDINARY_CLOUD = 'dyd4rlla9';
export const CLOUDINARY_PRESET = 'levnetaudio';

// Mutable state shared across modules
export const state = {
    currentUser: null,
    realUser: null,
    currentChatId: null,
    currentChatRef: null,
    selectedMsgId: null,
    selectedMsgText: null,
    isFirstLoad: true,
    reactionTargetMsgId: null,
    activeChatDbId: null,
    replyToMsg: null,
    typingTimeout: null,
    typingRef: null,
};

export const avatarCache = {};
window.feedSortMode = 'new';

export const buildChatDbId = (chatId) =>
    chatId.startsWith('#')
        ? 'group_' + chatId.replace('#', '')
        : [state.currentUser, chatId].sort().join('_').replace(/@/g, '');

export const buildChatDbIdFor = (chatId, fromUser) =>
    chatId.startsWith('#')
        ? 'group_' + chatId.replace('#', '')
        : [fromUser, chatId].sort().join('_').replace(/@/g, '');

export const getActiveChatDbId = () => state.activeChatDbId;

export const getAvatar = async (username) => {
    const key = username.replace('@', '');
    if (avatarCache[key] !== undefined) return avatarCache[key];
    const snap = await get(ref(db, `users/${key}/avatar`));
    avatarCache[key] = snap.val() || null;
    return avatarCache[key];
};

export const makeAvatarEl = (url, username, size = 30) => {
    const key = username.replace('@', '').replace('#', '');
    const letter = (username[1] || username[0] || '?').toUpperCase();
    let el;
    if (url) {
        el = document.createElement('img');
        el.src = url;
        el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;`;
    } else {
        el = document.createElement('div');
        el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:var(--secondary);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:${size * 0.35}px;font-weight:900;color:#fff;`;
        el.innerText = letter;
    }
    el.dataset.username = key;
    if (!username.startsWith('#')) {
        onValue(ref(db, `users/${key}/lastSeen`), snap => {
            const ts = snap.val();
            if (!ts) return;
            el.style.outline = Date.now() - ts < 60000 ? '2px solid #44cc66' : 'none';
            el.style.outlineOffset = '2px';
        });
    }
    return el;
};

export const updatePresence = () => {
    if (!state.currentUser) return;
    set(ref(db, `users/${state.currentUser.replace('@', '')}/lastSeen`), serverTimestamp());
};

export async function hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const saveTokenToDb = (token) => {
    if (!state.currentUser) return;
    const userPath = state.currentUser.replace('@', '');
    const tokenKey = btoa(token).substring(0, 20).replace(/[/+=]/g, 'x');
    set(ref(db, `users/${userPath}/tokens/${tokenKey}`), token);
};
