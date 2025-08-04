import { RetryHelper, NetworkError, RateLimitError } from './RetryHelper';

export interface DropboxConfig {
    clientId: string;
    redirectUri: string;
    accessToken?: string;
    refreshToken?: string;
}

export interface DropboxFile {
    id: string;
    name: string;
    path: string;
    rev?: string;
}

export interface DropboxEntry {
    id: string;
    name: string;
    path: string;
    type: 'file' | 'folder';
    rev?: string;
}

export class DropboxService {
    private clientId: string;
    private redirectUri: string;
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private currentFileId: string | null = null;
    private syncInterval: number | null = null;
    
    constructor(config: DropboxConfig) {
        this.clientId = config.clientId;
        this.redirectUri = config.redirectUri;
        this.accessToken = config.accessToken || null;
        this.refreshToken = config.refreshToken || null;
    }
    
    async authenticate(): Promise<boolean> {
        try {
            console.log('DropboxService.authenticate() called');
            console.log('Client ID:', this.clientId);
            console.log('Redirect URI:', this.redirectUri);
            
            const codeVerifier = this.generateCodeVerifier();
            const codeChallenge = await this.generateCodeChallenge(codeVerifier);
            
            const authUrl = `https://www.dropbox.com/oauth2/authorize?` +
                `client_id=${this.clientId}` +
                `&response_type=code` +
                `&code_challenge=${codeChallenge}` +
                `&code_challenge_method=S256` +
                `&token_access_type=offline` +
                `&redirect_uri=${encodeURIComponent(this.redirectUri)}`;
            
            console.log('Auth URL:', authUrl);
            
            const responseUrl = await this.launchAuthFlow(authUrl);
            console.log('Response URL:', responseUrl);
            
            const code = this.extractAuthCode(responseUrl);
            
            if (!code) {
                throw new Error('No authorization code received');
            }
            
            console.log('Got authorization code, exchanging for token...');
            const tokens = await this.exchangeCodeForToken(code, codeVerifier);
            this.accessToken = tokens.access_token;
            this.refreshToken = tokens.refresh_token;
            
            await this.saveTokens();
            console.log('Authentication successful, tokens saved');
            return true;
        } catch (error) {
            console.error('Authentication failed:', error);
            throw error;  // Re-throw to see the full error
        }
    }
    
