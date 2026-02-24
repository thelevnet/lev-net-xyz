document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-target');
            
            // Если цель — чат, просто уходим со страницы
            if (target === 'chat') {
                window.location.href = 'chat/index.html';
                return; // Дальше код не пойдет, табы переключаться не будут
            }

            // Обычная логика для остальных вкладок
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const targetPane = document.getElementById(target);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });
});