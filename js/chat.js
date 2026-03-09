import { db, ref, push, onValue, set, get, serverTimestamp, off, remove, state, SYSTEM_CHAT_ID, buildChatDbId, buildChatDbIdFor, getActiveChatDbId, getAvatar, makeAvatarEl } from './firebase.js';
import { showCustomModal, setTyping, watchTyping, setReply, clearReply, showCallButton } from './ui.js';
import { translateText, uploadImg } from './media.js';
import { isGeminiChat, sendToGemini, handleGeminiMention } from './ai.js';

// openChat

function openChat(id, targetMsgId = null, forceDbId = null) {
    document.getElementById('chatBox').classList.remove('feed-mode');
    if (state.currentChatRef) off(state.currentChatRef);
    setTyping(false);
    clearReply();
    state.currentChatId = id;
    state.isFirstLoad = true;

    document.getElementById('chatTitle').innerText = ' ' + id;

    // For gemini chats load real title from firebase
    if (id.startsWith('gemini_chat_')) {
        const myKey = state.currentUser?.replace('@', '');
        get(ref(db, `active_chats/${myKey}/${id}/title`)).then(snap => {
            const t = snap.val();
            if (t && !t.startsWith('gemini_chat_')) document.getElementById('chatTitle').childNodes[0].textContent = ' ' + t;
        });
    }
    document.getElementById('groupMembersBtn').style.display = id.startsWith('#') ? 'flex' : 'none';
    showCallButton(id);

    const existingLabel = document.getElementById('presenceLabel');
    if (existingLabel) existingLabel.remove();

    if (!id.startsWith('#') && id !== 'System' && id !== 'GLOBAL_FEED') {
        const key = id.replace('@', '');
        onValue(ref(db, `users/${key}/lastSeen`), snap => {
            const ts = snap.val();
            if (!ts) return;
            const diff = Date.now() - ts;
            let label;
            if (diff < 60000) label = 'online';
            else if (diff < 3600000) label = `${Math.floor(diff / 60000)} min ago`;
            else if (diff < 86400000) label = `${Math.floor(diff / 3600000)}h ago`;
            else label = `${Math.floor(diff / 86400000)}d ago`;
            document.getElementById('presenceLabel')?.remove();
            const sub = document.createElement('div');
            sub.id = 'presenceLabel';
            sub.style.cssText = 'font-size:0.65rem;opacity:0.6;font-weight:400;';
            sub.innerText = label;
            document.getElementById('chatTitle').appendChild(sub);
        });
    }

    if (window.innerWidth <= 600) document.getElementById('sidebar').classList.add('hidden');

    state.activeChatDbId = forceDbId || (id.startsWith('gemini_chat_') ? id : buildChatDbId(id));
    state.currentChatRef = ref(db, 'messages/' + state.activeChatDbId);

    const isSystemChat = state.activeChatDbId === SYSTEM_CHAT_ID && state.realUser !== '@admin';
    document.querySelector('.input-row').style.display = isSystemChat ? 'none' : 'flex';

    watchTyping(state.activeChatDbId);

    const box = document.getElementById('chatBox');
    const scrollBtn = document.getElementById('scrollDownBtn');
    box.onscroll = () => {
        scrollBtn.style.display = (box.scrollHeight - box.scrollTop - box.clientHeight) > 200 ? 'flex' : 'none';
    };
    scrollBtn.onclick = () => box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });

    // event delegation — replaces all inline onclick in messages
    box.onclick = (e) => {
        const img = e.target.closest('[data-open-img]');
        if (img) { window.openImg(img.dataset.openImg); return; }
        const iframe = e.target.closest('[data-open-iframe]');
        if (iframe) { window.openIframe(iframe.dataset.openIframe); return; }
        const mention = e.target.closest('[data-open-chat]');
        if (mention) { window.openChat(mention.dataset.openChat); return; }
        const audio = e.target.closest('[data-audio]');
        if (audio) { window.toggleAudio(audio.dataset.audio); return; }
        const scrollTo = e.target.closest('[data-scroll-to]');
        if (scrollTo) { window.scrollToMsg(scrollTo.dataset.scrollTo); return; }
        document.getElementById('msgMenu').style.display = 'none';
    };

    onValue(state.currentChatRef, (snap) => {
        box.innerHTML = '';
        const data = snap.val();
        if (!data) {
            box.innerHTML = '<div style="text-align:center;opacity:0.5;margin-top:20px;">No messages yet</div>';
            state.isFirstLoad = false;
            return;
        }

        let lastUser = null, lastDate = null;

        Object.entries(data).forEach(([msgKey, m]) => {
            const isMe = m.user === state.currentUser;
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
                const url = /^https?:\/\//.test(content.replace('IMG_URL:', '')) ? content.replace('IMG_URL:', '') : '';
                content = url ? `<img src="${url}" style="max-width:100%;border-radius:8px;cursor:pointer;display:block;" data-open-img="${url}">` : '';
            } else if (content.startsWith('AUDIO_URL:')) {
                const url = content.replace('AUDIO_URL:', '');
                const pid = 'ap_' + msgKey;
                content = `<div class="tg-voice" id="${pid}" data-url="${url}">
                    <button class="tg-play-btn" data-audio="${pid}"><i class="fa-solid fa-play"></i></button>
                    <div class="tg-wave">${Array.from({length:30},(_,i)=>`<div class="tg-bar" style="height:${8+Math.abs(Math.sin(i*0.8)*18)|0}px"></div>`).join('')}</div>
                </div>`;
            } else {
                // 1. purify raw input — kills all scripts/styles/buttons
                let safe = window.DOMPurify ? window.DOMPurify.sanitize(content, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }) : content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                // 2. markdown on clean plain text
                safe = window.marked ? window.marked.parse(safe, { breaks: true, gfm: true }) : safe.replace(/\n/g, '<br>');
                // 3. inject @mentions and URLs — our trusted code, runs after purify
                safe = safe.replace(/(@[a-zA-Z0-9_]+)/g, m => `<span class="mention" data-open-chat="${m}" style="cursor:pointer">${m}</span>`);
                safe = safe.replace(/<a href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/g, (match, url) => {
    return `${match}<div style="position:relative;margin-top:6px;border-radius:8px;overflow:hidden;background:#fff;"><iframe src="${url}" style="width:100%;height:200px;border:none;display:block;" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms"></iframe><div data-open-iframe="${url}" style="position:absolute;top:0;left:0;width:100%;height:100%;cursor:pointer;z-index:1;"></div></div>`;
});
                content = safe;
            }

            let replyHtml = '';
            if (m.replyTo) {
                const rt = m.replyTo;
                const rText = rt.text?.startsWith('IMG_URL:') ? '🖼 Image' : (rt.text || '').slice(0, 80);
                replyHtml = `<div class="reply-quote" data-scroll-to="${rt.id}">${rt.user}: ${rText}</div>`;
            }

            let touchTimer;
            wrapper.addEventListener('touchstart', (e) => {
                touchTimer = setTimeout(() => { state.reactionTargetMsgId = msgKey; showMenu(e, msgKey, m.text, isMe); touchTimer = null; }, 600);
            }, { passive: true });
            wrapper.addEventListener('touchend', () => { if (touchTimer) clearTimeout(touchTimer); });
            wrapper.addEventListener('touchmove', () => { if (touchTimer) clearTimeout(touchTimer); });
            wrapper.oncontextmenu = (e) => { e.preventDefault(); state.reactionTargetMsgId = msgKey; showMenu(e, msgKey, m.text, isMe); };
            wrapper.onclick = () => { document.getElementById('msgMenu').style.display = 'none'; };

            let reactionsHtml = '<div class="reactions-container">';
            if (m.reactions) {
                const counts = {};
                Object.values(m.reactions).forEach(emoji => { counts[emoji] = (counts[emoji] || 0) + 1; });
                Object.entries(counts).forEach(([emoji, count]) => { reactionsHtml += `<div class="reaction-badge">${emoji}${count > 1 ? ' ' + count : ''}</div>`; });
            }
            reactionsHtml += '</div>';

            wrapper.innerHTML = `<div class="message card">${replyHtml}<div class="msg-text">${content}</div>${reactionsHtml}<div class="msg-time">${timeStr}</div></div>`;

            if (!isMe && m.user !== lastUser) {
                const avatarRow = document.createElement('div');
                avatarRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:2px;padding-left:2px;cursor:pointer;';
                const avatarEl = makeAvatarEl(null, m.user, 20);
                const nameEl = document.createElement('span');
                nameEl.style.cssText = 'font-size:0.72rem;font-weight:900;color:var(--link);';
                nameEl.innerText = m.user;
                avatarRow.dataset.openChat = m.user;
                avatarRow.style.cursor = 'pointer';
                avatarRow.appendChild(avatarEl);
                avatarRow.appendChild(nameEl);
                box.appendChild(avatarRow);
                getAvatar(m.user).then(url => { if (url) avatarEl.replaceWith(makeAvatarEl(url, m.user, 20)); });
            }

            box.appendChild(wrapper);
            lastUser = m.user;
        });

        state.isFirstLoad = false;

        if (targetMsgId) {
            setTimeout(() => {
                const el = document.getElementById('msg-' + targetMsgId);
                if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('glow-msg'); setTimeout(() => el.classList.remove('glow-msg'), 2000); }
            }, 200);
        } else {
            box.scrollTop = box.scrollHeight;
        }
    });
}

