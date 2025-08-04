document.addEventListener('DOMContentLoaded', async () => {
    const vimModeToggle = document.getElementById('vimMode');
    const vimHelp = document.getElementById('vimHelp');
    
    const result = await chrome.storage.sync.get(['vimEnabled']);
    vimModeToggle.checked = result.vimEnabled || false;
    
    if (vimModeToggle.checked) {
        vimHelp.style.display = 'block';
    }
    
    vimModeToggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await chrome.storage.sync.set({ vimEnabled: enabled });
        
        vimHelp.style.display = enabled ? 'block' : 'none';
        
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                if (tab.url && tab.url.startsWith('chrome://newtab')) {
                    chrome.tabs.reload(tab.id);
                }
            });
        });
    });
});