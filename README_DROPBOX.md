# Browser Notes - Dropbox Integration

This Chrome extension allows **any user** to sync their notes to **their own Dropbox account** for backup and cross-device access.

## For Extension Users

Once the extension is properly configured by the developer, any user can:
1. Install the extension
2. Click "Connect to Dropbox" in settings
3. Authorize access to their own Dropbox account
4. Choose where to save their notes in their Dropbox
5. Notes will sync automatically to their personal Dropbox

**Privacy**: Each user's notes are saved to their own Dropbox account. The extension developer and other users cannot access your notes.

## For Extension Developers

### 1. Set up ONE Dropbox App (for all your users)

1. Go to [Dropbox Developer Portal](https://www.dropbox.com/developers/apps)
2. Create a new app with:
   - API: **Scoped access**
   - Access: **App folder** (recommended for security) or **Full Dropbox**
   - Name: Choose a unique name (e.g., "Browser Notes Sync")
3. Note your **App key** from the Settings tab (this is public, safe to share)
4. Set permissions in the Permissions tab:
   - `files.content.write`
   - `files.content.read`
   - `files.metadata.write`
   - `files.metadata.read`

### 2. Configure the Extension

1. Copy `config.example.js` to `config.js`:
   ```bash
   cp config.example.js config.js
   ```

2. Edit `config.js` and replace `YOUR_DROPBOX_APP_KEY` with your app key:
   ```javascript
   window.DROPBOX_CONFIG = {
       APP_KEY: 'your-app-key-here'  // This is safe to distribute
   };
   ```

**Note**: The app key is public and safe to include in your distributed extension. It only identifies your app to Dropbox. Users still need to authenticate with their own Dropbox credentials.

### 3. Build the Extension

```bash
npm install
npm run build
```

### 4. Load the Extension & Get Your Extension ID

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the extension directory (where manifest.json is)
5. **IMPORTANT**: Copy the Extension ID that appears under your extension name
   - It will look like: `kjhgfedcba1234567890abcdefghijkl`
   - This is YOUR development ID (unique to your computer)

### 5. Configure Dropbox OAuth Redirect

1. Go back to [your Dropbox app settings](https://www.dropbox.com/developers/apps)
2. Find the "OAuth 2" section
3. In "Redirect URIs", add your extension's redirect URI:
   ```
   https://YOUR-EXTENSION-ID-HERE.chromiumapp.org/
   ```
   Example with actual ID:
   ```
   https://kjhgfedcba1234567890abcdefghijkl.chromiumapp.org/
   ```
4. Click "Add" to save the redirect URI

**Note for Development**: 
- Each developer on your team will have a different extension ID
- You can add multiple redirect URIs (one for each developer)
- When you publish to Chrome Web Store, you'll get a permanent ID and need to add that too

### 6. Connect to Dropbox

1. Click the extension icon or open a new tab
2. Click the settings icon or go to the extension options
3. Click "Connect to Dropbox"
4. Authorize the app
5. Select or create a file to sync your notes

## Features

### Automatic Syncing
- Notes are automatically synced to Dropbox when you type
- Changes from other devices are synced every 30 seconds
- Manual sync available with "Sync Now" button

### Conflict Resolution
- Automatic conflict detection
- User prompts to resolve conflicts between local and remote versions
- Last-write-wins with user confirmation

### Offline Support
- Notes are stored locally when offline
- Automatic sync when connection is restored

### Security Features
- OAuth 2.0 with PKCE for secure authentication
- Tokens stored securely in Chrome storage
- No app secret stored in the extension
- Automatic token refresh

### Error Handling
- Automatic retry with exponential backoff
- Rate limit handling
- Network error recovery

## File Management

### Creating Files
1. Enter a file name (e.g., "my-notes.txt")
2. Click "Create New File"
3. The file will be created in your Dropbox app folder

### Selecting Files
- Use the dropdown to select existing files
- Only `.txt` files are shown
- Click refresh button to update file list

## Troubleshooting

### "Not authenticated" error
1. Check your app key is correctly set in `config.js`
2. Try disconnecting and reconnecting to Dropbox

### Sync not working
1. Check Auto-sync is enabled in settings
2. Verify the file exists in Dropbox
3. Check browser console for errors

### Extension not loading
1. Ensure you've run `npm run build`
2. Check that all files are present in `dist/` folder
3. Reload the extension in Chrome

## Development

### Project Structure
```
├── src/                    # TypeScript source files
│   ├── NotesAppWithDropbox.ts
│   ├── DropboxService.ts
│   ├── SettingsUI.ts
│   └── RetryHelper.ts
├── dist/                   # Compiled JavaScript
├── config.js              # Your Dropbox configuration
├── manifest.json          # Extension manifest
└── DROPBOX_SETUP_GUIDE.md # Detailed setup guide
```

### Building from Source
```bash
npm install
npm run build
npm test
```

### Key Technologies
- TypeScript for type safety
- Chrome Extension Manifest V3
- Dropbox API v2
- OAuth 2.0 with PKCE

## Privacy & Security

- Your notes are only accessible by you
- Dropbox tokens are stored locally in your browser
- No data is sent to third parties
- The extension only accesses files you explicitly select

## Support

For issues or questions:
1. Check the [setup guide](DROPBOX_SETUP_GUIDE.md)
2. Review browser console for error messages
3. Ensure your Dropbox app is properly configured

## License

MIT