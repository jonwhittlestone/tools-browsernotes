document.addEventListener('DOMContentLoaded', async () => {
    const vimModeToggle = document.getElementById('vimMode');
    const vimHelp = document.getElementById('vimHelp');
    const workContextToggle = document.getElementById('workContext');
    
    const result = await chrome.storage.sync.get(['vimEnabled', 'workContextEnabled']);
    vimModeToggle.checked = result.vimEnabled || false;
    workContextToggle.checked = result.workContextEnabled !== false; // Default to true
    
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
    
    workContextToggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await chrome.storage.sync.set({ workContextEnabled: enabled });
        
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                if (tab.url && tab.url.startsWith('chrome://newtab')) {
                    chrome.tabs.reload(tab.id);
                }
            });
        });
    });
});