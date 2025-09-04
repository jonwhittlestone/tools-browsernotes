// Offscreen document script for Gmail inbox count extraction

let gmailFrame: HTMLIFrameElement | null = null;

interface GmailCountMessage {
    type: 'GET_GMAIL_COUNT';
}

interface GmailCountResponse {
    type: 'GMAIL_COUNT_RESULT';
    count: number;
    error?: string;
}

// Listen for messages from the main app
chrome.runtime.onMessage.addListener((message: GmailCountMessage, sender, sendResponse) => {
    if (message.type === 'GET_GMAIL_COUNT') {
        getGmailCount().then(result => {
            sendResponse(result);
        }).catch(error => {
            sendResponse({ 
                type: 'GMAIL_COUNT_RESULT', 
                count: -1, 
                error: error.message 
            });
        });
        return true; // Keep message channel open for async response
    }
});

async function getGmailCount(): Promise<GmailCountResponse> {
    try {
        // Create or get Gmail iframe
        if (!gmailFrame) {
            gmailFrame = document.getElementById('gmail-frame') as HTMLIFrameElement;
            if (!gmailFrame) {
                throw new Error('Gmail frame not found');
            }
        }

        // Load Gmail if not already loaded
        if (!gmailFrame.src || gmailFrame.src === '') {
            gmailFrame.src = 'https://mail.google.com/mail/u/0/#inbox';
            
            // Wait for iframe to load
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Gmail loading timeout'));
                }, 30000); // 30 second timeout

                const onLoad = () => {
                    clearTimeout(timeout);
                    gmailFrame!.removeEventListener('load', onLoad);
                    gmailFrame!.removeEventListener('error', onError);
                    // Additional wait for Gmail to fully render
                    setTimeout(resolve, 5000);
                };

                const onError = () => {
                    clearTimeout(timeout);
                    gmailFrame!.removeEventListener('load', onLoad);
                    gmailFrame!.removeEventListener('error', onError);
                    reject(new Error('Gmail failed to load'));
                };

                gmailFrame!.addEventListener('load', onLoad);
                gmailFrame!.addEventListener('error', onError);
            });
        }

        // Extract count from Gmail iframe
        const count = await extractCountFromFrame();
        
        return {
            type: 'GMAIL_COUNT_RESULT',
            count: count
        };

    } catch (error) {
        console.error('Error getting Gmail count:', error);
        return {
            type: 'GMAIL_COUNT_RESULT',
            count: -1,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

async function extractCountFromFrame(): Promise<number> {
    if (!gmailFrame || !gmailFrame.contentDocument) {
        throw new Error('Gmail frame not accessible');
    }

    const doc = gmailFrame.contentDocument;
    
    // Debug: Check what's actually loaded in the iframe
    console.log('Gmail iframe URL:', gmailFrame.src);
    console.log('Gmail iframe document title:', doc.title);
    console.log('Gmail iframe document body innerHTML length:', doc.body ? doc.body.innerHTML.length : 'No body');
    console.log('Gmail iframe document head innerHTML length:', doc.head ? doc.head.innerHTML.length : 'No head');
    
    // Check if we're getting blocked or redirected
    if (doc.body && doc.body.innerHTML.includes('blocked') || doc.title.toLowerCase().includes('error')) {
        console.error('Gmail appears to be blocked or showing error page');
        throw new Error('Gmail blocked in iframe');
    }
    
    // Look for the specific structure you mentioned: <span class="Dj">...of <span class="ts">8</span></span>
    
    // First try to find the exact pattern you showed
    const djElement = doc.querySelector('.Dj');
    if (djElement && djElement.textContent) {
        const djText = djElement.textContent.trim();
        console.log('Found .Dj element with text:', djText);
        
        // Look for pattern like "1–8 of 8" or "1-8 of 8"
        const match = djText.match(/(\d+)[–-](\d+)\s+of\s+(\d+)/);
        if (match) {
            const totalCount = parseInt(match[3], 10);
            console.log(`Gmail count extracted from .Dj: ${totalCount}`);
            return totalCount;
        }
        
        // Also try simpler "of X" pattern
        const simpleMatch = djText.match(/of\s+(\d+)/);
        if (simpleMatch) {
            const totalCount = parseInt(simpleMatch[1], 10);
            console.log(`Gmail count extracted from .Dj (simple): ${totalCount}`);
            return totalCount;
        }
    }
    
    // Try multiple selectors as fallback
    const selectors = [
        '.Dj .ts:last-child',  // The last .ts element in .Dj (should be the total)
        '.Dj span:last-child', // Last span in .Dj
        '.ts',  // All .ts elements
        '.Dj .Ts .ts',
        '.ar9 .ts',
        '[data-tooltip*="of"] span',
        'span[aria-label*="of"]'
    ];

    for (const selector of selectors) {
        const elements = doc.querySelectorAll(selector);
        console.log(`Trying selector: ${selector}, found ${elements.length} elements`);
        
        for (const element of elements) {
            if (element && element.textContent) {
                const text = element.textContent.trim();
                console.log(`  Element text: "${text}"`);
                
                // For .ts elements, just try to parse as number
                if (selector.includes('.ts')) {
                    const num = parseInt(text, 10);
                    if (!isNaN(num) && num > 0) {
                        console.log(`Gmail count extracted: ${num} using selector: ${selector}`);
                        return num;
                    }
                } else {
                    // For other elements, try pattern matching
                    const match = text.match(/(?:of\s+(\d+)|\b(\d+)\s+(?:conversations?|emails?)\b|-(\d+)\s+of\s+(\d+))/);
                    if (match) {
                        const count = parseInt(match[1] || match[2] || match[4], 10);
                        if (!isNaN(count) && count > 0) {
                            console.log(`Gmail count extracted: ${count} using selector: ${selector}`);
                            return count;
                        }
                    }
                }
            }
        }
    }

    // Debug: log all elements that might contain the count
    const allElements = doc.querySelectorAll('*');
    let foundElements = 0;
    for (const el of allElements) {
        if (el.textContent && el.textContent.includes(' of ')) {
            console.log(`Found element with 'of': ${el.tagName}.${el.className} - "${el.textContent.trim()}"`);
            foundElements++;
            if (foundElements > 10) break; // Limit debug output
        }
    }
    
    console.log('No Gmail count found, assuming 0');
    return 0;
}