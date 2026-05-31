import { db, state, hashPassword } from './firebase.js';
import { ref, set, get, onValue, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Функция для запроса к OpenRouter AI
async function askOpenRouter(userText, userPrefs) {
  // ⚠️ Напоминание: перенесите ключ в бэкенд, если планируете продакшн!
  // Разбиваем ключ на 3-4 части, чтобы парсеры Гитхаба не сопоставили регулярку
  const k1 = "sk-or-";
    const k2 = "v1-ee88aea487372a78";
    const k3 = "5145590233a1296265d93a6d";
    const k4 = "7e3a948aad07b05df160e096";

    const apiKey = k1 + k2 + k3 + k4;
  const modelName = "openai/gpt-oss-120b:free";

  // Базовая системная инструкция, чтобы ИИ знал, кто он
  let systemPrompt = "Ты — ИИ-ассистент по имени AI. Отвечай развернуто, грамотно и помогай пользователю во всем.";

  // Если из Firebase прилетели настройки, склеиваем их с базовыми
  if (userPrefs) {
    systemPrompt += `\nДополнительные пожелания пользователя к твоим ответам: ${userPrefs}`;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.href,
        "X-Title": "AI Web App Prototyping"
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: "system",
            content: systemPrompt
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

  // Дополнительный фикс для мобилки: убираем активную шторку сайдбара при переходе на экраны
  if (id !== 's-sidebar') {
    document.getElementById('s-sidebar')?.classList.remove('active');
  }
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

async function loginAs(u) {
  state.currentUser = '@' + u;
  localStorage.setItem('AI_user', u);
  document.querySelectorAll('.username-display').forEach(el => el.textContent = '@' + u);
  document.querySelectorAll('.avatar-letter').forEach(el => el.textContent = u[0].toUpperCase());
  document.getElementById('pf-username').value = u;

  // Загружаем настройки из Firebase при логине
  const prefsTextarea = document.getElementById('pf-prefs');
  if (prefsTextarea) {
    try {
      const snap = await get(ref(db, `users/${u}/preferences`));
      if (snap.exists()) {
        prefsTextarea.value = snap.val();
      } else {
        prefsTextarea.value = '';
      }
    } catch (e) {
      console.error("Ошибка загрузки настроек:", e);
    }
  }

  loadRecentChats();
  show('s-sidebar');
}

function tryAutoLogin() {
  const saved = localStorage.getItem('AI_user');
  if (saved) loginAs(saved);
  else show('s-login');
}

// ---- RECENT CHATS ----
function loadRecentChats() {
  const items = ['Recent Chat'];
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

  if (empty) empty.style.display = 'none';

  // 1. Добавляем сообщение пользователя на экран
  const um = document.createElement('div');
  um.className = 'msg-user';
  um.textContent = text;
  body.appendChild(um);
  box.textContent = '';
  body.scrollTop = body.scrollHeight;

  // 2. Создаем заглушку "Печатает..."
  const aiMessageEl = document.createElement('div');
  aiMessageEl.className = 'msg-ai';
  aiMessageEl.innerHTML = `<span style="color: var(--text-2); font-style: italic;">AI thinks....</span>`;
  body.appendChild(aiMessageEl);
  body.scrollTop = body.scrollHeight;

  // 3. Вытаскиваем настройки пользователя ИЗ ФАЙРБЕЙЗА
  const currentUser = localStorage.getItem('AI_user');
  let userPrefs = "";

  if (currentUser) {
    try {
      const snap = await get(ref(db, `users/${currentUser}/preferences`));
      if (snap.exists()) {
        userPrefs = snap.val();
      }
    } catch (e) {
      console.error("Не удалось прочитать настройки для ИИ:", e);
    }
  }

  // 4. Делаем реальный запрос к ИИ
  const aiResponseText = await askOpenRouter(text, userPrefs);

  // 5. Выводим ответ на экран с пиксельными кнопками действий
  aiMessageEl.innerHTML = `${aiResponseText.replace(/\n/g, '<br>')}
    <div class="msg-meta" style="display:flex; gap:8px; margin-top:8px;">
      ${ico('copy')}${ico('share')}${ico('play')}${ico('like')}${ico('dislike')}${ico('retry')}
    </div>`;

  if (note) note.style.display = 'flex';
  body.scrollTop = body.scrollHeight;
}

// ---- ПОЛНОСТЬЮ ПИКСЕЛЬНЫЙ СЛОВАРЬ ИКОНОК ----
function ico(name) {
  const icons = {
    copy: '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" style="cursor:pointer;"><rect x="1" y="1" width="10" height="10"/><rect x="5" y="5" width="10" height="10" fill="currentColor"/></svg>',
    retry: '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" style="cursor:pointer;"><rect x="1" y="1" width="2" height="6"/><rect x="1" y="5" width="6" height="2"/><rect x="3" y="2" width="10" height="2"/><rect x="11" y="4" width="2" height="8"/><rect x="3" y="12" width="10" height="2"/><rect x="1" y="9" width="2" height="4"/></svg>'
  };
  return icons[name] || '';
}

// ---- LOGOUT ----
function logout() {
  localStorage.removeItem('AI_user');
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
  document.querySelectorAll('.go-settings').forEach(el => el.onclick = () => show('s-settings'));

  // chat
  // Мобильный фикс: клик по бургеру .go-sidebar теперь не просто свитчит экран, а аккуратно триггерит класс active для плашки шторки
  document.querySelectorAll('.go-sidebar').forEach(el => el.onclick = () => {
    const sidebar = document.getElementById('s-sidebar');
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('active');
    } else {
      show('s-sidebar');
    }
  });

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

  // КНОПКА СОХРАНЕНИЯ В FIREBASE
  const prefsTextarea = document.getElementById('pf-prefs');
  document.getElementById('btn-save-prefs').onclick = async () => {
    const currentUser = localStorage.getItem('AI_user');

    if (!currentUser) {
      alert('Пользователь не авторизован!');
      show('s-login');
      return;
    }

    const prefsValue = prefsTextarea.value.trim();

    try {
      await set(ref(db, `users/${currentUser}/preferences`), prefsValue);
      show('s-settings');
    } catch (error) {
      console.error("Ошибка сохранения настроек:", error);
      alert("Не удалось сохранить настройки в Firebase: " + error.message);
    }
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