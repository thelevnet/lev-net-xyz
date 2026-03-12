import { db, ref, set, remove, onValue, off, serverTimestamp, state, getAvatar, makeAvatarEl, updatePresence, avatarCache } from './firebase.js';

// Modal

export const showCustomModal = (title, showInput = false, defaultValue = "") => {
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

// Typing

export const setTyping = (isTyping) => {
    if (!state.currentUser || !state.activeChatDbId) return;
    const key = state.currentUser.replace('@', '');
    const tRef = ref(db, `typing/${state.activeChatDbId}/${key}`);
    if (isTyping) set(tRef, serverTimestamp());
    else remove(tRef);
};

export const watchTyping = (dbId) => {
    if (state.typingRef) off(state.typingRef);
    state.typingRef = ref(db, `typing/${dbId}`);
    const indicator = document.getElementById('typingIndicator');
    onValue(state.typingRef, snap => {
        const data = snap.val();
        if (!data) { indicator.style.display = 'none'; return; }
        const others = Object.keys(data).filter(k => '@' + k !== state.currentUser);
        if (!others.length) { indicator.style.display = 'none'; return; }
        indicator.style.display = 'flex';
        indicator.querySelector('.typing-text').innerText = `${others.map(k => '@' + k).join(', ')} is writing...`;
    });
};

// Reply

export const setReply = (msgId, user, text) => {
    state.replyToMsg = { id: msgId, user, text };
    const bar = document.getElementById('replyBar');
    bar.style.display = 'flex';
    bar.querySelector('.reply-user').innerText = user;
    bar.querySelector('.reply-preview').innerText = text?.startsWith('IMG_URL:') ? '🖼 Image' : (text || '').slice(0, 80);
};

export const clearReply = () => {
    state.replyToMsg = null;
    document.getElementById('replyBar').style.display = 'none';
};

// Settings avatar

export const updateSettingsAvatar = (url) => {
    const img = document.getElementById('myAvatar');
    const placeholder = document.getElementById('myAvatarPlaceholder');
    document.getElementById('myUsername').innerText = state.currentUser;
    if (url) {
        img.src = url;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        img.style.display = 'none';
        placeholder.style.display = 'flex';
        placeholder.innerText = state.currentUser[1]?.toUpperCase() || '?';
    }
};

// Call button in header (DM only)

export const showCallButton = (chatId) => {
    document.getElementById('callHeaderBtn')?.remove();
    if (!chatId || chatId.startsWith('#') || chatId === 'System' || chatId === 'GLOBAL_FEED' || chatId === '@gemini' || chatId.startsWith('gemini_chat_')) return;
    const btn = document.createElement('button');
    btn.id = 'callHeaderBtn';
    btn.className = 'card';
    btn.style.cssText = 'width:40px;height:40px;display:flex;align-items:center;justify-content:center;margin-left:10px;';
    btn.innerHTML = '<i class="fa-solid fa-phone"></i>';
    btn.title = 'Voice call';
    btn.onclick = () => window.callStart(chatId);
    document.getElementById('headerActions')?.appendChild(btn);
};

// Proceed (auth success)

export const proceed = (user) => {
    state.currentUser = user;
    state.realUser = user;
    document.getElementById('userAuthOverlay').style.display = 'none';
    document.getElementById('chatApp').style.display = 'flex';
    // imported lazily to avoid circular dep
    import('./admin.js').then(m => m.checkAdmin(user));
    import('./chatlist.js').then(m => m.loadActiveChats());
    import('./calls.js').then(m => m.injectCallUI());
    getAvatar(user).then(url => updateSettingsAvatar(url));
    updatePresence();
    setInterval(updatePresence, 30000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) updatePresence();
        else setTyping(false);
    });
};
