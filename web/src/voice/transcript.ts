/**
 * Flicker-free live transcript (Wispr-Flow style): words stream in one by one.
 * Only the changed tail of the word list is touched in the DOM, so stable words never repaint;
 * new words fade in; tentative (interim) words are dimmer until the utterance is final.
 */
const STYLE_ID = 'wc-live-transcript-style';
const CSS = `
.wc-lt-w{display:inline;opacity:1;transition:opacity .18s ease,color .25s ease}
.wc-lt-w.wc-lt-new{opacity:0}
.wc-lt-tent .wc-lt-w{opacity:.72}
.wc-lt-tent .wc-lt-w.wc-lt-new{opacity:0}
`;

export class LiveTranscript {
  private words: string[] = [];
  private spans: HTMLSpanElement[] = [];
  private settled = false;
  constructor(private el: HTMLElement) {
    if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
      const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
    }
    el.setAttribute('aria-live', 'polite');
  }

  /** Feed every `interim` (running text of the current utterance). */
  update(text: string): void {
    if (this.settled) { this.clear(); this.settled = false; } // new utterance starts a fresh line
    const next = text.trim() ? text.trim().split(/\s+/) : [];
    let i = 0;
    while (i < next.length && i < this.words.length && next[i] === this.words[i]) i++;
    // revise only the tail that changed
    for (let k = this.spans.length - 1; k >= i; k--) {
      // same word count position but different text: edit in place (no fade) to avoid flicker
      if (k < next.length) { this.spans[k].textContent = (k ? ' ' : '') + next[k]; }
      else { this.spans[k].remove(); this.spans.pop(); }
    }
    for (let k = this.spans.length; k < next.length; k++) {
      const s = document.createElement('span');
      s.className = 'wc-lt-w wc-lt-new';
      s.textContent = (k ? ' ' : '') + next[k];
      this.el.appendChild(s);
      this.spans.push(s);
      requestAnimationFrame(() => s.classList.remove('wc-lt-new'));
    }
    this.words = next;
    this.el.classList.add('wc-lt-tent');
  }

  /** Utterance committed: settle the words (full opacity). */
  commit(text?: string): void {
    if (text !== undefined) this.update(text);
    this.el.classList.remove('wc-lt-tent');
    this.settled = true;
  }

  clear(): void { this.settled = false; this.words = []; this.spans = []; this.el.textContent = ''; this.el.classList.remove('wc-lt-tent'); }
}
