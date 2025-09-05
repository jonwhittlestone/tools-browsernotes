# Browser Notes

A powerful note-taking Chrome extension that replaces your new tab page with a persistent notepad. Features automatic saving, Dropbox sync, Vim mode, and a clean dark interface.

## ✨ Features

- **📝 Instant Access** - Replace new tab with your notes
- **💾 Auto-Save** - Notes saved automatically as you type
- **☁️ Dropbox Sync** - Optional sync across devices
- **🌙 Dark Theme** - Easy on the eyes
- **⌨️ Vim Mode** - For keyboard enthusiasts with full undo/redo support
- **📅 Date Templates** - Quick journaling entries
- **📦 Task Archiving** - Automatically archive completed tasks
- **🔒 Privacy First** - All data stored locally

## 🚀 Quick Start

```bash
# Clone and setup
git clone https://github.com/yourusername/browser-notes.git
cd browser-notes
npm install
npm run build

# Load in Chrome
1. Open chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this directory
```

## 📚 Documentation

Visit our comprehensive documentation in the [docs/](docs/) directory:

- **[Quick Start Guide](docs/README_DROPBOX.md)** - Get up and running
- **[Dropbox Setup](docs/DROPBOX_SETUP_GUIDE.md)** - Enable sync
- **[Publishing Guide](docs/CHROME_STORE_PUBLISHING_GUIDE.md)** - Deploy to Chrome Web Store
- **[All Documentation →](docs/index.md)**

## 🛠️ Development

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Chrome browser

### Build Commands

```bash
npm run build        # Build the extension
npm test             # Run tests (also: make test)
npm run lint         # Lint code
npm run package      # Create distribution zip
```

### Make Commands

```bash
make install         # Install dependencies
make build          # Build TypeScript files
make test           # Run unit tests
make clean          # Clean build artifacts
make dev            # Development build (build + icons)
make package        # Create extension package
```

### Testing & Quality Assurance

This project includes comprehensive testing and code quality measures:

**Running Tests:**
```bash
npm test             # Run all tests
make test           # Alternative via Makefile
```

**Pre-commit Hooks:**
- **Husky** automatically runs tests before each commit
- **Commits are blocked** if any tests fail
- Ensures main branch always has working code
- No manual intervention needed - just commit normally

**Test Coverage:**
- ✅ **Core App Functionality** - Note saving, loading, UI interactions
- ✅ **Vim Mode** - All vim commands including undo/redo system  
- ✅ **Task Management** - Task counting, archiving functionality
- ✅ **Retry Logic** - Network request resilience

### Project Structure

```
browser-notes/
├── src/                  # TypeScript source files
├── dist/                 # Built JavaScript files
├── docs/                 # Documentation
├── icons/                # Extension icons
├── manifest.json         # Extension manifest
├── index.html           # Main notes interface
├── settings.html        # Settings page
└── webpack.config.js    # Build configuration
```

## ⌨️ Keyboard Shortcuts

### Standard Mode
- `Ctrl/Cmd + S` - Manual sync (when Dropbox enabled)

### Vim Mode (when enabled)
- `i` - Insert mode
- `Esc` - Normal mode
- `dd` - Delete line (archives tasks automatically)
- `u` - Undo
- `U` - Redo
- `yy` - Copy line
- `p/P` - Paste after/before cursor
- [Full Vim commands →](docs/index.md)

## 🤝 Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file

## 🔗 Links

- [Documentation](docs/index.md)
- [Report Issues](https://github.com/yourusername/browser-notes/issues)
- [Chrome Web Store](#) (coming soon)

---

Made with ❤️ for note-takers everywhere