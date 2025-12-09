const { ipcRenderer } = require('electron');

let decisionMade = false;

window.addEventListener('DOMContentLoaded', () => {
    const noWorkBtn = document.getElementById('no-work-btn');
    const workBtn = document.getElementById('work-btn');

    noWorkBtn.addEventListener('click', () => {
        if (decisionMade) {
            console.log(">> Decision already made, ignoring click");
            return;
        }
        decisionMade = true;
        console.log(">> Button clicked: no-work");

        // Disable both buttons
        noWorkBtn.disabled = true;
        workBtn.disabled = true;

        ipcRenderer.send('panic-decision', 'no-work');
    });

    workBtn.addEventListener('click', () => {
        if (decisionMade) {
            console.log(">> Decision already made, ignoring click");
            return;
        }
        decisionMade = true;
        console.log(">> Button clicked: work");

        // Disable both buttons
        noWorkBtn.disabled = true;
        workBtn.disabled = true;

        ipcRenderer.send('panic-decision', 'work');
    });
});
