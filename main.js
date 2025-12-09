const { app, BrowserWindow, ipcMain, screen, shell, globalShortcut, powerMonitor } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let mainWindow;
let overlayWindow;
let panicCountdownWindow;
let panicLinksWindow;
let blockerWindows = []; // Black screens for non-target displays
let isQuitting = false;
let targetDisplay = null; // Track which display to use

// Statistics tracking
let currentWorkspace = null;
let workspaceStartTime = null;
let statsConfig = null;

// Panic mode configuration
let panicModeFilePath = null; // Will be set by user
let panicDecision = null; // Track whether user chose 'work' or 'no-work'
let coldTurkeyOverlay = null; // Cold Turkey activation overlay
let panicModeActive = false; // Track if panic mode is currently running

// Load or initialize statistics configuration
function loadStatsConfig() {
    try {
        const statsPath = path.join(__dirname, 'stats.json');
        if (fs.existsSync(statsPath)) {
            const data = fs.readFileSync(statsPath, 'utf8');
            statsConfig = JSON.parse(data);
        } else {
            // Initialize new stats file
            statsConfig = {
                workspaceTimes: {},
                sessions: []
            };
            saveStatsConfig();
        }
    } catch (error) {
        console.error('Error loading stats config:', error);
        statsConfig = {
            workspaceTimes: {},
            sessions: []
        };
    }
}

function saveStatsConfig() {
    try {
        const statsPath = path.join(__dirname, 'stats.json');
        fs.writeFileSync(statsPath, JSON.stringify(statsConfig, null, 2));
    } catch (error) {
        console.error('Error saving stats config:', error);
    }
}

// Start tracking a workspace session
function startWorkspaceTracking(workspaceName) {
    currentWorkspace = workspaceName;
    workspaceStartTime = Date.now();
    console.log(`>> Started tracking: ${workspaceName}`);
}

// Stop tracking and save the session
function stopWorkspaceTracking() {
    if (!currentWorkspace || !workspaceStartTime) return;

    const duration = Date.now() - workspaceStartTime;
    const durationMinutes = Math.floor(duration / 60000);

    // Update total time for this workspace
    if (!statsConfig.workspaceTimes[currentWorkspace]) {
        statsConfig.workspaceTimes[currentWorkspace] = 0;
    }
    statsConfig.workspaceTimes[currentWorkspace] += durationMinutes;

    // Record session
    statsConfig.sessions.push({
        workspace: currentWorkspace,
        startTime: workspaceStartTime,
        endTime: Date.now(),
        duration: durationMinutes
    });

    // Keep only last 100 sessions
    if (statsConfig.sessions.length > 100) {
        statsConfig.sessions = statsConfig.sessions.slice(-100);
    }

    saveStatsConfig();
    console.log(`>> Stopped tracking ${currentWorkspace}: ${durationMinutes} minutes`);

    currentWorkspace = null;
    workspaceStartTime = null;
}

// Get the display to use for windows
function getTargetDisplay() {
    const displays = screen.getAllDisplays();

    // If we have a saved target, check if it's still valid
    if (targetDisplay) {
        const stillExists = displays.find(d => d.id === targetDisplay.id);
        if (stillExists) {
            return stillExists;
        }
    }

    // Default to primary display
    // Future enhancement: could detect largest display, or add user selection UI
    targetDisplay = screen.getPrimaryDisplay();
    console.log(`>> Using display: ${targetDisplay.id} (${targetDisplay.bounds.width}x${targetDisplay.bounds.height})`);

    return targetDisplay;
}

