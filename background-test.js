// Simple test background script
console.log('Background script loaded successfully!');

chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
    chrome.contextMenus.create({
        id: 'openSettings',
        title: 'Browser Notes Settings',
        contexts: ['action']
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received:', message);
    
    if (message.type === 'GET_GMAIL_COUNT_FROM_BACKGROUND') {
        console.log('Handling Gmail count request');
        sendResponse({ 
            type: 'GMAIL_COUNT_RESULT', 
            count: 5 // Test response
        });
        return true;
    } else if (message.type === 'GET_JIRA_DONE_COUNT_FROM_BACKGROUND') {
        console.log('Handling Jira count request');
        sendResponse({ 
            type: 'JIRA_DONE_COUNT_RESULT', 
            count: '2/10' // Test response
        });
        return true;
    }
});