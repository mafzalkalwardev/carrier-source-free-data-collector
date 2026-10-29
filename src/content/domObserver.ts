export type DomChangeCallback = (info: {
  url: string;
  reason: 'mutation' | 'url' | 'popstate';
}) => void;

/**
 * Selective MutationObserver + URL-change detection for "Capture As I Browse".
 * Disconnects when inactive to avoid idle overhead.
 */
export class DomObserverController {
  private observer: MutationObserver | null = null;
  private urlPollTimer: number | null = null;
  private lastUrl: string;
  private lastFingerprint: string | null = null;
  private debounceTimer: number | null = null;
  private callback: DomChangeCallback | null = null;
  private active = false;

  constructor() {
    this.lastUrl = location.href;
  }

  start(callback: DomChangeCallback, targetSelector?: string): void {
    this.stop();
    this.callback = callback;
    this.active = true;
    this.lastUrl = location.href;

    const root =
      (targetSelector && document.querySelector(targetSelector)) ||
      document.querySelector('main') ||
      document.body;

    this.observer = new MutationObserver(() => {
      this.scheduleNotify('mutation');
    });

    this.observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: false,
      attributes: false,
    });

    window.addEventListener('popstate', this.onPopState);
    // SPA navigation often uses pushState/replaceState
    this.patchHistory();

    this.urlPollTimer = window.setInterval(() => {
      if (location.href !== this.lastUrl) {
        this.lastUrl = location.href;
        this.scheduleNotify('url');
      }
    }, 800);
  }

  stop(): void {
    this.active = false;
    this.observer?.disconnect();
    this.observer = null;
    if (this.urlPollTimer != null) {
      clearInterval(this.urlPollTimer);
      this.urlPollTimer = null;
    }
    if (this.debounceTimer != null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    window.removeEventListener('popstate', this.onPopState);
    this.callback = null;
  }

  isActive(): boolean {
    return this.active;
  }

  setFingerprint(fp: string): void {
    this.lastFingerprint = fp;
  }

  getLastFingerprint(): string | null {
    return this.lastFingerprint;
  }

  private onPopState = (): void => {
    this.scheduleNotify('popstate');
  };

  private scheduleNotify(reason: 'mutation' | 'url' | 'popstate'): void {
    if (!this.active || !this.callback) return;
    if (this.debounceTimer != null) clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => {
      if (!this.callback) return;
      this.callback({ url: location.href, reason });
    }, 450);
  }

  private patchHistory(): void {
    const notify = () => this.scheduleNotify('url');
    const wrap = (fn: typeof history.pushState) =>
      function (this: History, ...args: Parameters<typeof history.pushState>) {
        const ret = fn.apply(this, args);
        notify();
        return ret;
      };

    if (!(history.pushState as unknown as { __csPatched?: boolean }).__csPatched) {
      history.pushState = wrap(history.pushState) as typeof history.pushState;
      (history.pushState as unknown as { __csPatched?: boolean }).__csPatched = true;
      history.replaceState = wrap(history.replaceState) as typeof history.replaceState;
      (history.replaceState as unknown as { __csPatched?: boolean }).__csPatched = true;
    }
  }
}

/** Wait until results fingerprint changes or timeout. */
export function waitForResultsChange(
  getFingerprint: () => string,
  previousFingerprint: string,
  timeoutMs = 15000,
  /** Optional: require at least this many cards before accepting the change. */
  getCardCount?: () => number,
  minCards = 1
): Promise<{ changed: boolean; fingerprint: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    let sawDifferentFp = false;

    const finish = (changed: boolean, fingerprint: string) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearInterval(poll);
      resolve({ changed, fingerprint });
    };

    const check = () => {
      const fp = getFingerprint();
      const count = getCardCount ? getCardCount() : minCards;
      if (fp && fp !== previousFingerprint) {
        sawDifferentFp = true;
        // Prefer a changed fingerprint that already has cards (skip empty loading states)
        if (count >= minCards) {
          finish(true, fp);
          return;
        }
      }
      if (Date.now() - start > timeoutMs) {
        finish(sawDifferentFp, fp);
      }
    };

    const observer = new MutationObserver(() => check());
    const root = document.querySelector('main') ?? document.body;
    observer.observe(root, { childList: true, subtree: true });

    const poll = window.setInterval(check, 300);
    check();
  });
}