// Create black blocker windows for all non-target displays
function createBlockerWindows() {
    const allDisplays = screen.getAllDisplays();
    const target = getTargetDisplay();

    // Close any existing blocker windows
    destroyBlockerWindows();

    // Create blocker for each non-target display
    allDisplays.forEach(display => {
        if (display.id !== target.id) {
            const { x, y, width, height } = display.bounds;
            const blocker = new BrowserWindow({
                x: x,
                y: y,
                width: width,
                height: height,
                backgroundColor: '#000000',
                frame: false,
                show: false,
                skipTaskbar: true,
                alwaysOnTop: true,
                focusable: false,
                webPreferences: {
                    nodeIntegration: false
                }
            });

            // Load black screen HTML
            blocker.loadFile('blocker.html');

            // Prevent blocker from closing unless app is quitting
            blocker.on('close', (e) => {
                if (!isQuitting) {
                    e.preventDefault();
                }
            });

            blocker.webContents.once('did-finish-load', () => {
                blocker.setKiosk(true);
                blocker.show();
            });

            blockerWindows.push(blocker);
            console.log(`>> Created blocker for display ${display.id} (${width}x${height})`);
        }
    });
}

// Destroy all blocker windows
function destroyBlockerWindows() {
    blockerWindows.forEach(blocker => {
        if (blocker && !blocker.isDestroyed()) {
            blocker.destroy();
        }
    });
    blockerWindows = [];
}

// Cycle to the next display
function cycleToNextDisplay() {
    const displays = screen.getAllDisplays();
    if (displays.length <= 1) {
        console.log('>> Only one display available');
        return;
    }

    const currentTarget = getTargetDisplay();
    const currentIndex = displays.findIndex(d => d.id === currentTarget.id);
    const nextIndex = (currentIndex + 1) % displays.length;
    const nextDisplay = displays[nextIndex];

    console.log(`>> Switching from display ${currentTarget.id} (${currentTarget.bounds.width}x${currentTarget.bounds.height}) to ${nextDisplay.id} (${nextDisplay.bounds.width}x${nextDisplay.bounds.height})`);

    // Update target before recreating
    targetDisplay = nextDisplay;

    // Recreate the dashboard on the new display
    if (mainWindow) {
        console.log('>> Closing old dashboard window...');
        mainWindow.destroy();

        setTimeout(() => {
            console.log('>> Creating dashboard on new display...');
            createDashboard();

            // Wait for dashboard to be ready, then update overlay and blockers
            setTimeout(() => {
                console.log('>> Updating overlay and blockers...');

                // Move overlay to new display if it exists
                if (overlayWindow) {
                    const { x: displayX, y: displayY, height: displayHeight } = nextDisplay.workArea;
                    overlayWindow.setBounds({
                        x: displayX + 20,
                        y: displayY + displayHeight - 160,
                        width: 180,
                        height: 140
                    });
                }

                // Recreate blocker windows for the new configuration
                createBlockerWindows();
                console.log(`>> Display switch complete!`);
            }, 1500);
        }, 100);
    }
}

// 1. CLEAN STARTUP: Only create the Dashboard
function createDashboard() {
    console.log(">> STARTUP: Creating Dashboard...");
    const display = getTargetDisplay();
    const { x, y, width, height } = display.workArea;

    mainWindow = new BrowserWindow({
        x: x,
        y: y,
        width: width,
        height: height,
        backgroundColor: '#000000',
        show: false, 
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            partition: 'persist:main',
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        }
    });

    mainWindow.loadFile('index.html');

    // Wait for the page to fully load (including all scripts)
    mainWindow.webContents.once('did-finish-load', () => {
        // Match the exact order used in showDashboard()
        mainWindow.setKiosk(true);
        mainWindow.show();
        mainWindow.focus();

        // Give the window and iframe time to settle, then force calendar reload
        setTimeout(() => {
            mainWindow.webContents.send('force-repaint');
            console.log(">> Dashboard Ready & Focused.");

            // Check if we should auto-enter sleep mode (7pm-11pm)
            if (isSleepModeTime()) {
                console.log(">> Auto-entering Sleep Mode (7pm-11pm window)");
                setTimeout(() => {
                    startSleepMode();
                }, 1000);
            }
        }, 200);
    });

    // Standard Handlers
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.includes('google.com') || url.includes('accounts')) return { action: 'allow' };
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault();
            mainWindow.webContents.send('attempt-close'); 
        }
    });
}

