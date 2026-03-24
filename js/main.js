import { db, ref, set, get, onValue, serverTimestamp, state, SYSTEM_CHAT_ID, VAPID, hashPassword, saveTokenToDb, messaging, getToken, makeAvatarEl, getAvatar } from './firebase.js';
import { showCustomModal, setTyping, proceed, updateSettingsAvatar, showCallButton } from './ui.js';
import { sendMsg } from './chat.js';
import { startRecording, stopRecording, getMediaRecorder, uploadImg } from './media.js';

const updateHeaderButtonVisibility = () => {
    const sidebar = document.getElementById('sidebar');
    const chatSearch = document.getElementById('chatSearch');
    const createGroupBtn = document.getElementById('createGroupBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const menuToggle = document.getElementById('menuToggle');

    if (!sidebar || !chatSearch || !createGroupBtn || !settingsBtn || !menuToggle) {
        console.warn('One or more header elements not found for visibility update.');
        return;
    }

    const isSidebarOpen = !sidebar.classList.contains('hidden');

    // menuToggle is always visible
    menuToggle.style.display = 'flex';

    if (isSidebarOpen) {
        // Sidebar is open: show chatSearch, createGroupBtn, settingsBtn
        chatSearch.style.display = 'flex';
        createGroupBtn.style.display = 'flex';
        settingsBtn.style.display = 'flex';
    } else {
        // Sidebar is closed: hide chatSearch, createGroupBtn, settingsBtn
        chatSearch.style.display = 'none';
        createGroupBtn.style.display = 'none';
        settingsBtn.style.display = 'none';
    }
    // The 'call' button (callHeaderBtn) is dynamically added to headerActions
    // Its visibility is handled by `showCallButton` in ui.js, and it should remain visible.
};

const init = () => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) proceed(savedUser);
    else document.getElementById('userAuthOverlay').style.display = 'flex';

    // Theme
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

    // Accent
    const applyAccent = (accent) => {
        document.documentElement.setAttribute('data-accent', accent);
        document.querySelectorAll('.accent-swatch').forEach(s => s.classList.toggle('active', s.dataset.accent === accent));
    };
    applyAccent(localStorage.getItem('accent') || 'cyan');
    document.getElementById('accentPicker').addEventListener('click', (e) => {
        const swatch = e.target.closest('.accent-swatch');
        if (!swatch) return;
        localStorage.setItem('accent', swatch.dataset.accent);
        applyAccent(swatch.dataset.accent);
    });

    document.getElementById('openSystemBtn').onclick = () => window.openChat('System', null, SYSTEM_CHAT_ID);
    document.getElementById('openGeminiBtn').onclick = () => import('./ai.js').then(m => m.openGeminiFolder());
    document.getElementById('replyBarClose').onclick = () => import('./ui.js').then(m => m.clearReply());

    // Textarea
    const area = document.getElementById('msgInput');
    area.oninput = async () => {
        area.style.height = 'auto';
        area.style.height = area.scrollHeight + 'px';
        const btn = document.getElementById('sendBtn');
        const isText = area.value.trim().length > 0;

        if (isText && state.currentChatId) {
            btn.classList.add('active');
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        }

        if (isText) {
            setTyping(true);
            clearTimeout(state.typingTimeout);
            state.typingTimeout = setTimeout(() => setTyping(false), 3000);
        } else {
            setTyping(false);
        }

        const val = area.value;
        const cmd = document.getElementById('cmdSuggestions');
        cmd.innerHTML = '';

        if (val.startsWith('/')) {
            const commands = [
                { cmd: '/translate de', desc: 'Translate to German' },
                { cmd: '/translate en', desc: 'Translate to English' },
            ];
            const matches = commands.filter(c => c.cmd.startsWith(val.toLowerCase()));
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

        const atMatch = val.match(/@([a-zA-Z0-9_]*)$/);
        if (atMatch) {
            const query = atMatch[1].toLowerCase();
            const snap = await get(ref(db, 'users'));
            const users = Object.keys(snap.val() || {}).filter(u => u.toLowerCase().includes(query) && '@' + u !== state.currentUser);
            if (users.length) {
                cmd.style.display = 'block';
                users.slice(0, 5).forEach(u => {
                    const item = document.createElement('div');
                    item.className = 'suggest-item';
                    item.innerHTML = `<b>@${u}</b>`;
                    item.onclick = () => { area.value = val.replace(/@([a-zA-Z0-9_]*)$/, '@' + u + ' '); cmd.style.display = 'none'; area.focus(); };
                    cmd.appendChild(item);
                });
            } else { cmd.style.display = 'none'; }
            return;
        }

        cmd.style.display = 'none';
    };
    area.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };

    // Buttons
    document.getElementById('settingsBtn').onclick = () => {
        document.getElementById('settingsPanel').classList.toggle('hidden');
        document.getElementById('sidebar').classList.add('hidden'); // Ensure sidebar is hidden when settings panel is opened
        updateHeaderButtonVisibility(); // Update button visibility after sidebar state changes
        showCallButton(state.currentChatId); // Update call button visibility
    };

    document.getElementById('logoutBtn').onclick = () => { setTyping(false); localStorage.clear(); location.reload(); };
    document.getElementById('menuToggle').onclick = () => {
        document.getElementById('sidebar').classList.toggle('hidden');
        document.getElementById('settingsPanel').classList.add('hidden'); // Ensure settings panel is hidden when sidebar is toggled
        updateHeaderButtonVisibility(); // Update button visibility after sidebar state changes
        showCallButton(state.currentChatId); // Update call button visibility
    };
    document.getElementById('sendBtn').onclick = sendMsg;
    document.getElementById('openFeedBtn').onclick = window.openFeed;

    // Group Creation
    const createGroupModal = document.getElementById('createGroupModal');
    const groupNameInput = document.getElementById('groupNameInput');
    const groupMembersSelection = document.getElementById('groupMembersSelection');
    const groupIconInput = document.getElementById('groupIconInput');
    const groupIconPreview = document.getElementById('groupIconPreview');
    const confirmCreateGroup = document.getElementById('confirmCreateGroup');
    const cancelCreateGroup = document.getElementById('cancelCreateGroup');

    groupIconInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = groupIconPreview.querySelector('img');
                const i = groupIconPreview.querySelector('i');
                if(img) { img.src = e.target.result; img.style.display = 'block'; }
                if(i) i.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    };

    document.getElementById('createGroupBtn').onclick = async () => {
        createGroupModal.style.display = 'flex';
        groupNameInput.value = '';
        groupIconInput.value = '';
        if(groupIconPreview.querySelector('img')) groupIconPreview.querySelector('img').style.display = 'none';
        if(groupIconPreview.querySelector('i')) groupIconPreview.querySelector('i').style.display = 'block';

        groupMembersSelection.innerHTML = '<div style="padding:10px;text-align:center;opacity:0.5;">Loading users...</div>';
        const snap = await get(ref(db, 'users'));
        const users = snap.val() || {};
        groupMembersSelection.innerHTML = '';

        Object.keys(users).forEach(u => {
            if ('@' + u === state.currentUser) return;
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;align-items:center;padding:8px;gap:10px;border-bottom:1px solid var(--border);cursor:pointer;';

            const av = makeAvatarEl(null, '@' + u, 30);
            getAvatar('@' + u).then(url => { if(url) av.replaceWith(makeAvatarEl(url, '@' + u, 30)); });
            div.appendChild(av);

            const name = document.createElement('span');
            name.innerText = '@' + u;
            name.style.flex = '1';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = u;
            cb.style.width = '18px';
            cb.style.height = '18px';

            div.onclick = (e) => { if(e.target !== cb) cb.checked = !cb.checked; };

            div.appendChild(name);
            div.appendChild(cb);
            groupMembersSelection.appendChild(div);
        });
    };

    cancelCreateGroup.onclick = () => {
        createGroupModal.style.display = 'none';
    };

    confirmCreateGroup.onclick = async () => {
        const name = groupNameInput.value.trim();
        if (!name) return alert('Group name required!');

        confirmCreateGroup.disabled = true;
        confirmCreateGroup.innerText = 'Creating...';

        try {
            let iconUrl = null;
            if (groupIconInput.files[0]) {
                iconUrl = await uploadImg(groupIconInput.files[0]);
            }

            const selectedMembers = Array.from(groupMembersSelection.querySelectorAll('input:checked')).map(cb => cb.value);
            const groupId = '#' + name.replace(/#/g, '');
            const dbId = 'group_' + name.replace(/#/g, '');

            const myKey = state.currentUser.replace('@', '');
            const members = { [myKey]: true };
            selectedMembers.forEach(m => members[m] = true);

            const groupData = {
                admins: { [myKey]: true },
                members: members,
                icon: iconUrl
            };

            await set(ref(db, 'groups/' + dbId), groupData);

            await set(ref(db, `active_chats/${myKey}/${dbId}`), {
                title: groupId,
                lastMsg: 'Group created',
                lastTime: Date.now()
            });

            for (const m of selectedMembers) {
                await set(ref(db, `active_chats/${m}/${dbId}`), {
                    title: groupId,
                    lastMsg: 'Group created',
                    lastTime: Date.now()
                });
            }

            createGroupModal.style.display = 'none';
            window.openChat(groupId);
        } catch (e) {
            console.error(e);
            alert('Error creating group: ' + e.message);
        } finally {
            confirmCreateGroup.disabled = false;
            confirmCreateGroup.innerText = 'Create';
        }
    };

    // Auth
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

    // Search
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
                    item.onclick = () => { window.openChat(item.innerText); sInput.value = ''; sSuggest.style.display = 'none'; };
                    sSuggest.appendChild(item);
                }
            });
        } else {
            const myChatsSnap = await get(ref(db, `active_chats/${state.currentUser.replace('@', '')}`));
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
                        item.innerHTML = `<div style="font-size:0.8em;color:var(--link);">in ${chatTitle}</div><div style="font-weight:bold;">${m.user}:</div><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.text}</div>`;
                        item.onclick = () => { window.openChat(chatTitle, msgId); sInput.value = ''; sSuggest.style.display = 'none'; };
                        sSuggest.appendChild(item);
                    }
                });
            });
        }
    };

    // Send / Voice Button Logic
    const sendBtn = document.getElementById('sendBtn');
    let isRecording = false;

    sendBtn.onclick = () => {
        if (area.value.trim().length > 0) {
            sendMsg();
        }
    };

    sendBtn.addEventListener('mousedown', () => {
        if (area.value.trim().length === 0) {
            if ('ontouchstart' in window) return;
            startRecording();
        }
    });
    sendBtn.addEventListener('mouseup', () => {
        if (area.value.trim().length === 0) {
            if ('ontouchstart' in window) return;
            if (getMediaRecorder()) stopRecording();
        }
    });
    sendBtn.addEventListener('mouseleave', () => {
        if (area.value.trim().length === 0) {
            if ('ontouchstart' in window) return;
            if (getMediaRecorder()) stopRecording();
        }
    });
    sendBtn.addEventListener('touchstart', (e) => {
        if (area.value.trim().length === 0) {
            e.preventDefault();
            isRecording ? stopRecording() : startRecording();
            isRecording = !isRecording;
        }
    }, { passive: false });

    // Attachment Menu
    const attachBtn = document.getElementById('attachBtn');
    const attachmentMenu = document.getElementById('attachmentMenu');
    attachBtn.onclick = (e) => {
        e.stopPropagation();
        attachmentMenu.style.display = attachmentMenu.style.display === 'flex' ? 'none' : 'flex';
    };
    document.addEventListener('click', () => { attachmentMenu.style.display = 'none'; });
    attachmentMenu.onclick = (e) => e.stopPropagation();

    // Image
    document.getElementById('imgInput').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file || !state.currentChatId) return;
        const btn = e.target.parentElement;
        btn.style.opacity = '0.5';
        try {
            const { push: fbPush, ref: fbRef, set: fbSet, serverTimestamp: fbTs } = await import('./firebase.js');
            const { uploadImg: upImg } = await import('./media.js');
            const url = await upImg(file);
            fbPush(fbRef(db, 'messages/' + state.activeChatDbId), { user: state.currentUser, text: `IMG_URL:${url}`, timestamp: fbTs() });
            const myKey = state.currentUser.replace('@', '');
            fbSet(fbRef(db, `active_chats/${myKey}/${state.activeChatDbId}/lastMsg`), '🖼 Image');
            fbSet(fbRef(db, `active_chats/${myKey}/${state.activeChatDbId}/lastTime`), Date.now());
        } catch { await showCustomModal("Upload failed"); }
        finally { btn.style.opacity = '1'; e.target.value = ''; attachmentMenu.style.display = 'none'; }
    };

    // Video
    document.getElementById('videoInput').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file || !state.currentChatId) return;
        const btn = e.target.parentElement;
        btn.style.opacity = '0.5';
        try {
            const { push: fbPush, ref: fbRef, set: fbSet, serverTimestamp: fbTs } = await import('./firebase.js');
            const { uploadVideo: upVid } = await import('./media.js');
            const url = await upVid(file);
            fbPush(fbRef(db, 'messages/' + state.activeChatDbId), { user: state.currentUser, text: `VIDEO_URL:${url}`, timestamp: fbTs() });
            const myKey = state.currentUser.replace('@', '');
            fbSet(fbRef(db, `active_chats/${myKey}/${state.activeChatDbId}/lastMsg`), '🎥 Video');
            fbSet(fbRef(db, `active_chats/${myKey}/${state.activeChatDbId}/lastTime`), Date.now());
        } catch { await showCustomModal("Upload failed"); }
        finally { btn.style.opacity = '1'; e.target.value = ''; attachmentMenu.style.display = 'none'; }
    };

    // File
    document.getElementById('fileInput').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file || !state.currentChatId) return;
        const btn = e.target.parentElement;
        btn.style.opacity = '0.5';
        try {
            const { push: fbPush, ref: fbRef, set: fbSet, serverTimestamp: fbTs } = await import('./firebase.js');
            const { uploadFile: upFile } = await import('./media.js');
            const url = await upFile(file);
            fbPush(fbRef(db, 'messages/' + state.activeChatDbId), {
                user: state.currentUser,
                text: `FILE_URL:${url}|NAME:${file.name}`,
                timestamp: fbTs()
            });
            const myKey = state.currentUser.replace('@', '');
            fbSet(fbRef(db, `active_chats/${myKey}/${state.activeChatDbId}/lastMsg`), '📁 File');
            fbSet(fbRef(db, `active_chats/${myKey}/${state.activeChatDbId}/lastTime`), Date.now());
        } catch (err) {
            console.error(err);
            await showCustomModal("Upload failed");
        }
        finally { btn.style.opacity = '1'; e.target.value = ''; attachmentMenu.style.display = 'none'; }
    };

    get(ref(db, 'invites/')).then(snap => { if (!snap.exists()) set(ref(db, 'invites/'), true); });
    // Initial call to set correct button states on page load (sidebar is initially closed)
    updateHeaderButtonVisibility();
};

// Service Worker

window.addEventListener('load', () => {
    if (!('serviceWorker' in navigator)) { console.warn('SW not supported'); return; }
    navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
        .then((reg) => {
            if (state.currentUser) {
                getToken(messaging, { vapidKey: VAPID, serviceWorkerRegistration: reg })
                    .then(token => { if (token) saveTokenToDb(token); })
                    .catch(err => console.log('Token error:', err));
            }
        })
        .catch(err => console.log('SW registration failed:', err));
});

init();
