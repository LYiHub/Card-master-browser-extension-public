(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoShortcutDisplay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const MODIFIER_ALIASES = Object.freeze({
    alt: 'Alt',
    cmd: 'Command',
    command: 'Command',
    control: 'Ctrl',
    ctrl: 'Ctrl',
    macctrl: 'Ctrl',
    meta: 'Command',
    option: 'Alt',
    shift: 'Shift',
    super: 'Command'
  });

  const KEY_ALIASES = Object.freeze({
    arrowdown: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight',
    arrowup: 'ArrowUp',
    down: 'ArrowDown',
    esc: 'Escape',
    escape: 'Escape',
    left: 'ArrowLeft',
    return: 'Enter',
    right: 'ArrowRight',
    up: 'ArrowUp'
  });

  const ARROW_LABELS = Object.freeze({
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑'
  });

  const MAC_KEY_LABELS = Object.freeze({
    ...ARROW_LABELS,
    Enter: '↩',
    Escape: '⎋',
    Tab: '⇥'
  });

  const MAC_MODIFIER_LABELS = Object.freeze({
    Alt: '⌥',
    Command: '⌘',
    Ctrl: '⌃',
    Shift: '⇧'
  });

  function getNavigatorPlatform(navigatorLike) {
    const source = navigatorLike || {};
    const userAgentDataPlatform = source.userAgentData &&
      typeof source.userAgentData.platform === 'string'
      ? source.userAgentData.platform
      : '';
    const candidates = [
      userAgentDataPlatform,
      source.platform,
      source.userAgent
    ];
    for (const candidate of candidates) {
      const value = String(candidate || '').trim().toLowerCase();
      if (!value) {
        continue;
      }
      if (/(mac|iphone|ipad|ipod)/.test(value)) {
        return 'mac';
      }
      if (/win/.test(value)) {
        return 'windows';
      }
      if (/(linux|android|cros)/.test(value)) {
        return 'other';
      }
    }
    return 'other';
  }

  function resolvePlatform(options) {
    const config = options || {};
    const explicitPlatform = String(config.platform || '').trim().toLowerCase();
    if (explicitPlatform.includes('mac')) {
      return 'mac';
    }
    if (explicitPlatform.includes('win')) {
      return 'windows';
    }
    if (explicitPlatform) {
      return 'other';
    }
    return getNavigatorPlatform(config.navigatorLike);
  }

  function normalizeKeyToken(value) {
    const text = String(value || '').trim();
    if (!text) {
      return '';
    }
    const alias = KEY_ALIASES[text.toLowerCase()];
    return alias || text;
  }

  function formatShortcutChord(shortcut, options) {
    const text = String(shortcut || '').trim();
    if (!text) {
      return '';
    }
    const parts = text
      .split('+')
      .map((part) => String(part || '').trim())
      .filter(Boolean);
    if (parts.length === 0) {
      return '';
    }
    const keyToken = normalizeKeyToken(parts.pop());
    const modifiers = parts.map((part) => {
      return MODIFIER_ALIASES[String(part || '').trim().toLowerCase()] || part;
    });
    const platform = resolvePlatform(options);
    const keyLabel = platform === 'mac'
      ? (MAC_KEY_LABELS[keyToken] || keyToken)
      : (ARROW_LABELS[keyToken] || keyToken);
    if (platform === 'mac') {
      return `${modifiers.map((modifier) => MAC_MODIFIER_LABELS[modifier] || modifier).join('')}${keyLabel}`;
    }
    return modifiers.length > 0 ? `${modifiers.join('+')}+${keyLabel}` : keyLabel;
  }

  function formatShortcutReferencePart(part, options) {
    const text = String(part || '').trim();
    if (!text) {
      return '';
    }
    if (text.toLowerCase() === 'arrow keys') {
      return '↑↓←→';
    }
    if (text.toLowerCase() === 'release alt') {
      return resolvePlatform(options) === 'mac' ? '⌥↑' : 'Alt↑';
    }
    const sequence = text.split(/\s+/).filter(Boolean);
    if (sequence.length > 1) {
      return sequence
        .map((shortcut) => formatShortcutChord(shortcut, options))
        .join(' ');
    }
    return formatShortcutChord(text, options);
  }

  function formatShortcutReference(shortcut, options) {
    return String(shortcut || '')
      .split(/\s*\/\s*/)
      .map((part) => formatShortcutReferencePart(part, options))
      .filter(Boolean)
      .join(' / ');
  }

  function formatShortcutTemplate(text, shortcut, options) {
    const shortcutLabel = formatShortcutChord(shortcut, options);
    return String(text || '').replace(/\{shortcut\}/g, shortcutLabel);
  }

  return Object.freeze({
    formatShortcutChord,
    formatShortcutReference,
    formatShortcutReferencePart,
    formatShortcutTemplate,
    getNavigatorPlatform
  });
});
