# Built-in search icon provenance

The only runtime artwork in this directory is the bundled `tile-<key>.png` set. Options, new tab, and the search-scope panel all resolve icons through the same shared key-to-tile map. Each 144px RGBA tile bakes in its background and clipping mask so the artwork remains legible in both light and dark themes.

The notes below record the provenance of those frozen tiles. Brand names and marks remain the property of their respective owners.

- AI providers: version-pinned `@lobehub/icons-static-svg@1.94.0` assets from [Lobe Icons](https://github.com/lobehub/lobe-icons) (`openai`, `gemini-color`, `yuanbao-color`, `deepseek-color`, and `kimi-color`). Kimi uses the black-field treatment from its current light-theme favicon so the white mark remains legible.
- Doubao's tile uses the anthropomorphic mascot from the official Doubao CDN (`https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/favicon/new-doubao/180x180.png`).
- Qianwen, MiniMax Agent, and Metaso use their current official website product artwork: Qianwen's `80x80` AliCDN mark (`https://img.alicdn.com/imgextra/i2/O1CN01taBbMS1CfyJoOt0lB_!!6000000000109-2-tps-80-80.png`), MiniMax Agent's `favicon_v2.png` (`https://agent.minimax.io/assets/logo/favicon_v2.png?v=4`), and Metaso's Apple touch icon (`https://metaso.cn/apple-touch-icon.png`). Their artwork is normalized inside the corresponding 144px runtime tiles.
- DuckDuckGo, Brave, and GitHub: matching color vectors from the Iconify `logos` collection. DuckDuckGo and Brave were cross-checked against their official brand/press resources.
- Bilibili, Ecosia, Zhihu, Weibo, Juejin, X, and Wikipedia: matching brand vectors from [Simple Icons](https://github.com/simple-icons/simple-icons), retrieved through Iconify and frozen here. X reverses the mark to white on black, matching its official monochrome brand assets.
- Stack Overflow, MDN, npm, Semantic Scholar, Perplexity, and Sogou: matching brand vectors from [Simple Icons](https://github.com/simple-icons/simple-icons), retrieved through the `better-icons` Iconify client and frozen here.
- Hugging Face and Google Scholar: artwork from their current official site favicons, resized to 96px. Google Scholar is placed on a white rounded tile so its transparent regions do not inherit the surrounding shortcut tint.
- Google Maps, Reddit, and Xiaohongshu: current official app artwork from their public Apple App Store listings, resized to 96px. These preserve each brand's rounded tile, white reversals, and multicolor details at shortcut size.
- Yahoo and Yandex: matching brand glyphs from the Material Design Icons and Tabler Iconify collections, retrieved through `better-icons` and frozen here.
- Felo: simplified from the official `https://felo.ai/icon.svg` artwork. Douyin uses a compact locally drawn provider tile because no suitable redistributable square vector was available from the audited icon collections.
- Shenma uses its official white `神马 sm.cn` website wordmark (`https://cdn1.sm.cn/L1/272/6837/static/home/v2/logo.png`) on the orange field used by the site. JD.com uses the stable Joy dog and `京东` app artwork served by its official download page (`https://img12.360buyimg.com/img/s140x140_jfs/t1/147258/23/16345/4347/5fc4965aEbef48770/b9b653af73b80a4e.png`). Their artwork is normalized inside the corresponding runtime tiles.
- Taobao and Tmall: frozen app artwork from the official [Taobao](https://apps.apple.com/us/app/taobao-online-shopping-app/id387682726) and [Tmall](https://apps.apple.com/us/app/id518966501) App Store listings. The tiles preserve the rounded `淘` mark and the red `天猫`/black-cat app icon.
- YouTube, Baidu, Bing, Google, Douban, and Sogou were already bundled as matching vectors before this audit and remain pinned locally.
