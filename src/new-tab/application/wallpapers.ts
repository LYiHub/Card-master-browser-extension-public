import { t } from '../../localization/messages';
export type NewTabBuiltinWallpaper = {
  id: string;
  label: string;
  tone: 'light' | 'dark';
  path: string;
  thumbnailPath: string;
};

export const NEW_TAB_BUILTIN_WALLPAPERS: readonly NewTabBuiltinWallpaper[] = [
  {
    id: 'dark-linocut-topographic',
    get label() {
      return t('cm_wallpapers_label_1');
    },
    tone: 'dark',
    path: 'vendor/lumno/wallpapers/lumno-newtab-dark-linocut-topographic.webp',
    thumbnailPath:
      'vendor/lumno/wallpapers/lumno-newtab-dark-linocut-topographic-thumb.webp',
  },
  {
    id: 'dark-monet-lily-nocturne',
    get label() {
      return t('cm_wallpapers_label_2');
    },
    tone: 'dark',
    path: 'vendor/lumno/wallpapers/lumno-newtab-dark-monet-lily-nocturne.webp',
    thumbnailPath:
      'vendor/lumno/wallpapers/lumno-newtab-dark-monet-lily-nocturne-thumb.webp',
  },
  {
    id: 'dark-shanshui-moonlit',
    get label() {
      return t('cm_wallpapers_label_3');
    },
    tone: 'dark',
    path: 'vendor/lumno/wallpapers/lumno-newtab-dark-shanshui-moonlit.webp',
    thumbnailPath:
      'vendor/lumno/wallpapers/lumno-newtab-dark-shanshui-moonlit-thumb.webp',
  },
  {
    id: 'monet-coastal-white',
    get label() {
      return t('cm_wallpapers_label_4');
    },
    tone: 'light',
    path: 'vendor/lumno/wallpapers/lumno-newtab-monet-coastal-white.webp',
    thumbnailPath:
      'vendor/lumno/wallpapers/lumno-newtab-monet-coastal-white-thumb.webp',
  },
  {
    id: 'white-3d-observatory',
    get label() {
      return t('cm_wallpapers_label_5');
    },
    tone: 'light',
    path: 'vendor/lumno/wallpapers/lumno-newtab-white-3d-observatory.webp',
    thumbnailPath:
      'vendor/lumno/wallpapers/lumno-newtab-white-3d-observatory-thumb.webp',
  },
  {
    id: 'white-shanshui',
    get label() {
      return t('cm_wallpapers_label_6');
    },
    tone: 'light',
    path: 'vendor/lumno/wallpapers/lumno-newtab-white-shanshui.webp',
    thumbnailPath:
      'vendor/lumno/wallpapers/lumno-newtab-white-shanshui-thumb.webp',
  },
] as const;

export function newTabBuiltinWallpaper(id: string) {
  return NEW_TAB_BUILTIN_WALLPAPERS.find((wallpaper) => wallpaper.id === id);
}
