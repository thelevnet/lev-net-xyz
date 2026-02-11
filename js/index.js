document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-target');

            // Убираем активный класс у всех табов и панелей
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));

            // Добавляем активный класс текущему табу и нужной панели
            tab.classList.add('active');
            document.getElementById(target).classList.add('active');
        });
    });
});