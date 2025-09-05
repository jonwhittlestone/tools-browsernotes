export class VimMode {
    textarea: HTMLTextAreaElement;
    indicator: HTMLElement;
    mode: 'normal' | 'insert' | 'visual' = 'normal';
    enabled: boolean = false;
    yankedText: string = '';
    lastCommand: string = '';
    commandBuffer: string = '';
    visualStart: number | null = null;
    visualEnd: number | null = null;
    cursor: HTMLElement | null = null;
    undoStack: { content: string; cursor: number }[] = [];
    redoStack: { content: string; cursor: number }[] = [];
    onLineDeleted?: (deletedLine: string, fullContent: string, cursorPosition: number) => void;
    
    constructor(
        textarea: HTMLTextAreaElement, 
        indicator: HTMLElement, 
        onLineDeleted?: (deletedLine: string, fullContent: string, cursorPosition: number) => void
    ) {
        this.textarea = textarea;
        this.indicator = indicator;
        this.onLineDeleted = onLineDeleted;
        this.cursor = document.getElementById('vimCursor');
        this.handleKeydown = this.handleKeydown.bind(this);
        this.updateCursor = this.updateCursor.bind(this);
        this.handleBlur = this.handleBlur.bind(this);
    }
    
    enable(): void {
        this.enabled = true;
        this.mode = 'normal';
        this.textarea.addEventListener('keydown', this.handleKeydown, true);
        this.textarea.addEventListener('scroll', this.updateCursor);
        this.textarea.addEventListener('blur', this.handleBlur);
        this.updateIndicator();
        // Keep focus to allow cursor navigation
        this.textarea.focus();
        // Set readonly in normal mode to prevent typing
        this.textarea.setAttribute('readonly', 'readonly');
        this.showCursor();
    }
    
    disable(): void {
        this.enabled = false;
        this.textarea.removeEventListener('keydown', this.handleKeydown, true);
        this.textarea.removeEventListener('scroll', this.updateCursor);
        this.textarea.removeEventListener('blur', this.handleBlur);
        this.indicator.classList.remove('active');
        this.indicator.textContent = '';
        // Remove readonly when vim mode is disabled
        this.textarea.removeAttribute('readonly');
        this.hideCursor();
    }
    
    updateIndicator(): void {
        if (!this.enabled) return;
        
        this.indicator.classList.add('active');
        this.indicator.classList.remove('normal-mode', 'insert-mode', 'visual-mode');
        
        switch (this.mode) {
            case 'normal':
                this.indicator.textContent = 'NORMAL';
                this.indicator.classList.add('normal-mode');
                break;
            case 'insert':
                this.indicator.textContent = 'INSERT';
                this.indicator.classList.add('insert-mode');
                break;
            case 'visual':
                this.indicator.textContent = 'VISUAL';
                this.indicator.classList.add('visual-mode');
                break;
        }
    }
    
    handleKeydown(e: KeyboardEvent): void {
        if (!this.enabled) return;
        
        if (this.mode === 'insert') {
            if (e.key === 'Escape' || (e.ctrlKey && e.key === '[')) {
                e.preventDefault();
                e.stopPropagation();
                this.enterNormalMode();
            }
            return;
        }
        
        if (this.mode === 'visual') {
            this.handleVisualMode(e);
            return;
        }
        
        if (this.mode === 'normal') {
            this.handleNormalMode(e);
        }
    }
    
    handleNormalMode(e: KeyboardEvent): void {
        const key = e.key;
        const ctrl = e.ctrlKey;
        const shift = e.shiftKey;
        
        if (ctrl && !shift) {
            if (key === 'r') {
                e.preventDefault();
                document.execCommand('redo');
                return;
            }
        }
        
        switch (key) {
            case 'i':
                e.preventDefault();
                this.enterInsertMode();
                break;
            
            case 'a':
                e.preventDefault();
                this.enterInsertMode();
                this.moveCursor(1);
                break;
            
            case 'o':
                e.preventDefault();
                this.enterInsertMode();
                this.insertNewLine(false);
                break;
            
            case 'O':
                e.preventDefault();
                this.enterInsertMode();
                this.insertNewLine(true);
                break;
            
            case 'v':
                e.preventDefault();
                this.enterVisualMode();
                break;
            
            case 'V':
                e.preventDefault();
                this.enterVisualLineMode();
                break;
            
            case 'h':
            case 'ArrowLeft':
                e.preventDefault();
                this.moveCursor(-1);
                break;
            
            case 'l':
            case 'ArrowRight':
                e.preventDefault();
                this.moveCursor(1);
                break;
            
            case 'j':
            case 'ArrowDown':
                e.preventDefault();
                this.moveLines(1);
                break;
            
            case 'k':
            case 'ArrowUp':
                e.preventDefault();
                this.moveLines(-1);
                break;
            
            case 'w':
                e.preventDefault();
                this.moveWord(1);
                break;
            
            case 'b':
                e.preventDefault();
                this.moveWord(-1);
                break;
            
            case '0':
            case 'Home':
                e.preventDefault();
                this.moveToLineStart();
                break;
            
            case '$':
            case 'End':
                e.preventDefault();
                this.moveToLineEnd();
                break;
            
            case 'g':
                e.preventDefault();
                if (this.lastCommand === 'g') {
                    this.moveToStart();
                    this.commandBuffer = '';
                } else {
                    this.commandBuffer = 'g';
                }
                break;
            
            case 'G':
                e.preventDefault();
                this.moveToEnd();
                break;
            
            case 'x':
                e.preventDefault();
                this.deleteChar();
                break;
            
            case 'd':
                e.preventDefault();
                if (this.lastCommand === 'd') {
                    this.deleteLine();
                    this.commandBuffer = '';
                } else {
                    this.commandBuffer = 'd';
                }
                break;
            
            case 'y':
                e.preventDefault();
                if (this.lastCommand === 'y') {
                    this.yankLine();
                    this.commandBuffer = '';
                } else {
                    this.commandBuffer = 'y';
                }
                break;
            
            case 'p':
                e.preventDefault();
                this.paste(false);
                break;
            
            case 'P':
                e.preventDefault();
                this.paste(true);
                break;
            
            case 'u':
                e.preventDefault();
                this.undo();
                break;
            
            case 'U':
                e.preventDefault();
                this.redo();
                break;
            
            default:
                this.commandBuffer = '';
        }
        
        this.lastCommand = this.commandBuffer || key;
    }
    
    handleVisualMode(e: KeyboardEvent): void {
        const key = e.key;
        
        if (key === 'Escape' || (e.ctrlKey && key === '[')) {
            e.preventDefault();
            this.enterNormalMode();
            return;
        }
        
        switch (key) {
            case 'h':
            case 'ArrowLeft':
                e.preventDefault();
                this.extendSelection(-1);
                break;
            
            case 'l':
            case 'ArrowRight':
                e.preventDefault();
                this.extendSelection(1);
                break;
            
            case 'j':
            case 'ArrowDown':
            case 'k':
            case 'ArrowUp':
                e.preventDefault();
                break;
            
            case 'y':
                e.preventDefault();
                this.yankSelection();
                this.enterNormalMode();
                break;
            
            case 'd':
            case 'x':
                e.preventDefault();
                this.deleteSelection();
                this.enterNormalMode();
                break;
        }
    }
    
    enterNormalMode(): void {
        this.mode = 'normal';
        // Set readonly to prevent typing in normal mode
        this.textarea.setAttribute('readonly', 'readonly');
        this.updateIndicator();
        // Don't clear selection, just collapse it to cursor position
        const pos = this.textarea.selectionStart;
        this.textarea.setSelectionRange(pos, pos);
        this.updateCursor();
        this.showCursor();
        // Force focus to stay on textarea (override browser default)
        if (document.activeElement !== this.textarea) {
            this.textarea.focus();
        }
    }
    
    enterInsertMode(): void {
        this.mode = 'insert';
        // Remove readonly to allow typing in insert mode
        this.textarea.removeAttribute('readonly');
        // Ensure cursor position is maintained
        const pos = this.textarea.selectionStart;
        this.textarea.focus();
        this.textarea.setSelectionRange(pos, pos);
        this.updateIndicator();
        this.hideCursor();
    }
    
    enterVisualMode(): void {
        this.mode = 'visual';
        this.visualStart = this.textarea.selectionStart;
        this.visualEnd = this.textarea.selectionEnd;
        this.updateIndicator();
    }
    
    enterVisualLineMode(): void {
        this.mode = 'visual';
        const pos = this.textarea.selectionStart;
        const text = this.textarea.value;
        
        let lineStart = pos;
        while (lineStart > 0 && text[lineStart - 1] !== '\n') {
            lineStart--;
        }
        
        let lineEnd = pos;
        while (lineEnd < text.length && text[lineEnd] !== '\n') {
            lineEnd++;
        }
        
        this.textarea.setSelectionRange(lineStart, lineEnd);
        this.visualStart = lineStart;
        this.visualEnd = lineEnd;
        this.updateIndicator();
    }
    
    moveCursor(offset: number): void {
        const pos = this.textarea.selectionStart + offset;
        this.textarea.setSelectionRange(pos, pos);
        this.updateCursor();
    }
    
    moveLines(offset: number): void {
        const text = this.textarea.value;
        const pos = this.textarea.selectionStart;
        const lines = text.split('\n');
        
        let currentLine = 0;
        let charCount = 0;
        
        for (let i = 0; i < lines.length; i++) {
            if (charCount + lines[i].length >= pos) {
                currentLine = i;
                break;
            }
            charCount += lines[i].length + 1;
        }
        
        const targetLine = Math.max(0, Math.min(lines.length - 1, currentLine + offset));
        
        let newPos = 0;
        for (let i = 0; i < targetLine; i++) {
            newPos += lines[i].length + 1;
        }
        
        const columnInCurrentLine = pos - charCount;
        newPos += Math.min(columnInCurrentLine, lines[targetLine].length);
        
        this.textarea.setSelectionRange(newPos, newPos);
        this.updateCursor();
    }
    
    moveWord(direction: number): void {
        const text = this.textarea.value;
        let pos = this.textarea.selectionStart;
        
        if (direction > 0) {
            while (pos < text.length && /\w/.test(text[pos])) pos++;
            while (pos < text.length && !/\w/.test(text[pos])) pos++;
        } else {
            pos--;
            while (pos > 0 && !/\w/.test(text[pos])) pos--;
            while (pos > 0 && /\w/.test(text[pos - 1])) pos--;
        }
        
        this.textarea.setSelectionRange(pos, pos);
        this.updateCursor();
    }
    
    moveToLineStart(): void {
        const text = this.textarea.value;
        let pos = this.textarea.selectionStart;
        
        while (pos > 0 && text[pos - 1] !== '\n') {
            pos--;
        }
        
        this.textarea.setSelectionRange(pos, pos);
        this.updateCursor();
    }
    
    moveToLineEnd(): void {
        const text = this.textarea.value;
        let pos = this.textarea.selectionStart;
        
        while (pos < text.length && text[pos] !== '\n') {
            pos++;
        }
        
        this.textarea.setSelectionRange(pos, pos);
        this.updateCursor();
    }
    
    moveToStart(): void {
        this.textarea.setSelectionRange(0, 0);
    }
    
    moveToEnd(): void {
        const len = this.textarea.value.length;
        this.textarea.setSelectionRange(len, len);
    }
    
    insertNewLine(above: boolean): void {
        this.saveState();
        const text = this.textarea.value;
        const pos = this.textarea.selectionStart;
        
        if (above) {
            this.moveToLineStart();
            const newPos = this.textarea.selectionStart;
            this.textarea.value = text.slice(0, newPos) + '\n' + text.slice(newPos);
            this.textarea.setSelectionRange(newPos, newPos);
        this.updateCursor();
        } else {
            this.moveToLineEnd();
            const newPos = this.textarea.selectionStart;
            this.textarea.value = text.slice(0, newPos) + '\n' + text.slice(newPos);
            this.textarea.setSelectionRange(newPos + 1, newPos + 1);
        }
        
        this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    deleteChar(): void {
        const text = this.textarea.value;
        const pos = this.textarea.selectionStart;
        
        if (pos < text.length) {
            this.saveState();
            this.textarea.value = text.slice(0, pos) + text.slice(pos + 1);
            this.textarea.setSelectionRange(pos, pos);
        this.updateCursor();
            this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
    
    deleteLine(): void {
        this.saveState();
        const text = this.textarea.value;
        const pos = this.textarea.selectionStart;
        
        let lineStart = pos;
        while (lineStart > 0 && text[lineStart - 1] !== '\n') {
            lineStart--;
        }
        
        let lineEnd = pos;
        while (lineEnd < text.length && text[lineEnd] !== '\n') {
            lineEnd++;
        }
        
        if (lineEnd < text.length) {
            lineEnd++;
        }
        
        this.yankedText = text.slice(lineStart, lineEnd);
        
        // Call the archive callback before deleting
        if (this.onLineDeleted) {
            this.onLineDeleted(this.yankedText, text, pos);
        }
        
        this.textarea.value = text.slice(0, lineStart) + text.slice(lineEnd);
        this.textarea.setSelectionRange(lineStart, lineStart);
        this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    yankLine(): void {
        const text = this.textarea.value;
        const pos = this.textarea.selectionStart;
        
        let lineStart = pos;
        while (lineStart > 0 && text[lineStart - 1] !== '\n') {
            lineStart--;
        }
        
        let lineEnd = pos;
        while (lineEnd < text.length && text[lineEnd] !== '\n') {
            lineEnd++;
        }
        
        if (lineEnd < text.length) {
            lineEnd++;
        }
        
        this.yankedText = text.slice(lineStart, lineEnd);
    }
    
    yankSelection(): void {
        if (this.textarea.selectionStart !== this.textarea.selectionEnd) {
            this.yankedText = this.textarea.value.slice(
                this.textarea.selectionStart,
                this.textarea.selectionEnd
            );
        }
    }
    
    deleteSelection(): void {
        if (this.textarea.selectionStart !== this.textarea.selectionEnd) {
            this.saveState();
            const text = this.textarea.value;
            const start = this.textarea.selectionStart;
            const end = this.textarea.selectionEnd;
            
            this.yankedText = text.slice(start, end);
            this.textarea.value = text.slice(0, start) + text.slice(end);
            this.textarea.setSelectionRange(start, start);
            this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
    
    paste(before: boolean): void {
        if (!this.yankedText) return;
        
        this.saveState();
        const text = this.textarea.value;
        const pos = this.textarea.selectionStart;
        
        const insertPos = before ? pos : pos + 1;
        this.textarea.value = text.slice(0, insertPos) + this.yankedText + text.slice(insertPos);
        this.textarea.setSelectionRange(insertPos, insertPos);
        this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    extendSelection(offset: number): void {
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        
        if (offset > 0) {
            this.textarea.setSelectionRange(start, Math.min(end + offset, this.textarea.value.length));
        } else {
            this.textarea.setSelectionRange(Math.max(start + offset, 0), end);
        }
    }
    
    clearSelection(): void {
        const pos = this.textarea.selectionStart;
        this.textarea.setSelectionRange(pos, pos);
        this.updateCursor();
    }
    
    showCursor(): void {
        if (this.cursor && this.mode === 'normal') {
            this.cursor.style.display = 'block';
            // Small delay to ensure textarea is properly positioned
            setTimeout(() => this.updateCursor(), 10);
        }
    }
    
    hideCursor(): void {
        if (this.cursor) {
            this.cursor.style.display = 'none';
        }
    }
    
    updateCursor(): void {
        if (!this.cursor || this.mode !== 'normal' || !this.enabled) {
            return;
        }
        
        const pos = this.textarea.selectionStart;
        const textBeforeCursor = this.textarea.value.substring(0, pos);
        
        const textareaRect = this.textarea.getBoundingClientRect();
        const containerRect = this.textarea.parentElement!.getBoundingClientRect();
        
        // Calculate position based on text content
        const lines = textBeforeCursor.split('\n');
        const currentLine = lines.length - 1;
        const currentColumn = lines[lines.length - 1].length;
        
        // Use a more reliable method
        const style = window.getComputedStyle(this.textarea);
        const lineHeight = parseFloat(style.lineHeight) || 24;
        const fontSize = parseFloat(style.fontSize) || 14;
        const charWidth = fontSize * 0.6; // Approximate character width for monospace
        
        const x = textareaRect.left - containerRect.left + 20 + (currentColumn * charWidth);
        const y = textareaRect.top - containerRect.top + 20 + (currentLine * lineHeight) - this.textarea.scrollTop;
        
        this.cursor.style.left = x + 'px';
        this.cursor.style.top = y + 'px';
        // Block cursor like traditional vim
        this.cursor.style.width = charWidth + 'px';
        this.cursor.style.height = lineHeight + 'px';
    }
    
    handleBlur(e: FocusEvent): void {
        // In vim normal mode, prevent focus loss - refocus immediately
        if (this.enabled && this.mode === 'normal') {
            e.preventDefault();
            // Use setTimeout to avoid focus fighting
            setTimeout(() => {
                if (this.enabled && this.mode === 'normal') {
                    this.textarea.focus();
                }
            }, 0);
        }
    }
    
    saveState(): void {
        const state = {
            content: this.textarea.value,
            cursor: this.textarea.selectionStart
        };
        this.undoStack.push(state);
        // Limit undo stack size to prevent memory issues
        if (this.undoStack.length > 50) {
            this.undoStack.shift();
        }
        // Clear redo stack when new action is performed
        this.redoStack = [];
    }
    
    undo(): void {
        if (this.undoStack.length === 0) return;
        
        const currentState = {
            content: this.textarea.value,
            cursor: this.textarea.selectionStart
        };
        this.redoStack.push(currentState);
        
        const previousState = this.undoStack.pop()!;
        this.textarea.value = previousState.content;
        this.textarea.setSelectionRange(previousState.cursor, previousState.cursor);
        this.updateCursor();
        this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    redo(): void {
        if (this.redoStack.length === 0) return;
        
        const currentState = {
            content: this.textarea.value,
            cursor: this.textarea.selectionStart
        };
        this.undoStack.push(currentState);
        
        const nextState = this.redoStack.pop()!;
        this.textarea.value = nextState.content;
        this.textarea.setSelectionRange(nextState.cursor, nextState.cursor);
        this.updateCursor();
        this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
}