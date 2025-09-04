// Background tab approach for Gmail count extraction

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


// Handle messages for Gmail and Jira count requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_GMAIL_COUNT_FROM_BACKGROUND') {
        handleGmailCountRequest(sendResponse);
        return true; // Keep message channel open for async response
    } else if (message.type === 'GET_JIRA_DONE_COUNT_FROM_BACKGROUND') {
        handleJiraDoneCountRequest(sendResponse);
        return true; // Keep message channel open for async response
    }
});

async function handleGmailCountRequest(sendResponse) {
    try {
        console.log('Background: Starting Gmail count request');
        // Create a background tab to Gmail, extract count, then close it
        const tab = await chrome.tabs.create({
            url: 'https://mail.google.com/mail/u/0/#inbox',
            active: false // Create in background
        });
        console.log('Background: Gmail tab created with ID:', tab.id);
        
        // Wait for tab to load
        await new Promise((resolve) => {
            const listener = (tabId, changeInfo) => {
                if (tabId === tab.id && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });
        
        // Give Gmail time to render
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // First check if the correct Gmail account is logged in
        const accountCheckResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                try {
                    // Look for account indicators in Gmail
                    const selectors = [
                        'div[data-email*="jon.whittlestone@trustpilot.com"]',
                        '[aria-label*="jon.whittlestone@trustpilot.com"]',
                        '[title*="jon.whittlestone@trustpilot.com"]',
                        '.gb_d[aria-label*="jon.whittlestone@trustpilot.com"]',
                        '.gb_d[title*="jon.whittlestone@trustpilot.com"]'
                    ];
                    
                    for (const selector of selectors) {
                        if (document.querySelector(selector)) {
                            console.log('Found correct Gmail account using selector:', selector);
                            return true;
                        }
                    }
                    
                    // Also check URL for account indicator
                    if (window.location.href.includes('jon.whittlestone@trustpilot.com')) {
                        console.log('Found correct Gmail account in URL');
                        return true;
                    }
                    
                    // Check page content for email
                    const bodyText = document.body ? document.body.textContent : '';
                    if (bodyText.includes('jon.whittlestone@trustpilot.com')) {
                        console.log('Found correct Gmail account in page content');
                        return true;
                    }
                    
                    console.log('Gmail account verification failed - not jon.whittlestone@trustpilot.com');
                    return false;
                } catch (error) {
                    console.error('Error checking Gmail account:', error);
                    return false;
                }
            }
        });
        
        const isCorrectAccount = accountCheckResults && accountCheckResults[0] && accountCheckResults[0].result;
        
        if (!isCorrectAccount) {
            // Close the tab and return 0 with flag if not the correct account
            await chrome.tabs.remove(tab.id);
            console.log('Skipping Gmail count extraction - not the correct account');
            sendResponse({ 
                type: 'GMAIL_COUNT_RESULT', 
                count: 0,
                accountNotFound: true
            });
            return;
        }
        
        // Extract count using content script
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                try {
                    console.log('Extracting count from verified Gmail account: jon.whittlestone@trustpilot.com');
                    
                    // Look for the specific structure: <span class="Dj">...of <span class="ts">8</span></span>
                    const djElement = document.querySelector('.Dj');
                    if (djElement && djElement.textContent) {
                        const djText = djElement.textContent.trim();
                        console.log('Found .Dj element with text:', djText);
                        
                        // Look for pattern like "1–8 of 8" or "1-8 of 8"
                        const match = djText.match(/(\\d+)[\\u2013-](\\d+)\\s+of\\s+(\\d+)/);
                        if (match) {
                            const totalCount = parseInt(match[3], 10);
                            console.log('Gmail count extracted from .Dj: ' + totalCount);
                            return totalCount;
                        }
                        
                        // Also try simpler "of X" pattern
                        const simpleMatch = djText.match(/of\\s+(\\d+)/);
                        if (simpleMatch) {
                            const totalCount = parseInt(simpleMatch[1], 10);
                            console.log('Gmail count extracted from .Dj (simple): ' + totalCount);
                            return totalCount;
                        }
                    }
                    
                    // Fallback selectors
                    const selectors = ['.Dj .ts:last-child', '.ts'];
                    for (const selector of selectors) {
                        const elements = document.querySelectorAll(selector);
                        for (const element of elements) {
                            if (element && element.textContent) {
                                const num = parseInt(element.textContent.trim(), 10);
                                if (!isNaN(num) && num > 0) {
                                    console.log('Gmail count extracted: ' + num + ' using selector: ' + selector);
                                    return num;
                                }
                            }
                        }
                    }
                    
                    return 0;
                } catch (error) {
                    console.error('Error extracting Gmail count:', error);
                    return -1;
                }
            }
        });
        
        // Close the background tab
        console.log('Background: Closing Gmail tab');
        await chrome.tabs.remove(tab.id);
        
        const count = results && results[0] && results[0].result !== undefined ? results[0].result : -1;
        console.log('Background: Sending Gmail response with count:', count);
        
        sendResponse({ 
            type: 'GMAIL_COUNT_RESULT', 
            count: count 
        });
    } catch (error) {
        console.error('Error handling Gmail count request:', error);
        sendResponse({ 
            type: 'GMAIL_COUNT_RESULT', 
            count: -1, 
            error: error.message 
        });
    }
}

