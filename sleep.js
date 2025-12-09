const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

let config = {};
let episodes = [];
let currentEpisode = null;
const audio = document.getElementById('audio-player');
let playbackSpeed = 1.0;

// Load configuration
function loadConfig() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configData);
        console.log('Config loaded:', config);
    } catch (error) {
        console.error('Error loading config:', error);
        config = {
            podcastDirectory: path.join(require('os').homedir(), 'Podcasts'),
            playedEpisodes: {}
        };
    }
}

// Save configuration
function saveConfig() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Error saving config:', error);
    }
}

// Get audio files from podcast directory
function getEpisodes() {
    try {
        if (!fs.existsSync(config.podcastDirectory)) {
            console.log('Podcast directory does not exist:', config.podcastDirectory);
            return [];
        }

        const files = fs.readdirSync(config.podcastDirectory);
        const audioExtensions = ['.mp3', '.m4a', '.wav', '.ogg', '.aac'];

        const audioFiles = files
            .filter(file => {
                const ext = path.extname(file).toLowerCase();
                return audioExtensions.includes(ext);
            })
            .map(file => {
                const filePath = path.join(config.podcastDirectory, file);
                const stats = fs.statSync(filePath);
                const playedInfo = config.playedEpisodes[file] || { played: false, position: 0 };

                return {
                    name: file,
                    path: filePath,
                    size: stats.size,
                    modified: stats.mtime,
                    played: playedInfo.played,
                    position: playedInfo.position
                };
            });

        return audioFiles;
    } catch (error) {
        console.error('Error getting episodes:', error);
        return [];
    }
}

