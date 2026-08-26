(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabShortcutIconStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';

  const DEFAULT_STORAGE_KEY = '_x_extension_newtab_shortcut_icons_2026_unique_';
  const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
  const MAX_SOURCE_DIMENSION = 4096;
  const OUTPUT_SIZE = 128;
  const MAX_STORED_DATA_URL_LENGTH = 160 * 1024;
  const MAX_OUTPUT_BYTES = 96 * 1024;
  const ACCEPTED_MIME_TYPES = Object.freeze([
    'image/png',
    'image/jpeg',
    'image/webp'
  ]);

  function getOption(options, key, fallback) {
    if (options && Object.prototype.hasOwnProperty.call(options, key)) {
      return options[key];
    }
    return fallback;
  }

  function createIconError(code, message) {
    const error = new Error(message || code || 'Shortcut icon error.');
    error.code = String(code || 'unknown');
    return error;
  }

  function normalizeShortcutId(value) {
    return String(value || '').trim();
  }

  function isAcceptedMimeType(value) {
    return ACCEPTED_MIME_TYPES.includes(String(value || '').trim().toLowerCase());
  }

  function validateSourceFile(file) {
    if (!file || !isAcceptedMimeType(file.type)) {
      throw createIconError('unsupported-type', 'Unsupported shortcut icon type.');
    }
    const size = Number(file.size);
    if (!Number.isFinite(size) || size <= 0) {
      throw createIconError('empty-file', 'Shortcut icon file is empty.');
    }
    if (size > MAX_SOURCE_BYTES) {
      throw createIconError('file-too-large', 'Shortcut icon source file is too large.');
    }
    return true;
  }

  function validateSourceDimensions(width, height) {
    const sourceWidth = Math.floor(Number(width));
    const sourceHeight = Math.floor(Number(height));
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) ||
        sourceWidth <= 0 || sourceHeight <= 0) {
      throw createIconError('invalid-image', 'Shortcut icon dimensions are invalid.');
    }
    if (sourceWidth > MAX_SOURCE_DIMENSION || sourceHeight > MAX_SOURCE_DIMENSION) {
      throw createIconError('dimensions-too-large', 'Shortcut icon dimensions are too large.');
    }
    return {
      width: sourceWidth,
      height: sourceHeight
    };
  }

  function getContainedRect(sourceWidth, sourceHeight, targetSize) {
    const dimensions = validateSourceDimensions(sourceWidth, sourceHeight);
    const size = Math.max(1, Math.round(Number(targetSize) || OUTPUT_SIZE));
    const scale = Math.min(size / dimensions.width, size / dimensions.height);
    const width = Math.max(1, Math.round(dimensions.width * scale));
    const height = Math.max(1, Math.round(dimensions.height * scale));
    return {
      x: Math.round((size - width) / 2),
      y: Math.round((size - height) / 2),
      width,
      height
    };
  }

  function getDataUrlByteLength(value) {
    const match = /^data:[^;,]+;base64,([a-zA-Z0-9+/]*={0,2})$/.exec(String(value || '').trim());
    if (!match) return 0;
    const encoded = match[1];
    const padding = encoded.endsWith('==') ? 2 : (encoded.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor((encoded.length * 3) / 4) - padding);
  }

  function normalizeIconDataUrl(value) {
    const dataUrl = String(value || '').trim();
    if (!dataUrl.startsWith('data:image/png;base64,') ||
        dataUrl.length > MAX_STORED_DATA_URL_LENGTH ||
        getDataUrlByteLength(dataUrl) > MAX_OUTPUT_BYTES) {
      return '';
    }
    return dataUrl;
  }

  function normalizeIconMap(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const normalized = {};
    Object.keys(source).forEach((rawId) => {
      const shortcutId = normalizeShortcutId(rawId);
      const dataUrl = normalizeIconDataUrl(source[rawId]);
      if (shortcutId && dataUrl) {
        normalized[shortcutId] = dataUrl;
      }
    });
    return normalized;
  }

  function createShortcutIconStore(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const documentObj = getOption(opts, 'documentObj', root.document);
    const windowObj = getOption(opts, 'windowObj', root.window || root);
    const storageArea = getOption(opts, 'storageArea', null);
    const storageKey = String(getOption(opts, 'storageKey', DEFAULT_STORAGE_KEY));

    function getRuntimeError() {
      const chromeApi = windowObj && windowObj.chrome ? windowObj.chrome : root.chrome;
      return chromeApi && chromeApi.runtime && chromeApi.runtime.lastError
        ? chromeApi.runtime.lastError
        : null;
    }

    function readAll() {
      return new Promise((resolve, reject) => {
        if (!storageArea || typeof storageArea.get !== 'function') {
          resolve({});
          return;
        }
        storageArea.get([storageKey], (result) => {
          const runtimeError = getRuntimeError();
          if (runtimeError) {
            reject(createIconError('storage-read-failed', runtimeError.message));
            return;
          }
          resolve(normalizeIconMap(result && result[storageKey]));
        });
      });
    }

    function writeAll(iconMap) {
      const normalized = normalizeIconMap(iconMap);
      return new Promise((resolve, reject) => {
        if (!storageArea || typeof storageArea.set !== 'function') {
          reject(createIconError('storage-unavailable', 'Local extension storage is unavailable.'));
          return;
        }
        storageArea.set({ [storageKey]: normalized }, () => {
          const runtimeError = getRuntimeError();
          if (runtimeError) {
            reject(createIconError('storage-write-failed', runtimeError.message));
            return;
          }
          resolve(normalized);
        });
      });
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const Reader = (windowObj && windowObj.FileReader) || root.FileReader;
        if (typeof Reader !== 'function') {
          reject(createIconError('read-failed', 'FileReader is unavailable.'));
          return;
        }
        const reader = new Reader();
        reader.onerror = () => {
          reject(createIconError('read-failed', 'Failed to read shortcut icon.'));
        };
        reader.onload = () => {
          resolve(String(reader.result || ''));
        };
        reader.readAsDataURL(file);
      });
    }

    function loadImage(dataUrl) {
      return new Promise((resolve, reject) => {
        const ImageConstructor = (windowObj && windowObj.Image) || root.Image;
        if (typeof ImageConstructor !== 'function') {
          reject(createIconError('decode-failed', 'Image decoder is unavailable.'));
          return;
        }
        const image = new ImageConstructor();
        image.onload = () => resolve(image);
        image.onerror = () => {
          reject(createIconError('decode-failed', 'Failed to decode shortcut icon.'));
        };
        image.src = dataUrl;
      });
    }

    function renderNormalizedPng(image, sourceWidth, sourceHeight) {
      if (!documentObj || typeof documentObj.createElement !== 'function') {
        throw createIconError('render-failed', 'Canvas is unavailable.');
      }
      const canvas = documentObj.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext && canvas.getContext('2d');
      if (!context) {
        throw createIconError('render-failed', 'Canvas is unavailable.');
      }
      const target = getContainedRect(sourceWidth, sourceHeight, OUTPUT_SIZE);
      context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, target.x, target.y, target.width, target.height);
      const dataUrl = canvas.toDataURL('image/png');
      const normalized = normalizeIconDataUrl(dataUrl);
      if (!normalized) {
        throw createIconError('render-failed', 'Failed to render shortcut icon.');
      }
      return normalized;
    }

    function prepareFile(file) {
      try {
        validateSourceFile(file);
      } catch (error) {
        return Promise.reject(error);
      }
      return readFileAsDataUrl(file)
        .then(loadImage)
        .then((image) => {
          const dimensions = validateSourceDimensions(
            image.naturalWidth || image.width,
            image.naturalHeight || image.height
          );
          return {
            dataUrl: renderNormalizedPng(image, dimensions.width, dimensions.height),
            sourceWidth: dimensions.width,
            sourceHeight: dimensions.height,
            outputWidth: OUTPUT_SIZE,
            outputHeight: OUTPUT_SIZE
          };
        });
    }

    return Object.freeze({
      storageKey,
      prepareFile,
      readAll,
      writeAll
    });
  }

  return Object.freeze({
    DEFAULT_STORAGE_KEY,
    MAX_SOURCE_BYTES,
    MAX_SOURCE_DIMENSION,
    OUTPUT_SIZE,
    MAX_OUTPUT_BYTES,
    ACCEPTED_MIME_TYPES,
    createIconError,
    isAcceptedMimeType,
    validateSourceFile,
    validateSourceDimensions,
    getContainedRect,
    getDataUrlByteLength,
    normalizeIconDataUrl,
    normalizeIconMap,
    createShortcutIconStore
  });
});
