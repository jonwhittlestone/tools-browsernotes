# Browser Notes

A powerful note-taking Chrome extension that replaces your new tab page with a persistent notepad. Features automatic saving, Dropbox sync, Vim mode, and a clean dark interface.

## ✨ Features

- **📝 Instant Access** - Replace new tab with your notes
- **💾 Auto-Save** - Notes saved automatically as you type
- **☁️ Dropbox Sync** - Optional sync across devices
- **🌙 Dark Theme** - Easy on the eyes
- **⌨️ Vim Mode** - For keyboard enthusiasts
- **📅 Date Templates** - Quick journaling entries
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
npm run test         # Run tests
npm run lint         # Lint code
npm run package      # Create distribution zip
```

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
- `dd` - Delete line
- `yy` - Copy line
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