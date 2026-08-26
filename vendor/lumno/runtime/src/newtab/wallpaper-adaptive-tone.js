(function(root) {
  'use strict';

  function noop() {}

  function getOption(options, key, fallback) {
    if (options && Object.prototype.hasOwnProperty.call(options, key)) {
      return options[key];
    }
    return fallback;
  }

  function getFunction(options, key, fallback) {
    const value = getOption(options, key, fallback || noop);
    return typeof value === 'function' ? value : (fallback || noop);
  }

  function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return min;
    }
    return Math.min(max, Math.max(min, number));
  }

  const adaptiveToneStyleProps = [
    '--x-nt-wallpaper-adaptive-ink',
    '--x-nt-wallpaper-adaptive-ink-muted',
    '--x-nt-wallpaper-adaptive-hover-bg',
    '--x-nt-wallpaper-adaptive-shadow',
    '--x-nt-wallpaper-adaptive-halo',
    '--x-nt-wallpaper-wordmark-ink',
    '--x-nt-wallpaper-icon-solid-bg',
    '--x-nt-wallpaper-icon-solid-bg-hover',
    '--x-nt-wallpaper-icon-solid-ink',
    '--x-nt-wallpaper-icon-solid-ink-hover',
    '--x-nt-wallpaper-surface-border',
    '--x-nt-wallpaper-surface-clear',
    '--x-nt-wallpaper-surface-clear-terminal',
    '--x-nt-wallpaper-surface-mist',
    '--x-nt-wallpaper-surface-mist-terminal',
    '--x-nt-shortcut-wallpaper-icon-bg',
    '--x-nt-shortcut-wallpaper-icon-color',
    '--x-nt-shortcut-add-bg',
    '--x-nt-shortcut-add-color'
  ];
  const WORDMARK_MIN_CONTRAST = 3.25;
  const WORDMARK_TEXTURED_MIN_CONTRAST = 4.5;

  function mixNumber(start, end, amount) {
    return start + ((end - start) * clampNumber(amount, 0, 1));
  }

  function mixChannel(start, end, amount) {
    return Math.round(mixNumber(start, end, amount));
  }

  function formatRgb(red, green, blue, alphaPercent) {
    return `rgb(${red} ${green} ${blue} / ${Math.round(alphaPercent)}%)`;
  }

  function formatSolidRgb(color) {
    return `rgb(${Math.round(color.red)} ${Math.round(color.green)} ${Math.round(color.blue)})`;
  }

  function getColorLuminance(color) {
    return ((color.red * 0.299) + (color.green * 0.587) + (color.blue * 0.114)) / 255;
  }

  function getRelativeLuminance(color) {
    const resolvedColor = getValidToneColor(color);
    function linearize(channel) {
      const value = clampNumber(channel, 0, 255) / 255;
      return value <= 0.04045
        ? value / 12.92
        : Math.pow((value + 0.055) / 1.055, 2.4);
    }
    return (0.2126 * linearize(resolvedColor.red)) +
      (0.7152 * linearize(resolvedColor.green)) +
      (0.0722 * linearize(resolvedColor.blue));
  }

  function getContrastRatio(firstColor, secondColor) {
    const firstLuminance = getRelativeLuminance(firstColor);
    const secondLuminance = getRelativeLuminance(secondColor);
    const lighter = Math.max(firstLuminance, secondLuminance);
    const darker = Math.min(firstLuminance, secondLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function mixColor(color, target, amount) {
    return {
      red: mixChannel(color.red, target.red, amount),
      green: mixChannel(color.green, target.green, amount),
      blue: mixChannel(color.blue, target.blue, amount)
    };
  }

  function smoothstep(value) {
    const amount = clampNumber(value, 0, 1);
    return amount * amount * (3 - (2 * amount));
  }

  function setStyleProperty(element, name, value) {
    if (element.style.getPropertyValue(name) === value) {
      return;
    }
    element.style.setProperty(name, value);
  }

  function clearAdaptiveToneStyles(element) {
    adaptiveToneStyleProps.forEach((prop) => {
      element.style.removeProperty(prop);
    });
  }

  function getWallpaperOffWordmarkColor(overlayLuminance) {
    return overlayLuminance >= 0.5
      ? { red: 242, green: 242, blue: 242 }
      : { red: 38, green: 38, blue: 38 };
  }

  function getWordmarkInkColor(color, luminance, ink, overlayAlpha, overlayLuminance, textureContrast, effectType) {
    const resolvedOverlayAlpha = clampNumber(overlayAlpha, 0, 1);
    if (isWallpaperOverlayCovered(resolvedOverlayAlpha)) {
      return getWallpaperOffWordmarkColor(clampNumber(overlayLuminance, 0, 1));
    }
    const baseColor = color && Number.isFinite(color.red) &&
      Number.isFinite(color.green) &&
      Number.isFinite(color.blue)
      ? color
      : { red: 128, green: 140, blue: 156 };
    const overlayAmount = smoothstep((resolvedOverlayAlpha - 0.36) / 0.64);
    const highTexture = isHighTextureTone(textureContrast, effectType, 0.16);
    const darkOverlay = clampNumber(overlayLuminance, 0, 1) < 0.5;
    const lightTarget = darkOverlay
      ? { red: 118, green: 126, blue: 136 }
      : { red: 250, green: 251, blue: 253 };
    const baseLift = darkOverlay
      ? (ink === 'light' ? 0.24 : 0.2)
      : (ink === 'light' ? 0.9 : 0.84);
    const textureLift = highTexture ? (darkOverlay ? 0.01 : 0.04) : 0;
    const preferredColor = mixColor(
      baseColor,
      lightTarget,
      clampNumber(baseLift + textureLift, 0, 0.94)
    );
    const contrastBackground = effectType && effectType !== 'none'
      ? {
          red: clampNumber(luminance, 0, 1) * 255,
          green: clampNumber(luminance, 0, 1) * 255,
          blue: clampNumber(luminance, 0, 1) * 255
        }
      : baseColor;
    return ensureWordmarkReadable(
      mixColor(preferredColor, lightTarget, overlayAmount * 0.36),
      contrastBackground,
      ink,
      highTexture
    );
  }

  function ensureWordmarkReadable(color, backgroundColor, ink, highTexture) {
    const background = getValidToneColor(backgroundColor);
    const minimumContrast = highTexture
      ? WORDMARK_TEXTURED_MIN_CONTRAST
      : WORDMARK_MIN_CONTRAST;
    if (getContrastRatio(color, background) >= minimumContrast) {
      return color;
    }
    const lightTarget = { red: 248, green: 250, blue: 252 };
    const darkTarget = { red: 15, green: 23, blue: 42 };
    const preferredTarget = ink === 'dark' ? darkTarget : lightTarget;
    const alternateTarget = ink === 'dark' ? lightTarget : darkTarget;
    const target = getContrastRatio(preferredTarget, background) >= minimumContrast
      ? preferredTarget
      : alternateTarget;
    return mixColorToMinContrast(color, target, background, minimumContrast);
  }

  function mixColorToMinContrast(color, target, backgroundColor, minimumContrast) {
    let low = 0;
    let high = 1;
    let best = target;
    for (let index = 0; index < 10; index += 1) {
      const amount = (low + high) / 2;
      const mixed = mixColor(color, target, amount);
      if (getContrastRatio(mixed, backgroundColor) >= minimumContrast) {
        best = mixed;
        high = amount;
      } else {
        low = amount;
      }
    }
    return best;
  }

  function mixColorToMaxLuminance(color, target, maxLuminance) {
    let low = 0;
    let high = 1;
    let best = color;
    for (let index = 0; index < 8; index += 1) {
      const amount = (low + high) / 2;
      const mixed = mixColor(color, target, amount);
      if (getColorLuminance(mixed) <= maxLuminance) {
        best = mixed;
        high = amount;
      } else {
        low = amount;
      }
    }
    return best;
  }

  function mixColorToMinLuminance(color, target, minLuminance) {
    let low = 0;
    let high = 1;
    let best = color;
    for (let index = 0; index < 8; index += 1) {
      const amount = (low + high) / 2;
      const mixed = mixColor(color, target, amount);
      if (getColorLuminance(mixed) >= minLuminance) {
        best = mixed;
        high = amount;
      } else {
        low = amount;
      }
    }
    return best;
  }

  function isTexturedWallpaperEffect(effectType) {
    return effectType === 'ascii' || effectType === 'halftone';
  }

  function isHighTextureTone(textureContrast, effectType, threshold) {
    return isTexturedWallpaperEffect(effectType) ||
      (Number.isFinite(textureContrast) && textureContrast >= threshold);
  }

  function isWallpaperOverlayCovered(overlayAlpha) {
    return clampNumber(overlayAlpha, 0, 1) >= 0.995;
  }

  function shouldUseIconSolidBackground(luminance, overlayAlpha, textureContrast, effectType) {
    if (clampNumber(overlayAlpha, 0, 1) >= 0.9) {
      return false;
    }
    if (isHighTextureTone(textureContrast, effectType, 0.1)) {
      return true;
    }
    return luminance > 0.08 && luminance < 0.96;
  }

  function getIconSolidBackgroundColor(color, luminance, ink, hover) {
    const baseColor = color && Number.isFinite(color.red) &&
      Number.isFinite(color.green) &&
      Number.isFinite(color.blue)
      ? color
      : { red: 128, green: 140, blue: 156 };
    const middleRisk = 1 - Math.min(1, Math.abs(luminance - 0.54) / 0.34);
    const hoverLift = hover ? 0.08 : 0;
    if (ink === 'dark') {
      const amount = 0.66 + (middleRisk * 0.18) + hoverLift;
      return mixColor(baseColor, { red: 252, green: 254, blue: 255 }, amount);
    }
    const amount = 0.68 + (middleRisk * 0.18) + hoverLift;
    return mixColor(baseColor, { red: 15, green: 23, blue: 42 }, amount);
  }

  function getIconSolidForegroundColor(backgroundColor) {
    return getColorLuminance(backgroundColor) >= 0.56
      ? { red: 30, green: 41, blue: 59 }
      : { red: 248, green: 250, blue: 252 };
  }

  function getColorChroma(color) {
    const max = Math.max(color.red, color.green, color.blue);
    const min = Math.min(color.red, color.green, color.blue);
    return (max - min) / 255;
  }

  function getValidToneColor(color) {
    return color && Number.isFinite(color.red) &&
      Number.isFinite(color.green) &&
      Number.isFinite(color.blue)
      ? color
      : { red: 128, green: 140, blue: 156 };
  }

  function getShortcutUrlBaseSurfaceColor(color, localLuminance, ink) {
    const baseColor = getValidToneColor(color);
    const surfaceLuminance = clampNumber(localLuminance, 0, 1);
    const hueStrength = smoothstep((getColorChroma(baseColor) - 0.035) / 0.24);
    if (ink === 'light') {
      const tintAmount = mixNumber(0.025, 0.12, hueStrength);
      const darkBase = surfaceLuminance <= 0.26
        ? { red: 34, green: 38, blue: 46 }
        : { red: 24, green: 28, blue: 35 };
      const backgroundColor = mixColor(darkBase, baseColor, tintAmount);
      const minSeparation = surfaceLuminance <= 0.3 ? 0.07 : 0.1;
      const backgroundLuminance = getColorLuminance(backgroundColor);
      if (Math.abs(backgroundLuminance - surfaceLuminance) >= minSeparation) {
        return backgroundColor;
      }
      if (backgroundLuminance >= surfaceLuminance) {
        return mixColorToMinLuminance(
          backgroundColor,
          { red: 70, green: 78, blue: 92 },
          clampNumber(surfaceLuminance + minSeparation, 0, 0.36)
        );
      }
      return mixColorToMaxLuminance(
        backgroundColor,
        { red: 12, green: 16, blue: 22 },
        clampNumber(surfaceLuminance - minSeparation, 0.06, 1)
      );
    }

    const tintAmount = mixNumber(0.055, 0.2, hueStrength);
    const paleBase = surfaceLuminance >= 0.58
      ? { red: 244, green: 246, blue: 248 }
      : { red: 248, green: 250, blue: 252 };
    let backgroundColor = mixColor(paleBase, baseColor, tintAmount);
    const minSeparation = surfaceLuminance >= 0.78 ? 0.082 : 0.11;
    const backgroundLuminance = getColorLuminance(backgroundColor);
    if (Math.abs(backgroundLuminance - surfaceLuminance) >= minSeparation) {
      return backgroundColor;
    }
    if (surfaceLuminance >= 0.72) {
      const tintedGray = mixColor(
        { red: 218, green: 224, blue: 232 },
        baseColor,
        hueStrength * 0.28
      );
      return mixColorToMaxLuminance(
        backgroundColor,
        tintedGray,
        clampNumber(surfaceLuminance - minSeparation, 0, 1)
      );
    }
    return mixColorToMinLuminance(
      backgroundColor,
      { red: 255, green: 255, blue: 255 },
      clampNumber(surfaceLuminance + minSeparation, 0, 1)
    );
  }

  function getShortcutUrlSurfaceColor(color, localLuminance, ink) {
    const baseSurfaceColor = getShortcutUrlBaseSurfaceColor(color, localLuminance, ink);
    const backgroundLuminance = getColorLuminance(baseSurfaceColor);
    if (ink === 'light') {
      const target = backgroundLuminance >= 0.26
        ? { red: 18, green: 22, blue: 28 }
        : { red: 52, green: 58, blue: 68 };
      return mixColor(baseSurfaceColor, target, backgroundLuminance >= 0.26 ? 0.1 : 0.28);
    }
    const target = backgroundLuminance >= 0.56
      ? { red: 255, green: 255, blue: 255 }
      : { red: 248, green: 250, blue: 252 };
    return mixColor(baseSurfaceColor, target, backgroundLuminance >= 0.56 ? 0.34 : 0.22);
  }

  function getShortcutAddSurfaceColor(urlSurfaceColor, ink) {
    const backgroundLuminance = getColorLuminance(urlSurfaceColor);
    if (ink === 'light') {
      const target = backgroundLuminance >= 0.32
        ? { red: 92, green: 102, blue: 118 }
        : { red: 70, green: 78, blue: 92 };
      return mixColor(urlSurfaceColor, target, backgroundLuminance >= 0.32 ? 0.14 : 0.24);
    }
    const target = backgroundLuminance >= 0.5
      ? { red: 255, green: 255, blue: 255 }
      : { red: 248, green: 250, blue: 252 };
    return mixColor(urlSurfaceColor, target, backgroundLuminance >= 0.56 ? 0.28 : 0.18);
  }

  function getForcedShortcutSurfaceInk(ink, themeMode) {
    return themeMode === 'dark' ? 'light' : ink;
  }

  function shouldApplyForcedIconBackground(element, mode) {
    if (!element) {
      return false;
    }
    if (mode === 'shortcut-add') {
      return true;
    }
    if (mode === 'default-theme') {
      return element.getAttribute('data-shortcut-theme-default') === 'true';
    }
    return true;
  }

  function clearForcedIconBackgroundStyles(element) {
    if (!element) {
      return;
    }
    element.removeAttribute('data-wallpaper-forced-icon-bg');
    element.style.removeProperty('--x-nt-shortcut-wallpaper-icon-bg');
    element.style.removeProperty('--x-nt-shortcut-wallpaper-icon-color');
    element.style.removeProperty('--x-nt-shortcut-add-bg');
    element.style.removeProperty('--x-nt-shortcut-add-color');
  }

  function applyForcedIconBackgroundStyles(element, luminance, ink, color, mode, themeMode) {
    if (!shouldApplyForcedIconBackground(element, mode)) {
      clearForcedIconBackgroundStyles(element);
      return;
    }
    const forcedSurfaceInk = getForcedShortcutSurfaceInk(ink, themeMode);
    const urlSurfaceColor = getShortcutUrlSurfaceColor(color, luminance, forcedSurfaceInk);
    if (mode === 'shortcut-add') {
      const addBackgroundColor = getShortcutAddSurfaceColor(urlSurfaceColor, forcedSurfaceInk);
      element.setAttribute('data-wallpaper-forced-icon-bg', 'true');
      setStyleProperty(element, '--x-nt-shortcut-add-bg', formatSolidRgb(addBackgroundColor));
      setStyleProperty(element, '--x-nt-shortcut-add-color',
        formatSolidRgb(getIconSolidForegroundColor(addBackgroundColor)));
      return;
    }
    element.setAttribute('data-wallpaper-forced-icon-bg', 'true');
    setStyleProperty(element, '--x-nt-shortcut-wallpaper-icon-bg', formatSolidRgb(urlSurfaceColor));
    setStyleProperty(element, '--x-nt-shortcut-wallpaper-icon-color',
      formatSolidRgb(getIconSolidForegroundColor(urlSurfaceColor)));
  }

  function applyIconSolidBackgroundStyles(element, luminance, ink, color, overlayAlpha, textureContrast, effectType) {
    if (!element) {
      return;
    }
    const overlayCovered = isWallpaperOverlayCovered(overlayAlpha);
    element.setAttribute('data-wallpaper-overlay-cover', overlayCovered ? 'true' : 'false');
    const enabled = shouldUseIconSolidBackground(luminance, overlayAlpha, textureContrast, effectType);
    element.setAttribute('data-wallpaper-icon-bg', enabled ? 'true' : 'false');
    if (!enabled) {
      element.style.removeProperty('--x-nt-wallpaper-icon-solid-bg');
      element.style.removeProperty('--x-nt-wallpaper-icon-solid-bg-hover');
      element.style.removeProperty('--x-nt-wallpaper-icon-solid-ink');
      element.style.removeProperty('--x-nt-wallpaper-icon-solid-ink-hover');
      return;
    }
    const backgroundColor = getIconSolidBackgroundColor(color, luminance, ink, false);
    const hoverBackgroundColor = getIconSolidBackgroundColor(color, luminance, ink, true);
    setStyleProperty(element, '--x-nt-wallpaper-icon-solid-bg', formatSolidRgb(backgroundColor));
    setStyleProperty(element, '--x-nt-wallpaper-icon-solid-bg-hover', formatSolidRgb(hoverBackgroundColor));
    setStyleProperty(element, '--x-nt-wallpaper-icon-solid-ink',
      formatSolidRgb(getIconSolidForegroundColor(backgroundColor)));
    setStyleProperty(element, '--x-nt-wallpaper-icon-solid-ink-hover',
      formatSolidRgb(getIconSolidForegroundColor(hoverBackgroundColor)));
  }

  function applyAdaptiveToneStyles(element, luminance, ink, color, overlayAlpha, overlayLuminance, textureContrast, effectType) {
    if (!element || !Number.isFinite(luminance)) {
      return;
    }
    if (ink === 'dark') {
      const amount = clampNumber((luminance - 0.52) / 0.42, 0, 1);
      const red = mixChannel(78, 15, amount);
      const green = mixChannel(90, 23, amount);
      const blue = mixChannel(106, 42, amount);
      const mutedRed = mixChannel(100, 30, amount);
      const mutedGreen = mixChannel(116, 41, amount);
      const mutedBlue = mixChannel(139, 59, amount);
      setStyleProperty(element, '--x-nt-wallpaper-adaptive-ink',
        formatRgb(red, green, blue, mixNumber(72, 88, amount)));
      setStyleProperty(element, '--x-nt-wallpaper-wordmark-ink',
        formatSolidRgb(getWordmarkInkColor(
          color,
          luminance,
          ink,
          overlayAlpha,
          overlayLuminance,
          textureContrast,
          effectType
        )));
      setStyleProperty(element, '--x-nt-wallpaper-adaptive-ink-muted',
        formatRgb(mutedRed, mutedGreen, mutedBlue, mixNumber(52, 66, amount)));
      setStyleProperty(element, '--x-nt-wallpaper-adaptive-hover-bg',
        formatRgb(red, green, blue, mixNumber(7, 12, amount)));
      setStyleProperty(element, '--x-nt-wallpaper-adaptive-shadow', 'transparent');
      setStyleProperty(element, '--x-nt-wallpaper-adaptive-halo', 'transparent');
      return;
    }

    const amount = clampNumber((0.54 - luminance) / 0.42, 0, 1);
    const red = mixChannel(226, 253, amount);
    const green = mixChannel(232, 254, amount);
    const blue = mixChannel(240, 255, amount);
    const mutedRed = mixChannel(203, 248, amount);
    const mutedGreen = mixChannel(213, 250, amount);
    const mutedBlue = mixChannel(225, 252, amount);
    setStyleProperty(element, '--x-nt-wallpaper-adaptive-ink',
      formatRgb(red, green, blue, mixNumber(78, 92, amount)));
    setStyleProperty(element, '--x-nt-wallpaper-wordmark-ink',
      formatSolidRgb(getWordmarkInkColor(
        color,
        luminance,
        ink,
        overlayAlpha,
        overlayLuminance,
        textureContrast,
        effectType
      )));
    setStyleProperty(element, '--x-nt-wallpaper-adaptive-ink-muted',
      formatRgb(mutedRed, mutedGreen, mutedBlue, mixNumber(58, 76, amount)));
    setStyleProperty(element, '--x-nt-wallpaper-adaptive-hover-bg',
      formatRgb(248, 250, 252, mixNumber(10, 18, amount)));
    setStyleProperty(element, '--x-nt-wallpaper-adaptive-shadow',
      formatRgb(15, 23, 42, mixNumber(26, 42, amount)));
    setStyleProperty(element, '--x-nt-wallpaper-adaptive-halo',
      formatRgb(15, 23, 42, mixNumber(12, 22, amount)));
  }

  function applySurfaceToneStyles(element, luminance, ink, color, textureContrast, effectType) {
    const sourceColor = getValidToneColor(color);
    const neutralColor = ink === 'dark'
      ? { red: 248, green: 250, blue: 252 }
      : { red: 18, green: 24, blue: 34 };
    const hueStrength = smoothstep((getColorChroma(sourceColor) - 0.025) / 0.25);
    const surfaceColor = mixColor(
      neutralColor,
      sourceColor,
      mixNumber(0.08, 0.18, hueStrength)
    );
    const textureRisk = isHighTextureTone(textureContrast, effectType, 0.16)
      ? 1
      : clampNumber((Number(textureContrast) || 0) / 0.2, 0, 1);
    const middleLuminanceRisk = 1 - Math.min(1, Math.abs(luminance - 0.52) / 0.48);
    const protection = Math.max(textureRisk, middleLuminanceRisk * 0.5);
    const mistAlpha = mixNumber(ink === 'dark' ? 64 : 62, 74, protection);
    const clearAlpha = mixNumber(ink === 'dark' ? 32 : 36, 50, protection);
    const borderColor = ink === 'dark'
      ? { red: 15, green: 23, blue: 42 }
      : { red: 248, green: 250, blue: 252 };

    setStyleProperty(element, '--x-nt-wallpaper-surface-mist',
      formatRgb(surfaceColor.red, surfaceColor.green, surfaceColor.blue, mistAlpha));
    setStyleProperty(element, '--x-nt-wallpaper-surface-mist-terminal',
      formatRgb(surfaceColor.red, surfaceColor.green, surfaceColor.blue, Math.min(88, mistAlpha + 13)));
    setStyleProperty(element, '--x-nt-wallpaper-surface-clear',
      formatRgb(surfaceColor.red, surfaceColor.green, surfaceColor.blue, clearAlpha));
    setStyleProperty(element, '--x-nt-wallpaper-surface-clear-terminal',
      formatRgb(surfaceColor.red, surfaceColor.green, surfaceColor.blue, Math.min(72, clearAlpha + 14)));
    setStyleProperty(element, '--x-nt-wallpaper-surface-border',
      formatRgb(borderColor.red, borderColor.green, borderColor.blue, ink === 'dark' ? 8 : 13));
  }

  function createWallpaperAdaptiveTone(options) {
    const documentObj = getOption(options, 'documentObj', root.document);
    const windowObj = getOption(options, 'windowObj', root.window);
    const getTargets = getFunction(options, 'getTargets', function() {
      return [];
    });
    const getCurrentWallpaper = getFunction(options, 'getCurrentWallpaper', function() {
      return null;
    });
    const getWallpaperImageUrl = getFunction(options, 'getWallpaperImageUrl', function() {
      return '';
    });
    const getOverlayAlphaAtViewportY = getFunction(options, 'getOverlayAlphaAtViewportY', function() {
      return 0;
    });
    const getOverlayLuminance = getFunction(options, 'getOverlayLuminance', function() {
      return 1;
    });
    const getEffectLuminanceAtViewport = getFunction(options, 'getEffectLuminanceAtViewport', function() {
      return null;
    });
    const applyWordmarkThemeAppearance = getFunction(options, 'applyWordmarkThemeAppearance');

    let sampler = null;
    let pendingImageUrl = '';
    let loadToken = 0;
    let toneFrame = 0;

    function getDocumentThemeMode() {
      return documentObj && documentObj.body && documentObj.body.getAttribute('data-theme') === 'dark'
        ? 'dark'
        : 'light';
    }

    function requestFrame(callback) {
      if (windowObj && typeof windowObj.requestAnimationFrame === 'function') {
        return windowObj.requestAnimationFrame(callback);
      }
      return setTimeout(callback, 16);
    }

    function cancelFrame(id) {
      if (windowObj && typeof windowObj.cancelAnimationFrame === 'function') {
        windowObj.cancelAnimationFrame(id);
        return;
      }
      clearTimeout(id);
    }

    function getViewportSize() {
      const docEl = documentObj.documentElement;
      return {
        width: Math.max(1, windowObj.innerWidth || (docEl ? docEl.clientWidth : 0) || 1),
        height: Math.max(1, windowObj.innerHeight || (docEl ? docEl.clientHeight : 0) || 1)
      };
    }

    function getToneTargets() {
      const targets = getTargets();
      return Array.isArray(targets) ? targets : [];
    }

    function clearTargetTone(element) {
      if (!element) {
        return;
      }
      element.removeAttribute('data-wallpaper-ink');
      element.removeAttribute('data-wallpaper-icon-bg');
      element.removeAttribute('data-wallpaper-overlay-cover');
      element.style.removeProperty('--x-nt-wallpaper-local-luma');
      clearForcedIconBackgroundStyles(element);
      clearAdaptiveToneStyles(element);
    }

    function cancelScheduledApply() {
      if (toneFrame) {
        cancelFrame(toneFrame);
        toneFrame = 0;
      }
    }

    function clear(options) {
      cancelScheduledApply();
      getToneTargets().forEach((target) => {
        if (!target || !target.element) {
          return;
        }
        clearTargetTone(target.element);
      });
      if (!options || options.updateWordmark !== false) {
        applyWordmarkThemeAppearance();
      }
    }

    function getSampleRect(rect, target) {
      const viewport = getViewportSize();
      const minWidth = Math.max(1, Number(target && target.minWidth) || 80);
      const minHeight = Math.max(1, Number(target && target.minHeight) || 40);
      const width = Math.min(viewport.width, Math.max(rect.width + 32, minWidth));
      const height = Math.min(viewport.height, Math.max(rect.height + 28, minHeight));
      const centerX = clampNumber((rect.left + rect.right) / 2, 0, viewport.width);
      const centerY = clampNumber((rect.top + rect.bottom) / 2, 0, viewport.height);
      const maxLeft = Math.max(0, viewport.width - width);
      const maxTop = Math.max(0, viewport.height - height);
      return {
        left: clampNumber(centerX - (width / 2), 0, maxLeft),
        top: clampNumber(centerY - (height / 2), 0, maxTop),
        width,
        height
      };
    }

    function loadImage(url) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
          if (typeof image.decode === 'function') {
            image.decode().then(() => {
              resolve(image);
            }).catch(() => {
              resolve(image);
            });
            return;
          }
          resolve(image);
        };
        image.onerror = () => {
          reject(new Error('Failed to load wallpaper image.'));
        };
        image.src = url;
      });
    }

    function createSampler(image, url) {
      const naturalWidth = Math.max(1, image.naturalWidth || image.width || 1);
      const naturalHeight = Math.max(1, image.naturalHeight || image.height || 1);
      const sampleScale = Math.min(1, 420 / naturalWidth, 260 / naturalHeight);
      const canvas = documentObj.createElement('canvas');
      canvas.width = Math.max(1, Math.round(naturalWidth * sampleScale));
      canvas.height = Math.max(1, Math.round(naturalHeight * sampleScale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        return null;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let imageData = null;
      try {
        imageData = context.getImageData(0, 0, canvas.width, canvas.height).data;
      } catch (e) {
        imageData = null;
      }
      return {
        url,
        canvas,
        context,
        imageData,
        naturalWidth,
        naturalHeight,
        sampleScaleX: canvas.width / naturalWidth,
        sampleScaleY: canvas.height / naturalHeight
      };
    }

    function getRenderedMetrics(sourceSampler) {
      const viewport = getViewportSize();
      const scale = Math.max(
        viewport.width / sourceSampler.naturalWidth,
        viewport.height / sourceSampler.naturalHeight
      );
      const renderedWidth = sourceSampler.naturalWidth * scale;
      const renderedHeight = sourceSampler.naturalHeight * scale;
      return {
        scale,
        offsetX: (viewport.width - renderedWidth) / 2,
        offsetY: (viewport.height - renderedHeight) / 2
      };
    }

    function applyOverlayToLuminance(luminance, alpha, overlayLuminance) {
      return (luminance * (1 - alpha)) + (overlayLuminance * alpha);
    }

    function applyOverlayToColor(color, alpha, overlayLuminance) {
      const overlayColor = overlayLuminance >= 0.5
        ? { red: 255, green: 255, blue: 255 }
        : { red: 0, green: 0, blue: 0 };
      return {
        color: mixColor(color, overlayColor, alpha),
        alpha
      };
    }

    function getPixelColor(sourceSampler, x, y) {
      let red = 255;
      let green = 255;
      let blue = 255;
      let alpha = 1;
      if (sourceSampler.imageData) {
        const index = ((y * sourceSampler.canvas.width) + x) * 4;
        red = sourceSampler.imageData[index];
        green = sourceSampler.imageData[index + 1];
        blue = sourceSampler.imageData[index + 2];
        alpha = sourceSampler.imageData[index + 3] / 255;
      } else {
        const pixel = sourceSampler.context.getImageData(x, y, 1, 1).data;
        red = pixel[0];
        green = pixel[1];
        blue = pixel[2];
        alpha = pixel[3] / 255;
      }
      return {
        red: (red * alpha) + (255 * (1 - alpha)),
        green: (green * alpha) + (255 * (1 - alpha)),
        blue: (blue * alpha) + (255 * (1 - alpha))
      };
    }

    function sampleToneForRect(sourceSampler, rect, target, overlayLuminance, effectType) {
      if (!sourceSampler || !sourceSampler.canvas || !sourceSampler.context || !rect) {
        return null;
      }
      const metrics = getRenderedMetrics(sourceSampler);
      const isIconButton = Boolean(target && target.iconButton);
      const xs = isIconButton
        ? [0.1, 0.24, 0.38, 0.5, 0.62, 0.76, 0.9]
        : [0.18, 0.34, 0.5, 0.66, 0.82];
      const ys = isIconButton
        ? [0.12, 0.32, 0.5, 0.68, 0.88]
        : [0.24, 0.5, 0.76];
      const values = [];
      const ignoresOverlay = Boolean(target && target.ignoreOverlay);
      try {
        ys.forEach((yRatio) => {
          xs.forEach((xRatio) => {
            const viewportX = rect.left + (rect.width * xRatio);
            const viewportY = rect.top + (rect.height * yRatio);
            const sourceX = ((viewportX - metrics.offsetX) / metrics.scale) * sourceSampler.sampleScaleX;
            const sourceY = ((viewportY - metrics.offsetY) / metrics.scale) * sourceSampler.sampleScaleY;
            const x = Math.round(clampNumber(sourceX, 0, sourceSampler.canvas.width - 1));
            const y = Math.round(clampNumber(sourceY, 0, sourceSampler.canvas.height - 1));
            const sourceColor = getPixelColor(sourceSampler, x, y);
            const sourceLuminance = getColorLuminance(sourceColor);
            const effectLuminance = effectType && effectType !== 'none'
              ? getEffectLuminanceAtViewport(viewportX, viewportY, sourceLuminance)
              : null;
            const resolvedLuminance = Number.isFinite(effectLuminance) ? effectLuminance : sourceLuminance;
            const overlayAlpha = ignoresOverlay
              ? 0
              : clampNumber(getOverlayAlphaAtViewportY(viewportY), 0, 1);
            const overlayColor = ignoresOverlay
              ? { color: sourceColor, alpha: 0 }
              : applyOverlayToColor(sourceColor, overlayAlpha, overlayLuminance);
            values.push({
              luminance: ignoresOverlay
                ? resolvedLuminance
                : applyOverlayToLuminance(resolvedLuminance, overlayAlpha, overlayLuminance),
              color: overlayColor.color,
              overlayAlpha: overlayColor.alpha
            });
          });
        });
      } catch (e) {
        return null;
      }
      if (values.length === 0) {
        return null;
      }
      values.sort((a, b) => a.luminance - b.luminance);
      const textureContrast = values[values.length - 1].luminance - values[0].luminance;
      const trimCount = values.length >= 10 ? 2 : 0;
      const trimmed = values.slice(trimCount, values.length - trimCount);
      const sourceValues = trimmed.length > 0 ? trimmed : values;
      const sum = sourceValues.reduce((total, value) => {
        total.luminance += value.luminance;
        total.red += value.color.red;
        total.green += value.color.green;
        total.blue += value.color.blue;
        total.overlayAlpha += value.overlayAlpha;
        return total;
      }, {
        luminance: 0,
        red: 0,
        green: 0,
        blue: 0,
        overlayAlpha: 0
      });
      return {
        luminance: sum.luminance / sourceValues.length,
        color: {
          red: sum.red / sourceValues.length,
          green: sum.green / sourceValues.length,
          blue: sum.blue / sourceValues.length
        },
        overlayAlpha: sum.overlayAlpha / sourceValues.length,
        textureContrast
      };
    }

    function chooseInk(luminance, currentInk) {
      if (!Number.isFinite(luminance)) {
        return currentInk === 'dark' || currentInk === 'light' ? currentInk : 'light';
      }
      if (currentInk === 'dark') {
        return luminance < 0.5 ? 'light' : 'dark';
      }
      if (currentInk === 'light') {
        return luminance > 0.62 ? 'dark' : 'light';
      }
      return luminance >= 0.56 ? 'dark' : 'light';
    }

    function apply(options) {
      const config = options || {};
      if (!getCurrentWallpaper() ||
          !sampler ||
          !documentObj.body ||
          documentObj.body.getAttribute('data-wallpaper-active') !== 'true') {
        clear({ updateWordmark: false });
        applyWordmarkThemeAppearance();
        return;
      }
      const viewport = getViewportSize();
      const effectType = documentObj.body.getAttribute('data-wallpaper-effect') || '';
      const overlayLuminance = clampNumber(getOverlayLuminance(), 0, 1);
      const themeMode = getDocumentThemeMode();
      getToneTargets().forEach((target) => {
        if (!target || !target.element) {
          return;
        }
        if (target.disabled === true) {
          clearTargetTone(target.element);
          return;
        }
        if (!target.sampleElement) {
          return;
        }
        const rect = target.sampleElement.getBoundingClientRect();
        if (rect.width <= 1 ||
            rect.height <= 1 ||
            rect.right <= 0 ||
            rect.left >= viewport.width ||
            rect.bottom <= 0 ||
            rect.top >= viewport.height) {
          clearTargetTone(target.element);
          return;
        }
        const sampleRect = getSampleRect(rect, target);
        const sample = sampleToneForRect(sampler, sampleRect, target, overlayLuminance, effectType);
        const luminance = sample ? sample.luminance : null;
        if (!Number.isFinite(luminance)) {
          target.element.removeAttribute('data-wallpaper-overlay-cover');
          clearForcedIconBackgroundStyles(target.element);
          clearAdaptiveToneStyles(target.element);
          return;
        }
        const currentInk = config.resetInk === true
          ? null
          : target.element.getAttribute('data-wallpaper-ink');
        const nextInk = chooseInk(luminance, currentInk);
        const overlayCovered = isWallpaperOverlayCovered(sample.overlayAlpha);
        target.element.setAttribute('data-wallpaper-ink', nextInk);
        target.element.setAttribute('data-wallpaper-overlay-cover', overlayCovered ? 'true' : 'false');
        target.element.style.setProperty('--x-nt-wallpaper-local-luma', luminance.toFixed(3));
        applyAdaptiveToneStyles(
          target.element,
          luminance,
          nextInk,
          sample.color,
          sample.overlayAlpha,
          overlayLuminance,
          sample.textureContrast,
          effectType
        );
        if (target.surface === 'topbar') {
          applySurfaceToneStyles(
            target.element,
            luminance,
            nextInk,
            sample.color,
            sample.textureContrast,
            effectType
          );
        }
        if (target.iconButton) {
          applyIconSolidBackgroundStyles(
            target.element,
            luminance,
            nextInk,
            sample.color,
            sample.overlayAlpha,
            sample.textureContrast,
            effectType
          );
        } else {
          target.element.removeAttribute('data-wallpaper-icon-bg');
        }
        if (target.forcedIconBackground) {
          applyForcedIconBackgroundStyles(
            target.element,
            luminance,
            nextInk,
            sample.color,
            target.forcedIconBackground,
            themeMode
          );
        } else {
          clearForcedIconBackgroundStyles(target.element);
        }
      });
      applyWordmarkThemeAppearance();
    }

    function schedule() {
      if (!getCurrentWallpaper() || !sampler || pendingImageUrl) {
        return;
      }
      if (toneFrame) {
        return;
      }
      toneFrame = requestFrame(() => {
        toneFrame = requestFrame(() => {
          toneFrame = 0;
          apply();
        });
      });
    }

    function refresh() {
      const wallpaper = getCurrentWallpaper();
      const imageUrl = wallpaper ? getWallpaperImageUrl(wallpaper) : '';
      if (!wallpaper || !imageUrl) {
        loadToken += 1;
        pendingImageUrl = '';
        sampler = null;
        clear();
        return;
      }
      if (sampler && sampler.url === imageUrl) {
        if (pendingImageUrl) {
          loadToken += 1;
          pendingImageUrl = '';
        }
        schedule();
        return;
      }
      if (pendingImageUrl === imageUrl) {
        return;
      }
      const token = ++loadToken;
      pendingImageUrl = imageUrl;
      cancelScheduledApply();
      loadImage(imageUrl).then((image) => {
        if (token !== loadToken) {
          return;
        }
        pendingImageUrl = '';
        sampler = createSampler(image, imageUrl);
        apply({ resetInk: true });
        schedule();
      }).catch(() => {
        if (token !== loadToken) {
          return;
        }
        pendingImageUrl = '';
        sampler = null;
        clear();
      });
    }

    return {
      clear,
      refresh,
      schedule
    };
  }

  root.LumnoNewtabWallpaperAdaptiveTone = {
    createWallpaperAdaptiveTone
  };
})(globalThis);
