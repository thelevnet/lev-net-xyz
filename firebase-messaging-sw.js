importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyACwWS7Q03oipjC4issm3WIy8k_OkSiUiM",
    projectId: "levnetxyz",
    messagingSenderId: "223875022110",
    appId: "1:223875022110:web:8b4282b3ce3f19020cdd0f"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('Background message:', payload);
});