(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabBackgroundSearchFocus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function shouldFocusSearchFromPointer(event, backgroundTargets) {
    if (!event || event.defaultPrevented || !event.target || !Array.isArray(backgroundTargets)) {
      return false;
    }
    return backgroundTargets.some((target) => Boolean(target) && event.target === target);
  }

  function createBackgroundFocusHandler(options) {
    const config = options || {};
    if (typeof config.getBackgroundTargets !== 'function' || typeof config.focusSearch !== 'function') {
      throw new Error('Background search focus requires target and focus callbacks.');
    }
    return function handleBackgroundPointerFocus(event) {
      if (!shouldFocusSearchFromPointer(event, config.getBackgroundTargets())) {
        return false;
      }
      config.focusSearch();
      return true;
    };
  }

  return Object.freeze({
    createBackgroundFocusHandler,
    shouldFocusSearchFromPointer
  });
});