window.openChat = openChat;

window.scrollToMsg = (msgId) => {
    const el = document.getElementById('msg-' + msgId);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('glow-msg'); setTimeout(() => el.classList.remove('glow-msg'), 2000); }
};

window.openGroupMembers = async () => {
    if (!state.currentChatId?.startsWith('#')) return;
    const dbId = getActiveChatDbId();
    const snap = await get(ref(db, `groups/${dbId}/members`));
    const members = snap.val() ? Object.keys(snap.val()) : [];
    const list = document.getElementById('groupMembersList');
    list.innerHTML = '';
    members.forEach(m => {
        const d = document.createElement('div');
        d.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--border);';
        const av = makeAvatarEl(null, '@' + m, 28);
        const name = document.createElement('span');
        name.innerText = '@' + m;
        name.style.flex = '1';
        getAvatar('@' + m).then(url => { if (url) av.replaceWith(makeAvatarEl(url, '@' + m, 28)); });
        d.appendChild(av);
        d.appendChild(name);
        if (state.realUser === '@admin' && m !== state.currentUser.replace('@', '')) {
            const kickBtn = document.createElement('button');
            kickBtn.innerText = 'Kick';
            kickBtn.style.cssText = 'font-size:0.7rem;padding:3px 8px;border-radius:6px;border:1px solid red;background:none;color:red;cursor:pointer;';
            kickBtn.onclick = async () => { await remove(ref(db, `groups/${dbId}/members/${m}`)); await remove(ref(db, `active_chats/${m}/${dbId}`)); d.remove(); };
            d.appendChild(kickBtn);
        }
        list.appendChild(d);
    });
    document.getElementById('groupMembersPanel').classList.toggle('hidden');
};

