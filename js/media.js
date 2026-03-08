import { db, ref, push, set, serverTimestamp, state, getActiveChatDbId, CLOUDINARY_CLOUD, CLOUDINARY_PRESET } from './firebase.js';
import { showCustomModal } from './ui.js';

// Audio players

const audioPlayers = {};

window.toggleAudio = (pid) => {
    const el = document.getElementById(pid);
    if (!el) return;
    const url = el.dataset.url;
    const btn = el.querySelector('.tg-play-btn i');
    const bars = el.querySelectorAll('.tg-bar');
    const curEl = el.querySelector('.tg-cur');
    const durEl = el.querySelector('.tg-dur');
    const fmtTime = (s) => `${Math.floor(s / 60)}:${(Math.floor(s) % 60).toString().padStart(2, '0')}`;

    Object.entries(audioPlayers).forEach(([k, a]) => {
        if (k !== pid && !a.paused) {
            a.pause();
            const otherEl = document.getElementById(k);
            if (otherEl) {
                otherEl.querySelector('.tg-play-btn i').className = 'fa-solid fa-play';
                otherEl.querySelectorAll('.tg-bar').forEach(b => b.classList.remove('active'));
            }
        }
    });

    if (!audioPlayers[pid]) {
        const audio = new Audio(url);
        audioPlayers[pid] = audio;
        audio.onloadedmetadata = () => { durEl.innerText = fmtTime(audio.duration); };
        audio.ontimeupdate = () => {
            curEl.innerText = fmtTime(audio.currentTime);
            const progress = audio.duration ? audio.currentTime / audio.duration : 0;
            bars.forEach((b, i) => b.classList.toggle('active', i / bars.length <= progress));
        };
        audio.onended = () => {
            btn.className = 'fa-solid fa-play';
            bars.forEach(b => b.classList.remove('active'));
            curEl.innerText = '0:00';
        };
    }

    const audio = audioPlayers[pid];
    if (audio.paused) { audio.play(); btn.className = 'fa-solid fa-pause'; }
    else { audio.pause(); btn.className = 'fa-solid fa-play'; }
};

// Voice recording state

let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;

export const getMediaRecorder = () => mediaRecorder;

export const startRecording = async () => {
    if (!state.currentChatId) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.start();
        const btn = document.getElementById('voiceBtn');
        btn.classList.add('recording');
        btn.innerHTML = '<i class="fa-solid fa-stop"></i>';
        recordingSeconds = 0;
        const timerEl = document.getElementById('recordingTimer');
        timerEl.style.display = 'block';
        timerEl.innerText = '0:00';
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            const m = Math.floor(recordingSeconds / 60);
            const s = (recordingSeconds % 60).toString().padStart(2, '0');
            timerEl.innerText = `${m}:${s}`;
            if (recordingSeconds >= 120) stopRecording();
        }, 1000);
    } catch (e) {
        await showCustomModal('No microphone');
    }
};

export const stopRecording = async () => {
    if (!mediaRecorder) return;
    clearInterval(recordingTimer);
    document.getElementById('recordingTimer').style.display = 'none';
    const btn = document.getElementById('voiceBtn');
    btn.classList.remove('recording');
    btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
        mediaRecorder = null;
        btn.style.opacity = '0.5';
        try {
            const url = await uploadAudio(blob);
            const dbId = getActiveChatDbId();
            push(ref(db, 'messages/' + dbId), { user: state.currentUser, text: `AUDIO_URL:${url}`, timestamp: serverTimestamp() });
            const myKey = state.currentUser.replace('@', '');
            set(ref(db, `active_chats/${myKey}/${dbId}/lastMsg`), '🎤 Voice message');
            set(ref(db, `active_chats/${myKey}/${dbId}/lastTime`), Date.now());
        } catch (e) {
            await showCustomModal('Audio load error');
        } finally {
            btn.style.opacity = '1';
        }
    };
    mediaRecorder.stop();
};

// Uploads

export const uploadImg = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=dd65b7ceefe40d82481e19dd95070333`, { method: 'POST', body: formData });
    const data = await res.json();
    return data.data.url;
};

export const uploadAudio = async (blob) => {
    const formData = new FormData();
    formData.append('file', blob, 'voice.webm');
    formData.append('upload_preset', CLOUDINARY_PRESET);
    formData.append('resource_type', 'video');
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.secure_url) throw new Error('Cloudinary upload failed');
    return data.secure_url;
};

// Translate

export const translateText = async (pair, text) => {
    try {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`);
        const data = await res.json();
        return data.responseData.translatedText;
    } catch { return text; }
};
