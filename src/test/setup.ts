import { vi } from 'vitest';

const mockChrome = {
  storage: {
    local: {
      get: vi.fn((keys, callback) => {
        if (typeof callback === 'function') {
          callback({});
        }
        return Promise.resolve({});
      }),
      set: vi.fn((items, callback) => {
        if (typeof callback === 'function') {
          callback();
        }
        return Promise.resolve();
      }),
      remove: vi.fn((keys, callback) => {
        if (typeof callback === 'function') {
          callback();
        }
        return Promise.resolve();
      }),
    },
    sync: {
      get: vi.fn((keys, callback) => {
        if (typeof callback === 'function') {
          callback({});
        }
        return Promise.resolve({});
      }),
      set: vi.fn((items, callback) => {
        if (typeof callback === 'function') {
          callback();
        }
        return Promise.resolve();
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    onInstalled: {
      addListener: vi.fn(),
    },
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(),
    openOptionsPage: vi.fn(),
    id: 'test-extension-id',
    lastError: null,
  },
  identity: {
    launchWebAuthFlow: vi.fn(),
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    create: vi.fn(),
    query: vi.fn(),
    reload: vi.fn(),
  },
  action: {
    onClicked: {
      addListener: vi.fn(),
    },
  },
};

(globalThis as any).chrome = mockChrome;

// Mock crypto for code verifier generation — crypto is read-only in jsdom,
// so we stub individual methods rather than replacing the object.
vi.stubGlobal('crypto', {
  getRandomValues: vi.fn((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  }),
  subtle: {
    digest: vi.fn(() => Promise.resolve(new ArrayBuffer(32))),
  },
});

// Mock fetch
vi.stubGlobal('fetch', vi.fn());

// Set Dropbox config on window
(window as any).DROPBOX_CONFIG = {
  APP_KEY: 'test-dropbox-key',
};
