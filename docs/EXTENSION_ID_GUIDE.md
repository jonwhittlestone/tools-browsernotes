[Home](index.md) | [Quick Start](README_DROPBOX.md) | [Extension ID](EXTENSION_ID_GUIDE.md) | [Dropbox Setup](DROPBOX_SETUP_GUIDE.md) | [Page Setup](HOME_PAGE_SETUP.md) | [Publishing](PUBLISHING_GUIDE.md) | [Chrome Store](CHROME_STORE_PUBLISHING_GUIDE.md)

---

# Understanding Chrome Extension IDs and Dropbox OAuth

## What is the Extension ID?

Every Chrome extension has a unique 32-character ID that looks like this:
```
kjhgfedcba1234567890abcdefghijkl
```

This ID is used to create a unique URL for OAuth callbacks:
```
https://kjhgfedcba1234567890abcdefghijkl.chromiumapp.org/
```

## Visual Guide: Finding Your Extension ID

### Step 1: Load Your Extension
```
Chrome Menu → More Tools → Extensions
OR 
Type in address bar: chrome://extensions/
```

### Step 2: Enable Developer Mode
```
┌─────────────────────────────────────────┐
│ Extensions                         [🔧] │ ← Toggle this ON
│ Developer mode                     ON   │
└─────────────────────────────────────────┘
```

### Step 3: Load Unpacked Extension
```
┌──────────────────────────────────┐
│ [Load unpacked] [Pack extension] │ ← Click "Load unpacked"
└──────────────────────────────────┘
```
Select your extension folder (where manifest.json is located)

### Step 4: Find Your Extension ID
```
┌────────────────────────────────────────────┐
│ 📝 Browser Notes                           │
│ 1.0.0                                      │
│ ID: kjhgfedcba1234567890abcdefghijkl ← THIS IS YOUR ID
│ [Details] [Remove]                         │
└────────────────────────────────────────────┘
```

## Setting Up Dropbox OAuth Redirect

### In Dropbox Developer Console:

1. Go to: https://www.dropbox.com/developers/apps
2. Click on your app name
3. Find "OAuth 2" section
4. Look for "Redirect URIs"

```
┌─────────────────────────────────────────────────┐
│ OAuth 2                                         │
│                                                 │
│ Redirect URIs                                   │
│ ┌─────────────────────────────────────────┐   │
│ │ https://_______________________.chromiu │   │
│ │ mapp.org/                               │   │
│ └─────────────────────────────────────────┘   │
│ [Add]                                           │
└─────────────────────────────────────────────────┘
```

5. Enter YOUR redirect URI:
```
https://kjhgfedcba1234567890abcdefghijkl.chromiumapp.org/
         ↑ Your extension ID from Step 4
```

6. Click "Add"

## Why This is Needed

When a user connects their Dropbox:

```
1. User clicks "Connect to Dropbox" in your extension
   ↓
2. Browser opens: https://dropbox.com/oauth/authorize?...
   ↓
3. User logs in and approves
   ↓
4. Dropbox redirects to: https://YOUR-EXTENSION-ID.chromiumapp.org/?code=xyz
   ↓
5. Extension receives the authorization code
   ↓
6. Extension exchanges code for access token
```

The redirect URI tells Dropbox where to send the user back after authorization.

## Common Issues and Solutions

### ❌ "Invalid redirect_uri" Error
**Problem**: The redirect URI in Dropbox doesn't match your extension ID
**Solution**: 
1. Copy the EXACT extension ID from chrome://extensions/
2. Make sure the format is: `https://EXTENSION-ID.chromiumapp.org/`
3. Don't forget the trailing slash `/`

### ❌ Different IDs on Different Computers
**Problem**: Each computer generates a different ID for unpacked extensions
**Solution**: Add multiple redirect URIs in Dropbox (one for each developer):
```
https://developer1-extension-id.chromiumapp.org/
https://developer2-extension-id.chromiumapp.org/
https://production-extension-id.chromiumapp.org/
```

### ❌ "This app is not approved" Message
**Problem**: Dropbox app is in development mode (limited to 50 users)
**Solution**: 
- For testing: This is fine, ignore the warning
- For production: Apply for production approval in Dropbox

## Development vs Production

### During Development (Unpacked)
- Extension ID: Random, unique per computer
- Example: `abcdef1234567890abcdef1234567890`
- Add to Dropbox: For testing only

### After Publishing (Chrome Web Store)
- Extension ID: Permanent, same for all users
- Example: `permanentid123456789permanentid1`
- Add to Dropbox: For all your users

### Managing Multiple IDs

Your Dropbox app can have multiple redirect URIs:

```
Redirect URIs:
✓ https://dev-id-john.chromiumapp.org/     (John's dev machine)
✓ https://dev-id-sarah.chromiumapp.org/    (Sarah's dev machine)
✓ https://staging-id.chromiumapp.org/      (Staging version)
✓ https://production-id.chromiumapp.org/   (Published version)
```

This allows the same Dropbox app to work for:
- Multiple developers
- Testing environments
- Production users