import { describe, expect, it } from 'vitest';
import { parseDavListing } from './dav-listing';
import { memoryWebDav } from './test-server';
import { createRecord, resolveVersions } from './versions';
import { WebDavSync } from './webdav';

const credentials = { username: 'tester', password: 'example-test-password' };
describe('WebDAV directory interoperability', () => {
  it.each([
    'https://sync.example/dav/UserScripts',
    'https://sync.example/dav/UserScripts/',
  ])('normalizes the directory at the transport boundary: %s', async (url) => {
    const server = memoryWebDav();
    const client = new WebDavSync({ ...credentials, url }, server.fetcher);
    await client.test();
    expect(client.directory).toBe(
      'https://sync.example/dav/UserScripts/card-master-sync/versions-v3/',
    );
    expect(server.files.size).toBe(0);
    expect(client.diagnostics.join('\n')).toContain('无需 ETag');
  });

  it('supports prefixed or default XML namespaces and escaped directory names', () => {
    const directory = new URL('https://sync.example/a%20%26%20b/');
    for (const prefix of ['d:', '']) {
      const namespace = prefix ? 'xmlns:d="DAV:"' : 'xmlns="DAV:"';
      expect(
        parseDavListing(
          `<${prefix}multistatus ${namespace}><${prefix}response><${prefix}href>/a%20&amp;%20b/file.json</${prefix}href><${prefix}status>HTTP/1.1 200 OK</${prefix}status></${prefix}response></${prefix}multistatus>`,
          directory,
        ),
      ).toEqual(['file.json']);
    }
  });

  it('rejects non-DAV responses, truncated XML, external hrefs and DTDs', () => {
    const directory = new URL('https://sync.example/dav/');
    for (const xml of [
      '<html>login</html>',
      '<d:multistatus xmlns:d="DAV:">',
      '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///private/key">]><multistatus xmlns="DAV:"/>',
      '<multistatus xmlns="DAV:"><response><href>https://other.example/file.json</href><status>HTTP/1.1 200 OK</status></response></multistatus>',
    ])
      expect(() => parseDavListing(xml, directory)).toThrow();
  });

  it('reports method support, readback and directory visibility separately', async () => {
    const server = memoryWebDav();
    const client = new WebDavSync(
      { ...credentials, url: 'https://sync.example/dav/' },
      server.fetcher,
    );
    server.options.listStatus = 405;
    await expect(client.test()).rejects.toThrow('HTTP 405');
    server.options.listStatus = 207;
    server.options.hideFiles = true;
    await expect(client.test()).rejects.toThrow('未列出');
    server.options.hideFiles = false;
    server.options.failReadback = true;
    await expect(client.test()).rejects.toThrow('读回');
  });

  it('fetches omitted ancestors directly and verifies content-addressed payloads', async () => {
    const server = memoryWebDav();
    const client = new WebDavSync(
      { ...credentials, url: 'https://sync.example/dav/' },
      server.fetcher,
    );
    await client.test();
    const first = await createRecord('a', resolveVersions([]), {
      'script:a': { name: 'A', value: 1 },
    });
    await client.write(first);
    const next = await createRecord('a', resolveVersions([first]), {
      'script:a': { name: 'A', value: 2 },
    });
    await client.write(next);
    server.options.hideFiles = true;
    const fresh = new WebDavSync(
      { ...credentials, url: 'https://sync.example/dav/' },
      server.fetcher,
    );
    expect((await fresh.read([next.id])).entries['script:a']?.value).toBe(2);
    const path = `${fresh.directory}rev-${first.id}.json`;
    server.files.set(
      path,
      JSON.stringify({
        ...first,
        changes: { 'script:a': { name: 'A', value: 9 } },
      }),
    );
    await expect(
      new WebDavSync(
        { ...credentials, url: 'https://sync.example/dav/' },
        server.fetcher,
      ).read([first.id]),
    ).rejects.toThrow('校验失败');
  });
});
