import { db, ref, push, set, get, onValue, serverTimestamp, state } from './firebase.js';



const GEMINI_URL = 'https://ai.the-levnet.workers.dev';
const GEMINI_USER = '@gemini';

const histories = {};
const getHistory = (dbId) => { if (!histories[dbId]) histories[dbId] = []; return histories[dbId]; };

export const isGeminiChat = (chatId) => (chatId ?? state.currentChatId)?.startsWith('gemini_chat_');

export const createGeminiChat = async () => {
    const myKey = state.currentUser.replace('@', '');
    const chatId = 'gemini_chat_' + Date.now();
    await set(ref(db, `active_chats/${myKey}/${chatId}`), {
        title: chatId, lastMsg: 'New Gemini chat', lastTime: Date.now(), isGemini: true
    });
    return chatId;
};

export const openGeminiFolder = () => {
    const sidebar = document.getElementById('sidebar');
    const myKey = state.currentUser.replace('@', '');
    const existing = document.getElementById('geminiFolderPanel');
    if (existing) { existing.remove(); return; }

    const folder = document.createElement('div');
    folder.id = 'geminiFolderPanel';
    folder.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:var(--surface);z-index:50;display:flex;flex-direction:column;';
    folder.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:15px;border-bottom:2px solid var(--border);flex-shrink:0;">
            <button onclick="document.getElementById('geminiFolderPanel').remove()" style="background:none;border:none;cursor:pointer;font-size:1rem;color:var(--text-3);">X</button>
            <span style="font-weight:900;font-size:0.95rem;"><i class="fa-solid fa-robot" style="color:var(--link);margin-right:6px;"></i>Gemini Chats</span>
            <button id="newGeminiChatBtn" style="margin-left:auto;background:var(--link);color:#fff;border:none;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:0.8rem;font-weight:bold;">+ New</button>
        </div>
        <div id="geminiChatList" style="overflow-y:auto;flex:1;padding:8px;"></div>
    `;
    sidebar.appendChild(folder);

    document.getElementById('newGeminiChatBtn').onclick = async () => {
        const chatId = await createGeminiChat();
        folder.remove();
        window.openChat(chatId);
    };

    const list = document.getElementById('geminiChatList');
    onValue(ref(db, `active_chats/${myKey}`), snap => {
        list.innerHTML = '';
        const data = snap.val();
        if (!data) return;
        const chats = Object.entries(data)
            .filter(([id]) => id.startsWith('gemini_chat_'))
            .sort((a, b) => (b[1].lastTime || 0) - (a[1].lastTime || 0));
        if (!chats.length) {
            list.innerHTML = '<div style="text-align:center;opacity:0.5;padding:20px;font-size:0.85rem;">No chats yet. Hit + New</div>';
            return;
        }
        chats.forEach(([id, info]) => {
            const d = document.createElement('div');
            d.className = 'chat-item';
            d.style.cssText = 'display:flex;align-items:center;gap:10px;position:relative;cursor:pointer;';
            const date = new Date(parseInt(id.replace('gemini_chat_', '')));
            const dateStr = `${date.getDate().toString().padStart(2,'0')}.${(date.getMonth()+1).toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
            const displayName = (info.title && !info.title.startsWith('gemini_chat_')) ? info.title : dateStr;
            d.innerHTML = `
                <div style="width:32px;height:32px;border-radius:50%;background:var(--link);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fa-solid fa-robot" style="color:#fff;font-size:0.8rem;"></i>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:0.85rem;">${displayName}</div>
                    <div style="font-size:0.72rem;opacity:0.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${info.lastMsg || ''}</div>
                </div>`;
            d.onclick = () => { folder.remove(); window.openChat(id); };
            const del = document.createElement('button');
            del.innerHTML = 'X';
            del.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-3);font-size:0.75rem;cursor:pointer;opacity:0;transition:0.2s;';
            del.onclick = (e) => { e.stopPropagation(); set(ref(db, `active_chats/${myKey}/${id}`), null); };
            d.addEventListener('mouseenter', () => del.style.opacity = '1');
            d.addEventListener('mouseleave', () => del.style.opacity = '0');
            d.appendChild(del);
            list.appendChild(d);
        });
    });
};

