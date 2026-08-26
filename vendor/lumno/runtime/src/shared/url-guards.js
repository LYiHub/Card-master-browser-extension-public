(function(root, factory) {
  const api = factory();
  root.LumnoUrlGuards = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function isBrowserExtensionProtocol(protocol) {
    const normalized = String(protocol || '').toLowerCase();
    return normalized === 'chrome-extension:' ||
      normalized === 'moz-extension:' ||
      normalized === 'ms-browser-extension:';
  }

  function isBrowserInternalUrl(url) {
    const lower = String(url || '').toLowerCase();
    return lower.startsWith('chrome://') ||
      lower.startsWith('chrome-search://') ||
      lower.startsWith('edge://') ||
      lower.startsWith('brave://') ||
      lower.startsWith('vivaldi://') ||
      lower.startsWith('opera://') ||
      lower.startsWith('about:');
  }

  function isBrowserNewtabUrl(url) {
    const lower = String(url || '').trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
    return lower === 'chrome://newtab' ||
      lower === 'chrome://new-tab-page' ||
      lower === 'chrome-search://local-ntp' ||
      lower === 'chrome-search://local-ntp/local-ntp.html' ||
      lower === 'edge://newtab' ||
      lower === 'brave://newtab' ||
      lower === 'vivaldi://newtab' ||
      lower === 'opera://startpage';
  }

  function isExtensionStoreUrl(url) {
    if (!url) {
      return false;
    }
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      return (host === 'chrome.google.com' && path.startsWith('/webstore')) ||
        host === 'chromewebstore.google.com' ||
        (host === 'microsoftedge.microsoft.com' && path.startsWith('/addons')) ||
        host === 'addons.opera.com';
    } catch (e) {
      return false;
    }
  }

  function isRestrictedUrl(url) {
    if (!url || isBrowserInternalUrl(url)) {
      return true;
    }
    try {
      const parsed = new URL(url);
      const protocol = String(parsed.protocol || '').toLowerCase();
      if (isBrowserExtensionProtocol(protocol)) {
        return true;
      }
      if (protocol !== 'http:' && protocol !== 'https:') {
        return true;
      }
      return isExtensionStoreUrl(url);
    } catch (e) {
      return true;
    }
  }

  function canOpenOverlayOnUrl(url) {
    if (!url || isBrowserInternalUrl(url)) {
      return false;
    }
    try {
      const parsed = new URL(url);
      const protocol = String(parsed.protocol || '').toLowerCase();
      if (isBrowserExtensionProtocol(protocol)) {
        return false;
      }
      if (protocol === 'file:') {
        return true;
      }
      if (protocol !== 'http:' && protocol !== 'https:') {
        return false;
      }
      return !isExtensionStoreUrl(url);
    } catch (e) {
      return false;
    }
  }

  function canFetchPageForFavicon(url) {
    if (!url || isBrowserInternalUrl(url) || isExtensionStoreUrl(url)) {
      return false;
    }
    try {
      const protocol = String(new URL(url).protocol || '').toLowerCase();
      return protocol === 'http:' || protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  return Object.freeze({
    canFetchPageForFavicon,
    canOpenOverlayOnUrl,
    isBrowserExtensionProtocol,
    isBrowserInternalUrl,
    isBrowserNewtabUrl,
    isExtensionStoreUrl,
    isRestrictedUrl
  });
});
