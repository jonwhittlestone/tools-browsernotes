# Chrome Web Store Publishing Guide

This guide walks you through publishing the Browser Notes extension to the Chrome Web Store.

## Prerequisites

- Google account
- $5 USD one-time developer registration fee
- Extension tested locally
- All assets ready (icons, screenshots, descriptions)

## Important: About Your Extension ID

Since you have a `key.pem` file (in .gitignore), your extension already has a permanent ID. When you publish to the Chrome Web Store:

1. **DO NOT** include the `key` field from manifest.json in your published version
2. **DO NOT** include the `key.pem` file in your submission
3. The Chrome Web Store will assign a new permanent ID for the published version

This means you'll have:
- **Local development ID**: Based on your key.pem (for testing)
- **Published ID**: Assigned by Chrome Web Store (for users)

## Step 1: Prepare Your Extension for Publishing

### 1.1 Create a Production Manifest

Create `manifest.prod.json` (copy of manifest.json without the key):

```bash
cp manifest.json manifest.prod.json
```

Then remove the `"key"` field from `manifest.prod.json`.

### 1.2 Update Version Number

In `manifest.prod.json`, ensure you have a proper version:
```json
"version": "1.0.0"
```

### 1.3 Prepare Build Script

Add to `package.json`:
```json
"scripts": {
  "build:prod": "npm run build && npm run package",
  "package": "node scripts/package.js"
}
```

### 1.4 Create Packaging Script

Create `scripts/package.js`:
```javascript
const fs = require('fs');
const archiver = require('archiver');
const path = require('path');

// Create dist-extension directory if it doesn't exist
if (!fs.existsSync('dist-extension')) {
  fs.mkdirSync('dist-extension');
}

// Files and directories to include
const filesToInclude = [
  'manifest.prod.json',
  'index.html',
  'settings.html',
  'styles.css',
  'background.js',
  'config.js',
  'dist/',
  'icons/'
];

// Create a file to stream archive data to
const output = fs.createWriteStream('browser-notes-extension.zip');
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Extension packaged: ${archive.pointer()} total bytes`);
  console.log('Ready to upload: browser-notes-extension.zip');
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Add files to the archive
filesToInclude.forEach(file => {
  if (fs.statSync(file).isDirectory()) {
    archive.directory(file, file);
  } else if (file === 'manifest.prod.json') {
    // Rename manifest.prod.json to manifest.json in the archive
    archive.file(file, { name: 'manifest.json' });
  } else {
    archive.file(file, file);
  }
});

archive.finalize();
```

Install archiver:
```bash
npm install --save-dev archiver
```

## Step 2: Create Store Assets

### 2.1 Required Images

1. **Store Icon**: 128x128 PNG
2. **Screenshots**: At least 1 (1280x800 or 640x400)
3. **Promotional Images** (optional):
   - Small tile: 440x280 PNG
   - Large tile: 920x680 PNG
   - Marquee: 1400x560 PNG

### 2.2 Create Screenshots

1. Load your extension locally
2. Open a new tab showing your notes
3. Take screenshots showing key features:
   - Main notes interface
   - Date entry button
   - Dropbox sync (if configured)
   - Settings page

## Step 3: Register as Chrome Web Store Developer

1. Go to https://chrome.google.com/webstore/devconsole
2. Sign in with your Google account
3. Pay the one-time $5 registration fee
4. Complete your developer profile

## Step 4: Create New Extension Listing

### 4.1 Package Your Extension

```bash
npm run build:prod
```

This creates `browser-notes-extension.zip`.

### 4.2 Upload Extension

1. In Developer Dashboard, click "New Item"
2. Upload `browser-notes-extension.zip`
3. Fill in the listing details:

**Store Listing:**
- **Title**: Browser Notes
- **Summary** (132 chars max): A simple, elegant note-taking app that replaces your new tab page with a persistent notepad
- **Description**:
  ```
  Browser Notes transforms your new tab page into a powerful, always-accessible notepad.

  Features:
  ✓ Instant access - just open a new tab
  ✓ Auto-saves as you type
  ✓ Dark theme for comfortable viewing
  ✓ Date entry templates for journaling
  ✓ Optional Vim mode for power users
  ✓ Dropbox sync to access notes anywhere
  ✓ Privacy-focused - notes stored locally

  Perfect for:
  • Quick thoughts and reminders
  • Daily journaling
  • Meeting notes
  • Code snippets
  • Todo lists

  Your notes are automatically saved locally and optionally synced to Dropbox.
  ```

- **Category**: Productivity
- **Language**: English

### 4.3 Upload Images

1. Upload your 128x128 icon
2. Upload at least one screenshot
3. Add promotional images if available

### 4.4 Privacy Practices

Fill out the privacy questionnaire:
- Single purpose: Note-taking
- Permissions justification:
  - `storage`: Save notes locally
  - `identity`: Dropbox OAuth authentication
  - `contextMenus`: Right-click options
  - Host permissions: Access Dropbox API

### 4.5 Distribution

- **Visibility**: Public
- **Distribution**: All regions

## Step 5: Update Dropbox OAuth Settings

After publishing, you'll get a new extension ID:

1. Copy the published extension ID from the store
2. Go to https://www.dropbox.com/developers/apps
3. Select your app
4. Add the new redirect URI:
   ```
   https://YOUR-PUBLISHED-EXTENSION-ID.chromiumapp.org/
   ```

## Step 6: Submit for Review

1. Review all information
2. Click "Submit for Review"
3. Wait 1-3 business days for approval

## Step 7: Post-Publishing Updates

### For Future Updates:

1. Increment version in `manifest.prod.json`
2. Build and package: `npm run build:prod`
3. Upload new version in Developer Dashboard
4. Add release notes

### Version Control Best Practices:

1. Tag releases in git:
   ```bash
   git tag -a v1.0.0 -m "Initial release"
   git push origin v1.0.0
   ```

2. Keep `manifest.json` (with key) for local development
3. Use `manifest.prod.json` for store releases

## Troubleshooting

### Common Issues:

1. **"Duplicate key" error**: Ensure you removed the "key" field from manifest
2. **Icon issues**: Ensure icons are exactly the specified dimensions
3. **Permission warnings**: Provide clear justifications for all permissions

### Testing Production Build Locally:

1. Remove your development extension
2. Load the unpacked extension from the zip contents
3. Test all features before submission

## Maintenance

- Monitor user reviews and feedback
- Update regularly with bug fixes
- Respond to Chrome Web Store policy changes
- Keep Dropbox OAuth redirect URIs updated

Remember: Your local development will continue using the key.pem-based ID, while published users will use the Chrome Web Store assigned ID.