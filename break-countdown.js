const { ipcRenderer } = require('electron');

let countdown = 60;
let countdownInterval = null;

// Start countdown immediately on load
window.addEventListener('DOMContentLoaded', () => {
    startCountdown();
});

function startCountdown() {
    updateCountdownDisplay();

    countdownInterval = setInterval(() => {
        countdown--;
        updateCountdownDisplay();

        if (countdown <= 0) {
            clearInterval(countdownInterval);
            // Tell main process countdown finished - go to dashboard
            ipcRenderer.send('break-countdown-finished');
        }
    }, 1000);
}

function updateCountdownDisplay() {
    document.getElementById('countdown').textContent = countdown;
}
