interface EmojiEntry {
  emoji: string;
  keywords: string[];
}

const EMOJI_LIST: EmojiEntry[] = [
  // Faces
  { emoji: '😀', keywords: ['grin', 'happy', 'smile'] },
  { emoji: '😊', keywords: ['blush', 'happy', 'smile'] },
  { emoji: '😂', keywords: ['laugh', 'cry', 'funny'] },
  { emoji: '🥹', keywords: ['hold', 'tears', 'touched'] },
  { emoji: '😍', keywords: ['love', 'heart', 'eyes'] },
  { emoji: '😎', keywords: ['cool', 'sunglasses'] },
  { emoji: '🤔', keywords: ['think', 'hmm', 'wonder'] },
  { emoji: '😴', keywords: ['sleep', 'zzz', 'tired'] },
  { emoji: '😤', keywords: ['angry', 'huff', 'frustrated'] },
  { emoji: '😢', keywords: ['cry', 'sad', 'tear'] },
  { emoji: '🤯', keywords: ['mind', 'blown', 'explode'] },
  { emoji: '🥳', keywords: ['party', 'celebrate', 'birthday'] },
  { emoji: '😇', keywords: ['angel', 'innocent', 'halo'] },
  { emoji: '🤗', keywords: ['hug', 'warm'] },
  { emoji: '🫡', keywords: ['salute', 'respect'] },
  // Hands & gestures
  { emoji: '👍', keywords: ['thumb', 'up', 'yes', 'good'] },
  { emoji: '👎', keywords: ['thumb', 'down', 'no', 'bad'] },
  { emoji: '👏', keywords: ['clap', 'applause', 'bravo'] },
  { emoji: '🙌', keywords: ['raise', 'hands', 'hooray', 'celebrate'] },
  { emoji: '🤝', keywords: ['handshake', 'deal', 'agree'] },
  { emoji: '✌️', keywords: ['peace', 'victory'] },
  { emoji: '💪', keywords: ['strong', 'muscle', 'flex'] },
  { emoji: '🫶', keywords: ['heart', 'hands', 'love'] },
  // Hearts & symbols
  { emoji: '❤️', keywords: ['heart', 'love', 'red'] },
  { emoji: '💛', keywords: ['heart', 'yellow'] },
  { emoji: '💚', keywords: ['heart', 'green'] },
  { emoji: '💙', keywords: ['heart', 'blue'] },
  { emoji: '💜', keywords: ['heart', 'purple'] },
  { emoji: '🖤', keywords: ['heart', 'black'] },
  { emoji: '⭐', keywords: ['star', 'gold', 'favorite'] },
  { emoji: '🌟', keywords: ['star', 'glow', 'sparkle'] },
  { emoji: '✨', keywords: ['sparkle', 'magic', 'clean'] },
  { emoji: '🔥', keywords: ['fire', 'hot', 'lit'] },
  { emoji: '💯', keywords: ['hundred', 'perfect', 'score'] },
  { emoji: '⚡', keywords: ['lightning', 'electric', 'fast', 'energy'] },
  { emoji: '💡', keywords: ['idea', 'bulb', 'light'] },
  { emoji: '🎯', keywords: ['target', 'goal', 'bullseye', 'aim'] },
  // Nature & weather
  { emoji: '🌈', keywords: ['rainbow', 'colors'] },
  { emoji: '☀️', keywords: ['sun', 'sunny', 'bright'] },
  { emoji: '🌙', keywords: ['moon', 'night', 'crescent'] },
  { emoji: '🌧️', keywords: ['rain', 'cloud'] },
  { emoji: '❄️', keywords: ['snow', 'cold', 'winter', 'ice'] },
  { emoji: '🌸', keywords: ['cherry', 'blossom', 'flower', 'spring'] },
  { emoji: '🌻', keywords: ['sunflower', 'flower'] },
  { emoji: '🍀', keywords: ['clover', 'luck', 'lucky', 'four'] },
  { emoji: '🌲', keywords: ['tree', 'evergreen', 'pine'] },
  { emoji: '🌊', keywords: ['wave', 'ocean', 'sea', 'water'] },
  // Animals
  { emoji: '🐶', keywords: ['dog', 'puppy', 'pet'] },
  { emoji: '🐱', keywords: ['cat', 'kitty', 'pet'] },
  { emoji: '🐻', keywords: ['bear', 'teddy'] },
  { emoji: '🦊', keywords: ['fox'] },
  { emoji: '🐍', keywords: ['snake', 'python'] },
  { emoji: '🦅', keywords: ['eagle', 'bird'] },
  { emoji: '🐝', keywords: ['bee', 'honey', 'busy'] },
  { emoji: '🦋', keywords: ['butterfly', 'beautiful'] },
  { emoji: '🐢', keywords: ['turtle', 'slow'] },
  { emoji: '🐬', keywords: ['dolphin', 'ocean'] },
  // Food & drink
  { emoji: '🍎', keywords: ['apple', 'red', 'fruit'] },
  { emoji: '🍕', keywords: ['pizza', 'food'] },
  { emoji: '🍔', keywords: ['burger', 'hamburger', 'food'] },
  { emoji: '🌮', keywords: ['taco', 'food', 'mexican'] },
  { emoji: '🍜', keywords: ['noodle', 'ramen', 'soup'] },
  { emoji: '🍰', keywords: ['cake', 'dessert', 'sweet'] },
  { emoji: '🍩', keywords: ['donut', 'doughnut', 'sweet'] },
  { emoji: '☕', keywords: ['coffee', 'tea', 'hot', 'drink'] },
  { emoji: '🍺', keywords: ['beer', 'drink', 'cheers'] },
  { emoji: '🧃', keywords: ['juice', 'box', 'drink'] },
  // Activities & sports
  { emoji: '⚽', keywords: ['soccer', 'football', 'sport'] },
  { emoji: '🏀', keywords: ['basketball', 'sport'] },
  { emoji: '🎾', keywords: ['tennis', 'sport'] },
  { emoji: '🏃', keywords: ['run', 'jog', 'exercise'] },
  { emoji: '🚴', keywords: ['bike', 'cycle', 'bicycle'] },
  { emoji: '🏊', keywords: ['swim', 'pool', 'water'] },
  { emoji: '🎮', keywords: ['game', 'controller', 'play', 'video'] },
  { emoji: '🎬', keywords: ['movie', 'film', 'cinema', 'clapper'] },
  { emoji: '🎵', keywords: ['music', 'note', 'song'] },
  { emoji: '🎨', keywords: ['art', 'paint', 'palette', 'creative'] },
  // Objects & tools
  { emoji: '📱', keywords: ['phone', 'mobile', 'cell'] },
  { emoji: '💻', keywords: ['laptop', 'computer'] },
  { emoji: '📧', keywords: ['email', 'mail', 'envelope'] },
  { emoji: '📝', keywords: ['note', 'memo', 'write', 'pencil'] },
  { emoji: '📚', keywords: ['books', 'read', 'study', 'library'] },
  { emoji: '📅', keywords: ['calendar', 'date', 'schedule'] },
  { emoji: '⏰', keywords: ['alarm', 'clock', 'time', 'wake'] },
  { emoji: '🔑', keywords: ['key', 'lock', 'password'] },
  { emoji: '🔧', keywords: ['wrench', 'tool', 'fix', 'repair'] },
  { emoji: '💰', keywords: ['money', 'bag', 'rich', 'cash'] },
  { emoji: '🎁', keywords: ['gift', 'present', 'birthday'] },
  { emoji: '📦', keywords: ['box', 'package', 'delivery'] },
  { emoji: '🏠', keywords: ['house', 'home'] },
  { emoji: '🚗', keywords: ['car', 'drive', 'auto'] },
  { emoji: '✈️', keywords: ['plane', 'airplane', 'travel', 'flight'] },
  { emoji: '🚀', keywords: ['rocket', 'launch', 'space', 'fast'] },
  // People & roles
  { emoji: '👶', keywords: ['baby', 'child', 'infant'] },
  { emoji: '👦', keywords: ['boy', 'child', 'kid'] },
  { emoji: '👧', keywords: ['girl', 'child', 'kid'] },
  { emoji: '👨', keywords: ['man', 'adult', 'male'] },
  { emoji: '👩', keywords: ['woman', 'adult', 'female'] },
  { emoji: '👨‍👩‍👧‍👦', keywords: ['family', 'parents', 'children'] },
  // Status & flags
  { emoji: '✅', keywords: ['check', 'done', 'complete', 'yes'] },
  { emoji: '❌', keywords: ['cross', 'no', 'wrong', 'delete'] },
  { emoji: '⚠️', keywords: ['warning', 'caution', 'alert'] },
  { emoji: '🚫', keywords: ['no', 'forbidden', 'stop', 'ban'] },
  { emoji: '❓', keywords: ['question', 'what', 'help'] },
  { emoji: '❗', keywords: ['exclamation', 'important', 'alert'] },
  { emoji: '🔴', keywords: ['red', 'circle', 'stop'] },
  { emoji: '🟡', keywords: ['yellow', 'circle', 'caution'] },
  { emoji: '🟢', keywords: ['green', 'circle', 'go'] },
  { emoji: '🔵', keywords: ['blue', 'circle'] },
  // Misc
  { emoji: '🎉', keywords: ['party', 'celebrate', 'tada', 'confetti'] },
  { emoji: '🎊', keywords: ['confetti', 'celebrate'] },
  { emoji: '🏆', keywords: ['trophy', 'winner', 'champion', 'award'] },
  { emoji: '🎖️', keywords: ['medal', 'award', 'honor'] },
  { emoji: '🧹', keywords: ['broom', 'clean', 'sweep'] },
  { emoji: '🧺', keywords: ['basket', 'laundry'] },
  { emoji: '🛒', keywords: ['cart', 'shopping', 'grocery'] },
  { emoji: '💊', keywords: ['pill', 'medicine', 'health'] },
  { emoji: '🩺', keywords: ['stethoscope', 'doctor', 'health'] },
  { emoji: '🧘', keywords: ['yoga', 'meditate', 'zen', 'calm'] },
  { emoji: '💤', keywords: ['sleep', 'zzz', 'rest'] },
  { emoji: '📞', keywords: ['phone', 'call', 'telephone'] },
  { emoji: '🎂', keywords: ['birthday', 'cake', 'celebrate'] },
  { emoji: '🌍', keywords: ['earth', 'globe', 'world'] },
  { emoji: '🐾', keywords: ['paw', 'pet', 'animal'] },
  { emoji: '🍳', keywords: ['cook', 'egg', 'fry', 'breakfast'] },
  { emoji: '🧠', keywords: ['brain', 'think', 'smart', 'mind'] },
  { emoji: '👀', keywords: ['eyes', 'look', 'see', 'watch'] },
  { emoji: '🤞', keywords: ['fingers', 'crossed', 'luck', 'hope'] },
  { emoji: '🫠', keywords: ['melt', 'relax', 'dissolve'] },
  { emoji: '💐', keywords: ['bouquet', 'flowers', 'gift'] },
  { emoji: '🪴', keywords: ['plant', 'potted', 'garden'] },
  { emoji: '🧩', keywords: ['puzzle', 'piece', 'jigsaw'] },
  { emoji: '🎒', keywords: ['backpack', 'school', 'bag'] },
  { emoji: '🗓️', keywords: ['calendar', 'date', 'plan'] },
  { emoji: '📌', keywords: ['pin', 'pushpin', 'important'] },
  { emoji: '🏋️', keywords: ['weight', 'lift', 'gym', 'exercise'] },
  { emoji: '🧑‍💻', keywords: ['developer', 'code', 'programmer', 'tech'] },
  { emoji: '🎧', keywords: ['headphones', 'music', 'listen'] },
  { emoji: '📺', keywords: ['tv', 'television', 'watch'] },
];

