export type UserscriptSourceExport = {
  source: string;
  suggestedFilename: string;
};

export interface UserscriptSourceExporter {
  exportSource(payload: UserscriptSourceExport): void | Promise<void>;
}

export function userscriptExportFilename(name: string) {
  const normalized = Array.from(name.normalize('NFKC'), (character) =>
    character.charCodeAt(0) < 32 ? ' ' : character,
  ).join('');
  const filename = normalized
    .replace(/[<>:"/\\|?*]+/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/[ .-]+$/g, '')
    .trim();
  return `${filename || 'userscript'}.user.js`;
}
