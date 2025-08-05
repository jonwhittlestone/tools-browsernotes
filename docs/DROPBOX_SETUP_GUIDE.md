[Home](index.md) | [Quick Start](README_DROPBOX.md) | [Extension ID](EXTENSION_ID_GUIDE.md) | [Dropbox Setup](DROPBOX_SETUP_GUIDE.md) | [Page Setup](HOME_PAGE_SETUP.md) | [Publishing](PUBLISHING_GUIDE.md) | [Chrome Store](CHROME_STORE_PUBLISHING_GUIDE.md)

---

# Dropbox Integration Setup Guide

## Understanding the Multi-User Architecture

**Important**: One Dropbox app registration serves ALL users of your extension:
- You (the developer) create ONE app in Dropbox
- This app has ONE app key that's embedded in the extension
- Each user who installs the extension connects to THEIR OWN Dropbox account
- Each user can only access THEIR OWN files
- User authentication tokens are stored locally in each user's browser

## Step 1: Create Your Dropbox App (One-time Developer Setup)

1. Go to https://www.dropbox.com/developers/apps
2. Click "Create app"
3. Configure the app:
   - **Choose an API**: Select "Scoped access"
   - **Choose the type of access**: 
     - "App folder" - More secure, creates a dedicated folder in user's Dropbox
     - "Full Dropbox" - Allows users to save notes anywhere in their Dropbox
   - **Name your app**: Choose a name all your users will see (e.g., "Browser Notes Sync")
   - Click "Create app"

4. In the app settings page:
   - Note your **App key** (this is public and safe to distribute)
   - The **App secret** is NOT needed (we use PKCE flow for security)
   - Add OAuth 2 redirect URIs:
     ```
     https://<extension-id>.chromiumapp.org/
     ```
     (You'll get the extension ID after loading the unpacked extension)

5. In the Permissions tab, enable these scopes:
   - `files.content.write` - Write file content
   - `files.content.read` - Read file content
   - `files.metadata.write` - Create and modify file metadata
   - `files.metadata.read` - View file metadata
   - Click "Submit" to save permissions

## Step 2: How User Authentication Works

When a user clicks "Connect to Dropbox" in your extension:

1. The extension opens Dropbox's OAuth page using `chrome.identity.launchWebAuthFlow()`
2. User logs into THEIR Dropbox account (if not already logged in)
3. User sees YOUR app name and requested permissions
4. User clicks "Allow" to grant access
5. Dropbox redirects back with an authorization code
6. Extension exchanges the code for the USER's access token
7. Token is stored in the USER's local browser storage
8. Extension can now access ONLY that user's Dropbox files

## Step 3: Key Implementation Points

### Security Considerations:
- Never store the app secret in the extension (use PKCE flow)
- Store tokens encrypted in chrome.storage.local
- Implement token refresh logic
- Use short-lived access tokens

### Rate Limiting:
- Dropbox API has rate limits
- Implement exponential backoff for retries
- Batch operations when possible

### File Sync Strategy:
- Use Dropbox API v2 endpoints
- Implement conflict resolution (last-write-wins or merge)
- Add offline support with sync queue
- Use file revision tracking to detect changes

## Step 4: Testing Checklist

- [ ] OAuth flow works correctly
- [ ] File creation in Dropbox
- [ ] File reading from Dropbox
- [ ] Auto-sync on changes
- [ ] Conflict resolution
- [ ] Offline mode
- [ ] Token refresh
- [ ] Error handling