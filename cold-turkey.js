const { ipcRenderer } = require('electron');

let countdown = 20;
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
            // Tell main process countdown finished
            ipcRenderer.send('cold-turkey-countdown-finished');
        }
    }, 1000);
}

function updateCountdownDisplay() {
    document.getElementById('countdown').textContent = countdown;
}
