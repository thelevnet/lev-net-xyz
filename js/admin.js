import { db, ref, set, get, push, onValue, remove, serverTimestamp, state, SYSTEM_CHAT_ID, avatarCache } from './firebase.js';
import { showCustomModal } from './ui.js';

export function checkAdmin(user) {
    const panel = document.getElementById('adminPanel');
    if (!panel) return;
    if (state.realUser === '@admin') {
        panel.style.display = 'block';
        loadAllThreads();
    } else {
        panel.style.display = 'none';
    }
}

function loadAllThreads() {
    if (state.realUser !== '@admin') return;
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
            d.onclick = () => window.openChat(d.innerText, null, threadId);
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
        set(ref(db, `active_chats/${username}/${SYSTEM_CHAT_ID}`), { title: 'System', lastMsg: txt, lastTime: Date.now() });
    });
};

window.deleteEntireChat = async () => {
    if (!state.currentChatId || state.currentChatId === 'GLOBAL_FEED') return await showCustomModal("Select a real chat first");
    if (await showCustomModal("DELETE ALL MESSAGES?")) {
        await set(ref(db, `messages/${state.activeChatDbId}`), null);
        await showCustomModal("Nuked.");
    }
};

window.changeMyName = async () => {
    const n = await showCustomModal("Act as @username:", true);
    if (!n?.startsWith('@')) return;
    state.currentUser = n;
    await showCustomModal(`Now acting as ${n}`);
};

window.changeAvatar = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const { uploadImg } = await import('./media.js');
        const { updateSettingsAvatar } = await import('./ui.js');
        const url = await uploadImg(file);
        const key = state.currentUser.replace('@', '');
        await set(ref(db, `users/${key}/avatar`), url);
        avatarCache[key] = url;
        updateSettingsAvatar(url);
        await showCustomModal("Avatar updated!");
    };
    input.click();
};