// 2. LAZY LOAD: Create Overlay only when needed
function createOverlay() {
    if (overlayWindow) return; // Already exists? Skip.

    console.log(">> INIT: Creating Overlay Window...");
    const display = getTargetDisplay();
    const { x: displayX, y: displayY, height } = display.workArea;

    overlayWindow = new BrowserWindow({
        width: 180,
        height: 140,
        x: displayX + 20,  // 20px from left edge of target display
        y: displayY + height - 160,  // 160px from bottom of target display
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        show: false,
        focusable: false, // Key Fix: Overlay should never steal focus!
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    overlayWindow.loadFile('overlay.html');

    // Set up workspace visibility
    try {
        overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch (e) { console.log(e); }
}

// Check if current time is between 7pm and 11pm
function isSleepModeTime() {
    const now = new Date();
    const hours = now.getHours();
    return hours >= 19 && hours < 23; // 7pm (19:00) to 11pm (23:00)
}

// 3. SLEEP MODE: Load sleep page into main window
function startSleepMode() {
    console.log(">> INIT: Starting Sleep Mode...");

    if (mainWindow) {
        // Load sleep.html into the main window
        mainWindow.loadFile('sleep.html');

        mainWindow.webContents.once('did-finish-load', () => {
            console.log(">> Sleep Mode Ready.");
        });
    }
}

// 4. STATISTICS MODE: Load stats page into main window
function startStatsMode() {
    console.log(">> INIT: Starting Statistics Mode...");

    if (mainWindow) {
        // Load stats.html into the main window
        mainWindow.loadFile('stats.html');

        mainWindow.webContents.once('did-finish-load', () => {
            console.log(">> Statistics Mode Ready.");
        });
    }
}

// Exit sleep mode and return to dashboard
function exitSleepMode() {
    console.log(">> Exiting Sleep Mode...");

    if (mainWindow) {
        // Reload the dashboard
        mainWindow.loadFile('index.html');

        mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.setKiosk(true);
            mainWindow.show();
            mainWindow.focus();

            setTimeout(() => {
                mainWindow.webContents.send('force-repaint');
                console.log(">> Back to Dashboard.");
            }, 200);
        });
    }
}

// Load panic mode file path configuration
function loadPanicModeConfig() {
    try {
        const configPath = path.join(__dirname, 'panic-config.json');
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(data);
            panicModeFilePath = config.linkDumpPath || null;
            console.log(`>> Panic mode file path loaded: ${panicModeFilePath}`);
        } else {
            console.log('>> No panic mode config found. User needs to set link dump path.');
        }
    } catch (error) {
        console.error('Error loading panic mode config:', error);
    }
}

// Save panic mode file path configuration
function savePanicModeConfig(filePath) {
    try {
        const configPath = path.join(__dirname, 'panic-config.json');
        const config = { linkDumpPath: filePath };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        panicModeFilePath = filePath;
        console.log(`>> Panic mode file path saved: ${filePath}`);
    } catch (error) {
        console.error('Error saving panic mode config:', error);
    }
}

