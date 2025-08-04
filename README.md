# Browser Notes - Chrome Extension

A simple, lightweight note-taking Chrome extension that replaces your new tab page with a persistent notepad. Features include automatic saving to local storage and optional Vim mode for keyboard navigation.

## Screenshots

### Main Interface
![Browser Notes Main Interface](screenshots/main-interface.png)
*Clean, dark-themed note-taking interface that replaces your new tab page*

### Vim Mode
![Vim Mode with Block Cursor](screenshots/vim-mode.png)
*Vim mode enabled with visible block cursor and mode indicator*

### Settings Page
![Extension Settings](screenshots/settings-page.png)
*Settings page with Vim mode toggle and command reference*

> **Note**: Screenshots show the extension in action. To add your own screenshots, create a `screenshots/` directory and capture images of the running extension.

## Features

- **New Tab Override**: Replaces Chrome's new tab page with a note-taking interface
- **Persistent Storage**: Notes are automatically saved to local storage
- **Vim Mode**: Optional Vim-style keyboard navigation and editing
- **Dark Theme**: Easy on the eyes with a modern dark interface
- **Auto-Save**: Notes are saved automatically as you type
- **Settings Page**: Configure Vim mode through the extension settings

## Requirements

- Node.js (latest LTS version recommended)
- npm or yarn
- Chrome or Chromium-based browser

## Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd browser-notes

# Initial setup (installs dependencies, builds project, generates icons)
make setup

# Or manual setup:
npm install
npm run build:icons
npm run build
```

## Installation

### From Source

1. **Build the extension:**
   ```bash
   make setup
   # or manually:
   npm install && npm run build:icons && npm run build
   ```

2. **Load in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right corner
   - Click "Load unpacked" button
   - Select this directory
   - The extension will be installed and active

### Setting as Home Page

To use Browser Notes as your home page:

1. Open Chrome Settings (`chrome://settings/`)
2. In the "On startup" section, select "Open a specific page or set of pages"
3. Click "Add a new page"
4. Enter `chrome://newtab` as the URL
5. Click "Add"

Now clicking the home button will open your notes.

## Usage

### Basic Usage

1. Open a new tab or click the home button (if configured)
2. Start typing your notes in the text area
3. Notes are automatically saved as you type
4. The "Saved" indicator will appear briefly after each save

### Accessing Settings

Right-click on the Browser Notes icon in the toolbar and select "Browser Notes Settings" to configure options.

### Vim Mode

Enable Vim mode in the settings to use keyboard-based navigation and editing.

#### Vim Commands

**Normal Mode Commands:**
- `i` - Enter insert mode at cursor
- `a` - Enter insert mode after cursor
- `o` - Open new line below and enter insert mode
- `O` - Open new line above and enter insert mode
- `v` - Enter visual mode
- `V` - Enter visual line mode

**Navigation:**
- `h` or `←` - Move left
- `j` or `↓` - Move down
- `k` or `↑` - Move up
- `l` or `→` - Move right
- `w` - Jump to next word
- `b` - Jump to previous word
- `0` - Jump to start of line
- `$` - Jump to end of line
- `gg` - Jump to beginning of document
- `G` - Jump to end of document

**Editing:**
- `x` - Delete character under cursor
- `dd` - Delete current line
- `yy` - Copy (yank) current line
- `p` - Paste after cursor
- `P` - Paste before cursor
- `u` - Undo
- `Ctrl+r` - Redo

**Insert Mode:**
- `Esc` or `Ctrl+[` - Return to normal mode

**Visual Mode:**
- `y` - Copy (yank) selection
- `d` or `x` - Delete selection
- `Esc` - Return to normal mode

## Development

### Build System

This project uses a Makefile for consistent builds across different environments:

```bash
# Show available commands
make help

# Initial setup (recommended for first time)
make setup

# Individual commands
make install      # Install dependencies
make build        # Build TypeScript files  
make icons        # Generate extension icons
make test         # Run unit tests
make dev          # Development build (icons + build)
make package      # Create distribution package
make clean        # Clean build artifacts
```

### Project Structure

```
browser-notes/
├── Makefile               # Build system
├── .nvmrc                 # Node.js version
├── manifest.json          # Extension manifest
├── index.html            # New tab page
├── app.js               # Main application logic
├── vim-mode.js          # Vim mode implementation
├── styles.css           # Main styles
├── background.js        # Background service worker
├── settings.html        # Settings page
├── settings.js          # Settings page logic
├── settings.css         # Settings page styles
├── icons/               # Extension icons (generated)
├── screenshots/         # UI screenshots for documentation
├── scripts/             # Build scripts
│   └── generate-icons.js
├── src/                 # TypeScript source files
│   ├── NotesApp.ts
│   ├── VimMode.ts
│   └── __tests__/       # Unit tests
└── README.md
```

### Development Workflow

**First time setup:**
```bash
make setup
```

**Daily development:**
```bash
# Make changes to source files
make dev          # Rebuild icons and TypeScript
make test         # Run tests

# Test in Chrome by reloading the extension
```

**Before committing:**
```bash
make test         # Ensure tests pass
make package      # Verify packaging works
```

**Distribution:**
```bash
make package      # Creates dist/browser-notes-extension.zip
```

### TypeScript Support

The extension includes TypeScript support for better development experience:

```bash
# Build TypeScript files
make build
# or: npm run build

# Run tests  
make test
# or: npm test

# Run tests in watch mode
npm run test:watch

# Generate test coverage report
npm run test:coverage

# Generate icons
make icons
# or: npm run build:icons
```

### Running Tests

The project includes comprehensive unit tests for the main functionality:

1. Install dependencies: `npm install`
2. Run tests: `npm test`
3. Run tests with coverage: `npm run test:coverage`
4. Run tests in watch mode: `npm run test:watch`

Test files are located in `src/__tests__/` and cover:
- Note persistence and auto-save functionality
- Vim mode operations and keyboard handling
- Settings synchronization
- Storage operations

## Browser Compatibility

This extension is designed for Chrome and Chromium-based browsers (Edge, Brave, etc.) that support Manifest V3.

## Privacy

Browser Notes stores all data locally on your device. No data is sent to external servers. The extension requires minimal permissions:
- `storage` - To save notes and settings
- `contextMenus` - To add the settings option to the extension icon context menu

## License

MIT License - Feel free to modify and distribute as needed.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Support

If you encounter any issues or have feature requests, please create an issue on the project repository.