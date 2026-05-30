(function () {
    const track   = document.getElementById('projects-track');
    const btnPrev = document.getElementById('proj-prev');
    const btnNext = document.getElementById('proj-next');
    const counter = document.getElementById('proj-counter');
    if (!track) return;

    const origCards = Array.from(track.children);
    const total     = origCards.length;

    // клонируем по одному с каждой стороны
    origCards.forEach(c => track.appendChild(c.cloneNode(true)));
    const prependClones = origCards.map(c => c.cloneNode(true)).reverse();
    prependClones.forEach(c => track.prepend(c));
    // теперь: [клоны конца | оригиналы | клоны начала]
    // индекс первого оригинала = total

    let current  = total; // стартуем на первом оригинале
    let animating = false;

    function getOffset() {
        const wrapper = track.parentElement;
        const w       = wrapper.offsetWidth;
        const cardW   = w * 0.6666;
        const gap     = parseFloat(getComputedStyle(track).gap) || 24;
        // центрируем: сдвиг = текущий индекс * (ширина + gap) - (w - cardW) / 2
        return current * (cardW + gap) - (w - cardW) / 2;
    }

    function goTo(index, animate) {
        current = index;
        track.style.transition = animate
            ? 'transform 0.45s cubic-bezier(0.4,0,0.2,1)'
            : 'none';
        track.style.transform = `translateX(-${getOffset()}px)`;
        const realIndex = ((current - total) % total + total) % total;
        if (counter) counter.textContent = `${realIndex + 1} / ${total}`;
    }

    function next() {
        if (animating) return;
        animating = true;
        goTo(current + 1, true);
    }
    function prev() {
        if (animating) return;
        animating = true;
        goTo(current - 1, true);
    }

    track.addEventListener('transitionend', () => {
        animating = false;
        const allCards = track.children.length; // total * 3
        // если вышли за пределы оригиналов — тихий прыжок
        if (current >= total * 2) {
            goTo(current - total, false);
        } else if (current < total) {
            goTo(current + total, false);
        }
    });

    btnNext.addEventListener('click', next);
    btnPrev.addEventListener('click', prev);

    document.addEventListener('keydown', e => {
        const s    = document.getElementById('s-downloads');
        const rect = s.getBoundingClientRect();
        if (rect.top > -window.innerHeight * 0.5 && rect.top < window.innerHeight * 0.5) {
            if (e.key === 'ArrowRight') next();
            if (e.key === 'ArrowLeft')  prev();
        }
    });

    window.addEventListener('resize', () => goTo(current, false));

    goTo(current, false);
})();