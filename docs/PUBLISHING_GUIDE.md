[Home](index.md) | [Quick Start](README_DROPBOX.md) | [Extension ID](EXTENSION_ID_GUIDE.md) | [Dropbox Setup](DROPBOX_SETUP_GUIDE.md) | [Page Setup](HOME_PAGE_SETUP.md) | [Publishing](PUBLISHING_GUIDE.md) | [Chrome Store](CHROME_STORE_PUBLISHING_GUIDE.md)

---

# Publishing to Chrome Web Store

## Before Publishing

### 1. Production Dropbox App Setup

For a production release, update your Dropbox app:

1. **Add all possible redirect URIs**: Since you won't know the extension ID until published, you'll need to update this after publishing:
   ```
   https://<chrome-store-extension-id>.chromiumapp.org/
   ```

2. **Apply for Production Approval** (if needed):
   - If you expect > 50 users, apply for production approval in Dropbox
   - This removes the user limit on your app

3. **Update App Branding**:
   - Add an app icon in Dropbox developer portal
   - Write a clear description of what your app does
   - This is what users see when authorizing

### 2. Prepare Extension for Distribution

1. **Embed the App Key**: Since the app key is public, you can safely embed it:
   ```javascript
   // In config.js (this file CAN be included in distribution)
   window.DROPBOX_CONFIG = {
       APP_KEY: 'your-production-app-key'
   };
   ```

2. **Build for Production**:
   ```bash
   npm run build
   ```

3. **Create Distribution Package**:
   ```bash
   # Create a zip file with necessary files
   zip -r browser-notes-extension.zip \
     manifest.json \
     index.html \
     settings.html \
     *.css \
     config.js \
     dist/ \
     icons/
   ```

### 3. Chrome Web Store Submission

1. **Update Manifest Permissions**: Ensure manifest.json includes:
   ```json
   {
     "permissions": [
       "storage",
       "identity"
     ],
     "host_permissions": [
       "https://api.dropboxapi.com/*",
       "https://content.dropboxapi.com/*"
     ]
   }
   ```

2. **Privacy Policy**: Create a privacy policy explaining:
   - Extension stores data in user's own Dropbox
   - No data is collected by the developer
   - Each user's data is private to them

3. **Store Listing**: In your Chrome Web Store listing:
   - Clearly state "Syncs with YOUR Dropbox account"
   - Explain users need their own Dropbox account
   - Mention data privacy (only user can access their notes)

### 4. Post-Publishing Steps

1. **Get the Published Extension ID**:
   - Once published, you'll get a permanent extension ID
   - It will look like: `abcdefghijklmnopqrstuvwxyz123456`

2. **Update Dropbox Redirect URI**:
   - Go to Dropbox app settings
   - Add the production redirect URI:
     ```
     https://abcdefghijklmnopqrstuvwxyz123456.chromiumapp.org/
     ```

3. **Test the Published Version**:
   - Install from Chrome Web Store
   - Test Dropbox connection
   - Verify sync works correctly

## User Experience Flow

When users install your extension from the Chrome Web Store:

1. **First Launch**: User opens new tab, sees notes interface
2. **Settings Access**: User clicks settings icon
3. **Dropbox Connection**: 
   - User clicks "Connect to Dropbox"
   - Browser opens Dropbox authorization page
   - User logs into their Dropbox account
   - User approves your app
   - Browser redirects back to extension
4. **File Selection**:
   - User chooses existing file or creates new one
   - Notes start syncing automatically

## Important Considerations

### App Key Security
- The app key is **public** and safe to distribute
- It only identifies your app to Dropbox
- Without user authentication, it cannot access any data
- Never include the app secret (not needed with PKCE)

### User Data Privacy
- Each user's tokens are stored in their browser only
- You (developer) cannot access user data
- Users can revoke access anytime from Dropbox settings
- Extension uninstall removes all stored tokens

### Scaling Considerations
- One Dropbox app serves unlimited extension users
- Each user authenticates independently
- No server infrastructure needed
- All authentication happens client-side

### Support Documentation
Include in your extension:
- Clear setup instructions
- Troubleshooting guide
- FAQ about privacy and data storage
- Link to revoke access: https://www.dropbox.com/account/connected_apps

## Example Store Listing Description

```
Browser Notes with Dropbox Sync

Take notes directly in your browser and sync them securely to YOUR Dropbox account.

Features:
✓ Notes open in every new tab
✓ Sync to your personal Dropbox
✓ Access notes from any device
✓ Your data stays private - only you can access it
✓ Works offline, syncs when connected
✓ Vim mode for power users

How it works:
1. Install the extension
2. Connect your Dropbox account (optional)
3. Choose where to save in YOUR Dropbox
4. Notes sync automatically

Privacy First:
- Your notes are saved to YOUR Dropbox account
- We don't have access to your data
- No analytics or tracking
- Open source and transparent

Requirements:
- Dropbox account (free tier works)
- Chrome browser

Note: This extension requires you to authorize access to your own Dropbox account. Your notes are private and only accessible by you.
```