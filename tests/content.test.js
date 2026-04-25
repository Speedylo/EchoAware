// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { urlDetector } from '../src/content/urlDetector.js';

// ── urlDetector ───────────────────────────────────────────────────────────────

describe('urlDetector.isWatchUrl', () => {
  it('accepts standard watch URLs', () => {
    expect(urlDetector.isWatchUrl('https://www.youtube.com/watch?v=abc123')).toBe(true);
    expect(urlDetector.isWatchUrl('https://www.youtube.com/watch?v=XYZ&list=PL1')).toBe(true);
  });

  it('rejects Shorts URLs', () => {
    expect(urlDetector.isWatchUrl('https://www.youtube.com/shorts/abc123')).toBe(false);
  });

  it('rejects homepage and channel URLs', () => {
    expect(urlDetector.isWatchUrl('https://www.youtube.com/')).toBe(false);
    expect(urlDetector.isWatchUrl('https://www.youtube.com/@SomeChannel')).toBe(false);
    expect(urlDetector.isWatchUrl('https://www.youtube.com/results?search_query=cats')).toBe(false);
  });

  it('rejects non-YouTube URLs', () => {
    expect(urlDetector.isWatchUrl('https://www.google.com/watch?v=abc')).toBe(false);
  });
});

describe('urlDetector.init', () => {
  let originalPushState;

  beforeEach(() => {
    originalPushState = history.pushState;
  });

  afterEach(() => {
    history.pushState = originalPushState;
  });

  it('fires onNavigate when yt-navigate-finish fires on a watch URL', () => {
    const onNavigate = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { href: 'https://www.youtube.com/watch?v=abc123' },
      writable: true,
      configurable: true,
    });

    urlDetector.init(onNavigate);
    window.dispatchEvent(new Event('yt-navigate-finish'));

    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc123');
  });

  it('does NOT fire onNavigate when yt-navigate-finish fires on a non-watch URL', () => {
    const onNavigate = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { href: 'https://www.youtube.com/' },
      writable: true,
      configurable: true,
    });

    urlDetector.init(onNavigate);
    window.dispatchEvent(new Event('yt-navigate-finish'));

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('does NOT fire onNavigate for Shorts URLs', () => {
    const onNavigate = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { href: 'https://www.youtube.com/shorts/abc123' },
      writable: true,
      configurable: true,
    });

    urlDetector.init(onNavigate);
    window.dispatchEvent(new Event('yt-navigate-finish'));

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('fires onNavigate via pushState interception for a watch URL', () => {
    const onNavigate = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { href: 'https://www.youtube.com/watch?v=pushed' },
      writable: true,
      configurable: true,
    });

    urlDetector.init(onNavigate);
    history.pushState({}, '', '/watch?v=pushed');

    expect(onNavigate).toHaveBeenCalledWith('https://www.youtube.com/watch?v=pushed');
  });
});

// ── metadataScraper ───────────────────────────────────────────────────────────

describe('scrapeMetadata', () => {
  it('returns title from the DOM', async () => {
    document.body.innerHTML = `
      <h1 class="ytd-watch-metadata">
        <yt-formatted-string>My Video Title</yt-formatted-string>
      </h1>
    `;

    const { scrapeMetadata } = await import('../src/content/metadataScraper.js');
    const result = scrapeMetadata();

    expect(result.title).toBe('My Video Title');
  });

  it('returns an empty title when the element is absent', async () => {
    document.body.innerHTML = '';
    const { scrapeMetadata } = await import('../src/content/metadataScraper.js');
    const result = scrapeMetadata();

    expect(result.title).toBe('');
  });
});
