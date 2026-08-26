(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNavigationDisposition = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function isMiddleClick(event) {
    return Boolean(event && Number(event.button) === 1);
  }

  function isBackgroundOpenEvent(event) {
    return Boolean(event && (event.metaKey || event.ctrlKey || isMiddleClick(event)));
  }

  function getDisposition(event, fallback) {
    return isBackgroundOpenEvent(event)
      ? 'backgroundTab'
      : (fallback || 'newTab');
  }

  return Object.freeze({
    getDisposition,
    isBackgroundOpenEvent,
    isMiddleClick
  });
});
