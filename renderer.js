
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Todo list management
let todos = [];
const todosPath = path.join(__dirname, 'todos.json');

// Load todos from file
function loadTodos() {
    try {
        const data = fs.readFileSync(todosPath, 'utf8');
        const parsed = JSON.parse(data);
        todos = parsed.tasks || [];
    } catch (error) {
        console.error('Error loading todos:', error);
        todos = [];
    }
}

// Save todos to file
function saveTodos() {
    try {
        const data = { tasks: todos };
        fs.writeFileSync(todosPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving todos:', error);
    }
}

// Render todos to the list
function renderTodos() {
    const todoList = document.getElementById('todo-list');
    todoList.innerHTML = '';

    if (todos.length === 0) {
        return;
    }

    // Find the top task
    const topTaskIndex = todos.findIndex(task => task.isTopTask);
    const topTask = topTaskIndex >= 0 ? todos[topTaskIndex] : todos[0];

    // Ensure only one task is marked as top
    if (topTaskIndex < 0 && todos.length > 0) {
        todos[0].isTopTask = true;
        saveTodos();
    }

    // Render top task
    const topTaskElement = createTodoElement(topTask, true);
    todoList.appendChild(topTaskElement);

    // Add separator
    const separator = document.createElement('li');
    separator.className = 'todo-separator';
    separator.textContent = '-';
    todoList.appendChild(separator);

    // Render remaining tasks
    todos.forEach(task => {
        if (!task.isTopTask) {
            const taskElement = createTodoElement(task, false);
            todoList.appendChild(taskElement);
        }
    });

    // Setup click handlers
    setupTodoCheckboxes();
}

// Create a todo element
function createTodoElement(task, isTop) {
    const li = document.createElement('li');
    li.className = 'todo-item';
    li.setAttribute('data-task-id', task.id);

    if (isTop) {
        li.classList.add('top-task');
        li.setAttribute('data-top-task', 'true');
    }

    const checkbox = document.createElement('span');
    checkbox.className = 'todo-checkbox';

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = task.text;

    li.appendChild(checkbox);
    li.appendChild(text);

    return li;
}

// Update clock every second
function updateClock() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const timeString = `${hours}:${minutes}:${seconds}`;

    const clockElement = document.getElementById('clock');
    if (clockElement) {
        clockElement.innerText = timeString;
    }
}

// Initialize clock and update every second
updateClock();
setInterval(updateClock, 1000);

function runWorkspace(name) {
    const log = document.getElementById('status-log');
    log.innerText = `> Initializing workspace: ${name}...`;

    // IMPORTANT: This sends the name to the main process
    ipcRenderer.send('run-shortcut', name);

    setTimeout(() => {
        log.innerText = `> ${name} Active.`;
    }, 1500);
}

function runSleepMode() {
    const log = document.getElementById('status-log');
    log.innerText = `> Entering Sleep Mode...`;

    ipcRenderer.send('run-sleep-mode');

    setTimeout(() => {
        log.innerText = `> Sleep Mode Active.`;
    }, 1500);
}

function runStatsMode() {
    const log = document.getElementById('status-log');
    log.innerText = `> Loading Statistics...`;

    ipcRenderer.send('run-stats-mode');

    setTimeout(() => {
        log.innerText = `> Statistics Mode Active.`;
    }, 1500);
}

// KEYBOARD SHORTCUTS (1-9, S, T)
document.addEventListener('keydown', (event) => {
    if (!document.getElementById('quit-modal').classList.contains('hidden')) return;

    // Don't trigger shortcuts if user is typing in an input field
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
    }

    const key = event.key;
    // Check if key is 1 through 9
    if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(key)) {
        const items = document.querySelectorAll('.workspace-item');
        const index = parseInt(key) - 1;
        if (items[index]) {
            items[index].click(); // Triggers the visual click and the function
            items.forEach(el => el.classList.remove('active'));
            items[index].classList.add('active');
        }
    }
    // Check if key is 's' for Sleep Mode
    if (key === 's' || key === 'S') {
        runSleepMode();
    }
    // Check if key is 't' for Statistics
    if (key === 't' || key === 'T') {
        runStatsMode();
    }
    // Check if key is right arrow - focus on task entry bar
    if (key === 'ArrowRight') {
        const textInput = document.getElementById('task-text-input');
        if (textInput) {
            textInput.focus();
            textInput.setSelectionRange(textInput.value.length, textInput.value.length);
        }
    }
});

