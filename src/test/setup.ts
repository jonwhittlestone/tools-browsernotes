const mockChrome = {
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        if (typeof callback === 'function') {
          callback({});
        }
        return Promise.resolve({});
      }),
      set: jest.fn((items, callback) => {
        if (typeof callback === 'function') {
          callback();
        }
        return Promise.resolve();
      }),
      remove: jest.fn((keys, callback) => {
        if (typeof callback === 'function') {
          callback();
        }
        return Promise.resolve();
      }),
    },
    sync: {
      get: jest.fn((keys, callback) => {
        if (typeof callback === 'function') {
          callback({});
        }
        return Promise.resolve({});
      }),
      set: jest.fn((items, callback) => {
        if (typeof callback === 'function') {
          callback();
        }
        return Promise.resolve();
      }),
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  runtime: {
    onInstalled: {
      addListener: jest.fn(),
    },
    onMessage: {
      addListener: jest.fn(),
    },
    sendMessage: jest.fn(),
    openOptionsPage: jest.fn(),
    id: 'test-extension-id',
    lastError: null,
  },
  identity: {
    launchWebAuthFlow: jest.fn(),
  },
  contextMenus: {
    create: jest.fn(),
    onClicked: {
      addListener: jest.fn(),
    },
  },
  tabs: {
    create: jest.fn(),
    query: jest.fn(),
    reload: jest.fn(),
  },
  action: {
    onClicked: {
      addListener: jest.fn(),
    },
  },
};

(globalThis as any).chrome = mockChrome;

// Mock crypto for code verifier generation
(globalThis as any).crypto = {
  getRandomValues: jest.fn((array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  }),
  subtle: {
    digest: jest.fn(() => Promise.resolve(new ArrayBuffer(32))),
  },
};

// Mock btoa/atob
const mockBtoa = jest.fn((str: string) => 'mocked-base64-' + str);
const mockAtob = jest.fn((str: string) => str.replace('mocked-base64-', ''));
(globalThis as any).btoa = mockBtoa;
(globalThis as any).atob = mockAtob;

// Mock fetch
(globalThis as any).fetch = jest.fn();

// Mock window object for Dropbox config
(globalThis as any).window = {
  ...globalThis.window,
  DROPBOX_CONFIG: {
    APP_KEY: 'test-dropbox-key',
  },
  setInterval: jest.fn(),
  clearInterval: jest.fn(),
};