import { SaxesParser } from 'saxes';
import { SYNC_MAX_VERSIONS } from './model';

export function parseDavListing(xml: string, directory: URL): string[] {
  const parser = new SaxesParser({ xmlns: true });
  const stack: { uri: string; local: string }[] = [];
  const names = new Set<string>();
  let rootSeen = false;
  let responses = 0;
  let current: {
    href: string;
    statuses: number[];
    collection: boolean;
  } | null = null;
  let status = '';
  const fail = () => {
    throw new Error(
      '目录响应不是完整的 WebDAV 列表，请检查服务地址与反向代理配置。',
    );
  };
  parser.on('doctype', fail);
  parser.on('error', fail);
  parser.on('opentag', (tag) => {
    if (!stack.length) {
      if (tag.uri !== 'DAV:' || tag.local !== 'multistatus') fail();
      rootSeen = true;
    }
    stack.push(tag);
    if (stack.length > 32) fail();
    if (tag.uri !== 'DAV:') return;
    if (tag.local === 'response') {
      if (
        current ||
        stack.length !== 2 ||
        ++responses > SYNC_MAX_VERSIONS * 2 + 32
      )
        fail();
      current = { href: '', statuses: [], collection: false };
    }
    if (tag.local === 'status') status = '';
    if (
      tag.local === 'collection' &&
      stack.at(-2)?.local === 'resourcetype' &&
      current
    )
      current.collection = true;
  });
  const text = (value: string) => {
    const tag = stack.at(-1);
    if (!current || tag?.uri !== 'DAV:') return;
    if (tag.local === 'href' && stack.at(-2)?.local === 'response')
      current.href += value;
    if (tag.local === 'status') status += value;
  };
  parser.on('text', text);
  parser.on('cdata', text);
  parser.on('closetag', (tag) => {
    if (tag.uri === 'DAV:' && current) {
      if (tag.local === 'status') {
        const code = /^HTTP\/\S+\s+(\d{3})(?:\s|$)/.exec(status.trim());
        if (!code) fail();
        current.statuses.push(Number(code?.[1]));
      }
      if (tag.local === 'response') {
        if (!current.href.trim()) fail();
        const url = new URL(current.href.trim(), directory);
        if (
          url.origin !== directory.origin ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          fail();
        const root = decodeURIComponent(directory.pathname);
        const path = decodeURIComponent(url.pathname);
        if (path.replace(/\/$/, '') !== root.replace(/\/$/, '')) {
          if (!path.startsWith(root)) fail();
          const name = path.slice(root.length);
          if (!current.collection) {
            if (!name || name.includes('/') || name === '.' || name === '..')
              fail();
            if (!current.statuses.some((code) => code >= 200 && code < 300)) {
              throw new Error(
                '目录中的文件属性不可读，已停止同步，请检查读取权限。',
              );
            }
            names.add(name);
          }
        }
        current = null;
      }
    }
    stack.pop();
  });
  parser.write(xml).close();
  if (!rootSeen || current || stack.length) fail();
  return [...names].sort();
}