// Math challenge for quitting
let mathAnswer = 0;

function generateMathChallenge() {
    const num1 = Math.floor(Math.random() * 90) + 10; // 10-99
    const num2 = Math.floor(Math.random() * 90) + 10; // 10-99
    mathAnswer = num1 * num2;
    return `${num1} × ${num2}`;
}

// QUIT LOGIC
ipcRenderer.on('attempt-close', () => {
    const mathProblem = generateMathChallenge();
    document.getElementById('quit-prompt').innerText = `SOLVE TO EXIT: ${mathProblem} = ?`;
    document.getElementById('quit-modal').classList.remove('hidden');
    document.getElementById('quit-input').value = '';
    document.getElementById('quit-input').focus();
});

const quitInput = document.getElementById('quit-input');
quitInput.addEventListener('input', (e) => {
    const userAnswer = parseInt(e.target.value);
    if (userAnswer === mathAnswer) {
        ipcRenderer.send('force-quit');
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.getElementById('quit-modal').classList.add('hidden');
        document.getElementById('quit-input').value = '';
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'q') {
        e.preventDefault(); // Stop standard OS behavior
        // Generate new math challenge and show the modal
        const mathProblem = generateMathChallenge();
        document.getElementById('quit-prompt').innerText = `SOLVE TO EXIT: ${mathProblem} = ?`;
        document.getElementById('quit-modal').classList.remove('hidden');
        document.getElementById('quit-input').value = '';
        document.getElementById('quit-input').focus();
        return; // Stop processing
    }
});

// FORCE CALENDAR WAKE-UP
// If the iframe is grey on load, this forces it to reload once the window is stable.
ipcRenderer.on('force-repaint', () => {
    const iframe = document.querySelector('iframe');
    if (iframe) {
        console.log(">> Forcing Calendar Repaint...");
        // Re-assigning the SRC forces a reload
        iframe.src = iframe.src;
    }
});

// TODO LIST FUNCTIONALITY
function setupTodoCheckboxes() {
    const checkboxes = document.querySelectorAll('.todo-checkbox');
    checkboxes.forEach(checkbox => {
        // Remove any existing listeners by cloning
        const newCheckbox = checkbox.cloneNode(true);
        checkbox.parentNode.replaceChild(newCheckbox, checkbox);

        newCheckbox.addEventListener('click', function() {
            const todoItem = this.closest('.todo-item');
            if (todoItem) {
                const taskId = parseInt(todoItem.getAttribute('data-task-id'));
                const isTopTask = todoItem.hasAttribute('data-top-task');

                todoItem.style.transition = 'opacity 0.3s';
                todoItem.style.opacity = '0';

                setTimeout(() => {
                    // Remove task from data
                    todos = todos.filter(task => task.id !== taskId);

                    // If it was the top task, promote the next one
                    if (isTopTask && todos.length > 0) {
                        todos[0].isTopTask = true;
                    }

                    // Save and re-render
                    saveTodos();
                    renderTodos();
                }, 300);
            }
        });
    });
}

