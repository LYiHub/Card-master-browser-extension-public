import type {
  UserscriptSourceExport,
  UserscriptSourceExporter,
} from '../application/source-export';

export class BrowserUserscriptSourceExporter
  implements UserscriptSourceExporter
{
  exportSource({ source, suggestedFilename }: UserscriptSourceExport) {
    const url = URL.createObjectURL(
      new Blob([source], { type: 'text/javascript;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = suggestedFilename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