// Start panic mode - create overlay windows
function startPanicMode() {
    // Prevent multiple activations
    if (panicModeActive) {
        console.log(">> Panic mode already active, ignoring hotkey");
        return;
    }

    console.log(">> PANIC MODE ACTIVATED!");
    panicModeActive = true;

    if (!panicModeFilePath) {
        console.log(">> ERROR: No link dump file path configured!");
        panicModeActive = false;
        return;
    }

    const display = getTargetDisplay();
    const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = display.workArea;

    // Create countdown overlay (top middle of screen)
    panicCountdownWindow = new BrowserWindow({
        width: 200,
        height: 120,
        x: displayX + (displayWidth / 2) - 100,  // Center horizontally
        y: displayY + 50,  // 50px from top
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        show: false,
        focusable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    panicCountdownWindow.loadFile('panic.html');
    panicCountdownWindow.webContents.once('did-finish-load', () => {
        panicCountdownWindow.show();
        console.log(">> Panic countdown overlay shown");
    });

    // Create link input overlay (middle right side of screen)
    panicLinksWindow = new BrowserWindow({
        width: 460,
        height: 260,
        x: displayX + displayWidth - 480,  // 20px from right edge
        y: displayY + (displayHeight / 2) - 130,  // Center vertically
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        show: false,
        focusable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    panicLinksWindow.loadFile('links.html');
    panicLinksWindow.webContents.once('did-finish-load', () => {
        panicLinksWindow.show();
        panicLinksWindow.focus();
        console.log(">> Panic links overlay shown");
    });

    // Set up workspace visibility
    try {
        panicCountdownWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        panicLinksWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch (e) {
        console.log(e);
    }
}

// Save panic mode links to the markdown file
function savePanicLinks(links) {
    if (!panicModeFilePath) {
        console.error('>> ERROR: No link dump file path configured!');
        return;
    }

    try {
        const timestamp = new Date().toISOString();
        const formattedLinks = links.map(link => `- ${link}`).join('\n');
        const entry = `\n## Panic Save - ${timestamp}\n${formattedLinks}\n`;

        // Append to the markdown file
        fs.appendFileSync(panicModeFilePath, entry, 'utf8');
        console.log(`>> Saved ${links.length} link(s) to ${panicModeFilePath}`);
    } catch (error) {
        console.error('>> ERROR saving panic links:', error);
    }
}

// Exit panic mode - close overlays and show decision menu
function exitPanicMode() {
    console.log(">> Exiting Panic Mode initial phase...");

    if (panicCountdownWindow && !panicCountdownWindow.isDestroyed()) {
        panicCountdownWindow.destroy();
        panicCountdownWindow = null;
    }

    if (panicLinksWindow && !panicLinksWindow.isDestroyed()) {
        panicLinksWindow.destroy();
        panicLinksWindow = null;
    }

    // Show decision menu
    showPanicDecisionMenu();
}

// Show the panic decision menu
function showPanicDecisionMenu() {
    console.log(">> Showing panic decision menu...");

    if (mainWindow) {
        mainWindow.loadFile('panic-decision.html');

        mainWindow.webContents.once('did-finish-load', () => {
            // Exit kiosk mode first, then use fullscreen so window can be hidden later
            mainWindow.setKiosk(false);
            mainWindow.setFullScreen(true);
            mainWindow.show();
            mainWindow.focus();
            console.log(">> Panic decision menu ready");
        });
    }
}

// Start Cold Turkey activation - go to desktop and show overlay
function startColdTurkeyActivation(decision) {
    console.log(`>> Starting Cold Turkey activation for: ${decision}`);
    panicDecision = decision;

    // Immediately hide the decision screen and exit kiosk mode
    if (mainWindow) {
        // Force exit kiosk mode and fullscreen mode
        console.log(">> Exiting kiosk and hiding decision screen");
        mainWindow.setKiosk(false);

        // Listen for when fullscreen transition completes
        const onLeaveFullscreen = () => {
            console.log(">> Fullscreen exited, now hiding window");
            mainWindow.hide();

            setTimeout(() => {
                if (mainWindow.isVisible()) {
                    console.log(">> WARNING: Window still visible, minimizing");
                    mainWindow.minimize();
                } else {
                    console.log(">> Main window successfully hidden, desktop visible");
                }
            }, 50);
        };

        // If already not fullscreen, hide immediately
        if (!mainWindow.isFullScreen()) {
            console.log(">> Window not fullscreen, hiding immediately");
            mainWindow.hide();
            setTimeout(() => {
                if (mainWindow.isVisible()) {
                    console.log(">> WARNING: Window still visible, minimizing");
                    mainWindow.minimize();
                } else {
                    console.log(">> Main window successfully hidden, desktop visible");
                }
            }, 50);
        } else {
            // Wait for fullscreen to exit
            mainWindow.once('leave-full-screen', onLeaveFullscreen);
            mainWindow.setFullScreen(false);
        }

        // Run Cold Turkey shortcut (regardless of fullscreen state)
        const child = spawn('/usr/bin/shortcuts', ['run', 'Cold Turkey'], {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();

        // Create Cold Turkey overlay at top of screen
        const display = getTargetDisplay();
        const { x: displayX, y: displayY, width: displayWidth } = display.workArea;

        coldTurkeyOverlay = new BrowserWindow({
            width: displayWidth,
            height: 200,
            x: displayX,
            y: displayY,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            resizable: false,
            show: false,
            focusable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        coldTurkeyOverlay.loadFile('cold-turkey.html');
        coldTurkeyOverlay.webContents.once('did-finish-load', () => {
            coldTurkeyOverlay.show();
            console.log(">> Cold Turkey overlay shown on desktop");
        });

        try {
            coldTurkeyOverlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        } catch (e) {
            console.log(e);
        }
    }
}

// Cold Turkey countdown finished - proceed based on decision
function finishColdTurkeyActivation() {
    console.log(`>> Cold Turkey activation finished. Decision: ${panicDecision}`);

    // Close Cold Turkey overlay properly
    if (coldTurkeyOverlay && !coldTurkeyOverlay.isDestroyed()) {
        coldTurkeyOverlay.hide();
        coldTurkeyOverlay.close();
        setTimeout(() => {
            if (coldTurkeyOverlay && !coldTurkeyOverlay.isDestroyed()) {
                coldTurkeyOverlay.destroy();
            }
            coldTurkeyOverlay = null;
            console.log(">> Cold Turkey overlay destroyed");
        }, 100);
    }

    const savedDecision = panicDecision;
    panicDecision = null;

    // Wait for overlay to close before proceeding
    setTimeout(() => {
        if (savedDecision === 'work') {
            // Go to dashboard - reset panic mode flag
            console.log(">> Proceeding to dashboard (user wants to work)");
            panicModeActive = false;
            showDashboard();
        } else if (savedDecision === 'no-work') {
            // Show break countdown (flag will be reset after break countdown)
            console.log(">> Proceeding to break countdown (user doesn't want to work)");
            showBreakCountdown();
        }
    }, 200);
}

// Show break countdown (1 minute)
function showBreakCountdown() {
    console.log(">> Starting break countdown...");

    if (mainWindow) {
        // First ensure main window is shown
        mainWindow.show();

        mainWindow.loadFile('break-countdown.html');

        mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.setKiosk(true);
            mainWindow.show();
            mainWindow.focus();
            console.log(">> Break countdown ready and visible");
        });
    }
}

app.whenReady().then(() => {
    // Load statistics configuration
    loadStatsConfig();

    // Load panic mode configuration
    loadPanicModeConfig();

    // Enable auto-launch on startup
    app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: false
    });

    createDashboard();
    createBlockerWindows(); // Block all other displays

    // Handle system wake - always clean up and return to proper state
    powerMonitor.on('unlock-screen', () => {
        console.log(">> System woke up from sleep");

        // Stop any active workspace tracking
        stopWorkspaceTracking();

        // Check if we should show sleep mode after cleanup
        const shouldShowSleepMode = isSleepModeTime();

        // Always perform cleanup, regardless of time
        console.log(">> System wake - cleaning up and returning to main menu");
        if (mainWindow) {
            // If we were in a workspace, close overlay
            if (overlayWindow && !overlayWindow.isDestroyed()) {
                overlayWindow.hide();
            }

            // Close any panic mode windows
            if (panicCountdownWindow && !panicCountdownWindow.isDestroyed()) {
                panicCountdownWindow.destroy();
                panicCountdownWindow = null;
            }
            if (panicLinksWindow && !panicLinksWindow.isDestroyed()) {
                panicLinksWindow.destroy();
                panicLinksWindow = null;
            }
            if (coldTurkeyOverlay && !coldTurkeyOverlay.isDestroyed()) {
                coldTurkeyOverlay.destroy();
                coldTurkeyOverlay = null;
            }

            // Reset panic mode state
            panicModeActive = false;
            panicDecision = null;

            // Load dashboard first
            mainWindow.loadFile('index.html');
            mainWindow.webContents.once('did-finish-load', () => {
                // First, make sure window is visible and focused
                mainWindow.show();
                mainWindow.focus();
                
                // Give macOS time to actually focus the window, then enable kiosk
                setTimeout(() => {
                    mainWindow.setKiosk(true);
                    
                    setTimeout(() => {
                        mainWindow.webContents.send('force-repaint');
                        console.log(">> Dashboard restored after system wake");

                        if (shouldShowSleepMode) {
                            console.log(">> System wake during sleep mode hours - transitioning to sleep mode");
                            setTimeout(() => {
                                startSleepMode();
                            }, 500);
                        }
                    }, 200);
                }, 50); // Small delay to let focus actually take effect

                createBlockerWindows();
            });
        }
    });

    globalShortcut.register('Command+[', () => {
        showDashboard();
    });

    globalShortcut.register('Command+Option+M', () => {
        cycleToNextDisplay();
    });

    // Panic mode hotkey - Cmd+0
    globalShortcut.register('Command+0', () => {
        startPanicMode();
    });

    // Check every minute if it's 7pm and we should auto-enter sleep mode
    let wasInSleepModeTime = isSleepModeTime();
    setInterval(() => {
        const nowInSleepModeTime = isSleepModeTime();

        // If we just entered the 7pm-11pm window and we're on the dashboard
        if (nowInSleepModeTime && !wasInSleepModeTime) {
            if (mainWindow && !mainWindow.webContents.getURL().includes('sleep.html')) {
                console.log(">> 7pm reached - Auto-entering Sleep Mode");
                startSleepMode();
            }
        }

        wasInSleepModeTime = nowInSleepModeTime;
    }, 60000); // Check every minute

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createDashboard();
        else showDashboard();
    });

    // Handle display changes (monitors added/removed/reconfigured)
    screen.on('display-added', (_event, newDisplay) => {
        console.log(`>> Display added: ${newDisplay.id}`);
        // Recreate blocker windows to include the new display
        createBlockerWindows();
    });

    screen.on('display-removed', (_event, oldDisplay) => {
        console.log(`>> Display removed: ${oldDisplay.id}`);
        // If the removed display was our target, switch to primary
        if (targetDisplay && targetDisplay.id === oldDisplay.id) {
            console.log('>> Target display removed, switching to primary');
            targetDisplay = null;
            // Recreate windows on the new display
            if (mainWindow) {
                const display = getTargetDisplay();
                const { x, y, width, height } = display.workArea;
                mainWindow.setBounds({ x, y, width, height });
            }
        }
        // Recreate blocker windows for remaining displays
        createBlockerWindows();
    });

    screen.on('display-metrics-changed', (_event, changedDisplay, changedMetrics) => {
        console.log(`>> Display metrics changed: ${changedDisplay.id}`, changedMetrics);
        // If our target display changed, update window bounds
        if (targetDisplay && targetDisplay.id === changedDisplay.id) {
            targetDisplay = changedDisplay;
            if (mainWindow) {
                const { x, y, width, height } = changedDisplay.workArea;
                mainWindow.setBounds({ x, y, width, height });
            }
            // Update overlay position if it exists
            if (overlayWindow) {
                const { x: displayX, y: displayY, height: displayHeight } = changedDisplay.workArea;
                overlayWindow.setBounds({
                    x: displayX + 20,
                    y: displayY + displayHeight - 160,
                    width: 180,
                    height: 140
                });
            }
        }
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    destroyBlockerWindows();
});

// --- LOGIC ---

function showDashboard() {
    // Stop tracking current workspace
    stopWorkspaceTracking();

    // If we're in sleep mode or stats mode, exit it first
    if (mainWindow && mainWindow.webContents.getURL().includes('sleep.html')) {
        exitSleepMode();
        return;
    }

    if (mainWindow && mainWindow.webContents.getURL().includes('stats.html')) {
        // Exit stats mode - reload dashboard
        mainWindow.loadFile('index.html');

        mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.setKiosk(true);
            mainWindow.show();
            mainWindow.focus();

            setTimeout(() => {
                mainWindow.webContents.send('force-repaint');
                console.log(">> Returned to Dashboard from Stats.");
            }, 200);
        });
        return;
    }

    // If we're in panic decision mode, reload to dashboard and show it
    // (This is called after Cold Turkey/break countdown finishes)
    if (mainWindow && mainWindow.webContents.getURL().includes('panic-decision.html')) {
        mainWindow.loadFile('index.html');

        mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.setKiosk(true);
            mainWindow.show();
            mainWindow.focus();

            setTimeout(() => {
                mainWindow.webContents.send('force-repaint');
                console.log(">> Dashboard loaded and shown after panic flow.");
            }, 200);

            // Recreate blocker windows when returning to dashboard
            createBlockerWindows();
            console.log(">> Blocker windows recreated for dashboard mode");
        });
        return;
    }

    if (mainWindow) {
        mainWindow.setKiosk(true);
        mainWindow.show();
        mainWindow.focus();
    }
    if (overlayWindow) {
        overlayWindow.hide();
    }

    // Recreate blocker windows when returning to dashboard
    createBlockerWindows();
    console.log(">> Blocker windows recreated for dashboard mode");
}

function startWorkspaceMode(workspaceName) {
    // Start tracking this workspace
    startWorkspaceTracking(workspaceName);

    // 1. Ensure Overlay Exists
    createOverlay();

    const fullName = `${workspaceName}`;
    console.log(`> LAUNCHING: ${fullName}`);

    // 2. Run Shortcut
    const child = spawn('/usr/bin/shortcuts', ['run', fullName], {
        detached: true,
        stdio: 'ignore'
    });
    child.unref();

    // 3. Transition
    if (mainWindow) {
        mainWindow.setKiosk(false);
        mainWindow.setFullScreen(false);

        setTimeout(() => {
            mainWindow.hide();

            // Destroy blocker windows when entering workspace mode
            destroyBlockerWindows();
            console.log(">> Blocker windows destroyed for workspace mode");

            // 4. Show Overlay
            if (overlayWindow) {
                overlayWindow.show();
                // Set Opacity: 0 = Ghost Mode, 1.0 = Debug Mode
                overlayWindow.setOpacity(0);
                overlayWindow.webContents.send('start-timer', workspaceName);
            }
        }, 1000);
    }
}

// --- IPC EVENTS ---

ipcMain.on('run-shortcut', (_event, shortcutName) => {
    startWorkspaceMode(shortcutName);
});

ipcMain.on('run-sleep-mode', () => {
    startSleepMode();
});

ipcMain.on('run-stats-mode', () => {
    startStatsMode();
});

ipcMain.on('get-stats', (event) => {
    event.reply('stats-data', statsConfig);
});

ipcMain.on('stop-workspace', () => {
    showDashboard();
});

ipcMain.on('overlay-hover', (_event, state) => {
    if (!overlayWindow) return;
    if (state === 'enter') overlayWindow.setOpacity(1.0);
    if (state === 'leave') overlayWindow.setOpacity(0);
});

ipcMain.on('force-quit', () => {
    isQuitting = true;
    app.quit();
});

// Panic mode IPC handlers
ipcMain.on('panic-countdown-finished', () => {
    console.log(">> Panic countdown finished!");
    // Tell the links window to save and exit
    if (panicLinksWindow && !panicLinksWindow.isDestroyed()) {
        panicLinksWindow.webContents.send('countdown-finished');
    }
});

ipcMain.on('save-panic-links', (_event, links) => {
    savePanicLinks(links);
});

ipcMain.on('exit-panic-mode', () => {
    exitPanicMode();
});

ipcMain.on('panic-decision', (_event, decision) => {
    console.log(`>> Panic decision: ${decision}`);
    startColdTurkeyActivation(decision);
});

ipcMain.on('cold-turkey-countdown-finished', () => {
    console.log(">> Cold Turkey countdown finished");
    finishColdTurkeyActivation();
});

ipcMain.on('break-countdown-finished', () => {
    console.log(">> Break countdown finished");
    panicModeActive = false; // Reset panic mode flag
    showDashboard();
});

ipcMain.on('set-panic-file-path', (_event, filePath) => {
    savePanicModeConfig(filePath);
});