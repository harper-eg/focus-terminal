# Building Focus Terminal

## Prerequisites
- Node.js and npm installed
- macOS (for building Mac app)

## Development Mode

To run the app in development mode:

```bash
npm start
```

## Building the Application

### Quick Build (Creates distributable app)

To create a distributable `.dmg` and `.zip` file:

```bash
npm run build
```

This will create:
- `dist/Focus Terminal-1.0.0.dmg` - Installable disk image
- `dist/Focus Terminal-1.0.0-mac.zip` - Zip archive of the app

### Install the App

1. Open `dist/Focus Terminal-1.0.0.dmg`
2. Drag "Focus Terminal.app" to your Applications folder
3. Launch from Applications

**Important:** On first launch, macOS may block the app because it's not signed. To allow it:
1. Go to System Preferences → Privacy & Security
2. Click "Open Anyway" next to the blocked app message
3. Or right-click the app and select "Open", then confirm

## Auto-Launch Feature

Once the app is installed to Applications and you launch it **from the Applications folder**, the auto-launch feature will work properly. The app will:
- Automatically start when you log in to your computer
- Launch in kiosk mode immediately
- Auto-enter sleep mode if launched between 7pm-9pm

**Note:** Auto-launch only works when running the built app from Applications, not when running `npm start` in development mode.

## Build Output Structure

```
dist/
├── Focus Terminal-1.0.0.dmg          # Installer
├── Focus Terminal-1.0.0-mac.zip      # Portable archive
└── mac/Focus Terminal.app/           # Built app (inside dmg)
```

## Testing Without Full Build

If you want to test the packaged app without creating a dmg:

```bash
npm run build:dir
```

This creates the app in `dist/mac/Focus Terminal.app` which you can run directly.

## Troubleshooting

**App won't open:**
- Check System Preferences → Privacy & Security
- Try right-clicking and selecting "Open"

**Auto-launch not working:**
- Make sure you're running the built app from Applications folder
- The app needs to be launched at least once manually first
- Check System Preferences → Users & Groups → Login Items

**Config file location:**
- In development (`npm start`): Uses `config.json` in project directory
- In built app: Uses `config.json` packaged with the app
- Each install maintains its own config

## Updating the App

To update:
1. Make your code changes
2. Update version in `package.json`
3. Run `npm run build`
4. Install the new `.dmg` over the old version
