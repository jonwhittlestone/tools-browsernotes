// Simplified background script for Gmail and Jira extraction
console.log('Background script loading...');

// Track active requests to allow cancellation
const activeRequests = new Map();

chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
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

// Listen for tab changes to cancel requests if main tab is closed/navigated
chrome.tabs.onRemoved.addListener((tabId) => {
    // Cancel any active requests when a tab is closed
    for (const [requestId, controller] of activeRequests) {
        controller.cancel();
        activeRequests.delete(requestId);
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Cancel requests if navigating away from new tab page
    if (changeInfo.url && !changeInfo.url.includes('chrome://newtab')) {
        for (const [requestId, controller] of activeRequests) {
            controller.cancel();
            activeRequests.delete(requestId);
        }
    }
});

// Handle messages for Gmail and Jira count requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received:', message.type);
    console.log('Full message:', message);

    if (message.type === 'GET_GMAIL_COUNT_FROM_BACKGROUND') {
        const requestId = Date.now() + '_gmail';
        handleGmailCountRequest(sendResponse, requestId);
        return true; // Keep message channel open for async response
    } else if (message.type === 'GET_JIRA_DONE_COUNT_FROM_BACKGROUND') {
        const requestId = Date.now() + '_jira';
        handleJiraDoneCountRequest(sendResponse, requestId);
        return true; // Keep message channel open for async response
    }
});

async function handleGmailCountRequest(sendResponse, requestId) {
    const controller = {
        cancelled: false,
        cancel: () => {
            controller.cancelled = true;
            console.log('Gmail request cancelled:', requestId);
        }
    };

    activeRequests.set(requestId, controller);

    try {
        console.log('Background: Starting Gmail count request');

        // Wait 4 seconds before creating tab, but allow cancellation
        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(resolve, 4000);
            const checkCancellation = setInterval(() => {
                if (controller.cancelled) {
                    clearTimeout(timeoutId);
                    clearInterval(checkCancellation);
                    reject(new Error('Request cancelled'));
                }
            }, 100);
        });

        // Create a background tab to Gmail
        const tab = await chrome.tabs.create({
            url: 'https://mail.google.com/mail/u/0/#inbox',
            active: false
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
        
        // Extract count using content script - simplified approach
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: extractGmailCount
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
        if (error.message === 'Request cancelled') {
            console.log('Gmail request was cancelled');
        } else {
            sendResponse({
                type: 'GMAIL_COUNT_RESULT',
                count: -1,
                error: error.message
            });
        }
    } finally {
        activeRequests.delete(requestId);
    }
}

async function handleJiraDoneCountRequest(sendResponse, requestId) {
    const controller = {
        cancelled: false,
        cancel: () => {
            controller.cancelled = true;
            console.log('Jira request cancelled:', requestId);
        }
    };

    activeRequests.set(requestId, controller);

    try {
        console.log('Background: Starting Jira count request');

        // Wait 8 seconds before creating tab, but allow cancellation (staggered from Gmail)
        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(resolve, 8000);
            const checkCancellation = setInterval(() => {
                if (controller.cancelled) {
                    clearTimeout(timeoutId);
                    clearInterval(checkCancellation);
                    reject(new Error('Request cancelled'));
                }
            }, 100);
        });

        // Create a background tab to Jira
        const tab = await chrome.tabs.create({
            url: 'https://trustpilot-production.atlassian.net/jira/software/c/projects/CSSV/boards/82?assignee=712020%3A9409c59f-3436-489c-96d1-ebf40363ac94',
            active: false
        });
        console.log('Background: Jira tab created with ID:', tab.id);
        
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
        
        // Give Jira time to render (longer for Jira)
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Extract count using content script
        console.log('Background: Executing Jira extraction script...');
        let results;
        try {
            results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: extractJiraCount
            });
            console.log('Background: Jira extraction completed successfully');
            console.log('Background: Results:', results);
            console.log('Background: First result:', results[0]);
            console.log('Background: Result value:', results[0]?.result);
        } catch (scriptError) {
            console.error('Background: Script injection failed:', scriptError);
            throw scriptError;
        }
        
        // Close the background tab
        console.log('Background: Closing Jira tab');
        await chrome.tabs.remove(tab.id);
        
        const count = results && results[0] && results[0].result;
        console.log('Background: Sending Jira response with count:', count);
        
        sendResponse({
            type: 'JIRA_DONE_COUNT_RESULT',
            count: count || null
        });
    } catch (error) {
        console.error('Error handling Jira Done count request:', error);
        if (error.message === 'Request cancelled') {
            console.log('Jira request was cancelled');
        } else {
            sendResponse({
                type: 'JIRA_DONE_COUNT_RESULT',
                count: null,
                error: error.message
            });
        }
    } finally {
        activeRequests.delete(requestId);
    }
}