async function handleJiraDoneCountRequest(sendResponse) {
    try {
        // Create a background tab to Jira board, extract Done count, then close it
        const tab = await chrome.tabs.create({
            url: 'https://trustpilot-production.atlassian.net/jira/software/c/projects/CSSV/boards/82?assignee=712020%3A9409c59f-3436-489c-96d1-ebf40363ac94',
            active: false // Create in background
        });
        
        // Wait for tab to load
        await new Promise((resolve) => {
            const listener = (tabId, changeInfo) => {
                if (tabId === tab.id && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });
        
        // Give Jira time to render (Jira can be slower than Gmail)
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Extract Done count using content script
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                try {
                    console.log('Extracting Jira Done count...');
                    
                    // Look for Done column header with the specific structure
                    const doneHeaders = document.querySelectorAll('h2[aria-label="Done"]');
                    
                    for (const header of doneHeaders) {
                        const text = header.textContent || header.innerText || '';
                        console.log('Found Done header text:', text);
                        
                        // The markup shows numbers like "1/11" in complex nested spans
                        // Extract all numbers from the Done header
                        const numbers = text.match(/\\d+/g);
                        if (numbers && numbers.length >= 2) {
                            const done = numbers[0];
                            const total = numbers[numbers.length - 1];
                            console.log('Jira Done count extracted: ' + done + '/' + total);
                            return done + '/' + total;
                        }
                        
                        // Also try to find the pattern directly
                        const match = text.match(/(\\d+)\\/(\\d+)/);
                        if (match) {
                            const done = parseInt(match[1], 10);
                            const total = parseInt(match[2], 10);
                            console.log('Jira Done count extracted (direct): ' + done + '/' + total);
                            return done + '/' + total;
                        }
                    }
                    
                    // Fallback: look for any element with the Done pattern
                    const allElements = document.querySelectorAll('*');
                    for (const element of allElements) {
                        const text = element.textContent || '';
                        if (text.includes('Done') && text.match(/(\\d+)\\/(\\d+)/)) {
                            const match = text.match(/(\\d+)\\/(\\d+)/);
                            if (match) {
                                console.log('Jira Done count extracted (fallback): ' + match[1] + '/' + match[2]);
                                return match[1] + '/' + match[2];
                            }
                        }
                    }
                    
                    console.log('No Jira Done count found');
                    return null;
                } catch (error) {
                    console.error('Error extracting Jira Done count:', error);
                    return null;
                }
            }
        });
        
        // Close the background tab
        await chrome.tabs.remove(tab.id);
        
        const doneCount = results && results[0] && results[0].result;
        
        sendResponse({ 
            type: 'JIRA_DONE_COUNT_RESULT', 
            count: doneCount || null
        });
    } catch (error) {
        console.error('Error handling Jira Done count request:', error);
        sendResponse({ 
            type: 'JIRA_DONE_COUNT_RESULT', 
            count: null, 
            error: error.message 
        });
    }
}

