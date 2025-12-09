const { ipcRenderer } = require('electron');

// Listen for countdown finished event from main process
ipcRenderer.on('countdown-finished', () => {
    saveLinksAndExit();
});

// Focus first input field on load
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('link1').focus();

    // Add keyboard handlers for quick navigation
    const link1 = document.getElementById('link1');
    const link2 = document.getElementById('link2');
    const link3 = document.getElementById('link3');

    // Tab to next field, Shift+Tab to previous
    link1.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            link2.focus();
        }
    });

    link2.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            link3.focus();
        } else if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            link1.focus();
        }
    });

    link3.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            link2.focus();
        }
    });
});

function saveLinksAndExit() {
    const link1 = document.getElementById('link1').value.trim();
    const link2 = document.getElementById('link2').value.trim();
    const link3 = document.getElementById('link3').value.trim();

    const links = [link1, link2, link3].filter(link => link !== '');

    if (links.length > 0) {
        // Send links to main process to save
        ipcRenderer.send('save-panic-links', links);
    }

    // Exit panic mode and return to dashboard
    ipcRenderer.send('exit-panic-mode');
}
