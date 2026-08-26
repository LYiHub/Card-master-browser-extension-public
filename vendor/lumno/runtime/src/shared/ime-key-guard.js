(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoImeKeyGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const DEFAULT_COMMIT_ENTER_IGNORE_MS = 120;

  function isEnterKey(event) {
    return Boolean(event && (event.key === 'Enter' || event.code === 'Enter'));
  }

  function getEventTarget(event) {
    return event && event.target ? event.target : null;
  }

  function createImeKeyGuard(options) {
    const settings = options && typeof options === 'object' ? options : {};
    const now = typeof settings.now === 'function'
      ? settings.now
      : () => Date.now();
    const commitEnterIgnoreMs = Math.max(
      0,
      Number(settings.commitEnterIgnoreMs) || DEFAULT_COMMIT_ENTER_IGNORE_MS
    );
    let composing = false;
    let lastCompositionEndAt = 0;
    let lastCompositionTarget = null;

    function isComposing() {
      return composing;
    }

    function markCompositionStart(event) {
      composing = true;
      lastCompositionEndAt = 0;
      lastCompositionTarget = getEventTarget(event);
    }

    function markCompositionEnd(event) {
      composing = false;
      lastCompositionEndAt = now();
      lastCompositionTarget = getEventTarget(event);
    }

    function isNativeCompositionEvent(event) {
      return Boolean(
        event &&
        (
          event.isComposing ||
          event.keyCode === 229 ||
          event.which === 229 ||
          event.key === 'Process'
        )
      );
    }

    function isWithinCompositionCommitWindow(event) {
      if (!isEnterKey(event) || !lastCompositionEndAt) {
        return false;
      }
      const elapsed = now() - lastCompositionEndAt;
      if (elapsed < 0 || elapsed > commitEnterIgnoreMs) {
        return false;
      }
      const target = getEventTarget(event);
      return !lastCompositionTarget || !target || target === lastCompositionTarget;
    }

    function shouldIgnoreKeydown(event) {
      return Boolean(
        composing ||
        isNativeCompositionEvent(event) ||
        isWithinCompositionCommitWindow(event)
      );
    }

    return Object.freeze({
      isComposing,
      markCompositionStart,
      markCompositionEnd,
      shouldIgnoreKeydown
    });
  }

  return Object.freeze({
    createImeKeyGuard
  });
});