// Function to be injected into Gmail tab
function extractGmailCount() {
    try {
        console.log('Extracting Gmail count...');
        
        // Look for Gmail inbox count patterns
        const djElement = document.querySelector('.Dj');
        if (djElement && djElement.textContent) {
            const djText = djElement.textContent.trim();
            console.log('Found .Dj element with text:', djText);
            
            // Look for pattern like "1–8 of 8" or "1-8 of 8"
            const match = djText.match(/(\d+)[\u2013-](\d+)\s+of\s+(\d+)/);
            if (match) {
                const totalCount = parseInt(match[3], 10);
                console.log('Gmail count extracted: ' + totalCount);
                return totalCount;
            }
            
            // Try simpler "of X" pattern
            const simpleMatch = djText.match(/of\s+(\d+)/);
            if (simpleMatch) {
                const totalCount = parseInt(simpleMatch[1], 10);
                console.log('Gmail count extracted (simple): ' + totalCount);
                return totalCount;
            }
        }
        
        console.log('No Gmail count found');
        return 0;
    } catch (error) {
        console.error('Error extracting Gmail count:', error);
        return -1;
    }
}

// Function to be injected into Jira tab
function extractJiraCount() {
    try {
        // Look for Done column header
        const doneHeaders = document.querySelectorAll('h2[aria-label="Done"]');
        console.log('Found', doneHeaders.length, 'Done headers');
        
        for (const header of doneHeaders) {
            // Look for spans with absolute positioning that contain individual digits
            const positionedSpans = header.querySelectorAll('span[style*="position: absolute"]');
            console.log('Found', positionedSpans.length, 'positioned spans');
            
            let digits = [];
            for (const span of positionedSpans) {
                const text = span.textContent || span.innerText || '';
                const style = span.getAttribute('style') || '';
                console.log('Positioned span text:', text, 'style:', style);
                
                // Only process visible spans (opacity: 1)
                const isVisible = style.includes('opacity: 1');
                console.log('Span visible:', isVisible);
                
                // Extract digits from visible spans only
                if (text.trim() && /^\d+$/.test(text.trim()) && isVisible) {
                    // Extract left position to determine order
                    const leftMatch = style.match(/left:\s*([0-9.-]+)px/);
                    const left = leftMatch ? parseFloat(leftMatch[1]) : 0;
                    digits.push({ text: text.trim(), left: left });
                    console.log('Added visible digit:', text.trim(), 'at left:', left);
                }
            }
            
            // Sort by left position to get correct order
            digits.sort((a, b) => a.left - b.left);
            console.log('Sorted visible digits:', digits);
            
            if (digits.length > 0) {
                // Build the count string from visible positioned digits
                let countString = '';
                for (const digit of digits) {
                    countString += digit.text;
                }
                console.log('Assembled count from visible digits:', countString);
                
                // If we have something like "111", it might be "1/11" - try to parse
                if (countString.length >= 2) {
                    // For "111", assume first digit is numerator, rest is denominator
                    const numerator = countString.charAt(0);
                    const denominator = countString.substring(1);
                    const result = numerator + '/' + denominator;
                    console.log('Parsed visible digits as fraction:', result);
                    return result;
                }
                
                return countString;
            }
            
            // Fallback: Look for any text that might contain the count
            const allText = header.textContent || '';
            console.log('Fallback - all header text:', allText);
            const simpleMatch = allText.match(/(\d+)\/(\d+)/);
            if (simpleMatch) {
                const result = simpleMatch[1] + '/' + simpleMatch[2];
                console.log('Fallback extracted:', result);
                return result;
            }
        }
        
        console.log('No Done count found');
        return null;
    } catch (error) {
        console.error('Error in extractJiraCount:', error);
        return 'Error: ' + error.message;
    }
}

console.log('Background script loaded successfully!');