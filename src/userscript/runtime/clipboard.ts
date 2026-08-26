export type UserscriptClipboardInfo =
  | string
  | { type?: string; mimetype?: string }
  | undefined;

export function userscriptClipboardMimeType(info: UserscriptClipboardInfo) {
  const declared =
    typeof info === 'string'
      ? info
      : info?.mimetype || info?.type || 'text/plain';
  if (declared === 'text') return 'text/plain';
  if (declared === 'html') return 'text/html';
  return declared || 'text/plain';
}

export async function writeUserscriptClipboard(
  data: unknown,
  info?: UserscriptClipboardInfo,
) {
  const text = String(data);
  const mimeType = userscriptClipboardMimeType(info);
  if (mimeType === 'text/plain' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Continue to the browser copy-command fallback.
    }
  }
  if (navigator.clipboard?.write && typeof ClipboardItem === 'function') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          [mimeType]: new Blob([text], { type: mimeType }),
        }),
      ]);
      return;
    } catch {
      // Continue to the browser copy-command fallback.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;';
  const handleCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.clipboardData.setData(mimeType, text);
  };
  document.addEventListener('copy', handleCopy, true);
  document.documentElement.append(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (!document.execCommand('copy')) {
      throw new Error('The browser rejected the clipboard write.');
    }
  } finally {
    document.removeEventListener('copy', handleCopy, true);
    textarea.remove();
  }
}
