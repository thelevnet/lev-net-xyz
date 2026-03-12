import { db, ref, push, set, get, onValue, remove, serverTimestamp, state } from './firebase.js';
import { showCustomModal } from './ui.js';

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const buildCallId = (a, b) => [a, b].sort().join('_').replace(/@/g, '');

let pc = null;
let localStream = null;
let callActiveId = null;
let callRole = null;
let listeners = [];
let timerInterval = null;
let callSeconds = 0;
let pendingCallId = null;
let pendingCaller = null;
let ringTimeout = null;

export function injectCallUI() {
    if (document.getElementById('callOverlay')) return;

    document.body.insertAdjacentHTML('beforeend', `
        <div id="callOverlay" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.88);backdrop-filter:blur(10px);flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#fff;font-family:var(--font-main);">
            <div id="callAvatarEl" style="width:80px;height:80px;border-radius:50%;background:var(--secondary);display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:900;border:3px solid rgba(255,255,255,0.2);"></div>
            <div id="callTargetEl" style="font-size:1.3rem;font-weight:900;"></div>
            <div id="callStatusEl" style="font-size:0.85rem;opacity:0.6;"></div>
            <div id="callTimerEl" style="font-size:1.1rem;font-weight:bold;display:none;font-variant-numeric:tabular-nums;"></div>
            <audio id="remoteAudio" autoplay></audio>
            <video id="remoteVideo" autoplay playsinline style="display:none;width:100%;height:100%;object-fit:cover;position:absolute;inset:0;z-index:-1;transform:scaleX(-1);"></video>
            <video id="localVideo" autoplay playsinline muted style="display:none;width:130px;height:73px;border-radius:10px;object-fit:cover;position:absolute;top:20px;right:20px;border:2px solid rgba(255,255,255,0.2);transform:scaleX(-1);"></video>
            <div id="callControls" style="display:flex;gap:14px;align-items:center;transition:transform 0.3s ease;">
                <button id="callMuteBtn" onclick="window.callToggleMute()" style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;cursor:pointer;color:#fff;font-size:1rem;"><i class="fa-solid fa-microphone"></i></button>
                <button onclick="window.callEnd()" style="width:62px;height:62px;border-radius:50%;background:#e53935;border:none;cursor:pointer;color:#fff;font-size:1.3rem;"><i class="fa-solid fa-phone-slash"></i></button>
                <button id="callVideoBtn" onclick="window.callToggleVideo()" style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;cursor:pointer;color:#fff;font-size:1rem;"><i class="fa-solid fa-video-slash"></i></button>
            </div>
        </div>
        <div id="incomingCallNotif" style="display:none;position:fixed;bottom:20px;right:20px;z-index:99998;background:var(--surface);border:2px solid var(--border);border-radius:16px;padding:16px 18px;width:255px;box-shadow:0 8px 32px rgba(0,0,0,0.3);flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
                <div id="incomingAvatarEl" style="width:40px;height:40px;border-radius:50%;background:var(--secondary);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.1rem;flex-shrink:0;"></div>
                <div>
                    <div style="font-weight:900;font-size:0.9rem;" id="incomingCallerEl"></div>
                    <div style="font-size:0.73rem;opacity:0.6;">Incoming call...</div>
                </div>
            </div>
            <div style="display:flex;gap:8px;">
                <button onclick="window.callAccept()" style="flex:1;padding:8px;border-radius:10px;background:#43a047;border:none;cursor:pointer;color:#fff;font-weight:bold;font-size:0.83rem;"><i class="fa-solid fa-phone"></i> Answer</button>
                <button onclick="window.callReject()" style="flex:1;padding:8px;border-radius:10px;background:#e53935;border:none;cursor:pointer;color:#fff;font-weight:bold;font-size:0.83rem;"><i class="fa-solid fa-phone-slash"></i> Decline</button>
            </div>
        </div>
    `);

    onValue(ref(db, 'calls'), snap => {
        const me = state.currentUser;
        if (!me) return;
        const data = snap.val();
        if (!data) return;
        Object.entries(data).forEach(([cid, call]) => {
            if (call.callee === me && call.status === 'calling' && !pc && pendingCallId !== cid) {
                pendingCallId = cid;
                pendingCaller = call.caller;
                document.getElementById('incomingCallerEl').innerText = call.caller;
                document.getElementById('incomingAvatarEl').innerText = (call.caller[1] || call.caller[0] || '?').toUpperCase();
                document.getElementById('incomingCallNotif').style.display = 'flex';
                clearTimeout(ringTimeout);
                ringTimeout = setTimeout(() => window.callReject(), 30000);
            }
        });
    });
}

const showOverlay = (target, status) => {
    document.getElementById('callTargetEl').innerText = target;
    document.getElementById('callStatusEl').innerText = status;
    document.getElementById('callAvatarEl').innerText = (target[1] || target[0] || '?').toUpperCase();
    document.getElementById('callOverlay').style.display = 'flex';
};

const startTimer = () => {
    callSeconds = 0;
    const el = document.getElementById('callTimerEl');
    el.style.display = 'block';
    timerInterval = setInterval(() => {
        callSeconds++;
        el.innerText = `${Math.floor(callSeconds/60)}:${(callSeconds%60).toString().padStart(2,'0')}`;
    }, 1000);
};

