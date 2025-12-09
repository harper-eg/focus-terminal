const { ipcRenderer } = require('electron');

let timerInterval;
let seconds = 0;

// Listen for "START" command from Main Process
ipcRenderer.on('start-timer', (event, workspaceName) => {
    // Reset
    seconds = 0;
    clearInterval(timerInterval);
    
    // Update UI
    document.getElementById('active-task').innerText = workspaceName;
    document.getElementById('timer').innerText = "00:00:00";
    
    // Start Counting
    timerInterval = setInterval(() => {
        seconds++;
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        document.getElementById('timer').innerText = `${h}:${m}:${s}`;
    }, 1000);
});

// EXIT BUTTON
document.getElementById('exit-btn').addEventListener('click', () => {
    clearInterval(timerInterval);
    // Tell Main Process to stop everything and go back to dashboard
    ipcRenderer.send('stop-workspace');
});

// HOVER DETECTION
document.body.addEventListener('mouseenter', () => {
    ipcRenderer.send('overlay-hover', 'enter');
});

document.body.addEventListener('mouseleave', () => {
    ipcRenderer.send('overlay-hover', 'leave');
});