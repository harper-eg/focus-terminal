const { ipcRenderer } = require('electron');

let statsData = null;

// Request stats data from main process
ipcRenderer.send('get-stats');

// Receive stats data
ipcRenderer.on('stats-data', (event, data) => {
    statsData = data;
    renderStats();
});

function renderStats() {
    if (!statsData) return;

    renderWorkspaceList();
    renderRecentSessions();
    renderTimeChart();
    renderActivityChart();
}

// Render workspace list with bars
function renderWorkspaceList() {
    const container = document.getElementById('workspace-list');
    const workspaceTimes = statsData.workspaceTimes;

    if (Object.keys(workspaceTimes).length === 0) {
        container.innerHTML = '<div class="no-data">No workspace data yet. Start working to see statistics!</div>';
        return;
    }

    // Sort by time (descending)
    const sorted = Object.entries(workspaceTimes)
        .sort((a, b) => b[1] - a[1]);

    const totalTime = sorted.reduce((sum, [, mins]) => sum + mins, 0);
    const maxTime = sorted[0][1];

    // Same colors as the proportional chart
    const colors = [
        '#ff6b6b', // red
        '#51cf66', // green
        '#ffd43b', // yellow
        '#4dabf7', // blue
        '#cc5de8', // magenta
        '#22b8cf', // cyan
        '#adb5bd'  // gray
    ];

    container.innerHTML = '';
    sorted.forEach(([workspace, minutes], index) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        const percentage = Math.round((minutes / totalTime) * 100);

        const barWidth = (minutes / maxTime) * 100;
        const color = colors[index % colors.length];

        const item = document.createElement('div');
        item.className = 'workspace-stat';
        item.innerHTML = `
            <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="workspace-name" style="color: ${color};">${workspace}</span>
                    <span class="workspace-time" style="color: ${color};">${timeStr} (${percentage}%)</span>
                </div>
                <div class="workspace-bar" style="width: ${barWidth}%; background-color: ${color};"></div>
            </div>
        `;
        container.appendChild(item);
    });
}

// Render recent sessions
function renderRecentSessions() {
    const container = document.getElementById('recent-sessions');
    const sessions = statsData.sessions;

    if (sessions.length === 0) {
        container.innerHTML = '<div class="no-data">No sessions recorded yet.</div>';
        return;
    }

    // Show last 10 sessions
    const recentSessions = sessions.slice(-10).reverse();

    container.innerHTML = '';
    recentSessions.forEach(session => {
        const startDate = new Date(session.startTime);
        const dateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timeStr = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        const hours = Math.floor(session.duration / 60);
        const mins = session.duration % 60;
        const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

        const item = document.createElement('div');
        item.className = 'session-item';
        item.innerHTML = `
            <span class="session-workspace">${session.workspace}</span>
            <span class="session-time">${dateStr} ${timeStr}</span>
            <span class="session-duration">${durationStr}</span>
        `;
        container.appendChild(item);
    });
}

// Render ASCII bar chart of total time - with colors!
function renderTimeChart() {
    const container = document.getElementById('time-chart');
    const workspaceTimes = statsData.workspaceTimes;

    if (Object.keys(workspaceTimes).length === 0) {
        container.innerHTML = 'No data to display yet.';
        return;
    }

    // Create proportional bar chart showing distribution
    const sorted = Object.entries(workspaceTimes)
        .sort((a, b) => b[1] - a[1]);

    const totalTime = sorted.reduce((sum, [, mins]) => sum + mins, 0);

    // CSS color codes for different workspaces
    const colors = [
        '#ff6b6b', // red
        '#51cf66', // green
        '#ffd43b', // yellow
        '#4dabf7', // blue
        '#cc5de8', // magenta
        '#22b8cf', // cyan
        '#adb5bd'  // gray
    ];

    // Create a single proportional stacked bar showing distribution with percentages
    const barWidth = 60;
    let stackedBarHTML = '';

    sorted.forEach(([workspace, minutes], index) => {
        const proportion = minutes / totalTime;
        const segmentLength = Math.round(proportion * barWidth);
        const percentage = Math.round((minutes / totalTime) * 100);
        const color = colors[index % colors.length];

        // Create segment with percentage text in the middle if there's enough space
        let segment = '';
        if (segmentLength >= 4) {
            const percentText = `${percentage}%`;
            const padLeft = Math.floor((segmentLength - percentText.length) / 2);
            const padRight = segmentLength - padLeft - percentText.length;

            segment = '█'.repeat(padLeft) + percentText + '█'.repeat(padRight);
        } else {
            segment = '█'.repeat(segmentLength);
        }

        stackedBarHTML += `<span style="color: ${color};">${segment}</span>`;
    });

    // Only show the proportional bar - no breakdown here
    container.innerHTML = stackedBarHTML;
}

// Render activity chart for last 7 days
function renderActivityChart() {
    const container = document.getElementById('activity-chart');
    const sessions = statsData.sessions;

    if (sessions.length === 0) {
        container.textContent = 'No activity data yet.';
        return;
    }

    // Get last 7 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dayData = [];
    const dayLabels = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);

        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        // Sum minutes for this day
        const minutesThisDay = sessions
            .filter(s => {
                const sessionDate = new Date(s.startTime);
                return sessionDate >= date && sessionDate < nextDate;
            })
            .reduce((sum, s) => sum + s.duration, 0);

        dayData.push(minutesThisDay);
        dayLabels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
    }

    // Check if we have any data
    if (dayData.every(d => d === 0)) {
        container.textContent = 'No activity in the last 7 days.';
        return;
    }

    // Simple bar chart
    let chart = '';
    const maxMinutes = Math.max(...dayData);
    const barWidth = 40;

    dayData.forEach((minutes, index) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

        const barLength = maxMinutes > 0 ? Math.ceil((minutes / maxMinutes) * barWidth) : 0;
        const bar = '█'.repeat(barLength);

        chart += `${dayLabels[index].padEnd(4)} │ ${bar} ${timeStr}\n`;
    });

    container.textContent = chart;
}

// Back button handler
document.getElementById('back-btn').addEventListener('click', () => {
    console.log('>> Back button clicked - Returning to dashboard');
    ipcRenderer.send('stop-workspace');
});

// Handle keyboard shortcut to return to dashboard
document.addEventListener('keydown', (e) => {
    // Cmd+[ to return to dashboard
    if ((e.metaKey || e.ctrlKey) && e.key === '[') {
        e.preventDefault();
        console.log('>> Keyboard shortcut (Cmd+[) - Returning to dashboard from stats');
        ipcRenderer.send('stop-workspace');
    }
});
