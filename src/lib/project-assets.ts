type ExtensionRuntime = {
  id?: string;
  getURL?: (path: string) => string;
};

function extensionRuntime() {
  const globals = globalThis as typeof globalThis & {
    chrome?: { runtime?: ExtensionRuntime };
    browser?: { runtime?: ExtensionRuntime };
  };
  return globals.chrome?.runtime ?? globals.browser?.runtime;
}

export function projectAssetUrl(path: string) {
  const relativePath = path.replace(/^\/?(?:project-assets\/)?/, '');
  const runtime = extensionRuntime();
  return runtime?.id && runtime.getURL
    ? runtime.getURL(`project-assets/${relativePath}`)
    : `/project-assets/${relativePath}`;
}

export function extensionAssetUrl(path: string) {
  const relativePath = path.replace(/^\/+/, '');
  const runtime = extensionRuntime();
  return runtime?.id && runtime.getURL
    ? runtime.getURL(relativePath)
    : `/${relativePath}`;
}

export function rewriteProjectAssetUrls(css: string, assetRoot: string) {
  return css.replaceAll('/project-assets/', assetRoot);
}
