import { db, ref, set, onValue, remove, state, SYSTEM_CHAT_ID, getAvatar, makeAvatarEl } from './firebase.js';
import { showCustomModal } from './ui.js';

export function loadActiveChats() {
    if (!state.currentUser) return;
    onValue(ref(db, `active_chats/${state.currentUser.replace('@', '')}`), (snap) => {
        const list = document.getElementById('activeChatsList');
        list.innerHTML = '';
        const data = snap.val();
        if (!data) return;

        const entries = Object.entries(data)
            .filter(([id, info]) => id !== SYSTEM_CHAT_ID && info.title)
            .sort((a, b) => (b[1].lastTime || 0) - (a[1].lastTime || 0));

        entries.forEach(([id, info]) => {
            const d = document.createElement('div');
            d.className = 'chat-item';
            d.style.cssText = 'display:flex;align-items:center;gap:10px;position:relative;';
            d.onclick = () => {
                set(ref(db, `active_chats/${state.currentUser.replace('@', '')}/${id}/unread`), 0);
                window.openChat(info.title);
            };
            if (state.currentChatId && state.currentChatId === info.title) d.classList.add('active');

            const avatarEl = makeAvatarEl(null, info.title, 28);
            const textWrap = document.createElement('div');
            textWrap.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;';

            const nameEl = document.createElement('span');
            nameEl.innerText = info.title;
            nameEl.style.cssText = 'font-weight:700;font-size:0.9rem;';

            const previewEl = document.createElement('span');
            previewEl.style.cssText = 'font-size:0.72rem;opacity:0.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;';
            if (info.lastMsg) {
                previewEl.innerText = info.lastMsg.startsWith('IMG_URL:') ? '🖼 Image'
                    : info.lastMsg.startsWith('AUDIO_URL:') ? '🎤 Voice'
                    : info.lastMsg;
            }

            textWrap.appendChild(nameEl);
            textWrap.appendChild(previewEl);

            if (info.unread && info.unread > 0 && state.currentChatId !== info.title) {
                const badge = document.createElement('div');
                badge.className = 'unread-badge';
                badge.innerText = info.unread > 99 ? '99+' : info.unread;
                d.appendChild(avatarEl);
                d.appendChild(textWrap);
                d.appendChild(badge);
            } else {
                const delBtn = document.createElement('button');
                delBtn.innerHTML = '✕';
                delBtn.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-3);font-size:0.75rem;cursor:pointer;padding:2px 5px;opacity:0;transition:0.2s;';
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    if (await showCustomModal(`Remove ${info.title} from list?`)) {
                        remove(ref(db, `active_chats/${state.currentUser.replace('@', '')}/${id}`));
                    }
                };
                d.addEventListener('mouseenter', () => delBtn.style.opacity = '1');
                d.addEventListener('mouseleave', () => delBtn.style.opacity = '0');
                d.appendChild(avatarEl);
                d.appendChild(textWrap);
                d.appendChild(delBtn);
            }

            if (!info.title.startsWith('#') && info.title.startsWith('@')) {
                getAvatar(info.title).then(url => {
                    if (url) avatarEl.replaceWith(makeAvatarEl(url, info.title, 28));
                });
            }

            list.appendChild(d);
        });
    });
}