    private generateCodeVerifier(): string {
        const array = new Uint8Array(64);
        crypto.getRandomValues(array);
        return btoa(String.fromCharCode(...array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
    
    private async generateCodeChallenge(verifier: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(hash)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
    
    private launchAuthFlow(authUrl: string): Promise<string> {
        return new Promise((resolve, reject) => {
            console.log('Launching auth flow with chrome.identity.launchWebAuthFlow');
            console.log('Interactive: true');
            
            chrome.identity.launchWebAuthFlow(
                {
                    url: authUrl,
                    interactive: true
                },
                (responseUrl) => {
                    console.log('Auth flow callback received');
                    console.log('Response URL:', responseUrl);
                    console.log('Chrome runtime last error:', chrome.runtime.lastError);
                    
                    if (chrome.runtime.lastError) {
                        console.error('Chrome identity error:', chrome.runtime.lastError.message);
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (responseUrl) {
                        resolve(responseUrl);
                    } else {
                        reject(new Error('No response URL'));
                    }
                }
            );
        });
    }
    
    private extractAuthCode(responseUrl: string): string | null {
        const url = new URL(responseUrl);
        return url.searchParams.get('code');
    }
    
    private async exchangeCodeForToken(code: string, codeVerifier: string): Promise<any> {
        const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                code: code,
                grant_type: 'authorization_code',
                client_id: this.clientId,
                code_verifier: codeVerifier,
                redirect_uri: this.redirectUri
            })
        });
        
        if (!response.ok) {
            throw new Error(`Token exchange failed: ${response.statusText}`);
        }
        
        return response.json();
    }
    
    async refreshAccessToken(): Promise<boolean> {
        if (!this.refreshToken) {
            console.log('No refresh token available');
            return false;
        }
        
        console.log('Attempting to refresh access token...');
        try {
            const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken,
                    client_id: this.clientId
                })
            });
            
            if (!response.ok) {
                throw new Error(`Token refresh failed: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.accessToken = data.access_token;
            await this.saveTokens();
            console.log('Access token refreshed successfully');
            return true;
        } catch (error) {
            console.error('Token refresh failed:', error);
            return false;
        }
    }
    
    private async saveTokens(): Promise<void> {
        await chrome.storage.local.set({
            dropboxAccessToken: this.accessToken,
            dropboxRefreshToken: this.refreshToken
        });
    }
    
    async loadTokens(): Promise<void> {
        const result = await chrome.storage.local.get([
            'dropboxAccessToken',
            'dropboxRefreshToken'
        ]);
        this.accessToken = result.dropboxAccessToken || null;
        this.refreshToken = result.dropboxRefreshToken || null;
    }
    
    async listFiles(path: string = ''): Promise<DropboxFile[]> {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }
        
        console.log('DropboxService.listFiles called with path:', path);
        console.log('Using access token:', this.accessToken ? 'Yes' : 'No');
        
        try {
            return await RetryHelper.withRetry(async () => {
            const requestBody = {
                path: path === '/' ? '' : path,
                recursive: false,
                include_media_info: false,
                include_deleted: false,
                include_has_explicit_shared_members: false
            };
            
            console.log('Making API request to list_folder with body:', requestBody);
            
            const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            }).catch(err => {
                console.error('Network error during fetch:', err);
                throw new NetworkError(err.message);
            });
            
            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers);
            
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
                throw new RateLimitError(retryAfter);
            }
            
            if (response.status === 401) {
                console.log('401 Unauthorized - attempting token refresh');
                if (await this.refreshAccessToken()) {
                    throw new Error('TOKEN_REFRESHED');
                }
                throw new Error('Authentication failed');
            }
            
            if (!response.ok) {
                const errorBody = await response.text();
                console.error('API error response:', errorBody);
                throw new Error(`Failed to list files: ${response.statusText} - ${errorBody}`);
            }
            
            const data = await response.json();
            console.log('API response data:', data);
            
            const files = data.entries
                .filter((entry: any) => entry['.tag'] === 'file' && entry.name.endsWith('.md'))
                .map((entry: any) => ({
                    id: entry.id,
                    name: entry.name,
                    path: entry.path_display,
                    rev: entry.rev
                }));
            
            console.log('Filtered .md files:', files);
            return files;
            });
        } catch (error: any) {
            if (error.message === 'TOKEN_REFRESHED') {
                console.log('Token refreshed, retrying listFiles');
                return this.listFiles(path);
            }
            throw error;
        }
    }
    
    async listEntries(path: string = ''): Promise<DropboxEntry[]> {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }
        
        console.log('DropboxService.listEntries called with path:', path);
        console.log('Using access token:', this.accessToken ? 'Yes' : 'No');
        
        try {
            return await RetryHelper.withRetry(async () => {
            const requestBody = {
                path: path === '/' ? '' : path,
                recursive: false,
                include_media_info: false,
                include_deleted: false,
                include_has_explicit_shared_members: false
            };
            
            console.log('Making API request to list_folder with body:', requestBody);
            
            const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            }).catch(err => {
                console.error('Network error during fetch:', err);
                throw new NetworkError(err.message);
            });
            
            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers);
            
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
                throw new RateLimitError(retryAfter);
            }
            
            if (response.status === 401) {
                console.log('401 Unauthorized - attempting token refresh');
                if (await this.refreshAccessToken()) {
                    throw new Error('TOKEN_REFRESHED');
                }
                throw new Error('Authentication failed');
            }
            
            if (!response.ok) {
                const errorBody = await response.text();
                console.error('API error response:', errorBody);
                throw new Error(`Failed to list entries: ${response.statusText} - ${errorBody}`);
            }
            
            const data = await response.json();
            console.log('API response data:', data);
            
            const entries = data.entries.map((entry: any) => ({
                id: entry.id,
                name: entry.name,
                path: entry.path_display,
                type: entry['.tag'] === 'folder' ? 'folder' : 'file',
                rev: entry.rev
            }));
            
            console.log('All entries:', entries);
            return entries;
            });
        } catch (error: any) {
            if (error.message === 'TOKEN_REFRESHED') {
                console.log('Token refreshed, retrying listEntries');
                return this.listEntries(path);
            }
            throw error;
        }
    }
    
    async createFile(path: string, content: string): Promise<DropboxFile> {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }
        
        const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Dropbox-API-Arg': JSON.stringify({
                    path: path,
                    mode: 'add',
                    autorename: true,
                    mute: false
                }),
                'Content-Type': 'application/octet-stream'
            },
            body: content
        });
        
        if (response.status === 401) {
            if (await this.refreshAccessToken()) {
                return this.createFile(path, content);
            }
            throw new Error('Authentication failed');
        }
        
        if (!response.ok) {
            throw new Error(`Failed to create file: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            id: data.id,
            name: data.name,
            path: data.path_display,
            rev: data.rev
        };
    }
    
    async readFile(path: string): Promise<string> {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }
        
        try {
            return await RetryHelper.withRetry(async () => {
            const response = await fetch('https://content.dropboxapi.com/2/files/download', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Dropbox-API-Arg': JSON.stringify({ path })
                }
            }).catch(err => {
                throw new NetworkError(err.message);
            });
            
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
                throw new RateLimitError(retryAfter);
            }
            
            if (response.status === 401) {
                if (await this.refreshAccessToken()) {
                    throw new Error('TOKEN_REFRESHED');
                }
                throw new Error('Authentication failed');
            }
            
            if (!response.ok) {
                throw new Error(`Failed to read file: ${response.statusText}`);
            }
            
            return response.text();
            });
        } catch (error: any) {
            if (error.message === 'TOKEN_REFRESHED') {
                console.log('Token refreshed, retrying readFile');
                return this.readFile(path);
            }
            throw error;
        }
    }
    
    async updateFile(path: string, content: string, rev?: string): Promise<DropboxFile> {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }
        
        try {
            return await RetryHelper.withRetry(async () => {
            const apiArg: any = {
                path: path,
                mode: rev ? { '.tag': 'update', update: rev } : 'overwrite',
                autorename: false,
                mute: true
            };
            
            const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Dropbox-API-Arg': JSON.stringify(apiArg),
                    'Content-Type': 'application/octet-stream'
                },
                body: content
            }).catch(err => {
                throw new NetworkError(err.message);
            });
            
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
                throw new RateLimitError(retryAfter);
            }
            
            if (response.status === 401) {
                if (await this.refreshAccessToken()) {
                    throw new Error('TOKEN_REFRESHED');
                }
                throw new Error('Authentication failed');
            }
            
            if (!response.ok) {
                const error = await response.text();
                if (error.includes('conflict')) {
                    throw new Error('FILE_CONFLICT');
                }
                throw new Error(`Failed to update file: ${response.statusText}`);
            }
            
            const data = await response.json();
            return {
                id: data.id,
                name: data.name,
                path: data.path_display,
                rev: data.rev
            };
            }, {
                shouldRetry: (error) => {
                    if (error.message === 'FILE_CONFLICT') return false;
                    if (error.status === 429) return true;
                    if (error.status >= 500) return true;
                    if (error.code === 'NETWORK_ERROR') return true;
                    return false;
                }
            });
        } catch (error: any) {
            if (error.message === 'TOKEN_REFRESHED') {
                console.log('Token refreshed, retrying updateFile');
                return this.updateFile(path, content, rev);
            }
            throw error;
        }
    }
    
    async getFileMetadata(path: string): Promise<DropboxFile | null> {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }
        
        try {
            const response = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    path: path,
                    include_media_info: false,
                    include_deleted: false,
                    include_has_explicit_shared_members: false
                })
            });
            
            if (response.status === 401) {
                if (await this.refreshAccessToken()) {
                    return this.getFileMetadata(path);
                }
                throw new Error('Authentication failed');
            }
            
            if (response.status === 409) {
                return null;
            }
            
            if (!response.ok) {
                throw new Error(`Failed to get metadata: ${response.statusText}`);
            }
            
            const data = await response.json();
            return {
                id: data.id,
                name: data.name,
                path: data.path_display,
                rev: data.rev
            };
        } catch (error) {
            console.error('Error getting file metadata:', error);
            return null;
        }
    }
    
    async deleteFile(path: string): Promise<boolean> {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }
        
        try {
            const response = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path })
            });
            
            if (response.status === 401) {
                if (await this.refreshAccessToken()) {
                    return this.deleteFile(path);
                }
                throw new Error('Authentication failed');
            }
            
            return response.ok;
        } catch (error) {
            console.error('Error deleting file:', error);
            return false;
        }
    }
    
    isAuthenticated(): boolean {
        return !!this.accessToken;
    }
    
    async signOut(): Promise<void> {
        this.accessToken = null;
        this.refreshToken = null;
        await chrome.storage.local.remove([
            'dropboxAccessToken',
            'dropboxRefreshToken',
            'dropboxFilePath'
        ]);
    }
}