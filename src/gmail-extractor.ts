// Content script to extract Gmail inbox count
export function extractGmailInboxCount(): number {
    try {
        // Gmail uses different selectors depending on the view
        // Try multiple selectors to find the inbox count
        const selectors = [
            // New Gmail interface
            'a[href*="#inbox"] .aim:last-child .bsU',
            'a[href*="#inbox"] .aim:last-child span:last-child',
            'a[href*="#inbox"] .bsU',
            // Older Gmail interface  
            'a[href*="#inbox"] .nU > .aio:last-child .bsU',
            'a[href*="#inbox"] .nU > .bsU',
            // Alternative selectors
            '[data-tooltip="Inbox"] .bsU',
            '.aim[aria-label*="Inbox"] .bsU'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector) as HTMLElement;
            if (element && element.textContent) {
                const text = element.textContent.trim();
                // Extract number from text like "(123)" or "123"
                const match = text.match(/\((\d+)\)|\b(\d+)\b/);
                if (match) {
                    const count = parseInt(match[1] || match[2], 10);
                    if (!isNaN(count)) {
                        console.log(`Gmail inbox count extracted: ${count} using selector: ${selector}`);
                        return count;
                    }
                }
            }
        }

        // If no count found, might be zero or inbox is empty
        console.log('No Gmail inbox count found, assuming 0');
        return 0;
    } catch (error) {
        console.error('Error extracting Gmail inbox count:', error);
        return -1; // Return -1 to indicate error
    }
}

// Function to be injected into Gmail tab
export function getInboxCountScript(): string {
    return `
        (function() {
            try {
                // Look for total email count in Gmail interface (e.g., "1-13 of 13")
                const selectors = [
                    '.Dj .Ts .ts span[role="button"]',
                    '.Dj .Ts .ts',
                    '.ar9 .ts',
                    '.ar9 span[role="button"]',
                    '[data-tooltip*="of"] span',
                    '.ts span[role="button"]',
                    '.Ts .ts',
                    'span[aria-label*="of"]',
                    '.nH .ts'
                ];

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        if (element && element.textContent) {
                            const text = element.textContent.trim();
                            const match = text.match(/(?:of\\s+(\\d+)|\\b(\\d+)\\s+(?:conversations?|emails?)\\b|-(\\d+)\\s+of\\s+(\\d+))/);
                            if (match) {
                                const count = parseInt(match[1] || match[2] || match[4], 10);
                                if (!isNaN(count) && count > 0) {
                                    return count;
                                }
                            }
                        }
                    }
                }
                return 0;
            } catch (error) {
                console.error('Error extracting Gmail total count:', error);
                return -1;
            }
        })();
    `;
}