import { db, state, hashPassword } from './firebase.js';
import { ref, set, get, onValue, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";


// Функция для запроса к OpenRouter AI
async function askOpenRouter(userText) {
  const apiKey = "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";
  const modelName = "openai/gpt-oss-120b:free";

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Рекомендуемые OpenRouter заголовки для корректной аналитики:
        "HTTP-Referer": window.location.href,
        "X-Title": "Claude Web App Prototyping"
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: "system",
            content: "Ты — ИИ-ассистент по имени Claude. Отвечай развернуто, грамотно и помогай пользователю во всем."
          },
          {
            role: "user",
            content: userText
          }
        ]
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Ошибка сервера: ${response.status}`);
    }

    const data = await response.json();
    // Извлекаем текст ответа нейросети
    return data.choices[0].message.content;

  } catch (error) {
    console.error("OpenRouter Error:", error);
    return `Ошибка при генерации ответа: ${error.message}`;
  }
}
// ---- SCREEN ROUTER ----
const allScreens = ['s-login','s-sidebar','s-chat','s-settings','s-profile'];
export function show(id) {
  allScreens.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.remove('active');
  });
  const t = document.getElementById(id);
  if (t) t.classList.add('active');
}

// ---- CLOCK ----
function tick() {
  const n = new Date();
  const t = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  document.querySelectorAll('.time').forEach(el => el.textContent = t);
}
tick(); setInterval(tick, 15000);

// ---- AUTH ----
async function doRegister() {
  const u = document.getElementById('reg-username').value.trim().toLowerCase();
  const p = document.getElementById('reg-password').value;
  const err = document.getElementById('reg-error');
  err.textContent = '';
  if (!u || !p) { err.textContent = 'Fill all fields'; return; }
  if (u.length < 3) { err.textContent = 'Username min 3 chars'; return; }
  if (p.length < 4) { err.textContent = 'Password min 4 chars'; return; }

  const snap = await get(ref(db, `users/${u}`));
  if (snap.exists()) { err.textContent = 'Username taken'; return; }

  const hash = await hashPassword(p);
  await set(ref(db, `users/${u}`), { username: u, passwordHash: hash, createdAt: Date.now() });
  loginAs(u);
}

async function doLogin() {
  const u = document.getElementById('login-username').value.trim().toLowerCase();
  const p = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  err.textContent = '';
  if (!u || !p) { err.textContent = 'Fill all fields'; return; }

  const snap = await get(ref(db, `users/${u}`));
  if (!snap.exists()) { err.textContent = 'User not found'; return; }

  const hash = await hashPassword(p);
  if (snap.val().passwordHash !== hash) { err.textContent = 'Wrong password'; return; }
  loginAs(u);
}

function loginAs(u) {
  state.currentUser = '@' + u;
  localStorage.setItem('claude_user', u);
  document.querySelectorAll('.username-display').forEach(el => el.textContent = '@' + u);
  document.querySelectorAll('.avatar-letter').forEach(el => el.textContent = u[0].toUpperCase());
  document.getElementById('pf-username').value = u;
  loadRecentChats();
  show('s-sidebar');
}

function tryAutoLogin() {
  const saved = localStorage.getItem('claude_user');
  if (saved) loginAs(saved);
  else show('s-login');
}

// ---- RECENT CHATS ----
function loadRecentChats() {
  // static for now, can hook to firebase later
  const items = [
    'Importing files from a path in C++',
    'Расшифровка DTMF кода',
    'Неловкий момент в ванной',
    'Viber emoji replacement complaint',
    'Перевод японской песни на слух',
    'Плейлист из 200 видео Bad Apple',
    'Первый контакт с ИИ в Telegram',
  ];
  const list = document.getElementById('recent-list');
  list.innerHTML = '';
  items.forEach(txt => {
    const d = document.createElement('div');
    d.className = 'sn-recent';
    d.textContent = txt;
    d.onclick = () => show('s-chat');
    list.appendChild(d);
  });
}

// ---- CHAT ----
async function sendMessage() {
  const box = document.getElementById('chat-input');
  const text = box.textContent.trim();
  if (!text) return;

  const body = document.getElementById('chat-body');
  const empty = document.getElementById('chat-empty');
  const note = document.getElementById('ai-note');

  // Прячем пустой экран, если он есть
  if (empty) empty.style.display = 'none';

  // 1. Добавляем сообщение пользователя на экран
  const um = document.createElement('div');
  um.className = 'msg-user';
  um.textContent = text;
  body.appendChild(um);
  box.textContent = '';
  body.scrollTop = body.scrollHeight;

  // 2. Создаем элемент-заглушку "Печатает...", пока ждем ответ
  const aiMessageEl = document.createElement('div');
  aiMessageEl.className = 'msg-ai';
  aiMessageEl.innerHTML = `<span style="color: var(--text2); font-style: italic;">Claude думает...</span>`;
  body.appendChild(aiMessageEl);
  body.scrollTop = body.scrollHeight;

  // 3. Делаем реальный запрос к ИИ
  const aiResponseText = await askOpenRouter(text);

  // 4. Заменяем текст "Думает..." на реальный ответ от ИИ с кнопками действий
  // Используем прерывания строк для сохранения форматирования (или можно подключить markdown-микробиблиотеку)
  aiMessageEl.innerHTML = `${aiResponseText.replace(/\n/g, '<br>')}
    <div class="msg-meta">
      ${ico('copy')}${ico('share')}${ico('play')}${ico('like')}${ico('dislike')}${ico('retry')}
    </div>`;

  if (note) note.style.display = 'flex';
  body.scrollTop = body.scrollHeight;
}

function ico(name) {
  const icons = {
    copy: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
    share: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
    play: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    like: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>',
    dislike: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>',
    retry: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>',
  };
  return icons[name] || '';
}

// ---- LOGOUT ----
function logout() {
  localStorage.removeItem('claude_user');
  state.currentUser = null;
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').textContent = '';
  show('s-login');
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  // login/register tabs
  document.getElementById('tab-login').onclick = () => setTab('login');
  document.getElementById('tab-register').onclick = () => setTab('register');
  document.getElementById('btn-login').onclick = doLogin;
  document.getElementById('btn-register').onclick = doRegister;

  // enter key
  ['login-password','reg-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') id.includes('login') ? doLogin() : doRegister();
    });
  });

  // sidebar nav
  document.getElementById('sn-newchat').onclick = () => show('s-chat');
  document.getElementById('sn-chats').onclick = () => show('s-chat');
  document.querySelectorAll('.go-settings').forEach(el => el.onclick = () => show('s-settings'));

  // chat
  document.querySelectorAll('.go-sidebar').forEach(el => el.onclick = () => show('s-sidebar'));
  document.getElementById('btn-send').onclick = sendMessage;
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // settings
  document.getElementById('go-profile').onclick = () => show('s-profile');
  document.getElementById('btn-logout').onclick = logout;
  document.querySelector('.toggle-sw')?.addEventListener('click', function() {
    this.classList.toggle('off');
  });

  // profile back
  document.getElementById('back-profile').onclick = () => show('s-settings');
  document.getElementById('btn-save-prefs').onclick = () => {
    // could push to firebase
    show('s-settings');
  };

  tryAutoLogin();
});

function setTab(t) {
  document.getElementById('pane-login').style.display = t === 'login' ? 'flex' : 'none';
  document.getElementById('pane-register').style.display = t === 'register' ? 'flex' : 'none';
  document.getElementById('tab-login').style.color = t === 'login' ? 'var(--text)' : 'var(--text2)';
  document.getElementById('tab-register').style.color = t === 'register' ? 'var(--text)' : 'var(--text2)';
  document.getElementById('tab-line').style.transform = t === 'login' ? 'translateX(0)' : 'translateX(100%)';
}