// Get 3 random unplayed episodes
function getRandomUnplayedEpisodes(allEpisodes, count = 3) {
    const unplayed = allEpisodes.filter(ep => !ep.played);

    if (unplayed.length === 0) {
        // If no unplayed, show 3 most recent
        return allEpisodes
            .sort((a, b) => b.modified - a.modified)
            .slice(0, count);
    }

    // Shuffle and take count
    const shuffled = [...unplayed].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

// Display episode selection
function displayEpisodeSelection() {
    const episodeList = document.getElementById('episode-list');
    const noEpisodes = document.getElementById('no-episodes');
    const podcastPath = document.getElementById('podcast-path');

    podcastPath.textContent = config.podcastDirectory;

    episodes = getEpisodes();
    const selectedEpisodes = getRandomUnplayedEpisodes(episodes);

    if (selectedEpisodes.length === 0) {
        episodeList.innerHTML = '';
        noEpisodes.classList.remove('hidden');
        return;
    }

    noEpisodes.classList.add('hidden');
    episodeList.innerHTML = '';

    selectedEpisodes.forEach(episode => {
        const item = document.createElement('div');
        item.className = 'episode-item';
        item.onclick = () => loadEpisode(episode);

        const name = document.createElement('div');
        name.className = 'episode-name';
        name.textContent = episode.name.replace(/\.[^/.]+$/, ''); // Remove extension

        const meta = document.createElement('div');
        meta.className = 'episode-meta';
        const sizeMB = (episode.size / (1024 * 1024)).toFixed(1);
        const status = episode.played ? '(Played)' : '(New)';
        meta.textContent = `${sizeMB} MB · ${status}`;

        item.appendChild(name);
        item.appendChild(meta);
        episodeList.appendChild(item);
    });
}

// Load and play an episode
function loadEpisode(episode) {
    currentEpisode = episode;

    // Switch to player screen
    document.getElementById('episode-selection').classList.add('hidden');
    document.getElementById('player-screen').classList.remove('hidden');

    // Set episode title
    const title = episode.name.replace(/\.[^/.]+$/, '');
    document.getElementById('episode-title').textContent = title;

    // Load audio
    audio.src = 'file://' + episode.path;

    // Resume from saved position if exists
    if (episode.position > 0) {
        audio.currentTime = episode.position;
    }

    audio.playbackRate = playbackSpeed;
}

// Format time (seconds to MM:SS)
function formatTime(seconds) {
    if (!isFinite(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Update progress bar
function updateProgress() {
    if (!audio.duration) return;

    const percent = (audio.currentTime / audio.duration) * 100;
    document.getElementById('progress-bar').style.width = percent + '%';
    document.getElementById('time-current').textContent = formatTime(audio.currentTime);
    document.getElementById('time-total').textContent = formatTime(audio.duration);

    // Save progress every 5 seconds
    if (currentEpisode && Math.floor(audio.currentTime) % 5 === 0) {
        saveProgress();
    }
}

// Save playback progress
function saveProgress() {
    if (!currentEpisode) return;

    config.playedEpisodes[currentEpisode.name] = {
        played: audio.currentTime > 10, // Mark as played if listened >10 seconds
        position: audio.currentTime
    };

    saveConfig();
}

// Control button handlers
document.getElementById('btn-play-pause').onclick = () => {
    if (audio.paused) {
        audio.play();
        document.getElementById('btn-play-pause').textContent = '⏸ PAUSE';
    } else {
        audio.pause();
        document.getElementById('btn-play-pause').textContent = '▶ PLAY';
    }
};

document.getElementById('btn-back').onclick = () => {
    audio.currentTime = Math.max(0, audio.currentTime - 15);
};

document.getElementById('btn-forward').onclick = () => {
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 15);
};

document.getElementById('btn-speed').onclick = () => {
    const speeds = [1.0, 1.25, 1.5, 2.0];
    const currentIndex = speeds.indexOf(playbackSpeed);
    playbackSpeed = speeds[(currentIndex + 1) % speeds.length];
    audio.playbackRate = playbackSpeed;
    document.getElementById('btn-speed').textContent = playbackSpeed.toFixed(2) + 'x';
};

document.getElementById('btn-back-list').onclick = () => {
    // Back to list is allowed without challenge (staying in sleep mode)
    audio.pause();
    saveProgress();
    audio.src = ''; // Clear audio source
    document.getElementById('player-screen').classList.add('hidden');
    document.getElementById('episode-selection').classList.remove('hidden');
    displayEpisodeSelection();
};

// Progress bar click to seek
document.getElementById('progress-bar-container').onclick = (e) => {
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * audio.duration;
};

// Audio event listeners
audio.addEventListener('timeupdate', updateProgress);

audio.addEventListener('ended', () => {
    if (currentEpisode) {
        config.playedEpisodes[currentEpisode.name] = {
            played: true,
            position: 0
        };
        saveConfig();
    }
    document.getElementById('btn-play-pause').textContent = '▶ PLAY';
});

audio.addEventListener('loadedmetadata', () => {
    document.getElementById('time-total').textContent = formatTime(audio.duration);
});

// Math challenge for exiting sleep mode during restricted hours
let exitMathAnswer = 0;

function generateExitMathChallenge() {
    const num1 = Math.floor(Math.random() * 90) + 10; // 10-99
    const num2 = Math.floor(Math.random() * 90) + 10; // 10-99
    exitMathAnswer = num1 * num2;
    return `${num1} × ${num2}`;
}

function isSleepModeTime() {
    const now = new Date();
    const hours = now.getHours();
    return hours >= 19 && hours < 23; // 7pm (19:00) to 11pm (23:00)
}

function attemptExitSleepMode() {
    if (audio && !audio.paused) {
        audio.pause();
        saveProgress();
    }

    // If it's between 7pm-11pm, require math challenge
    if (isSleepModeTime()) {
        const mathProblem = generateExitMathChallenge();
        document.getElementById('exit-prompt').innerText = `SOLVE TO EXIT SLEEP MODE: ${mathProblem} = ?`;
        document.getElementById('exit-challenge-modal').classList.remove('hidden');
        document.getElementById('exit-input').value = '';
        document.getElementById('exit-input').focus();
    } else {
        // Outside restricted hours, exit normally
        ipcRenderer.send('stop-workspace');
    }
}

// Handle the exit challenge modal input
const exitInput = document.getElementById('exit-input');
exitInput.addEventListener('input', (e) => {
    const userAnswer = parseInt(e.target.value);
    if (userAnswer === exitMathAnswer) {
        document.getElementById('exit-challenge-modal').classList.add('hidden');
        ipcRenderer.send('stop-workspace');
    }
});

// Back button handler
document.getElementById('back-btn').addEventListener('click', () => {
    console.log('>> Back button clicked from sleep mode');
    attemptExitSleepMode();
});

// Handle keyboard shortcut to return to dashboard
document.addEventListener('keydown', (e) => {
    // ESC to close the exit challenge modal
    if (e.key === 'Escape') {
        document.getElementById('exit-challenge-modal').classList.add('hidden');
        document.getElementById('exit-input').value = '';
    }

    // Cmd+[ to return to dashboard
    if ((e.metaKey || e.ctrlKey) && e.key === '[') {
        e.preventDefault();
        console.log('>> Keyboard shortcut (Cmd+[) from sleep mode');
        attemptExitSleepMode();
    }
});

// Initialize on load
loadConfig();
displayEpisodeSelection();
