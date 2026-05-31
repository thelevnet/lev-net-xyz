(function () {
    const cards   = Array.from(document.querySelectorAll('.proj-card'));
    const btnPrev = document.getElementById('proj-prev');
    const btnNext = document.getElementById('proj-next');
    const counter = document.getElementById('proj-counter');
    if (!cards.length) return;
    const total = cards.length;
    let current = 0;

    function show(index) {
        cards.forEach(c => c.classList.remove('active'));
        cards[index].classList.add('active');
        if (counter) counter.textContent = `${index + 1} / ${total}`;
    }

    btnNext.addEventListener('click', () => { current = (current + 1) % total; show(current); });
    btnPrev.addEventListener('click', () => { current = (current - 1 + total) % total; show(current); });

    let touchStartX = 0;
    const container = document.querySelector('.projects-container');
    container.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    container.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 40) dx < 0 ? btnNext.click() : btnPrev.click();
    }, { passive: true });

    document.addEventListener('keydown', e => {
        const rect = document.getElementById('s-downloads').getBoundingClientRect();
        if (rect.top > -window.innerHeight * 0.5 && rect.top < window.innerHeight * 0.5) {
            if (e.key === 'ArrowRight') btnNext.click();
            if (e.key === 'ArrowLeft')  btnPrev.click();
        }
    });

    show(0);
})();
console.log("Hello, why are you reading my Console... It's MY Console.");
(function () {
    const burger = document.querySelector('.hdr-burger');
    const overlay = document.createElement('div');
    overlay.id = 'nav-overlay';
    overlay.innerHTML = `
        <nav class="nav-menu">
            <a href="../">Home</a>
            <a href="../chat/">Chat</a>
            <a href="../ai/">AI</a>
        </nav>
    `;
    document.body.appendChild(overlay);

    burger.addEventListener('click', () => {
        overlay.classList.toggle('open');
        burger.classList.toggle('active');
    });

    overlay.addEventListener('click', e => {
        if (e.target === overlay) {
            overlay.classList.remove('open');
            burger.classList.remove('active');
        }
    });

    overlay.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
            overlay.classList.remove('open');
            burger.classList.remove('active');
        });
    });
})();