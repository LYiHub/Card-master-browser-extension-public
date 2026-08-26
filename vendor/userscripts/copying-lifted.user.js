// ==UserScript==
// @name         Copying Lifted 解除复制限制
// @name:en      Copying Lifted
// @name:zh-CN   Copying Lifted 解除复制限制
// @namespace    https://palerock.cn
// @version      1.0
// @description  解除网页复制、选择和右键限制
// @author       Cangshi
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const runtimeKey = '__cardMasterCopyingLifted__';
  window[runtimeKey]?.();

  const activeClass = 'card-master-copying-lifted';
  const style = document.createElement('style');
  style.textContent = `.${activeClass}, .${activeClass} * { user-select: text !important; -webkit-user-select: text !important; }`;
  document.documentElement.append(style);

  let pointerActive = false;
  let modifierActive = false;
  const listeners = [];
  const listen = (target, type, listener, options) => {
    target.addEventListener(type, listener, options);
    listeners.push(() => target.removeEventListener(type, listener, options));
  };
  const updateSelection = () => {
    document.documentElement.classList.toggle(
      activeClass,
      pointerActive || modifierActive,
    );
  };
  const allowNativeAction = (event) => event.stopImmediatePropagation();

  listen(
    window,
    'pointerdown',
    () => {
      pointerActive = true;
      updateSelection();
    },
    true,
  );
  for (const type of ['pointerup', 'pointercancel']) {
    listen(
      window,
      type,
      () => {
        pointerActive = false;
        updateSelection();
      },
      true,
    );
  }
  listen(
    window,
    'keydown',
    (event) => {
      modifierActive = event.ctrlKey || event.metaKey;
      updateSelection();
    },
    true,
  );
  listen(
    window,
    'keyup',
    (event) => {
      modifierActive = event.ctrlKey || event.metaKey;
      updateSelection();
    },
    true,
  );
  listen(window, 'blur', () => {
    pointerActive = false;
    modifierActive = false;
    updateSelection();
  });
  for (const type of ['copy', 'cut', 'contextmenu', 'selectstart']) {
    listen(document, type, allowNativeAction, true);
  }

  window[runtimeKey] = () => {
    for (const remove of listeners) remove();
    document.documentElement.classList.remove(activeClass);
    style.remove();
    delete window[runtimeKey];
  };
})();