export class EmojiPicker {
  private static instance: EmojiPicker | null = null;

  private overlay: HTMLElement;
  private modal: HTMLElement;
  private searchInput: HTMLInputElement;
  private grid: HTMLElement;
  private resolve: ((value: string | null) => void) | null = null;
  private selectedEmoji: string = '';

  private constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'emoji-picker-overlay';

    this.modal = document.createElement('div');
    this.modal.className = 'emoji-picker-modal';

    // Search input
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.className = 'emoji-picker-search';
    this.searchInput.placeholder = 'Search or paste emoji...';
    this.searchInput.addEventListener('input', () => this.filterEmojis());

    // Grid
    this.grid = document.createElement('div');
    this.grid.className = 'emoji-picker-grid';

    // Actions
    const actions = document.createElement('div');
    actions.className = 'emoji-picker-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'emoji-picker-btn cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.close(null));

    const okBtn = document.createElement('button');
    okBtn.className = 'emoji-picker-btn ok';
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', () => this.close(this.getResult()));

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);

    this.modal.appendChild(this.searchInput);
    this.modal.appendChild(this.grid);
    this.modal.appendChild(actions);
    this.overlay.appendChild(this.modal);

    // Close on overlay click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close(null);
    });

    document.body.appendChild(this.overlay);
  }

  private static getInstance(): EmojiPicker {
    if (!EmojiPicker.instance) {
      EmojiPicker.instance = new EmojiPicker();
    }
    return EmojiPicker.instance;
  }

  static show(currentEmoji?: string): Promise<string | null> {
    const picker = EmojiPicker.getInstance();
    return picker.open(currentEmoji);
  }

  private open(currentEmoji?: string): Promise<string | null> {
    this.selectedEmoji = currentEmoji || '';
    this.searchInput.value = this.selectedEmoji;
    this.renderGrid(EMOJI_LIST);
    this.overlay.classList.add('visible');
    this.searchInput.focus();

    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  private close(result: string | null): void {
    this.overlay.classList.remove('visible');
    if (this.resolve) {
      this.resolve(result);
      this.resolve = null;
    }
  }

  private getResult(): string | null {
    const value = this.searchInput.value.trim();
    if (!value) return null;
    // Return the first emoji-like character(s) from the input
    // This handles both grid selection and direct paste/type
    return value;
  }

  private filterEmojis(): void {
    const query = this.searchInput.value.toLowerCase().trim();
    if (!query) {
      this.renderGrid(EMOJI_LIST);
      return;
    }

    // Check if the query itself is an emoji (pasted)
    const isEmoji = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/u.test(query);
    if (isEmoji) {
      this.selectedEmoji = query;
    }

    const filtered = EMOJI_LIST.filter(
      (e) =>
        e.emoji.includes(query) ||
        e.keywords.some((k) => k.includes(query)),
    );
    this.renderGrid(filtered);
  }

  private renderGrid(emojis: EmojiEntry[]): void {
    this.grid.innerHTML = '';
    for (const entry of emojis) {
      const btn = document.createElement('button');
      btn.className = 'emoji-picker-emoji';
      btn.textContent = entry.emoji;
      btn.title = entry.keywords.join(', ');
      btn.addEventListener('click', () => {
        this.selectedEmoji = entry.emoji;
        this.searchInput.value = entry.emoji;
      });
      this.grid.appendChild(btn);
    }
  }
}
