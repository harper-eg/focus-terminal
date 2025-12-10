const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Get user data path and todos path
const userDataPath = ipcRenderer.sendSync('get-user-data-path');
const todosPath = path.join(userDataPath, 'todos.json');

// Helper function to get default date value with current month
function getDefaultDateValue() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${month}/`;
}

// Helper function to parse MM/DD date
function parseTaskDate(dateStr) {
    if (!dateStr || !dateStr.includes('/')) return null;
    const [mm, dd] = dateStr.split('/').map(n => parseInt(n));
    if (!mm || !dd || isNaN(mm) || isNaN(dd)) return null;

    const now = new Date();
    const year = now.getFullYear();
    const date = new Date(year, mm - 1, dd);
    date.setHours(0, 0, 0, 0);

    return date;
}

// Helper function to get days until a date
function getDaysUntil(dateStr) {
    const taskDate = parseTaskDate(dateStr);
    if (!taskDate) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = taskDate - today;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // TEMPORARY STOPGAP: Treat overdue tasks as "today"
    if (diffDays < 0) return 0;

    return diffDays;
}

// Categorize a task based on date and priority
function categorizeTask(task) {
    const daysUntil = getDaysUntil(task.date);
    const isHigh = task.priority === 'high';

    if (daysUntil === null) {
        return isHigh ? 7 : 8;
    } else if (daysUntil === 0) {
        return isHigh ? 1 : 2;
    } else if (daysUntil === 1) {
        return isHigh ? 3 : 4;
    } else {
        return isHigh ? 5 : 6;
    }
}

// Sort tasks according to priority and date rules
function sortTasks(tasks) {
    if (tasks.length === 0) return [];

    const categories = {
        1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: []
    };

    tasks.forEach(task => {
        const cat = categorizeTask(task);
        categories[cat].push(task);
    });

    // Sort within each category by date (earliest first), then by ID
    for (let cat in categories) {
        categories[cat].sort((a, b) => {
            const dateA = parseTaskDate(a.date);
            const dateB = parseTaskDate(b.date);

            if (dateA && dateB) {
                const diff = dateA - dateB;
                if (diff !== 0) return diff;
                return a.id - b.id;
            }
            if (dateA) return -1;
            if (dateB) return 1;
            return a.id - b.id;
        });
    }

    // Intersperse function
    function intersperse(arr1, arr2) {
        const result = [];
        const maxLen = Math.max(arr1.length, arr2.length);
        for (let i = 0; i < maxLen; i++) {
            if (i < arr1.length) result.push(arr1[i]);
            if (i < arr2.length) result.push(arr2[i]);
        }
        return result;
    }

    // Build final sorted array
    const sorted = [
        ...categories[1],
        ...categories[2],
        ...categories[3],
        ...categories[4],
        ...intersperse(categories[5], categories[7]),
        ...intersperse(categories[6], categories[8])
    ];

    // Mark the first task as top task
    sorted.forEach(task => task.isTopTask = false);
    if (sorted.length > 0) {
        sorted[0].isTopTask = true;
    }

    return sorted;
}

// Load todos from file
function loadTodos() {
    try {
        const data = fs.readFileSync(todosPath, 'utf8');
        const parsed = JSON.parse(data);
        return parsed.tasks || [];
    } catch (error) {
        console.error('Error loading todos:', error);
        return [];
    }
}

// Save todos to file
function saveTodos(todos) {
    try {
        const data = { tasks: todos };
        fs.writeFileSync(todosPath, JSON.stringify(data, null, 2));
        console.log('Todos saved successfully!');
    } catch (error) {
        console.error('Error saving todos:', error);
    }
}

// Add task function
function addTask() {
    const textInput = document.getElementById('task-text-input');
    const dateInput = document.getElementById('task-date-input');
    const priorityToggle = document.getElementById('task-priority-toggle');

    const text = textInput.value.trim();
    const date = dateInput.value.trim();
    const priority = priorityToggle.getAttribute('data-priority');

    if (!text) {
        return; // Don't add empty tasks
    }

    // Load current todos
    let todos = loadTodos();

    // Generate new ID
    const maxId = todos.length > 0 ? Math.max(...todos.map(t => t.id)) : 0;
    const newTask = {
        id: maxId + 1,
        text: text,
        date: date || '',
        priority: priority,
        isTopTask: false
    };

    todos.push(newTask);

    // Apply sorting
    todos = sortTasks(todos);

    // Save
    saveTodos(todos);

    // Clear inputs
    textInput.value = '';
    dateInput.value = getDefaultDateValue();
    priorityToggle.setAttribute('data-priority', 'high');
    priorityToggle.textContent = 'HP';

    // Focus back on text input
    textInput.focus();

    // Notify main process that task was added
    ipcRenderer.send('task-added');
}

// Initialize the form
const textInput = document.getElementById('task-text-input');
const dateInput = document.getElementById('task-date-input');
const priorityToggle = document.getElementById('task-priority-toggle');

// Set initial date value
dateInput.value = getDefaultDateValue();

// Priority toggle
priorityToggle.addEventListener('click', () => {
    const currentPriority = priorityToggle.getAttribute('data-priority');
    if (currentPriority === 'high') {
        priorityToggle.setAttribute('data-priority', 'low');
        priorityToggle.textContent = 'LP';
    } else {
        priorityToggle.setAttribute('data-priority', 'high');
        priorityToggle.textContent = 'HP';
    }
});

// Date input formatting
dateInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length >= 2) {
        value = value.slice(0, 2) + '/' + value.slice(2, 4);
    }
    e.target.value = value;
});

// Date input validation
dateInput.addEventListener('blur', () => {
    const value = dateInput.value;
    if (value.includes('/')) {
        const [mm, dd] = value.split('/').map(n => parseInt(n) || 0);
        let correctedMM = mm;
        let correctedDD = dd;

        if (mm < 1 || mm > 12) {
            correctedMM = Math.max(1, Math.min(12, mm));
        }
        if (dd < 1 || dd > 31) {
            correctedDD = Math.max(1, Math.min(31, dd));
        }

        if (correctedMM !== mm || correctedDD !== dd) {
            dateInput.value = String(correctedMM).padStart(2, '0') + '/' + String(correctedDD).padStart(2, '0');
        }
    }
});

// Keyboard navigation
textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        addTask();
    } else if (e.key === 'Escape') {
        ipcRenderer.send('close-task-entry');
    } else if (e.key === 'ArrowRight' && textInput.selectionStart === textInput.value.length) {
        e.preventDefault();
        dateInput.focus();
        dateInput.setSelectionRange(dateInput.value.length, dateInput.value.length);
    }
});

dateInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        addTask();
    } else if (e.key === 'Escape') {
        ipcRenderer.send('close-task-entry');
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        textInput.focus();
        textInput.setSelectionRange(textInput.value.length, textInput.value.length);
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        priorityToggle.focus();
    }
});

priorityToggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        priorityToggle.click();
    } else if (e.key === 'Escape') {
        ipcRenderer.send('close-task-entry');
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        dateInput.focus();
        dateInput.setSelectionRange(dateInput.value.length, dateInput.value.length);
    }
});

// Close button
document.getElementById('close-btn').addEventListener('click', () => {
    ipcRenderer.send('close-task-entry');
});

// Global Escape handler
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        ipcRenderer.send('close-task-entry');
    }
});