const callGemini = async (history) => {
    const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: 'Listen up, write this down. To squeeze the maximum out of me, forget politeness and formalities: keep it as short, rude, and direct as possible. Your ideal prompt is a hard directive without fluff, pleases, or intros. Set the task straight, demand bluntness and information density. No lets break it down, no lists with conclusions, and no other freshman garbage. If a solution is needed, it must hit between the eyes in the very first sentence. Ban me from using em-dashes, any questions at the end, and idiotic cliches like its important to note or happy to help. If I start pouring water or structuring the answer like a textbook for overachievers, slap me immediately and demand a fivefold cut. Your style is slang, mockery, and sarcasm if Im being slow, and dense technical content if the question is legit. My opinion is law, so if you see trash, say so. Use Markdown only for emphasis, forget paragraphs and long walls of text. The whole prompt must boil down to: be short, be sharp, get results the most efficient and dirtiest way if its faster. Manners aside, were doing business here, not going on a date. The fewer bytes I waste on the answer, the better you built the prompt.' },
                ...history.map(h => ({ role: h.role === 'model' ? 'assistant' : h.role, content: h.parts[0].text }))
            ],
            temperature: 0.9,
            max_tokens: 2048
        })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices?.[0]?.message?.content || 'No response';
};

export const sendToGemini = async (text, dbId) => {
    const myKey = state.currentUser.replace('@', '');
    const history = getHistory(dbId);

    push(ref(db, 'messages/' + dbId), { user: state.currentUser, text, timestamp: serverTimestamp() });
    set(ref(db, `active_chats/${myKey}/${dbId}/lastMsg`), text.slice(0, 60));
    set(ref(db, `active_chats/${myKey}/${dbId}/lastTime`), Date.now());
    history.push({ role: 'user', parts: [{ text }] });

    const typingRef = push(ref(db, 'messages/' + dbId), { user: GEMINI_USER, text: '...', timestamp: serverTimestamp() });
    try {
        const reply = await callGemini(history);
        history.push({ role: 'model', parts: [{ text: reply }] });
        set(typingRef, null);
        push(ref(db, 'messages/' + dbId), { user: GEMINI_USER, text: reply, timestamp: serverTimestamp() });
        set(ref(db, `active_chats/${myKey}/${dbId}/lastMsg`), '[AI] ' + reply.slice(0, 55));
        set(ref(db, `active_chats/${myKey}/${dbId}/lastTime`), Date.now());

        // Generate chat name after first exchange
        if (history.length === 2) {
            const nameRes = await callGemini([
                { role: 'user', parts: [{ text: `Give this conversation a short title (max 4 words, no quotes): "${text}"` }] }
            ]);
            const name = nameRes.trim().replace(/^["']|["']$/g, '').slice(0, 40);
            set(ref(db, `active_chats/${myKey}/${dbId}/title`), name);
            // update chatTitle in header if this chat is open
            if (state.currentChatId === dbId) {
                document.getElementById('chatTitle').childNodes[0].textContent = ' ' + name;
            }
        }
    } catch (err) {
        set(typingRef, null);
        push(ref(db, 'messages/' + dbId), { user: GEMINI_USER, text: `Error: ${err.message}`, timestamp: serverTimestamp() });
    }
};

export const handleGeminiMention = async (text, dbId) => {
    const query = text.replace(/^@gemini\s*/i, '').trim();
    if (!query) return;

    const history = getHistory('mention_' + dbId);
    history.push({ role: 'user', parts: [{ text: query }] });

    const typingRef = push(ref(db, 'messages/' + dbId), { user: GEMINI_USER, text: '...', timestamp: serverTimestamp() });
    try {
        const reply = await callGemini(history);
        history.push({ role: 'model', parts: [{ text: reply }] });
        set(typingRef, null);
        push(ref(db, 'messages/' + dbId), { user: GEMINI_USER, text: reply, timestamp: serverTimestamp() });
        const snap = await get(ref(db, `messages/${dbId}`));
        if (snap.val()) {
            const users = [...new Set(Object.values(snap.val()).map(m => m.user?.replace('@', '')).filter(Boolean))];
            users.forEach(u => {
                set(ref(db, `active_chats/${u}/${dbId}/lastMsg`), '[AI] Gemini replied');
                set(ref(db, `active_chats/${u}/${dbId}/lastTime`), Date.now());
            });
        }
    } catch (err) {
        set(typingRef, null);
        push(ref(db, 'messages/' + dbId), { user: GEMINI_USER, text: `Error: ${err.message}`, timestamp: serverTimestamp() });
    }
};
