# Making Your Chrome Extension ID Permanent

## What We Did

1. **Generated a private key** (`key.pem`) using OpenSSL
2. **Added the public key** to `manifest.json`

## Your Permanent Extension ID

With the key added to manifest.json, your extension will now have a permanent ID that:
- Stays the same across all installations
- Remains constant even when loading/reloading as unpacked
- Will be the same ID when published to Chrome Web Store

## To Find Your Extension ID

1. Go to chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked" and select your extension directory
4. The Extension ID shown will now be permanent

## Important Files

- `key.pem` - Your private key (KEEP THIS SECURE! Never commit to git)
- `manifest.json` - Now contains the public key

## Security Note

**NEVER share or commit your `key.pem` file!** Add it to .gitignore:

```
echo "key.pem" >> .gitignore
```

The public key in manifest.json is safe to share and commit.

## Next Steps

1. Load your extension in Chrome
2. Copy the permanent Extension ID
3. Update your Dropbox redirect URI to: `https://YOUR-PERMANENT-ID.chromiumapp.org/`