// ADD TASK FUNCTIONALITY
function setupAddTaskBar() {
    console.log('>>> setupAddTaskBar called');
    const addTaskBar = document.getElementById('add-task-bar');
    const textInput = document.getElementById('task-text-input');
    const dateInput = document.getElementById('task-date-input');
    const priorityToggle = document.getElementById('task-priority-toggle');

    console.log('>>> Elements found:', {
        addTaskBar: !!addTaskBar,
        textInput: !!textInput,
        dateInput: !!dateInput,
        priorityToggle: !!priorityToggle
    });

    if (!textInput || !dateInput || !priorityToggle || !addTaskBar) {
        console.error('>>> Missing elements! Cannot setup add task bar.');
        return;
    }

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

    // Date input click selection
    dateInput.addEventListener('click', function() {
        const cursorPos = this.selectionStart;
        if (cursorPos <= 2) {
            // Select MM
            this.setSelectionRange(0, 2);
        } else {
            // Select DD
            const slashIndex = this.value.indexOf('/');
            if (slashIndex >= 0) {
                this.setSelectionRange(slashIndex + 1, this.value.length);
            }
        }
    });

    // Date validation
    dateInput.addEventListener('blur', () => {
        const value = dateInput.value;
        if (value.includes('/')) {
            const [mm, dd] = value.split('/').map(n => parseInt(n) || 0);
            let valid = true;
            let correctedMM = mm;
            let correctedDD = dd;

            if (mm < 1 || mm > 12) {
                correctedMM = Math.max(1, Math.min(12, mm));
                valid = false;
            }
            if (dd < 1 || dd > 31) {
                correctedDD = Math.max(1, Math.min(31, dd));
                valid = false;
            }

            if (!valid) {
                dateInput.value = String(correctedMM).padStart(2, '0') + '/' + String(correctedDD).padStart(2, '0');
            }
        }
    });

    // TEXT ENTRY STATE navigation
    console.log('>>> Attaching text input keydown listener');
    textInput.addEventListener('keydown', (e) => {
        console.log('>>> Text input keydown event:', e.key);
        if (e.key === 'ArrowRight') {
            console.log('ArrowRight pressed. Cursor at:', textInput.selectionStart, 'of', textInput.value.length);
            if (textInput.selectionStart === textInput.value.length && textInput.selectionEnd === textInput.value.length) {
                // Right at end -> Date Entry State
                console.log('Navigating to Date Entry');
                e.preventDefault();
                e.stopPropagation();
                dateInput.focus();
                dateInput.setSelectionRange(0, 2);
            } else {
                console.log('Allowing normal cursor movement');
                e.stopPropagation(); // Stop event from bubbling to whole bar handler
            }
        } else if (e.key === 'ArrowLeft') {
            console.log('ArrowLeft pressed. Cursor at:', textInput.selectionStart);
            if (textInput.selectionStart === 0 && textInput.selectionEnd === 0) {
                // Left at beginning -> Whole Bar State
                console.log('Navigating to Whole Bar');
                e.preventDefault();
                e.stopPropagation();
                addTaskBar.focus();
            } else {
                console.log('Allowing normal cursor movement');
                e.stopPropagation(); // Stop event from bubbling to whole bar handler
            }
        } else if (e.key === 'Enter') {
            // Enter -> Date Entry State
            console.log('>>> Text: Enter -> focusing date input');
            e.preventDefault();
            e.stopPropagation();
            dateInput.focus();
            dateInput.setSelectionRange(0, 2);
        } else if (e.key === 'Escape') {
            // Esc -> Main Menu State
            e.preventDefault();
            e.stopPropagation();
            textInput.blur();
        }
    });

    // DATE ENTRY STATE navigation
    console.log('>>> Attaching date input keydown listener');
    dateInput.addEventListener('keydown', (e) => {
        console.log('>>> Date input keydown event:', e.key);
        if (e.key === 'ArrowLeft') {
            // Left -> Text Entry State
            console.log('>>> Date: ArrowLeft -> focusing text input');
            e.preventDefault();
            e.stopPropagation();
            textInput.focus();
            textInput.setSelectionRange(textInput.value.length, textInput.value.length);
        } else if (e.key === 'ArrowRight') {
            // Right -> Priority Entry State
            console.log('>>> Date: ArrowRight -> focusing priority toggle');
            e.preventDefault();
            e.stopPropagation();
            priorityToggle.focus();
            console.log('>>> Priority toggle focused:', document.activeElement === priorityToggle);
        } else if (e.key === 'Enter') {
            // Enter -> Priority Entry State
            console.log('>>> Date: Enter -> focusing priority toggle');
            e.preventDefault();
            e.stopPropagation();
            priorityToggle.focus();
        } else if (e.key === 'Escape') {
            // Esc -> Main Menu State
            e.preventDefault();
            dateInput.blur();
        }
    });

    // PRIORITY ENTRY STATE navigation
    console.log('>>> Attaching priority toggle keydown listener');
    priorityToggle.addEventListener('keydown', (e) => {
        console.log('>>> Priority toggle keydown event:', e.key);
        if (e.key === 'ArrowLeft') {
            // Left -> Date Entry State
            console.log('>>> Priority: ArrowLeft -> focusing date input');
            e.preventDefault();
            e.stopPropagation();
            dateInput.focus();
            dateInput.setSelectionRange(0, 2);
        } else if (e.key === 'ArrowRight') {
            // Right -> Whole Bar State
            console.log('>>> Priority: ArrowRight -> focusing whole bar');
            e.preventDefault();
            e.stopPropagation();
            addTaskBar.focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
            // Enter or Space -> toggle HP/LP
            console.log('>>> Priority: Enter/Space -> toggling');
            e.preventDefault();
            e.stopPropagation();
            priorityToggle.click();
        } else if (e.key === 'Escape') {
            // Esc -> Main Menu State
            e.preventDefault();
            priorityToggle.blur();
        }
    });

    // WHOLE BAR STATE navigation
    console.log('>>> Attaching whole bar keydown listener');
    addTaskBar.addEventListener('keydown', (e) => {
        console.log('>>> Whole bar keydown event:', e.key, 'activeElement:', document.activeElement.id);
        if (e.key === 'ArrowLeft') {
            // Left -> Priority Entry State
            console.log('>>> Whole bar: ArrowLeft -> focusing priority toggle');
            e.preventDefault();
            e.stopPropagation();
            priorityToggle.focus();
        } else if (e.key === 'ArrowRight') {
            // Right -> Text Entry State
            console.log('>>> Whole bar: ArrowRight -> focusing text input');
            e.preventDefault();
            e.stopPropagation();
            textInput.focus();
            setTimeout(() => {
                textInput.setSelectionRange(textInput.value.length, textInput.value.length);
                console.log('>>> Cursor set to position:', textInput.value.length);
            }, 0);
        } else if (e.key === 'Enter') {
            // Enter -> submit task, return to Main Menu State
            console.log('>>> Whole bar: Enter -> adding task');
            e.preventDefault();
            e.stopPropagation();
            addTask();
        } else if (e.key === 'Escape') {
            // Esc -> Main Menu State
            e.preventDefault();
            addTaskBar.blur();
        }
    });

    // Make priority toggle focusable
    priorityToggle.setAttribute('tabindex', '0');
}

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
    saveTodos();
    renderTodos();

    // Clear inputs
    textInput.value = '';
    dateInput.value = '';
    priorityToggle.setAttribute('data-priority', 'high');
    priorityToggle.textContent = 'HP';

    // Focus back on text input
    textInput.focus();
}

// Initialize todos on load
console.log('>>> Renderer.js loaded, readyState:', document.readyState);

document.addEventListener('DOMContentLoaded', () => {
    console.log('>>> DOMContentLoaded fired');
    loadTodos();
    renderTodos();
    setupAddTaskBar();
});

// Also initialize immediately in case DOMContentLoaded already fired
if (document.readyState === 'loading') {
    console.log('>>> DOM still loading, waiting for DOMContentLoaded');
    // Still loading, wait for DOMContentLoaded
} else {
    console.log('>>> DOM already ready, initializing immediately');
    loadTodos();
    renderTodos();
    setupAddTaskBar();
}