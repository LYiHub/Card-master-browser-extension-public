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
    label: '深色版画地形',
    tone: 'dark',
    path: 'vendor/lumno/wallpapers/lumno-newtab-dark-linocut-topographic.webp',
    thumbnailPath:
      'vendor/lumno/wallpapers/lumno-newtab-dark-linocut-topographic-thumb.webp',
  },
  {
    id: 'dark-monet-lily-nocturne',
    label: '深色睡莲夜曲',
    tone: 'dark',
    path: 'vendor/lumno/wallpapers/lumno-newtab-dark-monet-lily-nocturne.webp',
    thumbnailPath:
      'vendor/lumno/wallpapers/lumno-newtab-dark-monet-lily-nocturne-thumb.webp',
  },
  {
    id: 'dark-shanshui-moonlit',
    label: '深色月下山水',
    tone: 'dark',
    path: 'vendor/lumno/wallpapers/lumno-newtab-dark-shanshui-moonlit.webp',
    thumbnailPath:
      'vendor/lumno/wallpapers/lumno-newtab-dark-shanshui-moonlit-thumb.webp',
  },
  {
    id: 'monet-coastal-white',
    label: '莫奈海岸',
    tone: 'light',
    path: 'vendor/lumno/wallpapers/lumno-newtab-monet-coastal-white.webp',
    thumbnailPath:
      'vendor/lumno/wallpapers/lumno-newtab-monet-coastal-white-thumb.webp',
  },
  {
    id: 'white-3d-observatory',
    label: '白色立体天文台',
    tone: 'light',
    path: 'vendor/lumno/wallpapers/lumno-newtab-white-3d-observatory.webp',
    thumbnailPath:
      'vendor/lumno/wallpapers/lumno-newtab-white-3d-observatory-thumb.webp',
  },
  {
    id: 'white-shanshui',
    label: '白色山水',
    tone: 'light',
    path: 'vendor/lumno/wallpapers/lumno-newtab-white-shanshui.webp',
    thumbnailPath:
      'vendor/lumno/wallpapers/lumno-newtab-white-shanshui-thumb.webp',
  },
] as const;

export function newTabBuiltinWallpaper(id: string) {
  return NEW_TAB_BUILTIN_WALLPAPERS.find((wallpaper) => wallpaper.id === id);
}
