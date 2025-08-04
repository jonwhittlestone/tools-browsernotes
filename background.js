chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'openSettings',
        title: 'Browser Notes Settings',
        contexts: ['action']
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'openSettings') {
        chrome.runtime.openOptionsPage();
    }
});

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: 'chrome://newtab' });
});