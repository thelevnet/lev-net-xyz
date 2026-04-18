document.addEventListener('DOMContentLoaded', () => {
    const timeline = document.getElementById('timeline');
    const dayBtns = document.querySelectorAll('.day-btn');
    const startHour = 0; // 00:00
    const endHour = 23;  // 23:59
    const pixelPerHour = 60; // Height of one hour slot in CSS

    // State
    let currentDayCode = 'Mo'; // 'Mo', 'Tu', etc.
    let editingTaskId = null;
    let dragSrcEl = null;

    // Load Tasks from LocalStorage or use default
    let tasks = JSON.parse(localStorage.getItem('levnet_planner_tasks')) || [
        { id: 1, day: 'Mo', start: '09:00', duration: 60, title: 'Team Meeting', color: '#ff8a65', icon: 'fa-users' },
        { id: 2, day: 'Mo', start: '11:30', duration: 90, title: 'Deep Work', color: '#65d8e8', icon: 'fa-brain' },
    ];

    // Colors & Icons
    const colors = ['#65d8e8', '#ff8a65', '#ba68c8', '#81c784', '#fff176', '#e57373'];
    const icons = ['fa-briefcase', 'fa-home', 'fa-coffee', 'fa-dumbbell', 'fa-book', 'fa-phone', 'fa-users', 'fa-brain', 'fa-cart-shopping', 'fa-bed'];

    const tasksGrid = document.getElementById('tasks-grid');
    const modal = document.getElementById('task-modal');
    const fabAdd = document.getElementById('fab-add');
    const btnCancel = document.getElementById('btn-cancel');
    const btnSave = document.getElementById('btn-save');
    const btnDelete = document.getElementById('btn-delete');

    // Inputs
    const inputTitle = document.getElementById('input-title');
    const inputStart = document.getElementById('input-start');
    const inputEnd = document.getElementById('input-end');
    
    // Auto-format time input (HH:MM)
    [inputStart, inputEnd].forEach(input => {
        input.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, ''); // Remove non-digits
            if (val.length > 4) val = val.slice(0, 4);
            if (val.length > 2) {
                val = val.slice(0, 2) + ':' + val.slice(2);
            }
            e.target.value = val;
        });
        
        // Blur validation
        input.addEventListener('blur', (e) => {
            let val = e.target.value;
            if (val.length === 1) val = '0' + val + ':00';
            else if (val.length === 2) val = val + ':00';
            else if (val.length === 3) val = val.replace(':', '') + '0'; // 12: -> 12:00 ? No, logic is complex. 
            // Simple robust check
            if (!val.includes(':') && val.length === 4) val = val.slice(0,2) + ':' + val.slice(2);
            
            // Validate HH
            const parts = val.split(':');
            if(parts[0] && parseInt(parts[0]) > 23) parts[0] = '23';
            if(parts[1] && parseInt(parts[1]) > 59) parts[1] = '59';
            
            e.target.value = parts.join(':');
        });
    });

    const inputColor = document.getElementById('input-color');
    const inputIcon = document.getElementById('input-icon');
    const inputRepeat = document.getElementById('input-repeat');
    const colorOptionsDiv = document.getElementById('color-options');
    const iconSelectBtn = document.getElementById('icon-select-btn');
    const iconDisplay = document.getElementById('selected-icon-display');
    const iconDropdown = document.getElementById('icon-dropdown');

    // --- DATE & HEADER LOGIC ---
    const daysShort = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    
    // Get real current date
    const now = new Date();
    const currentDayIndex = now.getDay(); // 0=Su, 1=Mo...
    
    // Calculate start of the week (Monday)
    // If today is Su(0), then monday was 6 days ago. If Mo(1), 0 days ago.
    const distToMon = (currentDayIndex + 6) % 7;
    const mondayDate = new Date(now);
    mondayDate.setDate(now.getDate() - distToMon);

    // Map button to real date for "Today" check
    const dayMap = {}; // 'Mo' -> Date object

    dayBtns.forEach((btn, index) => {
        // Buttons are Mo, Tu, We... in HTML order. Assuming HTML is Mo..Su
        // Add days to Monday
        const d = new Date(mondayDate);
        d.setDate(mondayDate.getDate() + index);
        
        const dayCode = btn.getAttribute('data-day');
        const dayNum = d.getDate();
        
        // Update Button Text
        btn.innerHTML = `${dayCode}<br><span style="font-size:10px">${dayNum}</span>`;
        
        dayMap[dayCode] = d;

        // Check if this button is Today
        if (d.toDateString() === now.toDateString()) {
            btn.style.border = '2px solid #65d8e8'; // Visual cue for today
            currentDayCode = dayCode; // Default to today
        }
    });

    // --- SAVE ---
    function saveToStorage() {
        localStorage.setItem('levnet_planner_tasks', JSON.stringify(tasks));
    }

    // --- HELPERS ---
    function getHoursFromTime(timeStr) {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h + (m / 60);
    }
    
    function formatTime(decimalTime) {
        const h = Math.floor(decimalTime) % 24;
        const m = Math.round((decimalTime - Math.floor(decimalTime)) * 60);
        return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
    }

    // --- RENDERING ---

    function renderTasks(dayCode) {
        tasksGrid.innerHTML = '';
        
        // Check if "Today"
        const isToday = dayMap[dayCode].toDateString() === new Date().toDateString();
        if (isToday) {
            renderCurrentTimeIndicator();
        }

        const dayTasks = tasks.filter(t => t.day === dayCode);

        dayTasks.forEach(task => {
            const taskStartHour = getHoursFromTime(task.start);
            const offsetHours = taskStartHour - startHour;
            
            const topPx = offsetHours * pixelPerHour;
            const heightPx = (task.duration / 60) * pixelPerHour;

            const el = document.createElement('div');
            el.className = 'task-card';
            el.style.top = `${topPx}px`;
            el.style.height = `${heightPx}px`;
            el.style.backgroundColor = task.color || '#65d8e8';
            el.style.boxShadow = `0 4px 10px ${task.color}66`;
            el.setAttribute('data-id', task.id);

            // Calculate end time
            const endHourVal = taskStartHour + (task.duration / 60);
            const endTimeStr = formatTime(endHourVal);

            const iconClass = task.icon || 'fa-briefcase';

            el.innerHTML = `
                <span class="task-time">${task.start} - ${endTimeStr}</span>
                <div class="task-title"><i class="fa-solid ${iconClass}"></i> ${task.title}</div>
            `;
            
            // Edit on click
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                openModal(task);
            });

            tasksGrid.appendChild(el);
        });
    }

    function renderCurrentTimeIndicator() {
        const d = new Date();
        const h = d.getHours();
        const m = d.getMinutes();
        const currentTimeVal = h + (m / 60);
        
        const pastHeight = (currentTimeVal - startHour) * pixelPerHour;

        const pastOverlay = document.createElement('div');
        pastOverlay.className = 'past-time-overlay';
        pastOverlay.style.height = `${Math.max(0, pastHeight)}px`;
        tasksGrid.appendChild(pastOverlay);

        const line = document.createElement('div');
        line.className = 'current-time-line';
        line.style.top = `${pastHeight}px`;
        tasksGrid.appendChild(line);
    }

    // --- TIMELINE ---
    for (let i = startHour; i <= endHour; i++) {
        const div = document.createElement('div');
        div.className = 'time-slot';
        div.innerHTML = `<span>${i.toString().padStart(2, '0')}</span>`;
        timeline.appendChild(div);
    }

    // --- DAY SELECTION ---
    dayBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            dayBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDayCode = btn.getAttribute('data-day');
            renderTasks(currentDayCode);
        });
    });
    
    // Set initial active button
    const activeBtn = Array.from(dayBtns).find(b => b.getAttribute('data-day') === currentDayCode);
    if(activeBtn) activeBtn.classList.add('active');


    // --- MODAL & FORM ---

    // Init Color Picker
    colors.forEach(c => {
        const d = document.createElement('div');
        d.className = 'color-circle';
        d.style.backgroundColor = c;
        d.addEventListener('click', () => {
            document.querySelectorAll('.color-circle').forEach(x => x.classList.remove('selected'));
            d.classList.add('selected');
            inputColor.value = c;
        });
        colorOptionsDiv.appendChild(d);
    });

    // Init Icon Picker
    icons.forEach(ic => {
        const d = document.createElement('div');
        d.className = 'icon-option';
        d.innerHTML = `<i class="fa-solid ${ic}"></i>`;
        d.addEventListener('click', () => {
            inputIcon.value = ic;
            iconDisplay.className = `fa-solid ${ic}`;
            iconDropdown.classList.add('hidden');
        });
        iconDropdown.appendChild(d);
    });

    iconSelectBtn.addEventListener('click', () => {
        iconDropdown.classList.toggle('hidden');
    });

    function openModal(taskToEdit = null) {
        modal.classList.add('open');
        iconDropdown.classList.add('hidden');

        if (taskToEdit) {
            editingTaskId = taskToEdit.id;
            inputTitle.value = taskToEdit.title;
            inputStart.value = taskToEdit.start;
            
            const startH = getHoursFromTime(taskToEdit.start);
            const endVal = startH + (taskToEdit.duration / 60);
            inputEnd.value = formatTime(endVal);

            inputColor.value = taskToEdit.color;
            // Visual update for color picker...
            document.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));

            inputIcon.value = taskToEdit.icon || 'fa-briefcase';
            iconDisplay.className = `fa-solid ${inputIcon.value}`;

            inputRepeat.value = 'none';
            btnDelete.classList.remove('hidden');
        } else {
            editingTaskId = null;
            inputTitle.value = '';
            inputStart.value = '09:00';
            inputEnd.value = '10:00';
            inputColor.value = '#65d8e8';
            inputIcon.value = 'fa-briefcase';
            iconDisplay.className = 'fa-solid fa-briefcase';
            inputRepeat.value = 'none';
            btnDelete.classList.add('hidden');
        }
    }

    function closeModal() {
        modal.classList.remove('open');
    }

    function deleteTask() {
        if (editingTaskId) {
            tasks = tasks.filter(t => t.id !== editingTaskId);
            saveToStorage();
            renderTasks(currentDayCode);
            closeModal();
        }
    }

    function saveTask() {
        const title = inputTitle.value;
        const start = inputStart.value;
        const end = inputEnd.value;
        const color = inputColor.value;
        const icon = inputIcon.value;
        const repeat = inputRepeat.value;

        if (!title || !start || !end) return alert('Fill all fields');

        const startH = getHoursFromTime(start);
        const endH = getHoursFromTime(end);
        let durationMin = (endH - startH) * 60;
        if (durationMin <= 0) durationMin += 24 * 60;
        if (durationMin <= 0) return alert('Invalid Time');

        if (editingTaskId) {
            const tIndex = tasks.findIndex(t => t.id === editingTaskId);
            if (tIndex > -1) {
                tasks[tIndex].title = title;
                tasks[tIndex].start = start;
                tasks[tIndex].duration = durationMin;
                tasks[tIndex].color = color;
                tasks[tIndex].icon = icon;
            }
        } else {
            const daysToAdd = repeat === 'daily' ? ['Mo','Tu','We','Th','Fr','Sa','Su'] : [currentDayCode];
            
            daysToAdd.forEach(d => {
                tasks.push({
                    id: Date.now() + Math.random(),
                    day: d,
                    start,
                    duration: durationMin,
                    title,
                    color,
                    icon
                });
            });
        }

        saveToStorage();
        renderTasks(currentDayCode);
        closeModal();
    }

    fabAdd.addEventListener('click', () => openModal());
    btnCancel.addEventListener('click', closeModal);
    btnSave.addEventListener('click', saveTask);
    btnDelete.addEventListener('click', deleteTask);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Initial Render
    renderTasks(currentDayCode);
    
    // Auto Scroll
    setTimeout(() => {
        const d = new Date();
        const h = d.getHours();
        const scrollPx = (h - 2) * pixelPerHour;
        document.querySelector('.planner-body').scrollTop = Math.max(0, scrollPx);
    }, 100);

    // Clock Tick
    setInterval(() => {
        if (dayMap[currentDayCode].toDateString() === new Date().toDateString()) {
            renderTasks(currentDayCode);
        }
    }, 60000);
});