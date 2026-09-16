import { vi } from 'vitest';

export function memoryWebDav() {
  const files = new Map<string, string>();
  const options = {
    listStatus: 207,
    listing: '',
    hideFiles: false,
    etag: false,
    failReadback: false,
    partialUpload: false,
  };
  let puts = 0;
  let gate: {
    count: number;
    arrived: number;
    promise: Promise<void>;
    release: () => void;
  } | null = null;
  const escapeXml = (text: string) =>
    text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  const fetcher = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'MKCOL') return new Response(null, { status: 201 });
      if (method === 'DELETE') {
        files.delete(url);
        return new Response(null, { status: 204 });
      }
      if (method === 'PROPFIND') {
        if (options.listing)
          return new Response(options.listing, { status: options.listStatus });
        const paths = options.hideFiles
          ? []
          : [...files.keys()].filter((path) => path.startsWith(url));
        return new Response(
          `<d:multistatus xmlns:d="DAV:">${paths.map((path) => `<d:response><d:href>${escapeXml(path)}</d:href><d:propstat><d:prop><d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`).join('')}</d:multistatus>`,
          { status: options.listStatus },
        );
      }
      if (method === 'PUT') {
        if (url.includes('/rev-')) {
          puts++;
          const waiting = gate;
          if (waiting) {
            waiting.arrived++;
            if (waiting.arrived === waiting.count) {
              gate = null;
              waiting.release();
            }
            await waiting.promise;
          }
        }
        files.set(
          url,
          options.partialUpload && url.includes('/rev-')
            ? '{partial'
            : String(init?.body),
        );
        // Deliberately ignore all conditional headers, like the reported service.
        return new Response(null, { status: 201 });
      }
      const body = files.get(url);
      return body === undefined
        ? new Response(null, { status: 404 })
        : new Response(options.failReadback ? 'wrong-content' : body, {
            headers: options.etag ? { ETag: '"optional-etag"' } : {},
          });
    },
  );
  return {
    files,
    options,
    fetcher,
    puts: () => puts,
    gateWrites(count: number) {
      let release = () => {};
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      gate = { count, arrived: 0, promise, release };
    },
  };
}
