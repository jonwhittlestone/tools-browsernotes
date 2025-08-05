# Browser Notes Page Setup Guide

Browser Notes can be set as your New Tab page (automatic) or Home page (manual setup).

## Option 1: New Tab Page (Automatic) ✅

**This is already configured!** When you install the extension:
- Every new tab will show your Browser Notes
- No manual setup required
- Works automatically for all users

The extension uses Chrome's `chrome_url_overrides` to replace the default new tab page.

## Option 2: Home Page (Manual Setup)

Chrome extensions cannot automatically set themselves as the home page, but you can do it manually:

### Method A: Using Extension URL
1. Load your extension in Chrome
2. Go to `chrome://extensions/`
3. Find Browser Notes and copy the Extension ID
4. Go to Chrome Settings (`chrome://settings/`)
5. Under "On startup" → Select "Open a specific page or set of pages"
6. Click "Add a new page"
7. Enter: `chrome-extension://YOUR-EXTENSION-ID/index.html`
8. Under "Appearance" → Turn on "Show home button"
9. Set home page to: `chrome-extension://YOUR-EXTENSION-ID/index.html`

### Method B: Using Local File (Development Only)
1. Go to Chrome Settings
2. Under "On startup" → Select "Open a specific page"
3. Add: `file:///path/to/your/extension/index.html`

## Which Should You Use?

| Feature | New Tab | Home Page |
|---------|---------|-----------|
| Automatic setup | ✅ Yes | ❌ No |
| User effort | None | Manual setup |
| Access method | Ctrl/Cmd + T | Home button click |
| Usage frequency | High (most users) | Lower |
| Multiple instances | Easy | Single page |

**Recommendation**: Keep the New Tab override as it provides the best user experience with zero configuration.