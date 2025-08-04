import { DropboxService, DropboxFile, DropboxEntry } from '../DropboxService';
import { NetworkError, RateLimitError } from '../RetryHelper';

describe('DropboxService', () => {
  let dropboxService: DropboxService;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    jest.clearAllMocks();
    
    dropboxService = new DropboxService({
      clientId: 'test-client-id',
      redirectUri: 'https://test-extension.chromiumapp.org/',
    });
  });

  describe('authentication', () => {
    it('should generate code verifier and challenge', async () => {
      const mockResponseUrl = 'https://test-extension.chromiumapp.org/?code=test-auth-code';
      const mockTokenResponse = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      };

      (chrome.identity.launchWebAuthFlow as jest.Mock).mockImplementation((_, callback) => {
        callback(mockResponseUrl);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse),
      } as Response);

      (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);

      const result = await dropboxService.authenticate();

      expect(result).toBe(true);
      expect(chrome.identity.launchWebAuthFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('https://www.dropbox.com/oauth2/authorize'),
          interactive: true,
        }),
        expect.any(Function)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.dropboxapi.com/oauth2/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        dropboxAccessToken: 'test-access-token',
        dropboxRefreshToken: 'test-refresh-token',
      });
    });

    it('should handle authentication failure', async () => {
      (chrome.identity.launchWebAuthFlow as jest.Mock).mockImplementation((_, callback) => {
        callback(null);
      });
      (chrome.runtime as any).lastError = { message: 'User cancelled' };

      await expect(dropboxService.authenticate()).rejects.toThrow('User cancelled');
    });

    it('should refresh access token', async () => {
      const mockTokenResponse = {
        access_token: 'new-access-token',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse),
      } as Response);

      (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);

      // Set refresh token
      (dropboxService as any).refreshToken = 'test-refresh-token';

      const result = await dropboxService.refreshAccessToken();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.dropboxapi.com/oauth2/token',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('refresh_token=test-refresh-token'),
        })
      );
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        dropboxAccessToken: 'new-access-token',
        dropboxRefreshToken: 'test-refresh-token',
      });
    });
  });

  describe('file operations', () => {
    beforeEach(() => {
      // Set access token for file operations
      (dropboxService as any).accessToken = 'test-access-token';
    });

    it('should list files successfully', async () => {
      const mockApiResponse = {
        entries: [
          {
            '.tag': 'file',
            id: 'file1',
            name: 'notes.md',
            path_display: '/notes.md',
            rev: 'rev1',
          },
          {
            '.tag': 'file',
            id: 'file2',
            name: 'document.txt',
            path_display: '/document.txt',
            rev: 'rev2',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockApiResponse),
      } as Response);

      const files = await dropboxService.listFiles('/');

      expect(files).toHaveLength(1);
      expect(files[0]).toEqual({
        id: 'file1',
        name: 'notes.md',
        path: '/notes.md',
        rev: 'rev1',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.dropboxapi.com/2/files/list_folder',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-access-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            path: '',
            recursive: false,
            include_media_info: false,
            include_deleted: false,
            include_has_explicit_shared_members: false,
          }),
        })
      );
    });

    it('should list all entries (files and folders)', async () => {
      const mockApiResponse = {
        entries: [
          {
            '.tag': 'folder',
            id: 'folder1',
            name: 'Documents',
            path_display: '/Documents',
          },
          {
            '.tag': 'file',
            id: 'file1',
            name: 'notes.md',
            path_display: '/notes.md',
            rev: 'rev1',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(mockApiResponse),
      } as Response);

      const entries = await dropboxService.listEntries('/');

      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({
        id: 'folder1',
        name: 'Documents',
        path: '/Documents',
        type: 'folder',
        rev: undefined,
      });
      expect(entries[1]).toEqual({
        id: 'file1',
        name: 'notes.md',
        path: '/notes.md',
        type: 'file',
        rev: 'rev1',
      });
    });

    it('should handle token refresh on 401 error', async () => {
      const mockTokenResponse = {
        access_token: 'new-access-token',
      };

      const mockApiResponse = {
        entries: [
          {
            '.tag': 'file',
            id: 'file1',
            name: 'notes.md',
            path_display: '/notes.md',
            rev: 'rev1',
          },
        ],
      };

      // First call returns 401, second call succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Headers(),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve(mockApiResponse),
        } as Response);

      (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);
      (dropboxService as any).refreshToken = 'test-refresh-token';

      const files = await dropboxService.listFiles('/');

      expect(files).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(3); // 401, token refresh, retry
    });

    it('should handle rate limiting with retry', async () => {
      const mockApiResponse = {
        entries: [
          {
            '.tag': 'file',
            id: 'file1',
            name: 'notes.md',
            path_display: '/notes.md',
            rev: 'rev1',
          },
        ],
      };

      // First call returns 429, second call succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '1' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve(mockApiResponse),
        } as Response);

      const files = await dropboxService.listFiles('/');

      expect(files).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should create a file', async () => {
      const mockFileResponse = {
        id: 'new-file-id',
        name: 'new-notes.md',
        path_display: '/new-notes.md',
        rev: 'new-rev',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockFileResponse),
      } as Response);

      const file = await dropboxService.createFile('/new-notes.md', 'File content');

      expect(file).toEqual({
        id: 'new-file-id',
        name: 'new-notes.md',
        path: '/new-notes.md',
        rev: 'new-rev',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://content.dropboxapi.com/2/files/upload',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-access-token',
            'Dropbox-API-Arg': JSON.stringify({
              path: '/new-notes.md',
              mode: 'add',
              autorename: true,
              mute: false,
            }),
            'Content-Type': 'application/octet-stream',
          },
          body: 'File content',
        })
      );
    });

    it('should read a file', async () => {
      const fileContent = 'This is the file content';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(fileContent),
      } as Response);

      const content = await dropboxService.readFile('/notes.md');

      expect(content).toBe(fileContent);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://content.dropboxapi.com/2/files/download',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-access-token',
            'Dropbox-API-Arg': JSON.stringify({ path: '/notes.md' }),
          },
        })
      );
    });

    it('should update a file', async () => {
      const mockFileResponse = {
        id: 'file-id',
        name: 'notes.md',
        path_display: '/notes.md',
        rev: 'updated-rev',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockFileResponse),
      } as Response);

      const file = await dropboxService.updateFile('/notes.md', 'Updated content', 'old-rev');

      expect(file).toEqual({
        id: 'file-id',
        name: 'notes.md',
        path: '/notes.md',
        rev: 'updated-rev',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://content.dropboxapi.com/2/files/upload',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-access-token',
            'Dropbox-API-Arg': JSON.stringify({
              path: '/notes.md',
              mode: { '.tag': 'update', update: 'old-rev' },
              autorename: false,
              mute: true,
            }),
            'Content-Type': 'application/octet-stream',
          },
          body: 'Updated content',
        })
      );
    });

    it('should get file metadata', async () => {
      const mockMetadata = {
        id: 'file-id',
        name: 'notes.md',
        path_display: '/notes.md',
        rev: 'file-rev',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMetadata),
      } as Response);

      const metadata = await dropboxService.getFileMetadata('/notes.md');

      expect(metadata).toEqual({
        id: 'file-id',
        name: 'notes.md',
        path: '/notes.md',
        rev: 'file-rev',
      });
    });

    it('should delete a file', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as Response);

      const result = await dropboxService.deleteFile('/notes.md');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.dropboxapi.com/2/files/delete_v2',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-access-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: '/notes.md' }),
        })
      );
    });
  });

  describe('authentication state', () => {
    it('should check if authenticated', () => {
      expect(dropboxService.isAuthenticated()).toBe(false);

      (dropboxService as any).accessToken = 'test-token';
      expect(dropboxService.isAuthenticated()).toBe(true);
    });

    it('should load tokens from storage', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        dropboxAccessToken: 'stored-access-token',
        dropboxRefreshToken: 'stored-refresh-token',
      });

      await dropboxService.loadTokens();

      expect((dropboxService as any).accessToken).toBe('stored-access-token');
      expect((dropboxService as any).refreshToken).toBe('stored-refresh-token');
    });

    it('should sign out and clear tokens', async () => {
      (dropboxService as any).accessToken = 'test-token';
      (dropboxService as any).refreshToken = 'test-refresh';
      (chrome.storage.local.remove as jest.Mock).mockResolvedValue(undefined);

      await dropboxService.signOut();

      expect((dropboxService as any).accessToken).toBeNull();
      expect((dropboxService as any).refreshToken).toBeNull();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith([
        'dropboxAccessToken',
        'dropboxRefreshToken',
        'dropboxFilePath',
      ]);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      (dropboxService as any).accessToken = 'test-access-token';
    });

    it('should throw error when not authenticated', async () => {
      (dropboxService as any).accessToken = null;

      await expect(dropboxService.listFiles('/')).rejects.toThrow('Not authenticated');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Error details'),
      } as Response);

      await expect(dropboxService.listFiles('/')).rejects.toThrow(
        'Failed to list files: Bad Request - Error details'
      );
    });
  });
});