const cleanup = () => {
    listeners.forEach(u => u());
    listeners = [];
    if (pc) { pc.close(); pc = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    callActiveId = callRole = pendingCallId = pendingCaller = null;
    clearInterval(timerInterval);
    const te = document.getElementById('callTimerEl');
    if (te) { te.style.display = 'none'; te.innerText = ''; }
    document.getElementById('callOverlay').style.display = 'none';
    document.getElementById('callOverlay').style.background = 'rgba(0,0,0,0.88)';
    document.getElementById('callControls').style.transform = 'translateY(0)';
    document.getElementById('remoteVideo').style.display = 'none';
    document.getElementById('localVideo').style.display = 'none';
    document.getElementById('incomingCallNotif').style.display = 'none';
};

const setupPC = () => {
    pc = new RTCPeerConnection(ICE);
    const remoteStream = new MediaStream();
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.ontrack = e => {
        e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
        document.getElementById('remoteAudio').srcObject = remoteStream;
        if (e.track.kind === 'video') {
            const v = document.getElementById('remoteVideo');
            v.srcObject = remoteStream;
            v.style.display = 'block';
            document.getElementById('callOverlay').style.background = 'black';
            document.getElementById('callControls').style.transform = 'translateY(100px)';
        }
    };
    pc.onconnectionstatechange = () => {
        const s = pc?.connectionState;
        if (s === 'connected') { document.getElementById('callStatusEl').innerText = ''; startTimer(); }
        else if (s === 'disconnected' || s === 'failed') window.callEnd();
    };
    const myNode = callRole === 'caller' ? 'callerCandidates' : 'calleeCandidates';
    pc.onicecandidate = e => { if (e.candidate) push(ref(db, `calls/${callActiveId}/${myNode}`), e.candidate.toJSON()); };
};

const listenICE = (node) => {
    const u = onValue(ref(db, `calls/${callActiveId}/${node}`), snap => {
        if (!snap.val() || !pc) return;
        Object.values(snap.val()).forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
    });
    listeners.push(u);
};

window.callStart = async (target) => {
    if (pc) return;
    callRole = 'caller';
    callActiveId = buildCallId(state.currentUser, target);
    try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
    catch { return showCustomModal('Microphone access denied'); }
    setupPC();
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    await set(ref(db, `calls/${callActiveId}`), { caller: state.currentUser, callee: target, offer: { type: offer.type, sdp: offer.sdp }, status: 'calling', timestamp: serverTimestamp() });
    listeners.push(onValue(ref(db, `calls/${callActiveId}/answer`), async snap => {
        if (!snap.val() || pc.signalingState === 'stable') return;
        await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
    }));
    listeners.push(onValue(ref(db, `calls/${callActiveId}/status`), snap => {
        if (snap.val() === 'rejected' || snap.val() === 'ended') cleanup();
    }));
    listenICE('calleeCandidates');
    showOverlay(target, 'Calling...');
};

window.callAccept = async () => {
    clearTimeout(ringTimeout);
    document.getElementById('incomingCallNotif').style.display = 'none';
    if (!pendingCallId) return;
    callActiveId = pendingCallId;
    const callerName = pendingCaller;
    callRole = 'callee';
    const snap = await get(ref(db, `calls/${callActiveId}/offer`));
    if (!snap.val()) return;
    try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
    catch { return showCustomModal('Microphone access denied'); }
    setupPC();
    await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await set(ref(db, `calls/${callActiveId}/answer`), { type: answer.type, sdp: answer.sdp });
    await set(ref(db, `calls/${callActiveId}/status`), 'active');
    listeners.push(onValue(ref(db, `calls/${callActiveId}/status`), snap => { if (snap.val() === 'ended') cleanup(); }));
    listenICE('callerCandidates');
    showOverlay(callerName, 'Connecting...');
};

window.callReject = async () => {
    clearTimeout(ringTimeout);
    document.getElementById('incomingCallNotif').style.display = 'none';
    if (!pendingCallId) return;
    await set(ref(db, `calls/${pendingCallId}/status`), 'rejected');
    setTimeout(() => remove(ref(db, `calls/${pendingCallId}`)), 3000);
    pendingCallId = pendingCaller = null;
};

window.callEnd = async () => {
    if (callActiveId) {
        await set(ref(db, `calls/${callActiveId}/status`), 'ended');
        setTimeout(() => remove(ref(db, `calls/${callActiveId}`)), 3000);
    }
    cleanup();
};

window.callToggleMute = () => {
    if (!localStream) return;
    const t = localStream.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    document.querySelector('#callMuteBtn i').className = t.enabled ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash';
};

window.callToggleVideo = async () => {
    if (!pc || !localStream) return;
    const vt = localStream.getVideoTracks()[0];
    if (vt) {
        vt.stop();
        localStream.removeTrack(vt);
        pc.getSenders().forEach(s => { if (s.track?.kind === 'video') pc.removeTrack(s); });
        document.getElementById('localVideo').style.display = 'none';
        document.querySelector('#callVideoBtn i').className = 'fa-solid fa-video-slash';
        if (document.getElementById('remoteVideo').style.display !== 'block') {
            document.getElementById('callControls').style.transform = 'translateY(0)';
        }
    } else {
        try {
            const vs = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
            const nvt = vs.getVideoTracks()[0];
            localStream.addTrack(nvt);
            pc.addTrack(nvt, localStream);
            const lv = document.getElementById('localVideo');
            lv.srcObject = localStream;
            lv.style.display = 'block';
            document.querySelector('#callVideoBtn i').className = 'fa-solid fa-video';
            document.getElementById('callControls').style.transform = 'translateY(100px)';
        } catch {}
    }
};