// Send

export const sendMsg = async () => {
    const inp = document.getElementById('msgInput');
    let txt = inp.value.trim();
    if (!txt || !state.currentChatId) return;

    // Gemini personal chat
    if (isGeminiChat(state.currentChatId)) {
        inp.value = '';
        inp.style.height = '50px';
        document.getElementById('sendBtn').classList.remove('active');
        await sendToGemini(txt, state.activeChatDbId);
        return;
    }

    // @gemini mention in any chat
    if (/^@ai\s+/i.test(txt)) {
        inp.value = '';
        inp.style.height = '50px';
        document.getElementById('sendBtn').classList.remove('active');
        await handleGeminiMention(txt, state.activeChatDbId);
        return;
    }

    if (state.currentChatId === 'GLOBAL_FEED') {
        push(ref(db, 'feed'), { user: state.currentUser, text: txt, votes: 0, timestamp: serverTimestamp() });
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

    const isGroup = state.currentChatId.startsWith('#');
    const targetId = state.currentChatId.replace(/[@#]/g, '');
    const dbId = state.activeChatDbId || (isGroup ? 'group_' + targetId : [state.currentUser, state.currentChatId].sort().join('_').replace(/@/g, ''));

    const msgData = { user: state.currentUser, text: txt, timestamp: serverTimestamp() };
    if (state.replyToMsg) msgData.replyTo = { id: state.replyToMsg.id, user: state.replyToMsg.user, text: state.replyToMsg.text };

    push(ref(db, 'messages/' + dbId), msgData);

    const myKey = state.currentUser.replace('@', '');
    const preview = txt.slice(0, 60);
    const now = Date.now();
    const isNewChat = !(await get(ref(db, `active_chats/${myKey}/${dbId}`))).exists();

    if (isNewChat) {
        if (isGroup) set(ref(db, `groups/${dbId}/members/${myKey}`), true);
        set(ref(db, `active_chats/${myKey}/${dbId}`), { title: state.currentChatId, lastMsg: preview, lastTime: now });
        if (!isGroup) set(ref(db, `active_chats/${targetId}/${dbId}`), { title: state.currentUser, lastMsg: preview, lastTime: now });
    } else {
        set(ref(db, `active_chats/${myKey}/${dbId}/lastMsg`), preview);
        set(ref(db, `active_chats/${myKey}/${dbId}/lastTime`), now);
        if (!isGroup) {
            set(ref(db, `active_chats/${targetId}/${dbId}/lastMsg`), preview);
            set(ref(db, `active_chats/${targetId}/${dbId}/lastTime`), now);
        }
    }

    if (!isGroup) {
        get(ref(db, `active_chats/${targetId}/${dbId}/unread`)).then(s => {
            set(ref(db, `active_chats/${targetId}/${dbId}/unread`), (s.val() || 0) + 1);
        });
    }

    setTyping(false);
    clearReply();
    inp.value = '';
    inp.style.height = '50px';
    document.getElementById('sendBtn').classList.remove('active');
};

// Forward

window.forwardMsg = async () => {
    document.getElementById('msgMenu').style.display = 'none';
    const target = await showCustomModal("Forward to (@user or #group):", true);
    if (!target) return;
    const targetDbId = buildChatDbIdFor(target, state.currentUser);
    push(ref(db, 'messages/' + targetDbId), { user: state.currentUser, text: state.selectedMsgText, forwarded: true, timestamp: serverTimestamp() });
    const myKey = state.currentUser.replace('@', '');
    const targetId = target.replace(/[@#]/g, '');
    set(ref(db, `active_chats/${myKey}/${targetDbId}/title`), target);
    set(ref(db, `active_chats/${myKey}/${targetDbId}/lastMsg`), state.selectedMsgText?.slice(0, 60) || '');
    set(ref(db, `active_chats/${myKey}/${targetDbId}/lastTime`), Date.now());
    if (!target.startsWith('#')) {
        set(ref(db, `active_chats/${targetId}/${targetDbId}/title`), state.currentUser);
        set(ref(db, `active_chats/${targetId}/${targetDbId}/lastMsg`), state.selectedMsgText?.slice(0, 60) || '');
        set(ref(db, `active_chats/${targetId}/${targetDbId}/lastTime`), Date.now());
    }
};

window.openIframe = (url) => {
    const overlay = document.createElement('div');
    overlay.id = 'iframeOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:99999;display:flex;flex-direction:column;';
    overlay.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:10px 15px;background:var(--surface);border-bottom:2px solid var(--border);flex-shrink:0;"><button onclick="document.getElementById('iframeOverlay').remove()" style="border:2px solid var(--border);background:var(--surface);border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:1rem;color:var(--text-1);display:flex;align-items:center;justify-content:center;">✕</button><a href="${url}" target="_blank" style="font-size:0.8rem;color:var(--link);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${url}</a></div><iframe src="${url}" style="flex:1;border:none;background:#fff;" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>`;
    document.body.appendChild(overlay);
};

window.openImg = (url) => {
    const overlay = document.createElement('div');
    overlay.id = 'imgOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:99999;display:flex;flex-direction:column;background:rgba(0,0,0,0.9);';
    overlay.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:10px 15px;background:var(--surface);border-bottom:2px solid var(--border);flex-shrink:0;"><button onclick="document.getElementById('imgOverlay').remove()" style="border:2px solid var(--border);background:var(--surface);border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:1rem;color:var(--text-1);display:flex;align-items:center;justify-content:center;">✕</button><a href="${url}" target="_blank" style="font-size:0.8rem;color:var(--link);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${url}</a></div><div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px;"><img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;"></div>`;
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
};
// Feed

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
                    ${c.user === state.currentUser ? `<span onclick="window.openEditBox('${postId}','${id}')" style="cursor:pointer;font-weight:bold;">Edit</span>` : ''}
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
            </div>`).join('');
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
    push(ref(db, `feed/${postId}/comments`), { user: state.currentUser, text: txt, parentId, timestamp: serverTimestamp() });
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
    const userKey = state.currentUser.replace('@', '');
    const vRef = ref(db, `feed/${postId}/voters/${userKey}`);
    const countRef = ref(db, `feed/${postId}/votes`);
    get(vRef).then(snap => {
        if (snap.exists()) { set(vRef, null); get(countRef).then(s => set(countRef, Math.max(0, (s.val() || 1) - 1))); }
        else { set(vRef, true); get(countRef).then(s => set(countRef, (s.val() || 0) + 1)); }
    });
};

window.openFeed = () => {
    document.getElementById('sidebar').classList.add('hidden');
    if (state.currentChatRef) off(state.currentChatRef);
    setTyping(false);
    state.currentChatId = 'GLOBAL_FEED';
    document.getElementById('chatTitle').innerHTML = `Feed
        <span onclick="window.feedSortMode='new';window.openFeed()" style="cursor:pointer;font-size:0.7rem;margin-left:10px;color:${window.feedSortMode==='new'?'var(--link)':'var(--text-3)'}">New</span>
        <span onclick="window.feedSortMode='top';window.openFeed()" style="cursor:pointer;font-size:0.7rem;margin-left:5px;color:${window.feedSortMode==='top'?'var(--link)':'var(--text-3)'}">Top</span>`;
    const box = document.getElementById('chatBox');
    box.classList.add('feed-mode');
    onValue(ref(db, 'feed'), (snap) => {
        box.innerHTML = '';
        const data = snap.val();
        if (!data) { box.innerHTML = '<div style="text-align:center;opacity:0.5;margin-top:20px;">No posts yet</div>'; return; }
        let posts = Object.entries(data);
        posts = window.feedSortMode === 'top' ? posts.sort((a,b) => (b[1].votes||0)-(a[1].votes||0)) : posts.reverse();
        posts.forEach(([id, p]) => {
            const card = document.createElement('div');
            card.className = 'post-card';
            const commsHtml = window.renderComments(id, p.comments, 'root');
            card.innerHTML = `<div class="post-user">${p.user}</div><div class="post-content">${p.text}</div>
                <div class="post-actions">
                    <div class="action-btn" onclick="window.upvote('${id}')"><i class="fa-solid fa-arrow-up"></i> ${p.votes||0}</div>
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
                <div class="comments-section" style="${commsHtml?'':'display:none;'}">${commsHtml}</div>`;
            box.appendChild(card);
        });
    });
};

// Context menu

const showMenu = (e, msgId, text, isMe) => {
    if (e.cancelable) e.preventDefault();
    state.selectedMsgId = msgId;
    state.selectedMsgText = text;
    const menu = document.getElementById('msgMenu');
    const canTouch = isMe || state.realUser === '@admin';
    document.getElementById('editBtn').style.display = canTouch ? 'flex' : 'none';
    document.getElementById('delBtn').style.display = canTouch ? 'flex' : 'none';
    menu.style.visibility = 'hidden';
    menu.style.display = 'flex';
    const menuW = menu.offsetWidth, menuH = menu.offsetHeight;
    let x = e.clientX || (e.touches?.[0]?.clientX ?? 0);
    let y = e.clientY || (e.touches?.[0]?.clientY ?? 0);
    if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 10;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 10;
    if (x < 10) x = 10; if (y < 10) y = 10;
    menu.style.left = `${x}px`; menu.style.top = `${y}px`; menu.style.visibility = 'visible';
};

window.copyMsg = () => { navigator.clipboard.writeText(state.selectedMsgText); document.getElementById('msgMenu').style.display = 'none'; };

window.replyToSelected = () => {
    document.getElementById('msgMenu').style.display = 'none';
    const wrapper = document.getElementById('msg-' + state.selectedMsgId);
    if (!wrapper) return;
    const prevEl = wrapper.previousElementSibling;
    const user = prevEl?.querySelector('span')?.innerText || '?';
    setReply(state.selectedMsgId, user, state.selectedMsgText);
    document.getElementById('msgInput').focus();
};

document.getElementById('delBtn').onclick = async () => {
    document.getElementById('msgMenu').style.display = 'none';
    if (await showCustomModal("Delete?")) set(ref(db, `messages/${getActiveChatDbId()}/${state.selectedMsgId}`), null);
};

document.getElementById('editBtn').onclick = async () => {
    document.getElementById('msgMenu').style.display = 'none';
    const nt = await showCustomModal("Edit", true, state.selectedMsgText);
    if (nt) set(ref(db, `messages/${getActiveChatDbId()}/${state.selectedMsgId}/text`), nt.trim());
};

document.addEventListener('click', () => { document.getElementById('msgMenu').style.display = 'none'; });

// Reactions

window.setReaction = (emoji) => {
    if (!state.reactionTargetMsgId || !state.currentChatId) return;
    const userKey = state.currentUser.replace('@', '');
    const reactionRef = ref(db, `messages/${getActiveChatDbId()}/${state.reactionTargetMsgId}/reactions/${userKey}`);
    get(reactionRef).then(snap => { set(reactionRef, snap.val() === emoji ? null : emoji); });
    document.getElementById('msgMenu').style.display = 'none';
};