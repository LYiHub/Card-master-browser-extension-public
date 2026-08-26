(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoExtensionRoutes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const ROUTE_PATHS = Object.freeze({
    newtab: 'src/newtab/newtab.html',
    lumnoNewtab: 'src/newtab/lumno-newtab.html',
    onboarding: 'src/onboarding/onboarding.html',
    options: 'src/options/options.html',
    optionsAppearance: 'src/options/options.html#appearance'
  });

  function hasRuntimeGetUrl(chromeApi) {
    return Boolean(
      chromeApi &&
      chromeApi.runtime &&
      typeof chromeApi.runtime.getURL === 'function'
    );
  }

  function buildExtensionUrl(chromeApi, routePath) {
    const value = String(routePath || '').trim();
    if (!value) {
      return '';
    }
    if (/^(https?:|chrome:|edge:|brave:|vivaldi:|opera:|about:|file:)/i.test(value)) {
      return value;
    }
    if (hasRuntimeGetUrl(chromeApi)) {
      return chromeApi.runtime.getURL(value);
    }
    return value;
  }

  function setUrlParam(url, key, value) {
    if (value === undefined || value === null || value === false) {
      return;
    }
    if (value === true) {
      url.searchParams.set(key, '1');
      return;
    }
    url.searchParams.set(key, String(value));
  }

  function buildRouteUrl(chromeApi, routePath, params) {
    const baseUrl = buildExtensionUrl(chromeApi, routePath);
    const url = new URL(baseUrl, 'chrome-extension://lumno/');
    const nextParams = params && typeof params === 'object' ? params : {};
    Object.keys(nextParams).sort().forEach((key) => {
      setUrlParam(url, key, nextParams[key]);
    });
    return url.toString();
  }

  function buildNewtabUrl(chromeApi, params) {
    return buildRouteUrl(chromeApi, ROUTE_PATHS.newtab, params);
  }

  function buildLumnoNewtabUrl(chromeApi, params) {
    return buildRouteUrl(chromeApi, ROUTE_PATHS.lumnoNewtab, params);
  }

  function buildOptionsUrl(chromeApi, hash) {
    const baseRoute = hash ? ROUTE_PATHS.options : ROUTE_PATHS.options;
    const url = new URL(
      buildExtensionUrl(chromeApi, baseRoute),
      'chrome-extension://lumno/'
    );
    const normalizedHash = String(hash || '').trim();
    if (normalizedHash) {
      url.hash = normalizedHash.startsWith('#') ? normalizedHash.slice(1) : normalizedHash;
    }
    return url.toString();
  }

  function getPathname(url) {
    if (!url) {
      return '';
    }
    try {
      const parsed = new URL(String(url));
      return String(parsed.pathname || '').toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function pathMatchesRoute(pathname, routePath) {
    const route = `/${String(routePath || '').split(/[?#]/)[0].toLowerCase()}`;
    return pathname === route || pathname.endsWith(route);
  }

  function isNewtabUrl(url) {
    const pathname = getPathname(url);
    return pathMatchesRoute(pathname, ROUTE_PATHS.newtab) ||
      pathMatchesRoute(pathname, ROUTE_PATHS.lumnoNewtab);
  }

  function isOptionsUrl(url) {
    return pathMatchesRoute(getPathname(url), ROUTE_PATHS.options);
  }

  function isOnboardingUrl(url) {
    return pathMatchesRoute(getPathname(url), ROUTE_PATHS.onboarding);
  }

  function classifyExtensionUrl(url) {
    if (isNewtabUrl(url)) {
      return 'newtab';
    }
    if (isOptionsUrl(url)) {
      return 'options';
    }
    if (isOnboardingUrl(url)) {
      return 'onboarding';
    }
    return 'other';
  }

  return Object.freeze({
    ROUTE_PATHS,
    buildExtensionUrl,
    buildNewtabUrl,
    buildLumnoNewtabUrl,
    buildOptionsUrl,
    isNewtabUrl,
    isOptionsUrl,
    isOnboardingUrl,
    classifyExtensionUrl
  });
});
