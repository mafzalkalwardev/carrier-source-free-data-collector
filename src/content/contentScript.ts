import { adapter } from './carrierSourceAdapter';

/**
 * Content script bridge for CarrierSource pages.
 * Speaks only with the extension; never contacts external APIs.
 *
 * Idempotent: programmatic re-injection after extension reload must not
 * register duplicate listeners.
 */

type IncomingMessage = {
  type: string;
  payload?: Record<string, unknown>;
};

declare global {
  interface Window {
    __csFreeDataCollectorBound?: boolean;
  }
}

if (!window.__csFreeDataCollectorBound) {
  window.__csFreeDataCollectorBound = true;

  chrome.runtime.onMessage.addListener(
    (message: IncomingMessage, _sender, sendResponse) => {
      handleMessage(message)
        .then(sendResponse)
        .catch((err: unknown) => {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      return true; // async
    }
  );

  chrome.runtime
    .sendMessage({ type: 'CONTENT_READY', payload: { url: location.href } })
    .catch(() => {
      /* side panel may not be listening */
    });
}

async function handleMessage(message: IncomingMessage): Promise<unknown> {
  switch (message.type) {
    case 'PING':
      return { ok: true, url: location.href };

    case 'GET_PAGE_CONTEXT': {
      const ctx = adapter.getPageContext();
      return { ok: true, ...ctx };
    }

    case 'EXTRACT_CARDS': {
      try {
        const result = adapter.extractCards();
        return {
          ok: true,
          carriers: result.carriers,
          pageFingerprint: result.pageFingerprint,
          searchContext: result.searchContext,
        };
      } catch (err) {
        return {
          ok: false,
          carriers: [],
          pageFingerprint: '',
          searchContext: adapter.getPageContext(),
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case 'EXTRACT_CARDS_WHEN_READY': {
      const timeoutMs = Number(message.payload?.timeoutMs ?? 12000);
      const minCards = Number(message.payload?.minCards ?? 1);
      const started = Date.now();
      let last = adapter.extractCards();
      while (Date.now() - started < timeoutMs) {
        last = adapter.extractCards();
        if (last.carriers.length >= minCards) {
          return {
            ok: true,
            carriers: last.carriers,
            pageFingerprint: last.pageFingerprint,
            searchContext: last.searchContext,
          };
        }
        await new Promise((r) => setTimeout(r, 350));
      }
      return {
        ok: true,
        carriers: last.carriers,
        pageFingerprint: last.pageFingerprint,
        searchContext: last.searchContext,
        timedOut: last.carriers.length < minCards,
      };
    }

    case 'EXTRACT_PROFILE': {
      try {
        const profile = adapter.extractProfile();
        if (!profile) {
          return { ok: false, error: 'No free profile details found.', profile: null };
        }
        return { ok: true, profile };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          profile: null,
        };
      }
    }

    case 'DETECT_PAGINATION': {
      return { ok: true, pagination: adapter.detectPagination() };
    }

    case 'CLICK_NEXT_PAGE': {
      const result = await adapter.clickNext();
      return { ok: result.clicked, ...result };
    }

    case 'GET_PAGE_READY_STATE': {
      return { ok: true, ...adapter.getReadyState() };
    }

    case 'WAIT_FOR_RESULTS_CHANGE': {
      const previous = String(message.payload?.previousFingerprint ?? '');
      const wait = await adapter.waitForChange(previous);
      return { ok: true, ...wait };
    }

    case 'START_BROWSE_OBSERVER': {
      adapter.observer.start(async ({ url, reason }) => {
        const extracted = adapter.extractCards();
        const lastFp = adapter.observer.getLastFingerprint();
        if (lastFp && extracted.pageFingerprint === lastFp) {
          return; // unchanged result set — skip
        }
        adapter.observer.setFingerprint(extracted.pageFingerprint);
        chrome.runtime.sendMessage({
          type: 'BROWSE_PAGE_READY',
          payload: {
            url,
            reason,
            carriers: extracted.carriers,
            pageFingerprint: extracted.pageFingerprint,
            searchContext: extracted.searchContext,
          },
        });
      });
      // Capture current page once on start
      const initial = adapter.extractCards();
      adapter.observer.setFingerprint(initial.pageFingerprint);
      return {
        ok: true,
        watching: true,
        initial,
      };
    }

    case 'STOP_BROWSE_OBSERVER': {
      adapter.observer.stop();
      return { ok: true, watching: false };
    }

    default:
      return { ok: false, error: `Unknown message type: ${message.type}` };
  }
}
