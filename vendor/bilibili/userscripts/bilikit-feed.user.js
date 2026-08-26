// ==UserScript==
// @name         BiliKit Feed
// @namespace    https://github.com/shiinayane/BiliKit
// @version      0.3.23
// @author       shiinayane
// @description  B 站首页换成手机 App 的个性化推荐流。零框架纯原生实现（无 React/Vue、gzip 约 29KB）+ 窗口化虚拟化，约束 DOM、封面与预览媒体的常驻资源。视频默认开新标签页，也可选当前页或底部抽屉；封面悬停「真视频」秒开预览（MSE，接近原生 App）。需配合 BiliKit Core（登录 / 设置）。
// @license      MIT
// @icon         data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20512%20512%22%3E%3Crect%20width%3D%22512%22%20height%3D%22512%22%20rx%3D%22116%22%20fill%3D%22%23FB7299%22%2F%3E%3Cg%20stroke%3D%22%23fff%22%20stroke-width%3D%2226%22%20stroke-linecap%3D%22round%22%3E%3Cline%20x1%3D%22212%22%20y1%3D%22182%22%20x2%3D%22166%22%20y2%3D%22104%22%2F%3E%3Cline%20x1%3D%22300%22%20y1%3D%22182%22%20x2%3D%22346%22%20y2%3D%22104%22%2F%3E%3C%2Fg%3E%3Crect%20x%3D%22108%22%20y%3D%22176%22%20width%3D%22296%22%20height%3D%22236%22%20rx%3D%2254%22%20fill%3D%22%23fff%22%2F%3E%3Cpath%20d%3D%22M234%20258%20302%20294%20234%20330Z%22%20fill%3D%22%2300AEEC%22%20stroke%3D%22%2300AEEC%22%20stroke-width%3D%2218%22%20stroke-linejoin%3D%22round%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E
// @match        *://www.bilibili.com/
// @match        *://www.bilibili.com/?*
// @match        *://www.bilibili.com/index.html*
// @connect      app.bilibili.com
// @connect      api.bilibili.com
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/585249/BiliKit%20Feed.user.js
// @updateURL https://update.greasyfork.org/scripts/585249/BiliKit%20Feed.meta.js
// ==/UserScript==

(function () {
  'use strict';

  function md5(s) {
    function add32(a, b) {
      return a + b & 4294967295;
    }
    function cmn(q, a, b, x, sh, t) {
      a = add32(add32(a, q), add32(x, t));
      return add32(a << sh | a >>> 32 - sh, b);
    }
    function ff(a, b, c, d, x, s2, t) {
      return cmn(b & c | ~b & d, a, b, x, s2, t);
    }
    function gg(a, b, c, d, x, s2, t) {
      return cmn(b & d | c & ~d, a, b, x, s2, t);
    }
    function hh(a, b, c, d, x, s2, t) {
      return cmn(b ^ c ^ d, a, b, x, s2, t);
    }
    function ii(a, b, c, d, x, s2, t) {
      return cmn(c ^ (b | ~d), a, b, x, s2, t);
    }
    function cycle(x, k) {
      let a = x[0], b = x[1], c = x[2], d = x[3];
      a = ff(a, b, c, d, k[0], 7, -680876936);
      d = ff(d, a, b, c, k[1], 12, -389564586);
      c = ff(c, d, a, b, k[2], 17, 606105819);
      b = ff(b, c, d, a, k[3], 22, -1044525330);
      a = ff(a, b, c, d, k[4], 7, -176418897);
      d = ff(d, a, b, c, k[5], 12, 1200080426);
      c = ff(c, d, a, b, k[6], 17, -1473231341);
      b = ff(b, c, d, a, k[7], 22, -45705983);
      a = ff(a, b, c, d, k[8], 7, 1770035416);
      d = ff(d, a, b, c, k[9], 12, -1958414417);
      c = ff(c, d, a, b, k[10], 17, -42063);
      b = ff(b, c, d, a, k[11], 22, -1990404162);
      a = ff(a, b, c, d, k[12], 7, 1804603682);
      d = ff(d, a, b, c, k[13], 12, -40341101);
      c = ff(c, d, a, b, k[14], 17, -1502002290);
      b = ff(b, c, d, a, k[15], 22, 1236535329);
      a = gg(a, b, c, d, k[1], 5, -165796510);
      d = gg(d, a, b, c, k[6], 9, -1069501632);
      c = gg(c, d, a, b, k[11], 14, 643717713);
      b = gg(b, c, d, a, k[0], 20, -373897302);
      a = gg(a, b, c, d, k[5], 5, -701558691);
      d = gg(d, a, b, c, k[10], 9, 38016083);
      c = gg(c, d, a, b, k[15], 14, -660478335);
      b = gg(b, c, d, a, k[4], 20, -405537848);
      a = gg(a, b, c, d, k[9], 5, 568446438);
      d = gg(d, a, b, c, k[14], 9, -1019803690);
      c = gg(c, d, a, b, k[3], 14, -187363961);
      b = gg(b, c, d, a, k[8], 20, 1163531501);
      a = gg(a, b, c, d, k[13], 5, -1444681467);
      d = gg(d, a, b, c, k[2], 9, -51403784);
      c = gg(c, d, a, b, k[7], 14, 1735328473);
      b = gg(b, c, d, a, k[12], 20, -1926607734);
      a = hh(a, b, c, d, k[5], 4, -378558);
      d = hh(d, a, b, c, k[8], 11, -2022574463);
      c = hh(c, d, a, b, k[11], 16, 1839030562);
      b = hh(b, c, d, a, k[14], 23, -35309556);
      a = hh(a, b, c, d, k[1], 4, -1530992060);
      d = hh(d, a, b, c, k[4], 11, 1272893353);
      c = hh(c, d, a, b, k[7], 16, -155497632);
      b = hh(b, c, d, a, k[10], 23, -1094730640);
      a = hh(a, b, c, d, k[13], 4, 681279174);
      d = hh(d, a, b, c, k[0], 11, -358537222);
      c = hh(c, d, a, b, k[3], 16, -722521979);
      b = hh(b, c, d, a, k[6], 23, 76029189);
      a = hh(a, b, c, d, k[9], 4, -640364487);
      d = hh(d, a, b, c, k[12], 11, -421815835);
      c = hh(c, d, a, b, k[15], 16, 530742520);
      b = hh(b, c, d, a, k[2], 23, -995338651);
      a = ii(a, b, c, d, k[0], 6, -198630844);
      d = ii(d, a, b, c, k[7], 10, 1126891415);
      c = ii(c, d, a, b, k[14], 15, -1416354905);
      b = ii(b, c, d, a, k[5], 21, -57434055);
      a = ii(a, b, c, d, k[12], 6, 1700485571);
      d = ii(d, a, b, c, k[3], 10, -1894986606);
      c = ii(c, d, a, b, k[10], 15, -1051523);
      b = ii(b, c, d, a, k[1], 21, -2054922799);
      a = ii(a, b, c, d, k[8], 6, 1873313359);
      d = ii(d, a, b, c, k[15], 10, -30611744);
      c = ii(c, d, a, b, k[6], 15, -1560198380);
      b = ii(b, c, d, a, k[13], 21, 1309151649);
      a = ii(a, b, c, d, k[4], 6, -145523070);
      d = ii(d, a, b, c, k[11], 10, -1120210379);
      c = ii(c, d, a, b, k[2], 15, 718787259);
      b = ii(b, c, d, a, k[9], 21, -343485551);
      x[0] = add32(a, x[0]);
      x[1] = add32(b, x[1]);
      x[2] = add32(c, x[2]);
      x[3] = add32(d, x[3]);
    }
    function blk(str, i2) {
      const m = [];
      for (let j = 0; j < 64; j += 4) m[j >> 2] = str.charCodeAt(i2 + j) + (str.charCodeAt(i2 + j + 1) << 8) + (str.charCodeAt(i2 + j + 2) << 16) + (str.charCodeAt(i2 + j + 3) << 24);
      return m;
    }
    const n = s.length;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    let i;
    for (i = 64; i <= n; i += 64) cycle(state, blk(s, i - 64));
    s = s.substring(i - 64);
    const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << (i % 4 << 3);
    tail[i >> 2] |= 128 << (i % 4 << 3);
    if (i > 55) {
      cycle(state, tail);
      for (i = 0; i < 16; i++) tail[i] = 0;
    }
    tail[14] = n * 8;
    cycle(state, tail);
    const hc = "0123456789abcdef";
    let out = "";
    for (const w of state) for (let j = 0; j < 4; j++) out += hc[w >> j * 8 + 4 & 15] + hc[w >> j * 8 & 15];
    return out;
  }
  const APPKEY = "4409e2ce8ffd12b8";
  const APPSEC = "59b43e04ad6965f34319062b478f83dd";
  function signAppQuery(params) {
    const p = { appkey: APPKEY, ...params };
    const sorted = Object.keys(p).sort().map((k) => `${k}=${encodeURIComponent(p[k])}`).join("&");
    return `${sorted}&sign=${md5(sorted + APPSEC)}`;
  }
  const MIXIN_TAB = [
    46,
    47,
    18,
    2,
    53,
    8,
    23,
    32,
    15,
    50,
    10,
    31,
    58,
    3,
    45,
    35,
    27,
    43,
    5,
    49,
    33,
    9,
    42,
    19,
    29,
    28,
    14,
    39,
    12,
    38,
    41,
    13,
    37,
    48,
    7,
    16,
    24,
    55,
    40,
    61,
    26,
    17,
    0,
    1,
    60,
    51,
    30,
    4,
    22,
    25,
    54,
    21,
    56,
    59,
    6,
    63,
    57,
    62,
    11,
    36,
    20,
    34,
    44,
    52
  ];
  const mixinKey = (orig) => MIXIN_TAB.map((n) => orig[n]).join("").slice(0, 32);
  const REF = { Referer: "https://www.bilibili.com/" };
  const LS_KEY = "bilikit:wbi";
  let keysPromise = null;
  function todayStamp() {
    return Math.floor(Date.now() / 864e5);
  }
  async function fetchKeys() {
    var _a, _b;
    try {
      const c = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (c && c.day === todayStamp() && c.img && c.sub) return { img: c.img, sub: c.sub };
    } catch {
    }
    try {
      const t = await gmRequest({ method: "GET", url: "https://api.bilibili.com/x/web-interface/nav", headers: REF });
      const w = (_b = (_a = JSON.parse(t)) == null ? void 0 : _a.data) == null ? void 0 : _b.wbi_img;
      const base = (u) => (u || "").split("/").pop().split(".")[0];
      const img = base(w == null ? void 0 : w.img_url), sub = base(w == null ? void 0 : w.sub_url);
      if (!img || !sub) return null;
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({ img, sub, day: todayStamp() }));
      } catch {
      }
      return { img, sub };
    } catch {
      return null;
    }
  }
  function getKeys() {
    if (!keysPromise) {
      keysPromise = fetchKeys().catch(() => null).then((k) => {
        if (!k) keysPromise = null;
        return k;
      });
    }
    return keysPromise;
  }
  async function signWbi(params) {
    const keys = await getKeys();
    if (!keys) return null;
    const mk = mixinKey(keys.img + keys.sub);
    const wts = Math.floor(Date.now() / 1e3);
    const q = { ...params, wts };
    const query = Object.keys(q).sort().map((k) => {
      const v = String(q[k]).replace(/[!'()*]/g, "");
      return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
    }).join("&");
    return `${query}&w_rid=${md5(query + mk)}`;
  }
  const WBI_REF = REF;
  const NS = "bk-feed";
  const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  const esc = (s) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const coverUrl = (u) => u ? u.replace(/^http:/, "https:") : BLANK;
  function coverSized(u) {
    const base = coverUrl(u);
    if (base === BLANK) return { avif: BLANK, webp: BLANK, jpg: BLANK };
    const p = "@640w_360h_1c";
    return { avif: `${base}${p}.avif`, webp: `${base}${p}.webp`, jpg: `${base}${p}` };
  }
  function fmtCount(n) {
    if (!isFinite(n) || n < 0) n = 0;
    if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, "") + "亿";
    if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, "") + "万";
    return String(n);
  }
  function fmtDuration(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    const mm = h ? String(m).padStart(2, "0") : String(m);
    return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
  }
  function fmtDate(tsSec) {
    if (!tsSec) return "";
    const d = new Date(tsSec * 1e3);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  function readSetting(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem("bilikit:settings") || "{}")[key];
      return v === void 0 ? fallback : v;
    } catch {
      return fallback;
    }
  }
  const redactKey = (u) => (u || "").replace(/(access_key=)[^&]*/i, "$1<redacted>");
  function gmXhr() {
    return typeof GM !== "undefined" && GM && GM.xmlHttpRequest ? GM.xmlHttpRequest.bind(GM) : typeof GM_xmlhttpRequest !== "undefined" ? GM_xmlhttpRequest : null;
  }
  function gmRequestBinary(url, range, signal) {
    const xhr = gmXhr();
    if (!xhr) return Promise.reject(new Error("GM.xmlHttpRequest 不可用"));
    const abortError = () => Object.assign(new Error("请求已中止"), { name: "AbortError" });
    if (signal == null ? void 0 : signal.aborted) return Promise.reject(signal.reason || abortError());
    const headers = { Referer: "https://www.bilibili.com/" };
    if (range) headers.Range = `bytes=${range.start}-${range.end}`;
    return new Promise((resolve, reject) => {
      let done = false;
      let req = null;
      const finish = (fn) => {
        if (done) return;
        done = true;
        signal == null ? void 0 : signal.removeEventListener("abort", onSignalAbort);
        fn();
      };
      const onSignalAbort = () => {
        var _a;
        try {
          (_a = req == null ? void 0 : req.abort) == null ? void 0 : _a.call(req);
        } catch {
        }
        finish(() => reject((signal == null ? void 0 : signal.reason) || abortError()));
      };
      try {
        req = xhr({
          method: "GET",
          url,
          headers,
          responseType: "arraybuffer",
          timeout: 15e3,
          onload: (r) => {
            const okStatus = range ? r.status === 206 : r.status >= 200 && r.status < 300;
            if (!okStatus) {
              finish(() => reject(new Error("HTTP " + r.status)));
              return;
            }
            const buf = r.response;
            if (buf instanceof ArrayBuffer && buf.byteLength) finish(() => resolve(buf));
            else finish(() => reject(new Error("空/非二进制响应 status=" + r.status)));
          },
          onerror: (r) => finish(() => reject(new Error("网络错误 " + (r && r.status)))),
          ontimeout: () => finish(() => reject(new Error("超时"))),
          onabort: () => finish(() => reject(abortError()))
        });
      } catch (e) {
        finish(() => reject(e));
      }
      if (!done) signal == null ? void 0 : signal.addEventListener("abort", onSignalAbort, { once: true });
      if (!done && (signal == null ? void 0 : signal.aborted)) onSignalAbort();
    });
  }
  function gmRequest(opts) {
    const xhr = gmXhr();
    if (!xhr) return Promise.reject(new Error("GM.xmlHttpRequest 不可用（Feed 需 @grant GM.xmlHttpRequest）"));
    return new Promise((resolve, reject) => {
      xhr({
        method: opts.method,
        url: opts.url,
        data: opts.data,
        headers: opts.headers || (opts.data ? { "Content-Type": "application/x-www-form-urlencoded" } : void 0),
        anonymous: opts.anonymous,
        // 不带 cookie —— passport 风控对带 web cookie 的请求会回 412 HTML
        timeout: 15e3,
        onload: (r) => {
          const t = r.responseText || "";
          if (t.trimStart().startsWith("<")) {
            console.error(
              "[BiliKit Feed] 非 JSON 响应（可能被风控/登录拦截）：",
              "status =",
              r.status,
              r.statusText,
              "url =",
              redactKey(r.finalUrl || opts.url),
              "\n  正文(前 300) =\n",
              t.slice(0, 300)
            );
          }
          resolve(t);
        },
        onerror: (r) => {
          console.error("[BiliKit Feed] onerror：", r && r.status);
          reject(new Error("网络错误"));
        },
        ontimeout: () => reject(new Error("请求超时")),
        onabort: () => reject(new Error("请求被中止"))
        // 否则中止时 Promise 永不 settle → 上游 loading 卡死
      });
    });
  }
  function descDate(desc) {
    if (!desc) return "";
    const i = desc.lastIndexOf(" · ");
    return i >= 0 ? desc.slice(i + 3).trim() : "";
  }
  function normalize(item) {
    var _a;
    if (!item || typeof item !== "object") return null;
    const args = item.args || {};
    const pa = item.player_args || {};
    return {
      goto: item.goto || "",
      title: item.title || "",
      up: args.up_name || "",
      mid: String(args.up_id || item.avatar && item.avatar.up_id || ""),
      face: item.avatar && item.avatar.cover || "",
      cover: item.cover || "",
      uri: item.uri || "",
      bvid: item.bvid || pa.bvid || "",
      aid: String(args.aid || pa.aid || item.param || ""),
      cid: String(pa.cid || args.cid || item.cid || ""),
      // player_args.cid 常有；无则预览时 pagelist 兜底
      param: String(item.param || args.aid || pa.aid || ""),
      // dislike 接口的 id
      duration: item.cover_left_text_1 || "",
      // 时长（实测在 text_1，如 13:02）
      play: item.cover_left_text_2 || "",
      // 观看数（实测在 text_2，如 25.4万观看）
      danmaku: item.cover_left_text_3 || "",
      // 弹幕数（如 13弹幕）
      date: descDate(item.desc || ""),
      reason: item.bottom_rcmd_reason || "",
      dislikeReasons: Array.isArray((_a = item.three_point) == null ? void 0 : _a.dislike_reasons) ? item.three_point.dislike_reasons.filter((r) => r && typeof r.id === "number").map((r) => ({ id: r.id, name: String(r.name || ""), toast: String(r.toast || "") })) : [],
      source: "app",
      trackId: ""
    };
  }
  let _dumpedTP = false;
  async function fetchAppFeed(accessKey2 = "") {
    var _a, _b;
    const idx = Math.floor(Date.now() / 1e3) + Math.floor(Math.random() * 1e3);
    const query = signAppQuery({
      build: "1",
      mobi_app: "iphone",
      device: "pad",
      idx: String(idx),
      access_key: accessKey2
    });
    const url = `https://app.bilibili.com/x/v2/feed/index?${query}`;
    const text = await gmRequest({ method: "GET", url });
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return { code: -1, message: "响应非 JSON（可能被风控/登录拦截）", cards: [], raw: text };
    }
    const items2 = Array.isArray((_a = json == null ? void 0 : json.data) == null ? void 0 : _a.items) ? json.data.items : [];
    if (!_dumpedTP && items2.length) {
      _dumpedTP = true;
      const sample = (_b = items2.find((i) => i && i.three_point)) == null ? void 0 : _b.three_point;
      if (sample) console.debug("[BiliKit Feed] three_point 样本（校对「我不想看」reason id/name 用）:", JSON.stringify(sample));
    }
    const cards = items2.map(normalize).filter((c) => !!c && c.goto === "av");
    const code = typeof (json == null ? void 0 : json.code) === "number" ? json.code : -1;
    return { code, message: (json == null ? void 0 : json.message) || "", cards, raw: json };
  }
  function normalizeWeb(item) {
    if (!item || item.goto !== "av") return null;
    const owner = item.owner || {};
    const stat = item.stat || {};
    const aid = String(item.id || item.aid || "");
    return {
      goto: "av",
      title: item.title || "",
      up: owner.name || "",
      mid: String(owner.mid || ""),
      face: owner.face || "",
      cover: item.pic || "",
      uri: item.uri || (item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : ""),
      bvid: item.bvid || "",
      aid,
      cid: String(item.cid || ""),
      param: aid,
      duration: fmtDuration(item.duration || 0),
      play: stat.view ? fmtCount(stat.view) : "",
      danmaku: stat.danmaku ? fmtCount(stat.danmaku) : "",
      date: item.pubdate ? fmtDate(item.pubdate) : "",
      reason: item.rcmd_reason && item.rcmd_reason.content || (item.is_followed ? "已关注" : ""),
      // web 端「不想看」reason 是固定两项（不像 app 从 three_point 动态取）：内容不感兴趣=1、不想看此UP主=4。
      // 复用卡片现有的 pickReasons 映射：name 得能被它匹配到——'不感兴趣'命中 notInterest(id===1)、'UP主'命中 upper(/^up主/)。
      // 实际提交走 web 接口（见 actions.ts，按 source 分派）；菜单显示的标签在 card.ts 里另写死。
      dislikeReasons: [
        { id: 1, name: "不感兴趣", toast: "" },
        { id: 4, name: "UP主", toast: "" }
      ],
      source: "web",
      trackId: String(item.track_id || "")
    };
  }
  async function fetchWebFeed(freshIdx) {
    var _a;
    const query = await signWbi({ fresh_type: 4, feed_version: "V8", homepage_ver: 1, ps: 12, fresh_idx: freshIdx, fresh_idx_1h: freshIdx });
    if (!query) return { code: -1, message: "wbi 签名未就绪", cards: [], raw: null };
    let text;
    try {
      text = await gmRequest({ method: "GET", url: `https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd?${query}`, headers: WBI_REF });
    } catch {
      return { code: -1, message: "网络错误", cards: [], raw: null };
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return { code: -1, message: "响应非 JSON（可能被风控拦截）", cards: [], raw: text };
    }
    const list = Array.isArray((_a = json == null ? void 0 : json.data) == null ? void 0 : _a.item) ? json.data.item : [];
    const cards = list.map(normalizeWeb).filter((c) => !!c);
    const code = typeof (json == null ? void 0 : json.code) === "number" ? json.code : -1;
    return { code, message: (json == null ? void 0 : json.message) || "", cards, raw: json };
  }
  function injectStyle() {
    if (document.getElementById("bk-feed-style")) return;
    const s = document.createElement("style");
    s.id = "bk-feed-style";
    s.textContent = `
    .${NS}{ display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:22px 16px; padding:16px 0; }
    /* 不再用 content-visibility：真·窗口化已把 DOM 限制在可视附近；且 CV 会让「窗口内但不在视口」的卡
       塌回 contain-intrinsic-size，与视口内卡的真实高不一致 → 滚动时高度抖动。去掉后每卡真实等高。 */
    /* hover 浮起用 top 偏移而**不是 transform**：transform 会把这张卡提成合成层、移开又拆掉——
       WebKit 的重叠测试会把「视觉边界（含 hover 大投影，伸进邻卡）与之重叠、绘制顺序在后」的邻卡内容
       连带提升/降回合成层；网格列宽是 1fr 分数像素，文字在普通绘制与合成层上的亚像素栅格化不同，
       建/拆层那一瞬邻卡遮罩文字就会肉眼可见地「动一下」（圆角裁剪短暂失效露缝也是同一根）。
       top 是纯绘制偏移（position:relative 已就位）：不建层、不触发邻卡任何变化，只重绘本卡区域。 */
    .${NS}-card{ cursor:pointer; top:0; transition:top .18s ease; }
    .${NS}-card:hover{ top:-4px; }
    /* isolation:isolate 修 WebKit #77572：overflow:hidden+border-radius 容器里含硬件合成子层（hover 预览的 <video>，
       媒体合成面无视元素 border-radius）时 Safari 不把子层裁到圆角、露缝；建独立层叠上下文即正确裁剪。
       **必须常驻、不能按需切换**：0.3.17 曾改成「仅挂 <video> 时加 .hasvp」以省合成面，但动态增删 isolation
       会在建/拆层叠上下文那一瞬 churn 合成层，触发 WebKit overlap testing 把邻卡遮罩(播放/弹幕图标)顶得上下位移、
       露缝（与 hover 用 transform 会晃邻卡同源）——故回归常驻。每张封面一个层叠上下文的图形开销可接受。 */
    .${NS}-cover{ position:relative; aspect-ratio:16/9; border-radius:8px; overflow:hidden; background:var(--bg2,#e3e5e7); transition:box-shadow .18s ease; isolation:isolate; }
    .${NS}-card:hover .${NS}-cover{ box-shadow:0 6px 20px rgba(0,0,0,.22); }
    .${NS}-cover img{ width:100%; height:100%; object-fit:cover; display:block; opacity:0; transition:opacity .35s ease; }
    .${NS}-cover.loaded img{ opacity:1; }
    /* hover 雪碧图预览：盖在封面上，鼠标横向刮帧；在遮罩(z-index:2)之下、图片之上 */
    .${NS}-preview{ position:absolute; inset:0; z-index:1; background-repeat:no-repeat; opacity:0; transition:opacity .15s ease; pointer-events:none; }
    .${NS}-preview.on{ opacity:1; }
    /* hover 真视频预览：低清 dash 静音自动播，盖在封面上（同雪碧图层级 z-index:1，遮罩之下、图片之上） */
    .${NS}-vpreview{ position:absolute; inset:0; z-index:1; width:100%; height:100%; object-fit:cover; display:block; opacity:0; transition:opacity .2s ease; pointer-events:none; background:#000; }
    .${NS}-vpreview.on{ opacity:1; }
    /* Safari 圆角裁剪补丁：透明度过渡的封面图 / 真视频预览会被 Safari 提为合成子层；父卡 hover 浮起(transform)
       期间，Safari 有时不把这些子层裁到 .bk-cover 的 border-radius，方角越过圆角、露出一条缝（深色下尤其明显）。
       给每个「铺满封面、贴到边角」的子层自身也上同款圆角，方角即被磨圆、与父级圆角重合，父级裁剪失效时也不再露缝。
       走 border-radius(仅编译期圆角)而非 -webkit-mask 强裁——后者会把播放中的视频每帧重刷进遮罩缓冲、增功耗。 */
    .${NS}-cover img, .${NS}-vpreview, .${NS}-preview{ border-radius:8px; }
    .${NS}-mask, .${NS}-pbar{ border-radius:0 0 8px 8px; }
    /* 预览播放时：隐藏播放/弹幕数遮罩；右下角时长转「当前 / 总时长」，去渐变、加阴影保可读 */
    .${NS}-cover.previewing .${NS}-mstat{ display:none; }
    .${NS}-cover.previewing .${NS}-mask{ background:none; justify-content:flex-end; }
    .${NS}-cover.previewing .${NS}-mask span{ text-shadow:0 1px 4px rgba(0,0,0,.95); font-variant-numeric:tabular-nums; }
    /* 预览进度条：底部细条，随播放推进（scaleX → 合成层）。z-index:3 压在遮罩之上，短视频也看得清进度 */
    .${NS}-pbar{ position:absolute; left:0; right:0; bottom:0; z-index:3; height:3px; background:rgba(0,0,0,.28); opacity:0; transition:opacity .15s ease; pointer-events:none; }
    .${NS}-pbar.on{ opacity:1; }
    .${NS}-pbar i{ display:block; width:100%; height:100%; background:var(--brand_blue,#00aeec); transform:scaleX(0); transform-origin:left; }
    /* 骨架微光：统一走「合成层友好的 transform 位移伪元素」——封面(未加载)、骨架条、头像同一套，
       只动 transform（GPU 合成，不逐帧重绘），滚动/加载期都不掉帧。封面 .loaded/.failed 后伪元素消失。 */
    .${NS}-shimmer{ position:relative; overflow:hidden; background-color:var(--bg2,#e3e5e7); }
    .${NS}-cover:not(.loaded):not(.failed)::after, .${NS}-shimmer::after{
      content:''; position:absolute; inset:0;
      /* 浅色默认：白光打在浅灰底上看不见 → 用暗色扫光（浅底上才有对比） */
      background:linear-gradient(90deg, transparent 20%, rgba(0,0,0,.07) 50%, transparent 80%);
      transform:translateX(-100%); animation:bk-shimmer 1.6s linear infinite;
    }
    /* 深色：按页面真实底色判定(JS 给 grid 加 .bk-dark)，不用 @media prefers——避免「系统浅/B站深」时不生效。用淡白扫光 */
    .${NS}.bk-dark .${NS}-cover:not(.loaded):not(.failed)::after, .${NS}.bk-dark .${NS}-shimmer::after{
      background:linear-gradient(90deg, transparent 15%, rgba(255,255,255,.11) 50%, transparent 85%);
    }
    @keyframes bk-shimmer{ to{ transform:translateX(100%); } }
    /* 封面底部遮罩：左「播放·弹幕」右「时长」 */
    /* z-index:1 必需：封面 img 有 opacity 过渡，Safari 会把它提升为合成层、盖住本遮罩；
       给遮罩显式 z-index 才能压在图片层之上（否则 z-index:auto 不进合成层，被图片遮住）。 */
    .${NS}-mask{ position:absolute; left:0; right:0; bottom:0; z-index:2; display:flex; align-items:flex-end; justify-content:space-between; padding:8px 8px 7px; color:#fff; font-size:12px; line-height:1; background:linear-gradient(transparent, rgba(0,0,0,.85)); pointer-events:none; }
    .${NS}-mstat{ display:flex; align-items:center; gap:9px; }
    .${NS}-mstat span{ display:inline-flex; align-items:center; gap:3px; }
    .${NS}-mstat svg{ width:15px; height:15px; }
    /* 下方：头像独占左栏，右栏上标题、下「UP名 · 日期」 */
    .${NS}-bottom{ position:relative; z-index:2; display:flex; gap:10px; margin-top:9px; align-items:flex-start; } /* z-index:2 压过封面合成层，向上弹的三点菜单才不被封面盖住 */
    .${NS}-face{ width:34px; height:34px; flex:0 0 34px; border-radius:50%; object-fit:cover; background:var(--bg2,#e3e5e7); }
    img.${NS}-face{ cursor:pointer; transition:box-shadow .15s ease; } /* 有头像时可点进空间（占位 div 不给手型） */
    img.${NS}-face:hover{ box-shadow:0 0 0 2px var(--brand_blue,#00aeec); } /* hover 强调：品牌色圆环 */
    .${NS}-right{ flex:1; min-width:0; }
    .${NS}-up{ cursor:pointer; } /* UP 名可点进空间 */
    .${NS}-up:hover{ color:var(--brand_blue,#00aeec); }
    /* min-height 固定 2 行：让每张卡等高，虚拟化的行高估算才准、不漂移抖动（1 行标题也占 2 行位） */
    .${NS}-title{ margin:0 0 6px; font-size:15px; font-weight:500; line-height:1.4; min-height:2.8em; color:var(--text1,#18191c); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; transition:color .16s ease; }
    .${NS}-title:hover{ color:var(--brand_blue,#00aeec); } /* 与 UP 名一致：hover 标题本身即高亮成品牌色，示意可点 */
    .${NS}-sub{ display:flex; align-items:center; font-size:13px; color:var(--text3,#9499a0); }
    .${NS}-who{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .${NS}-sub i{ margin:0 5px; font-style:normal; }
    /* 推荐理由行内 pill（学 Gate）：只描边+文字色、不填充；实际配色由 B 站 reason style 内联覆盖 */
    .${NS}-badge{ flex:none; margin-right:6px; padding:0 6px; border:1px solid var(--brand_blue,#00aeec); border-radius:6px; color:var(--brand_blue,#00aeec); background:transparent; font-size:11px; line-height:16px; }
    /* 骨架占位（数据未到时） */
    .${NS}-skline{ height:13px; border-radius:4px; margin-bottom:8px; }
    /* 未装 Core 的提示条（可关闭） */
    .${NS}-warn{ grid-column:1/-1; display:flex; align-items:center; gap:12px; margin-bottom:6px; padding:10px 14px; border-radius:10px; background:var(--bg2,#f1f2f3); color:var(--text2,#61666d); font-size:13px; }
    .${NS}-warn b{ color:var(--text1,#18191c); }
    .${NS}-warn a{ color:var(--brand_blue,#00aeec); text-decoration:none; white-space:nowrap; }
    .${NS}-warn .bk-x{ margin-left:auto; border:0; background:transparent; color:var(--text3,#9499a0); cursor:pointer; font-size:14px; line-height:1; padding:4px; }
    .${NS}-warn .bk-x:hover{ color:var(--text1,#18191c); }
    .${NS}-spacer{ grid-column:1/-1; height:0; }  /* 窗口化：上下占位行，撑起未渲染区的高度，保滚动位置 */
    .${NS}-sentinel{ grid-column:1/-1; height:1px; }
    .${NS}-tip{ grid-column:1/-1; text-align:center; color:var(--text3,#9499a0); font-size:13px; padding:20px; }
    .${NS}-fab{ position:fixed; right:24px; bottom:32px; z-index:1000; display:flex; flex-direction:column; gap:10px; }
    /* 悬浮工具按钮：圆形 + 细描边 + 表面底 + 轻阴影，hover 变品牌色微浮起、按下微缩 */
    .${NS}-fab button{
      width:40px; height:40px; border-radius:50%; padding:0;
      display:flex; align-items:center; justify-content:center;
      border:1px solid var(--line_regular,#e3e5e7); background:var(--bg1,#fff); color:var(--text2,#61666d);
      cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,.12);
      transition:color .16s ease, transform .16s ease, box-shadow .16s ease, opacity .18s ease;
    }
    .${NS}-fab button:hover{ color:var(--brand_blue,#00aeec); transform:translateY(-2px); box-shadow:0 5px 16px rgba(0,0,0,.2); }
    .${NS}-fab button:active{ transform:scale(.94); }
    .${NS}-fab .bk-top{ opacity:0; pointer-events:none; transform:scale(.85); }      /* 默认藏，滚动后现 */
    .${NS}-fab.scrolled .bk-top{ opacity:1; pointer-events:auto; transform:none; }
    .${NS}-fab button.busy{ pointer-events:none; }
    .${NS}-fab button.busy svg{ animation:bk-spin .8s linear infinite; }
    @keyframes bk-spin{ to{ transform:rotate(360deg); } }
    /* 推荐源切换器：占一个 FAB 槽（40x40）；默认只显当前源（.bk-src-cur 复用 fab 圆钮样式），
       hover（或触屏 .open）当前钮淡出、竖向胶囊(.bk-src-pop)从底部对齐向上展开列出两项。 */
    .${NS}-src{ position:relative; width:40px; height:40px; }
    .${NS}-src-cur{ position:absolute; inset:0; transition:opacity .16s ease; }
    .${NS}-src:hover .${NS}-src-cur, .${NS}-src.open .${NS}-src-cur{ opacity:0; pointer-events:none; }
    .${NS}-src-pop{ position:absolute; right:0; bottom:0; z-index:1; display:flex; flex-direction:column;
      border-radius:20px; background:var(--bg1,#fff); border:1px solid var(--line_regular,#e3e5e7);
      box-shadow:0 4px 16px rgba(0,0,0,.18); overflow:hidden;
      opacity:0; visibility:hidden; transform:translateY(6px);
      transition:opacity .16s ease, transform .16s ease, visibility .16s; }
    .${NS}-src:hover .${NS}-src-pop, .${NS}-src.open .${NS}-src-pop{ opacity:1; visibility:visible; transform:none; }
    /* 胶囊里的两项：去掉 fab 圆钮的边/底/影/圆，做成连续竖条；当前项品牌色高亮 */
    .${NS}-fab .${NS}-src-opt{ width:40px; height:40px; border:0; border-radius:0; background:transparent; box-shadow:none; color:var(--text2,#61666d); }
    .${NS}-fab .${NS}-src-opt:hover{ transform:none; box-shadow:none; background:var(--bg2,#e3e5e7); color:var(--brand_blue,#00aeec); }
    .${NS}-fab .${NS}-src-opt.on{ color:var(--brand_blue,#00aeec); }

    /* ——— 卡片操作：稍后再看 / 我不想看 / 撤销浮层 ——— */
    .${NS}-card{ position:relative; } /* 承载「不想看」模糊浮层的定位上下文 */
    /* 三点菜单展开时抬高本卡层级，否则溢出的菜单会被 DOM 后面的卡片盖住。
       触发条件收窄为「悬到三点按钮本身」+ menuopen，而不是「悬到整张卡」——
       z-index 变化会让 Safari 重排该网格的合成层绘制顺序，touch 太频繁（鼠标扫过任意卡都算）会让
       其它卡片的圆角裁剪（同类 Safari 合成层 bug，见上面 border-radius 那段注释）瞬间失效、露出缝隙。
       用 :has() 把触发范围缩到「真悬到三点按钮」这个小目标上，日常划过网格不再触发全局重排。 */
    .${NS}-card:has(.${NS}-more-wrap:hover), .${NS}-card.menuopen{ z-index:20; }
    /* 稍后再看：封面右上角，hover 现（触屏首触即现）。深色封面上永远白图标、暗玻璃底 */
    .${NS}-wl{ position:absolute; top:8px; right:8px; z-index:3; width:32px; height:32px; border-radius:50%; border:0; padding:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.55); color:#fff; cursor:pointer; opacity:0; transform:translateY(-4px); -webkit-backdrop-filter:blur(4px); backdrop-filter:blur(4px); transition:opacity .18s ease, transform .18s ease, background .16s ease; }
    .${NS}-wl svg{ width:17px; height:17px; }
    .${NS}-card:hover .${NS}-wl{ opacity:1; transform:none; }
    .${NS}-wl:hover{ background:var(--brand_blue,#00aeec); }
    .${NS}-wl.busy{ pointer-events:none; }
    .${NS}-wl.busy svg{ animation:bk-spin .8s linear infinite; }
    .${NS}-wl.done{ opacity:1; transform:none; background:var(--brand_blue,#00aeec); }
    /* 三点「我不想看」：随 UP名·日期行右端、常显（不再压标题，标题恢复占满右侧宽度）。
       给 sub 定个 min-height，让「有菜单」与「无菜单」的卡等高，虚拟化行高不漂移。菜单向上弹（本行在卡底部）。 */
    .${NS}-sub{ min-height:22px; }
    .${NS}-more-wrap{ position:relative; flex:none; margin-left:auto; } /* auto 把三点推到本行最右端 */
    .${NS}-more{ width:22px; height:22px; border:0; padding:0; border-radius:6px; background:transparent; color:var(--text3,#9499a0); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .16s ease, color .16s ease; }
    .${NS}-more svg{ width:16px; height:16px; }
    .${NS}-more:hover{ background:var(--bg2,#e3e5e7); color:var(--text1,#18191c); }
    /* 菜单向上弹；z-index 高 + 下方 .bk-feed-bottom 抬到封面之上（封面是 Safari 合成层，否则菜单被自家封面盖住） */
    .${NS}-menu{ position:absolute; bottom:26px; right:0; z-index:30; min-width:136px; padding:4px; background:var(--bg1,#fff); border:1px solid var(--line_regular,#e3e5e7); border-radius:8px; box-shadow:0 6px 24px rgba(0,0,0,.16); opacity:0; visibility:hidden; transform:translateY(4px); transition:opacity .16s ease, transform .16s ease, visibility .16s; }
    .${NS}-more-wrap:hover .${NS}-menu, .${NS}-more-wrap.open .${NS}-menu{ opacity:1; visibility:visible; transform:none; }
    .${NS}-mi{ display:block; width:100%; text-align:left; padding:8px 10px; border:0; border-radius:6px; background:transparent; color:var(--text1,#18191c); font-size:13px; white-space:nowrap; cursor:pointer; }
    .${NS}-mi:hover{ background:var(--bg2,#e3e5e7); color:var(--brand_blue,#00aeec); }
    /* 提交「不想看」后：卡片内容模糊压暗 + 浮层（愁脸文案 + 撤销），淡入过渡 */
    .${NS}-card.disliked{ cursor:default; }
    .${NS}-card.disliked:hover{ top:0; } /* 已「不想看」的卡不再浮起（浮起改走 top，见上） */
    .${NS}-card.disliked .${NS}-cover, .${NS}-card.disliked .${NS}-bottom{ filter:blur(5px); opacity:.5; pointer-events:none; transition:filter .28s ease, opacity .28s ease; }
    .${NS}-dov{ position:absolute; inset:0; z-index:8; display:none; align-items:center; justify-content:center; }
    .${NS}-card.disliked .${NS}-dov{ display:flex; animation:bk-dov-in .26s ease; }
    @keyframes bk-dov-in{ from{ opacity:0; transform:scale(.96); } to{ opacity:1; transform:none; } }
    .${NS}-dov-in{ display:flex; flex-direction:column; align-items:center; gap:11px; padding:12px; text-align:center; }
    .${NS}-dov-txt{ color:var(--text1,#18191c); font-size:14px; font-weight:500; }
    .${NS}-undo{ display:inline-flex; align-items:center; gap:5px; padding:6px 15px; border:1px solid var(--line_regular,#e3e5e7); border-radius:16px; background:var(--bg1,#fff); color:var(--text1,#18191c); font-size:13px; cursor:pointer; transition:color .16s ease, border-color .16s ease; }
    .${NS}-undo svg{ width:15px; height:15px; }
    .${NS}-undo:hover{ color:var(--brand_blue,#00aeec); border-color:var(--brand_blue,#00aeec); }
    /* 轻量 toast：底部居中，跟随 B 站主题变量 */
    .${NS}-toast{ position:fixed; left:50%; bottom:44px; z-index:2147483000; transform:translateX(-50%) translateY(12px); max-width:76vw; padding:9px 16px; border-radius:8px; background:rgba(0,0,0,.82); color:#fff; font-size:13px; line-height:1.4; opacity:0; pointer-events:none; -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); transition:opacity .2s ease, transform .2s ease; }
    .${NS}-toast.on{ opacity:1; transform:translateX(-50%) translateY(0); }
  `;
    (document.head || document.documentElement).appendChild(s);
  }
  function hideNativeChrome() {
    if (document.getElementById("bk-feed-chrome")) return;
    const s = document.createElement("style");
    s.id = "bk-feed-chrome";
    s.textContent = `
    .feed-roll-btn { display: none !important; }        /* 右侧「换一换」 */
    .palette-button-wrap { display: none !important; }   /* 右下角 刷新内容/更多/返回顶部 */
    .adblock-tips { display: none !important; }          /* 顶部「检测到浏览器插件…加入白名单」提示 */
    /* 分区栏「不钉顶」：.header-channel 是 B 站在滚动后注入的钉顶副本（首屏时 h=0、空），
       真正可见的分区在 .bili-header 内、会随页滚走。隐掉这个副本即可：分区仍在（顶部那份），
       只是不再钉顶，也避开了它注入高度时引发的画面抽搐。 */
    .header-channel { display: none !important; }
  `;
    (document.head || document.documentElement).appendChild(s);
  }
  const shotCache = /* @__PURE__ */ new Map();
  const imgLoaded = /* @__PURE__ */ new Set();
  function preloadImg(src) {
    if (!src || imgLoaded.has(src)) return Promise.resolve();
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = im.onerror = () => {
        imgLoaded.add(src);
        if (imgLoaded.size > 400) imgLoaded.delete(imgLoaded.values().next().value);
        resolve();
      };
      im.src = src;
    });
  }
  async function fetchVideoshot(bvid) {
    var _a;
    if (shotCache.has(bvid)) return shotCache.get(bvid);
    let shot = null;
    try {
      const text = await gmRequest({ method: "GET", url: `https://api.bilibili.com/x/player/videoshot?bvid=${bvid}&index=1` });
      const d = (_a = JSON.parse(text)) == null ? void 0 : _a.data;
      if (d && Array.isArray(d.image) && d.image.length && Array.isArray(d.index) && d.index.length) {
        shot = { images: d.image.map((u) => coverUrl(u)), index: d.index, xlen: d.img_x_len || 10, ylen: d.img_y_len || 10 };
      }
    } catch {
    }
    shotCache.set(bvid, shot);
    if (shotCache.size > 200) shotCache.delete(shotCache.keys().next().value);
    return shot;
  }
  function setupHoverPreview(cover, bvid) {
    const RUN = 8e3;
    const FRAME_MS = 250;
    let hovering = false;
    let enterTimer = null;
    let rafId = 0;
    let startT = 0;
    let lastFrameAt = 0;
    let lastIdx = -1;
    let preview = null;
    let pbar = null;
    let bar = null;
    let shot = null;
    const showFrame = (idx) => {
      if (!preview || !shot) return;
      const per = shot.xlen * shot.ylen;
      const sheet = Math.min(Math.floor(idx / per), shot.images.length - 1);
      const local = idx % per;
      const col = local % shot.xlen;
      const row = Math.floor(local / shot.xlen);
      preview.style.backgroundImage = `url("${shot.images[sheet]}")`;
      preview.style.backgroundSize = `${shot.xlen * 100}% ${shot.ylen * 100}%`;
      preview.style.backgroundPosition = `${shot.xlen > 1 ? col / (shot.xlen - 1) * 100 : 0}% ${shot.ylen > 1 ? row / (shot.ylen - 1) * 100 : 0}%`;
    };
    const tick = (now) => {
      if (!cover.isConnected) {
        stop();
        return;
      }
      if (!hovering || !shot) {
        rafId = 0;
        return;
      }
      const p = (now - startT) % RUN / RUN;
      if (bar) bar.style.transform = `scaleX(${p})`;
      if (now - lastFrameAt >= FRAME_MS) {
        lastFrameAt = now;
        const idx = Math.min(Math.floor(p * shot.index.length), shot.index.length - 1);
        if (idx !== lastIdx) {
          lastIdx = idx;
          showFrame(idx);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    const stop = () => {
      hovering = false;
      if (enterTimer) {
        clearTimeout(enterTimer);
        enterTimer = null;
      }
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      preview == null ? void 0 : preview.classList.remove("on");
      pbar == null ? void 0 : pbar.classList.remove("on");
    };
    cover.addEventListener("mouseenter", () => {
      if (hovering) return;
      hovering = true;
      enterTimer = setTimeout(async () => {
        enterTimer = null;
        const s = await fetchVideoshot(bvid);
        if (!s || !hovering) return;
        await preloadImg(s.images[0]);
        if (!hovering) return;
        shot = s;
        if (!preview) {
          preview = document.createElement("div");
          preview.className = `${NS}-preview`;
          cover.appendChild(preview);
          pbar = document.createElement("div");
          pbar.className = `${NS}-pbar`;
          bar = document.createElement("i");
          pbar.appendChild(bar);
          cover.appendChild(pbar);
        }
        lastIdx = -1;
        lastFrameAt = 0;
        startT = performance.now();
        showFrame(0);
        preview.classList.add("on");
        pbar.classList.add("on");
        rafId = requestAnimationFrame(tick);
        for (const src of s.images.slice(1)) void preloadImg(src);
      }, 150);
    });
    cover.addEventListener("mouseleave", stop);
  }
  function targetMirror() {
    return readSetting("module.cdn-pick.cfg.targetHost", "upos-sz-mirrorhwb.bilivideo.com");
  }
  const EXTRA_MIRROR = "upos-sz-mirrorcoso1.bilivideo.com";
  const hostOf = (u) => {
    try {
      return new URL(u).hostname;
    } catch {
      return "";
    }
  };
  const pathOf = (u) => {
    try {
      return new URL(u).pathname;
    } catch {
      return "";
    }
  };
  function isPcdn(u) {
    const h = hostOf(u);
    return /\.mcdn\.bilivideo\.(cn|com)$/i.test(h) || h.includes("mcdn") || /(^|\.)szbdyd\.com$/i.test(h) || /\.biliapi\.net$/i.test(h) || pathOf(u).startsWith("/v1/resource/");
  }
  const isUpos = (u) => /^upos-[^.]*\.bilivideo\.com$/i.test(hostOf(u));
  function swapTo(u, host) {
    try {
      const x = new URL(u);
      x.protocol = "https:";
      x.host = host;
      return x.href;
    } catch {
      return u;
    }
  }
  const xyUsource = (u) => {
    try {
      return new URL(u).searchParams.get("xy_usource") || "";
    } catch {
      return "";
    }
  };
  function prefer(urls) {
    const mirror = targetMirror();
    const uniq = [...new Set(urls.filter(Boolean))];
    const out = [];
    const push = (v) => {
      if (v && !out.includes(v)) out.push(v);
    };
    for (const u of uniq) if (!isPcdn(u) && isUpos(u)) push(swapTo(u, mirror));
    for (const u of uniq) if (isPcdn(u)) {
      const xy = xyUsource(u);
      if (xy) push(swapTo(u, xy));
      push(swapTo(u, mirror));
      push(swapTo(u, EXTRA_MIRROR));
    }
    for (const u of uniq) push(u);
    return out;
  }
  async function getCid(bvid, known) {
    var _a, _b, _c;
    if (known) return known;
    const t = await gmRequest({ method: "GET", url: `https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`, headers: WBI_REF });
    return String(((_c = (_b = (_a = JSON.parse(t)) == null ? void 0 : _a.data) == null ? void 0 : _b[0]) == null ? void 0 : _c.cid) || "");
  }
  async function requestPlayurl(bvid, cid, fnval, qn) {
    const query = await signWbi({ bvid, cid, qn, fnval, fnver: 0, fourk: 0 });
    if (!query) throw new Error("no wbi keys");
    const t = await gmRequest({ method: "GET", url: `https://api.bilibili.com/x/player/wbi/playurl?${query}`, headers: WBI_REF });
    return JSON.parse(t);
  }
  function parseSeg(v) {
    const sb = v.segment_base || v.SegmentBase || {};
    const init = sb.initialization || sb.Initialization || sb.range || "";
    const idx = sb.index_range || sb.indexRange || "";
    const [, initEndS] = init.split("-");
    const [idxStartS, idxEndS] = idx.split("-");
    const initEnd = Number(initEndS), indexStart = Number(idxStartS), indexEnd = Number(idxEndS);
    if (!Number.isFinite(initEnd) || !Number.isFinite(indexStart) || !Number.isFinite(indexEnd)) return null;
    return { initEnd, indexStart, indexEnd };
  }
  const dashCache = /* @__PURE__ */ new Map();
  const durlCache = /* @__PURE__ */ new Map();
  const lru = (m) => {
    if (m.size > 150) m.delete(m.keys().next().value);
  };
  async function getDashPreview(bvid, cid0) {
    var _a, _b;
    if (dashCache.has(bvid)) return dashCache.get(bvid);
    let out = null;
    let errored = false;
    try {
      const cid = await getCid(bvid, cid0);
      if (!cid) throw new Error("no cid");
      const j = await requestPlayurl(bvid, cid, 16, 32);
      const avc = (((_b = (_a = j == null ? void 0 : j.data) == null ? void 0 : _a.dash) == null ? void 0 : _b.video) || []).filter((v) => v.codecid === 7);
      if (avc.length) {
        const low = avc.sort((a, b) => (a.id || 0) - (b.id || 0))[0];
        const seg = parseSeg(low);
        if (seg && low.codecs) {
          out = { codecs: low.codecs, urls: prefer([low.baseUrl || low.base_url, ...low.backupUrl || low.backup_url || []]), ...seg };
        }
      }
    } catch (e) {
      errored = true;
      console.warn("[BiliKit Feed] dash 取流失败：", (e == null ? void 0 : e.message) || e);
    }
    if (!errored) {
      dashCache.set(bvid, out);
      lru(dashCache);
    }
    return out;
  }
  async function getDurlSources(bvid, cid0) {
    var _a;
    if (durlCache.has(bvid)) return durlCache.get(bvid);
    let sources = null;
    let errored = false;
    try {
      const cid = await getCid(bvid, cid0);
      if (!cid) throw new Error("no cid");
      const j = await requestPlayurl(bvid, cid, 1, 16);
      const durl = (_a = j == null ? void 0 : j.data) == null ? void 0 : _a.durl;
      if (Array.isArray(durl) && durl.length) sources = prefer(durl.flatMap((x) => [x.url, ...x.backup_url || []]));
      else console.warn("[BiliKit Feed] durl 为空 code=", j == null ? void 0 : j.code, j == null ? void 0 : j.message);
    } catch (e) {
      errored = true;
      console.warn("[BiliKit Feed] durl 取流失败：", (e == null ? void 0 : e.message) || e);
    }
    if (!errored) {
      durlCache.set(bvid, sources);
      lru(durlCache);
    }
    return sources;
  }
  const PLAY_WATCH = 1600;
  const OPEN_GUARD = 3e3;
  const HIGH_WATER = 15;
  const LOW_WATER = 8;
  const BATCH_BYTES = 5e5;
  const MAX_MEDIA_BYTES = 8e6;
  const MS_CTOR = () => window.ManagedMediaSource || window.MediaSource || null;
  const isMMS = () => !!window.ManagedMediaSource;
  async function fetchRange(urls, start, end, signal) {
    const range = `bytes=${start}-${end}`;
    let last;
    for (const u of urls) {
      if (signal.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
      try {
        const r = await fetch(u, { headers: { Range: range }, credentials: "omit", cache: "no-store", signal });
        if (r.status === 206) return await r.arrayBuffer();
        last = new Error("fetch HTTP " + r.status);
      } catch (e) {
        if (signal.aborted) throw e;
        last = e;
      }
    }
    for (const u of urls) {
      if (signal.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
      try {
        return await gmRequestBinary(u, { start, end }, signal);
      } catch (e) {
        if (signal.aborted) throw e;
        last = e;
      }
    }
    throw last || new Error("all urls failed");
  }
  function parseSidx(sidxBuf) {
    try {
      const dv = new DataView(sidxBuf);
      const N = dv.byteLength;
      const u8 = (p2) => p2 + 1 <= N ? dv.getUint8(p2) : 0;
      const u16 = (p2) => p2 + 2 <= N ? dv.getUint16(p2) : 0;
      const u32 = (p2) => p2 + 4 <= N ? dv.getUint32(p2) : 0;
      const typeAt = (p2) => String.fromCharCode(u8(p2 + 4), u8(p2 + 5), u8(p2 + 6), u8(p2 + 7));
      let pos = 0;
      if (typeAt(0) !== "sidx") {
        let p2 = 0, g = 0;
        while (p2 + 8 <= N && g++ < 32) {
          if (typeAt(p2) === "sidx") break;
          const s = u32(p2);
          if (s <= 0) return null;
          p2 += s;
        }
        if (p2 + 8 > N || typeAt(p2) !== "sidx") return null;
        pos = p2;
      }
      const version = u8(pos + 8);
      let p = pos + 12 + 4;
      p += 4;
      p += version === 0 ? 8 : 16;
      p += 2;
      const refCount = u16(p);
      p += 2;
      const sizes = [];
      for (let i = 0; i < refCount && p + 12 <= N; i++) {
        sizes.push(u32(p) & 2147483647);
        p += 12;
      }
      return sizes.length ? sizes : null;
    } catch {
      return null;
    }
  }
  function appendWait(sb, buf, signal) {
    return new Promise((res, rej) => {
      const clean = () => {
        sb.removeEventListener("updateend", ok);
        sb.removeEventListener("error", er);
        signal.removeEventListener("abort", onAbort);
      };
      const ok = () => {
        clean();
        res();
      };
      const er = () => {
        clean();
        rej(new Error("append error"));
      };
      const onAbort = () => {
        clean();
        try {
          if (sb.updating) sb.abort();
        } catch {
        }
        rej(signal.reason || new DOMException("Aborted", "AbortError"));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      sb.addEventListener("updateend", ok);
      sb.addEventListener("error", er);
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        sb.appendBuffer(buf);
      } catch (e) {
        clean();
        rej(e);
      }
    });
  }
  function attachMse(video, dash) {
    const MS = MS_CTOR();
    if (!MS) {
      console.debug("[BiliKit Feed] MSE 不可用：无 MediaSource");
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      let settled = false, dead = false, objUrl = "";
      let ms = null, sb = null;
      const aborter = new AbortController();
      let openGuard = setTimeout(() => finish(false), OPEN_GUARD);
      let playWatch = null;
      const pumpListeners = [];
      const onPlaying = () => finish(true);
      const onVidErr = () => console.debug("[BiliKit Feed] MSE video error code=", video.error && video.error.code);
      video.addEventListener("playing", onPlaying);
      video.addEventListener("error", onVidErr, { once: true });
      const safeEnd = () => {
        try {
          if (ms && ms.readyState === "open" && sb && !sb.updating) ms.endOfStream();
        } catch {
        }
      };
      function dispose() {
        const resolvePending = !settled;
        if (resolvePending) settled = true;
        dead = true;
        aborter.abort();
        if (openGuard) {
          clearTimeout(openGuard);
          openGuard = null;
        }
        if (playWatch) {
          clearTimeout(playWatch);
          playWatch = null;
        }
        for (const [ev, h] of pumpListeners) video.removeEventListener(ev, h);
        pumpListeners.length = 0;
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("error", onVidErr);
        try {
          video.pause();
        } catch {
        }
        try {
          video.removeAttribute("src");
          video.load();
        } catch {
        }
        try {
          if (objUrl) URL.revokeObjectURL(objUrl);
        } catch {
        }
        objUrl = "";
        if (resolvePending) resolve(false);
      }
      video.__mseCleanup = dispose;
      function finish(ok) {
        if (settled) return;
        settled = true;
        if (openGuard) {
          clearTimeout(openGuard);
          openGuard = null;
        }
        if (playWatch) {
          clearTimeout(playWatch);
          playWatch = null;
        }
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("error", onVidErr);
        if (!ok) dispose();
        resolve(ok);
      }
      try {
        if (isMMS()) video.disableRemotePlayback = true;
        ms = new MS();
        objUrl = URL.createObjectURL(ms);
        video.src = objUrl;
        ms.addEventListener("error", () => finish(false));
        ms.addEventListener("sourceopen", async () => {
          if (openGuard) {
            clearTimeout(openGuard);
            openGuard = null;
          }
          try {
            const header = await fetchRange(dash.urls, 0, dash.indexEnd, aborter.signal);
            if (dead) return;
            const sizes = parseSidx(header.slice(dash.indexStart, dash.indexEnd + 1));
            sb = ms.addSourceBuffer(`video/mp4; codecs="${dash.codecs}"`);
            await appendWait(sb, header.slice(0, dash.initEnd + 1), aborter.signal);
            if (dead) return;
            const mediaBase = dash.indexEnd + 1;
            if (!sizes) {
              const media = await fetchRange(dash.urls, mediaBase, mediaBase + 6e5, aborter.signal);
              if (dead) return;
              await appendWait(sb, media, aborter.signal);
              safeEnd();
            } else {
              const offsets = [0];
              for (let i = 0; i < sizes.length; i++) offsets.push(offsets[i] + sizes[i]);
              let fi = 0, ended = false, pumping = false, fetched = 0;
              const ahead = () => {
                try {
                  const b = video.buffered;
                  return b.length ? b.end(b.length - 1) - video.currentTime : 0;
                } catch {
                  return 0;
                }
              };
              const doneAll = () => fi >= sizes.length || fetched >= MAX_MEDIA_BYTES;
              const pump = async () => {
                if (dead || pumping || !sb || sb.updating) return;
                if (doneAll()) {
                  if (!ended) {
                    ended = true;
                    safeEnd();
                  }
                  return;
                }
                if (ahead() > HIGH_WATER) return;
                pumping = true;
                try {
                  let n = 0, bytes = 0;
                  while (fi + n < sizes.length && bytes < BATCH_BYTES) {
                    bytes += sizes[fi + n];
                    n++;
                  }
                  const data = await fetchRange(dash.urls, mediaBase + offsets[fi], mediaBase + offsets[fi] + bytes - 1, aborter.signal);
                  if (dead) return;
                  await appendWait(sb, data, aborter.signal);
                  fi += n;
                  fetched += data.byteLength;
                } catch (e) {
                  if (dead) return;
                  console.debug("[BiliKit Feed] MSE 补拉失败：", e == null ? void 0 : e.message);
                  ended = true;
                  safeEnd();
                } finally {
                  pumping = false;
                }
                if (!dead && !doneAll() && ahead() < LOW_WATER) void pump();
              };
              const onTU = () => void pump();
              const onWait = () => {
                try {
                  const b = video.buffered;
                  if (b.length && video.currentTime < b.start(0)) video.currentTime = b.start(0);
                } catch {
                }
                void pump();
              };
              video.addEventListener("timeupdate", onTU);
              pumpListeners.push(["timeupdate", onTU]);
              video.addEventListener("waiting", onWait);
              pumpListeners.push(["waiting", onWait]);
              await pump();
            }
            if (dead) return;
            video.play().catch((e) => console.debug("[BiliKit Feed] MSE play() rej", e == null ? void 0 : e.name));
            playWatch = setTimeout(() => {
              console.debug("[BiliKit Feed] MSE 起播看门狗超时 rs=", video.readyState);
              finish(false);
            }, PLAY_WATCH);
          } catch (e) {
            if (dead) return;
            console.debug("[BiliKit Feed] MSE 装载失败：", (e == null ? void 0 : e.message) || e);
            finish(false);
          }
        }, { once: true });
      } catch (e) {
        console.debug("[BiliKit Feed] MSE 初始化失败：", (e == null ? void 0 : e.message) || e);
        finish(false);
      }
    });
  }
  const DELAY = 500;
  const FADE = 220;
  const MAX_ACTIVE = 3;
  const activeOrder = [];
  function registerActive(entry) {
    const i = activeOrder.indexOf(entry);
    if (i !== -1) activeOrder.splice(i, 1);
    activeOrder.push(entry);
    while (activeOrder.length > MAX_ACTIVE) {
      const idx = activeOrder.findIndex((x) => !x.isHovering());
      if (idx === -1) break;
      activeOrder.splice(idx, 1)[0].teardown();
    }
  }
  function unregisterActive(entry) {
    const i = activeOrder.indexOf(entry);
    if (i !== -1) activeOrder.splice(i, 1);
  }
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return `${m}:${ss < 10 ? "0" : ""}${ss}`;
  };
  function setupVideoPreview(cover, bvid, cid) {
    let hovering = false;
    let enterTimer = null;
    let hideTimer = null;
    let video = null;
    let cands = [];
    let ci = 0;
    let t0 = 0;
    let mode = "";
    let attemptOk = false;
    const durEl = cover.querySelector(`.${NS}-mask > span`);
    const origDur = durEl ? durEl.textContent || "" : "";
    const ensureEls = () => {
      if (video) return;
      video = document.createElement("video");
      video.className = `${NS}-vpreview`;
      video.muted = true;
      video.loop = true;
      video.preload = "auto";
      video.setAttribute("playsinline", "");
      video.addEventListener("timeupdate", () => {
        if (video && video.duration && isFinite(video.duration) && cover.classList.contains("previewing")) {
          if (durEl) durEl.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
        }
      });
      video.addEventListener("error", () => {
        if (mode === "durl" && ci + 1 < cands.length) {
          console.warn(`[BiliKit Feed] durl 源#${ci} 失败，换下一个`);
          playDurl(ci + 1);
        } else if (mode === "durl") attemptOk = false;
      });
      cover.appendChild(video);
    };
    const playDurl = (i) => {
      if (!video || i >= cands.length) return;
      ci = i;
      mode = "durl";
      video.src = cands[i];
      video.load();
      video.play().catch(() => {
      });
    };
    const restoreCover = () => {
      cover.classList.remove("previewing");
      if (durEl) durEl.textContent = origDur;
    };
    const show = () => {
      if (!video) return;
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      attemptOk = true;
      cover.classList.add("previewing");
      video.classList.add("on");
      registerActive(selfEntry);
    };
    const stop = () => {
      hovering = false;
      if (enterTimer) {
        clearTimeout(enterTimer);
        enterTimer = null;
      }
      if (!video || !video.classList.contains("on")) {
        if (video) teardown();
        else restoreCover();
        return;
      }
      video.classList.remove("on");
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        hideTimer = null;
        if (hovering) return;
        restoreCover();
        try {
          video == null ? void 0 : video.pause();
        } catch {
        }
      }, FADE);
    };
    const teardown = () => {
      var _a;
      hovering = false;
      if (enterTimer) {
        clearTimeout(enterTimer);
        enterTimer = null;
      }
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      restoreCover();
      attemptOk = false;
      unregisterActive(selfEntry);
      if (video) {
        try {
          (_a = video.__mseCleanup) == null ? void 0 : _a.call(video);
        } catch {
        }
        try {
          video.removeAttribute("src");
          video.load();
        } catch {
        }
        try {
          video.remove();
        } catch {
        }
        video = null;
      }
    };
    const selfEntry = { teardown, isHovering: () => hovering };
    cover.__bkTeardown = teardown;
    cover.addEventListener("mouseenter", () => {
      if (hovering) return;
      hovering = true;
      if (attemptOk && video && video.readyState >= 2 && !video.error) {
        video.play().catch(() => {
        });
        show();
        return;
      }
      t0 = performance.now();
      const dashP = getDashPreview(bvid, cid);
      enterTimer = setTimeout(async () => {
        enterTimer = null;
        if (!hovering || !cover.isConnected) return;
        ensureEls();
        const dash = await dashP;
        if (!hovering || !cover.isConnected) {
          stop();
          return;
        }
        let ok = false;
        if (dash && video) {
          mode = "mse";
          ok = await attachMse(video, dash);
          if (!hovering || !cover.isConnected) {
            teardown();
            return;
          }
          if (ok) console.debug(`[BiliKit Feed] MSE 起播 ${performance.now() - t0 | 0}ms ${bvid}`);
        }
        if (!ok) {
          const srcs = await getDurlSources(bvid, cid);
          if (!srcs || !srcs.length || !hovering || !cover.isConnected) {
            stop();
            return;
          }
          cands = srcs;
          playDurl(0);
        }
        if (!hovering || !cover.isConnected) {
          stop();
          return;
        }
        show();
      }, DELAY);
    });
    cover.addEventListener("mouseleave", stop);
  }
  function accessKey() {
    try {
      return JSON.parse(localStorage.getItem("bilikit:settings") || "{}")["feed.accessKey"] || "";
    } catch {
      return "";
    }
  }
  function biliJct() {
    const m = document.cookie.match(/(?:^|;\s*)bili_jct=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }
  const nowIdx = () => String(Math.floor(Date.now() / 1e3));
  async function feedDislike(card, reasonId, cancel) {
    const key = accessKey();
    if (!key) return { ok: false, message: "未配置 access_key，无法提交反馈" };
    const query = signAppQuery({
      access_key: key,
      build: "1",
      mobi_app: "iphone",
      device: "pad",
      goto: card.goto || "av",
      id: card.param || card.aid,
      reason_id: String(reasonId),
      idx: nowIdx()
    });
    const path = cancel ? "/x/feed/dislike/cancel" : "/x/feed/dislike";
    try {
      const text = await gmRequest({ method: "GET", url: `https://app.bilibili.com${path}?${query}` });
      const json = JSON.parse(text);
      return { ok: (json == null ? void 0 : json.code) === 0, message: (json == null ? void 0 : json.message) || ((json == null ? void 0 : json.code) === 0 ? "" : "失败") };
    } catch {
      return { ok: false, message: "网络错误" };
    }
  }
  async function webDislike(card, reasonId, cancel) {
    const csrf = biliJct();
    if (!csrf) return { ok: false, message: "需网页登录后才能反馈" };
    const path = cancel ? "/x/web-interface/feedback/dislike/cancel" : "/x/web-interface/feedback/dislike";
    const body = new URLSearchParams({
      app_id: "100",
      platform: "5",
      from_spmid: "",
      spmid: "333.1007.0.0",
      goto: card.goto || "av",
      id: card.aid || card.param,
      mid: card.mid || "0",
      track_id: card.trackId || "",
      feedback_page: "1",
      reason_id: String(reasonId),
      csrf
    });
    try {
      const r = await fetch(`https://api.bilibili.com${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });
      const json = await r.json();
      return { ok: (json == null ? void 0 : json.code) === 0, message: (json == null ? void 0 : json.message) || "" };
    } catch {
      return { ok: false, message: "网络错误" };
    }
  }
  const dislikeVideo = (c, reasonId) => c.source === "web" ? webDislike(c, reasonId, false) : feedDislike(c, reasonId, false);
  const undoDislikeVideo = (c, reasonId) => c.source === "web" ? webDislike(c, reasonId, true) : feedDislike(c, reasonId, true);
  async function toview(aid, del) {
    if (!aid) return { ok: false, message: "缺少视频 id" };
    const path = del ? "/x/v2/history/toview/del" : "/x/v2/history/toview/add";
    const csrf = biliJct();
    if (csrf) {
      try {
        const r = await fetch(`https://api.bilibili.com${path}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `aid=${encodeURIComponent(aid)}&csrf=${encodeURIComponent(csrf)}`
        });
        const json = await r.json();
        return { ok: (json == null ? void 0 : json.code) === 0, message: (json == null ? void 0 : json.message) || "" };
      } catch {
        return { ok: false, message: "网络错误" };
      }
    }
    const key = accessKey();
    if (!key) return { ok: false, message: "需网页登录或在设置里配置 access_key" };
    const query = signAppQuery({ access_key: key, build: "1", mobi_app: "iphone", device: "pad", aid, idx: nowIdx() });
    try {
      const text = await gmRequest({ method: "POST", url: `https://api.bilibili.com${path}?${query}` });
      const json = JSON.parse(text);
      return { ok: (json == null ? void 0 : json.code) === 0, message: (json == null ? void 0 : json.message) || "" };
    } catch {
      return { ok: false, message: "网络错误" };
    }
  }
  const watchLaterAdd = (aid) => toview(aid, false);
  const watchLaterDel = (aid) => toview(aid, true);
  let toastEl = null;
  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = `${NS}-toast`;
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    void toastEl.offsetWidth;
    toastEl.classList.add("on");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl == null ? void 0 : toastEl.classList.remove("on"), 2200);
  }
  const DEFAULT_OPEN_MODE = "newtab";
  const NEW_TAB_HISTORY_FLATTEN_KEY = "feed.newTabHistoryFlatten";
  const DEFAULT_NEW_TAB_HISTORY_FLATTEN = false;
  const WAYBACK_STACK_KEY = "bilikit-wayback-stack";
  const NEW_TAB_TARGET_PREFIX = "bilikit-newtab-flatten-";
  function isSafariUserAgent(userAgent, vendor) {
    return /Safari/i.test(userAgent) && /Apple Computer/i.test(vendor) && !/(?:Chrome|Chromium|CriOS|Edg|EdgiOS|Firefox|FxiOS|OPiOS)/i.test(userAgent);
  }
  function shouldUseSafariHistoryFlatten(enabled, userAgent, vendor) {
    return enabled && isSafariUserAgent(userAgent, vendor);
  }
  function newToken() {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }
  }
  function newHistoryFlattenTargetName(token = newToken()) {
    return `${NEW_TAB_TARGET_PREFIX}${token}`;
  }
  function openBiliKitVideoTab(url, enableHistoryFlatten) {
    const flatten = shouldUseSafariHistoryFlatten(
      enableHistoryFlatten,
      navigator.userAgent,
      navigator.vendor
    );
    if (!flatten) return window.open(url, "_blank", "noopener");
    let previousStack = null;
    try {
      previousStack = sessionStorage.getItem(WAYBACK_STACK_KEY);
      if (previousStack != null) sessionStorage.removeItem(WAYBACK_STACK_KEY);
    } catch {
    }
    try {
      return window.open(url, newHistoryFlattenTargetName());
    } finally {
      try {
        if (previousStack != null) sessionStorage.setItem(WAYBACK_STACK_KEY, previousStack);
      } catch {
      }
    }
  }
  const PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const DM_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 16H9l-5 4V5.5A1.5 1.5 0 0 1 5.5 4z"/></svg>';
  const WL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 1.95-5.05"/><path d="M4 3.5V7h3.5"/><path d="M10.5 9l4.3 3-4.3 3z" fill="currentColor" stroke="none"/></svg>';
  const WL_DONE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const MORE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>';
  const UNDO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.6-7.6L3 8"/></svg>';
  const stripUnit = (s) => s.replace(/观看|播放|弹幕|次/g, "").trim();
  function pickReasons(rs) {
    const upper = rs.find((r) => /^\s*up\s*主/i.test(r.name)) || rs.find((r) => /(作者|视频主)/.test(r.name));
    const notInterest = rs.find((r) => r.id === 1) || rs.find((r) => /不感兴趣|这个内容/.test(r.name)) || rs.find((r) => r !== upper);
    return { notInterest, upper };
  }
  function makeCard(c, beforeCurrentNavigation) {
    const el = document.createElement("div");
    el.className = `${NS}-card`;
    if (c.bvid) el.dataset.bvid = c.bvid;
    const mstat = (c.play ? `<span>${PLAY_SVG}${esc(stripUnit(c.play))}</span>` : "") + (c.danmaku ? `<span>${DM_SVG}${esc(stripUnit(c.danmaku))}</span>` : "");
    const badge = c.reason ? `<span class="${NS}-badge">${esc(c.reason)}</span>` : "";
    const who = `<span class="${NS}-up">${esc(c.up)}</span>` + (c.date ? `<i>·</i>${esc(c.date)}` : "");
    const sub = badge + `<span class="${NS}-who">${who}</span>`;
    const wlBtn = c.bvid ? `<button class="${NS}-wl ${NS}-noopen" type="button" title="稍后再看" aria-label="稍后再看">${WL_SVG}</button>` : "";
    const { notInterest, upper } = pickReasons(c.dislikeReasons || []);
    const menu = notInterest || upper ? `<div class="${NS}-more-wrap ${NS}-noopen"><button class="${NS}-more" type="button" title="我不想看" aria-label="我不想看">${MORE_SVG}</button><div class="${NS}-menu">` + (notInterest ? `<button class="${NS}-mi" type="button" data-rid="${notInterest.id}" data-lbl="不感兴趣">不感兴趣</button>` : "") + (upper ? `<button class="${NS}-mi" type="button" data-rid="${upper.id}" data-lbl="不想看此UP主">不想看此UP主</button>` : "") + `</div></div>` : "";
    const overlay = `<div class="${NS}-dov ${NS}-noopen"><div class="${NS}-dov-in"><div class="${NS}-dov-txt"></div><button class="${NS}-undo" type="button">${UNDO_SVG}<span>撤销</span></button></div></div>`;
    const cov = coverSized(c.cover);
    const pic = `<picture><source type="image/avif" data-srcset="${esc(cov.avif)}"><source type="image/webp" data-srcset="${esc(cov.webp)}"><img alt="" data-src="${esc(cov.jpg)}" decoding="async"></picture>`;
    el.innerHTML = `<div class="${NS}-cover">${pic}<div class="${NS}-mask"><div class="${NS}-mstat">${mstat}</div>` + (c.duration ? `<span>${esc(c.duration)}</span>` : "<span></span>") + `</div>` + wlBtn + `</div><div class="${NS}-bottom">` + (c.face ? `<img class="${NS}-face" src="${esc(coverUrl(c.face))}" alt="" loading="lazy" decoding="async">` : `<div class="${NS}-face"></div>`) + `<div class="${NS}-right"><div class="${NS}-title">${esc(c.title)}</div><div class="${NS}-sub">${sub}${menu}</div></div></div>` + overlay;
    const coverEl = el.querySelector(`.${NS}-cover`);
    const imgEl = el.querySelector("img");
    imgEl.addEventListener("load", () => {
      coverEl.classList.toggle("loaded", !imgEl.src.startsWith("data:"));
    });
    imgEl.addEventListener("error", () => {
      if (!imgEl.src.startsWith("data:")) coverEl.classList.add("failed");
    });
    if (c.bvid) {
      const pm = readSetting("feed.previewMode", "video");
      if (pm === "sprite") setupHoverPreview(coverEl, c.bvid);
      else if (pm !== "off") setupVideoPreview(coverEl, c.bvid, c.cid);
    }
    const wlEl = el.querySelector(`.${NS}-wl`);
    if (wlEl) wlEl.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (wlEl.classList.contains("busy")) return;
      const added = wlEl.classList.contains("done");
      wlEl.classList.add("busy");
      const r = added ? await watchLaterDel(c.aid) : await watchLaterAdd(c.aid);
      wlEl.classList.remove("busy");
      if (!r.ok) {
        toast(r.message || (added ? "移出失败" : "添加失败"));
        return;
      }
      if (added) {
        wlEl.innerHTML = WL_SVG;
        wlEl.classList.remove("done");
        wlEl.title = "稍后再看";
        toast("已移出稍后再看");
      } else {
        wlEl.innerHTML = WL_DONE_SVG;
        wlEl.classList.add("done");
        wlEl.title = "已加入稍后再看（再点移出）";
        toast("已添加到稍后再看");
      }
    });
    const moreWrap = el.querySelector(`.${NS}-more-wrap`);
    if (moreWrap) {
      let lastRid = c.dislikedRid || 0;
      const moreBtn = moreWrap.querySelector(`.${NS}-more`);
      const setOpen = (on) => {
        moreWrap.classList.toggle("open", on);
        el.classList.toggle("menuopen", on);
      };
      moreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setOpen(!moreWrap.classList.contains("open"));
      });
      el.querySelectorAll(`.${NS}-mi`).forEach((b) => b.addEventListener("click", async (e) => {
        e.stopPropagation();
        const btn = b;
        const rid = Number(btn.dataset.rid);
        const lbl = btn.dataset.lbl || "已标记不想看";
        setOpen(false);
        const r = await dislikeVideo(c, rid);
        if (!r.ok) {
          toast(r.message || "提交失败");
          return;
        }
        lastRid = rid;
        c.disliked = true;
        c.dislikedRid = rid;
        c.dislikedLbl = lbl;
        el.querySelector(`.${NS}-dov-txt`).textContent = lbl;
        el.classList.add("disliked");
      }));
      const undoEl = el.querySelector(`.${NS}-undo`);
      undoEl.addEventListener("click", (e) => {
        e.stopPropagation();
        c.disliked = false;
        el.classList.remove("disliked");
        undoDislikeVideo(c, lastRid).then((r) => {
          if (!r.ok) toast(r.message || "撤销失败");
        });
      });
      if (c.disliked) {
        el.querySelector(`.${NS}-dov-txt`).textContent = c.dislikedLbl || "已标记不想看";
        el.classList.add("disliked");
      }
    }
    el.addEventListener("click", (e) => {
      if (c.mid && e.target.closest(`.${NS}-face, .${NS}-up`)) {
        window.open(`https://space.bilibili.com/${c.mid}`, "_blank", "noopener");
        return;
      }
      if (c.bvid) {
        const url = `https://www.bilibili.com/video/${c.bvid}`;
        if (readSetting("feed.openMode", DEFAULT_OPEN_MODE) === "current") {
          beforeCurrentNavigation == null ? void 0 : beforeCurrentNavigation();
          location.href = url;
        } else openBiliKitVideoTab(
          url,
          readSetting(NEW_TAB_HISTORY_FLATTEN_KEY, DEFAULT_NEW_TAB_HISTORY_FLATTEN)
        );
        return;
      }
      if (c.uri && /^https?:\/\//i.test(c.uri)) window.open(c.uri, "_blank", "noopener");
    });
    return el;
  }
  function makeSkeleton() {
    const el = document.createElement("div");
    el.className = `${NS}-card ${NS}-skcard`;
    el.innerHTML = `<div class="${NS}-cover"></div><div class="${NS}-bottom"><div class="${NS}-face ${NS}-shimmer"></div><div class="${NS}-right"><div class="${NS}-shimmer ${NS}-skline"></div><div class="${NS}-shimmer ${NS}-skline" style="width:70%"></div><div class="${NS}-shimmer ${NS}-skline" style="width:45%;margin-top:6px"></div></div></div>`;
    return el;
  }
  let controls = null;
  let markerEl = null;
  let markerIo = null;
  const PHONE_SVG = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="10.5" y1="18" x2="13.5" y2="18"/></svg>';
  const PC_SVG = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3.5" width="20" height="13" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="16.5" x2="12" y2="21"/></svg>';
  const REFRESH_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>';
  const TOP_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  function buildSourceSwitcher(initial, onSwitch) {
    let cur = initial;
    const wrap = document.createElement("div");
    wrap.className = `${NS}-src`;
    const iconOf = (s) => s === "app" ? PHONE_SVG : PC_SVG;
    wrap.innerHTML = `<button class="${NS}-src-cur" type="button" title="推荐来源" aria-label="切换推荐来源"></button><div class="${NS}-src-pop"><button class="${NS}-src-opt" data-src="app" type="button" title="App 推荐" aria-label="App 推荐">${PHONE_SVG}</button><button class="${NS}-src-opt" data-src="web" type="button" title="网页推荐" aria-label="网页推荐">${PC_SVG}</button></div>`;
    const curBtn = wrap.querySelector(`.${NS}-src-cur`);
    const paint = (s) => {
      cur = s;
      curBtn.innerHTML = iconOf(s);
      wrap.querySelectorAll(`.${NS}-src-opt`).forEach((o) => o.classList.toggle("on", o.dataset.src === s));
    };
    paint(cur);
    curBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      wrap.classList.toggle("open");
    });
    wrap.querySelectorAll(`.${NS}-src-opt`).forEach((o) => o.addEventListener("click", (e) => {
      e.stopPropagation();
      const s = o.dataset.src;
      wrap.classList.remove("open");
      if (s === cur) return;
      paint(s);
      onSwitch(s);
    }));
    return wrap;
  }
  function mountControls(onRefresh, srcCtl) {
    if (controls && controls.isConnected) return;
    controls == null ? void 0 : controls.remove();
    markerEl == null ? void 0 : markerEl.remove();
    markerIo == null ? void 0 : markerIo.disconnect();
    const fab = document.createElement("div");
    fab.className = `${NS}-fab`;
    fab.innerHTML = `<button class="bk-top" title="返回顶部" aria-label="返回顶部">${TOP_SVG}</button><button class="bk-refresh" title="刷新内容" aria-label="刷新内容">${REFRESH_SVG}</button>`;
    const refreshBtn = fab.querySelector(".bk-refresh");
    refreshBtn.addEventListener("click", () => onRefresh(refreshBtn));
    fab.querySelector(".bk-top").addEventListener(
      "click",
      () => window.scrollTo({ top: 0, behavior: "smooth" })
    );
    if (srcCtl) fab.insertBefore(buildSourceSwitcher(srcCtl.initial, srcCtl.onSwitch), fab.firstChild);
    document.body.appendChild(fab);
    controls = fab;
    const marker = document.createElement("div");
    marker.style.cssText = "position:absolute;top:400px;left:0;width:1px;height:1px;pointer-events:none;";
    document.body.appendChild(marker);
    markerEl = marker;
    markerIo = new IntersectionObserver((es) => fab.classList.toggle("scrolled", !es[0].isIntersecting));
    markerIo.observe(marker);
  }
  const FEED_VERSION = "0.3.23";
  const KEY = "bilikit:feed.return-session";
  const VERSION = 1;
  const MAX_AGE_MS = 24 * 60 * 60 * 1e3;
  function isCard(value) {
    if (!value || typeof value !== "object") return false;
    const card = value;
    return typeof card.bvid === "string" && !!card.bvid && typeof card.title === "string" && typeof card.cover === "string" && (card.source === "app" || card.source === "web");
  }
  function parseFeedReturnSession(raw, now = Date.now()) {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (value.version !== VERSION || typeof value.savedAt !== "number" || now - value.savedAt > MAX_AGE_MS || value.savedAt > now + 6e4) return null;
      if (value.source !== "app" && value.source !== "web") return null;
      if (!Array.isArray(value.items) || !value.items.length || !value.items.every(isCard)) return null;
      return {
        version: VERSION,
        savedAt: value.savedAt,
        source: value.source,
        webFreshIdx: Math.max(1, Math.floor(Number(value.webFreshIdx) || 1)),
        exhausted: value.exhausted === true,
        scrollY: Math.max(0, Number(value.scrollY) || 0),
        items: value.items
      };
    } catch {
      return null;
    }
  }
  function saveFeedReturnSession(session, storage = sessionStorage, now = Date.now()) {
    try {
      const value = { version: VERSION, savedAt: now, ...session };
      storage.setItem(KEY, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("[BiliKit Feed] 保存返回状态失败，将按普通当前页导航：", error);
      return false;
    }
  }
  function takeFeedReturnSession(now = Date.now(), storage = sessionStorage) {
    let raw;
    try {
      raw = storage.getItem(KEY);
    } catch {
      return null;
    }
    const value = parseFeedReturnSession(raw, now);
    try {
      storage.removeItem(KEY);
    } catch {
    }
    return value;
  }
  const seen = /* @__PURE__ */ new Set();
  let grid = null;
  let sentinel = null;
  let topSpacer = null;
  let bottomSpacer = null;
  let loading = false;
  let exhausted = false;
  let cardIo = null;
  let sentinelIo = null;
  let gridRo = null;
  let lastGridW = 0;
  let feedGen = 0;
  const items = [];
  const nodes = /* @__PURE__ */ new Map();
  const MAX_ITEMS = 2e3;
  let cachedCols = 1;
  let cachedRowH = 0;
  let cachedGridTop = 0;
  let metricsDirty = true;
  let lastStart = -1, lastEnd = -1, lastTotalRows = -1;
  let renderRaf = 0;
  let suppressScroll = false;
  let cooldownUntil = 0;
  let source = (() => {
    try {
      return localStorage.getItem("bilikit:feed.tab") === "web" ? "web" : "app";
    } catch {
      return "app";
    }
  })();
  let webFreshIdx = 1;
  function getAccessKey() {
    try {
      return JSON.parse(localStorage.getItem("bilikit:settings") || "{}")["feed.accessKey"] || "";
    } catch {
      return "";
    }
  }
  let darkProbe = null;
  function pageIsDark() {
    if (!darkProbe) {
      darkProbe = document.createElement("div");
      darkProbe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;background:var(--bg2,#fff);pointer-events:none";
      (document.body || document.documentElement).appendChild(darkProbe);
    }
    const m = getComputedStyle(darkProbe).backgroundColor.match(/\d+(?:\.\d+)?/g);
    if (!m) return false;
    return 0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2] < 128;
  }
  function metrics() {
    if (!metricsDirty && cachedRowH > 0) return { cols: cachedCols, rowH: cachedRowH, gridTop: cachedGridTop };
    const cs = getComputedStyle(grid);
    const parts = cs.gridTemplateColumns.split(" ").filter(Boolean);
    const cols = parts.length && parts.every((p) => p.endsWith("px")) ? parts.length : cachedCols;
    cachedCols = cols;
    let cardH = 330;
    let measured = false;
    const first = nodes.size ? nodes.values().next().value : null;
    if (first && first.offsetHeight > 50) {
      cardH = first.offsetHeight;
      measured = true;
    }
    const rowGap = parseFloat(cs.rowGap) || 22;
    const rowH = cardH + rowGap;
    const gridTop = topSpacer ? topSpacer.getBoundingClientRect().top + window.scrollY : 0;
    if (measured) {
      cachedRowH = rowH;
      cachedGridTop = gridTop;
      metricsDirty = false;
    }
    return { cols, rowH, gridTop };
  }
  function invalidateLayout() {
    metricsDirty = true;
    lastStart = -1;
    lastEnd = -1;
    lastTotalRows = -1;
  }
  function teardownCard(el) {
    var _a;
    const cover = el.querySelector(`.${NS}-cover`);
    (_a = cover == null ? void 0 : cover.__bkTeardown) == null ? void 0 : _a.call(cover);
  }
  function teardownRenderedCards() {
    for (const el of nodes.values()) {
      cardIo == null ? void 0 : cardIo.unobserve(el);
      teardownCard(el);
      el.remove();
    }
    nodes.clear();
  }
  function saveCurrentFeedForReturn() {
    if (!items.length) return;
    saveFeedReturnSession({
      source,
      webFreshIdx,
      exhausted,
      scrollY: window.scrollY,
      items
    });
  }
  function render() {
    if (!grid || !sentinel || !topSpacer || !bottomSpacer) return;
    if (!items.length) {
      topSpacer.style.height = "0px";
      bottomSpacer.style.height = "0px";
      lastStart = lastEnd = lastTotalRows = -1;
      return;
    }
    const { cols, rowH, gridTop } = metrics();
    const totalRows = Math.ceil(items.length / cols);
    const into = window.scrollY - gridTop;
    const vh = window.innerHeight;
    const BUF = vh * 1.5;
    const firstRow = Math.max(0, Math.floor((into - BUF) / rowH));
    const lastRow = Math.min(totalRows - 1, Math.max(0, Math.ceil((into + vh + BUF) / rowH)));
    const startIdx = firstRow * cols;
    const endIdx = Math.min(items.length, (lastRow + 1) * cols);
    if (startIdx === lastStart && endIdx === lastEnd && totalRows === lastTotalRows) return;
    lastStart = startIdx;
    lastEnd = endIdx;
    lastTotalRows = totalRows;
    const anchor = firstRow > 0 ? nodes.get(Math.max(0, Math.floor(into / rowH)) * cols) || null : null;
    const anchorTop = anchor ? anchor.offsetTop : 0;
    for (const [i, el] of nodes) {
      if (i < startIdx || i >= endIdx) {
        cardIo == null ? void 0 : cardIo.unobserve(el);
        teardownCard(el);
        el.remove();
        nodes.delete(i);
      }
    }
    topSpacer.style.height = firstRow * rowH + "px";
    bottomSpacer.style.height = Math.max(0, (totalRows - (lastRow + 1)) * rowH) + "px";
    for (let i = startIdx; i < endIdx; i++) {
      if (nodes.has(i)) continue;
      const el = makeCard(items[i], saveCurrentFeedForReturn);
      nodes.set(i, el);
      let ref = bottomSpacer;
      for (let j = i + 1; j < endIdx; j++) {
        const n = nodes.get(j);
        if (n) {
          ref = n;
          break;
        }
      }
      grid.insertBefore(el, ref);
      cardIo == null ? void 0 : cardIo.observe(el);
    }
    if (anchor) {
      const delta = anchor.offsetTop - anchorTop;
      if (Math.abs(delta) > 0.5) {
        suppressScroll = true;
        window.scrollBy(0, delta);
      }
    }
  }
  function scheduleRender() {
    if (suppressScroll) {
      suppressScroll = false;
      return;
    }
    if (renderRaf) return;
    renderRaf = requestAnimationFrame(() => {
      renderRaf = 0;
      render();
    });
  }
  function clearAll() {
    if (cardIo) cardIo.disconnect();
    teardownRenderedCards();
    items.length = 0;
    if (topSpacer) topSpacer.style.height = "0px";
    if (bottomSpacer) bottomSpacer.style.height = "0px";
    invalidateLayout();
  }
  function renderSkeletons(n) {
    if (!grid || !bottomSpacer) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) frag.appendChild(makeSkeleton());
    grid.insertBefore(frag, bottomSpacer);
  }
  function clearSkeletons() {
    if (grid) grid.querySelectorAll(`.${NS}-skcard`).forEach((n) => n.remove());
  }
  function sentinelInView() {
    if (!sentinel) return false;
    return sentinel.getBoundingClientRect().top < window.innerHeight + Math.max(window.innerHeight, 1200);
  }
  function showTip(text) {
    if (!grid) return;
    let tip = grid.querySelector(`.${NS}-tip`);
    if (!tip) {
      tip = document.createElement("div");
      tip.className = `${NS}-tip`;
      grid.appendChild(tip);
    }
    tip.textContent = text;
  }
  function removeTip() {
    var _a;
    (_a = grid == null ? void 0 : grid.querySelector(`.${NS}-tip`)) == null ? void 0 : _a.remove();
  }
  function hasRealCard() {
    return !!grid && !!grid.querySelector(`.${NS}-card:not(.${NS}-skcard)`);
  }
  async function loadMore() {
    if (loading || exhausted || !grid || !sentinel) return;
    if (performance.now() < cooldownUntil) return;
    loading = true;
    const gen = feedGen;
    let failed = false;
    try {
      let emptyStreak = 0;
      let first = true;
      while ((first || sentinelInView()) && emptyStreak < 3 && items.length < MAX_ITEMS) {
        first = false;
        const { code, message, cards } = source === "web" ? await fetchWebFeed(webFreshIdx++) : await fetchAppFeed(getAccessKey());
        if (gen !== feedGen) return;
        if (code !== 0) {
          console.warn(`[BiliKit Feed] 加载失败 code=${code} ${message}`);
          failed = true;
          break;
        }
        clearSkeletons();
        removeTip();
        let addedThisPage = 0;
        for (const c of cards) {
          if (!c.bvid || seen.has(c.bvid)) continue;
          seen.add(c.bvid);
          items.push(c);
          addedThisPage++;
          if (items.length >= MAX_ITEMS) break;
        }
        if (addedThisPage) render();
        emptyStreak = addedThisPage === 0 ? emptyStreak + 1 : 0;
      }
      if (items.length >= MAX_ITEMS) {
        exhausted = true;
        showTip(`本次已加载 ${MAX_ITEMS} 条，为限制长会话内存已暂停追加；刷新内容可继续。`);
      } else if (emptyStreak >= 3) {
        if (source === "app" && !getAccessKey()) {
          exhausted = true;
          showTip("匿名推荐已刷完（B 站给匿名请求的是固定内容池）。配置 access_key 可看个性化、不重复的推荐。");
        } else {
          cooldownUntil = performance.now() + 3e3;
        }
      }
    } catch (e) {
      console.error("[BiliKit Feed] 加载出错：", e);
      failed = true;
    } finally {
      if (gen === feedGen) {
        clearSkeletons();
        loading = false;
        if (failed) cooldownUntil = performance.now() + 3e3;
      }
    }
    if (gen === feedGen && failed && !hasRealCard()) showTip("加载失败，请稍后重试；若持续失败可在设置里配置 access_key 或检查网络。");
  }
  function refreshFeed(btn) {
    if (!grid || !sentinel) return;
    feedGen++;
    loading = false;
    clearAll();
    removeTip();
    seen.clear();
    exhausted = false;
    webFreshIdx = 1;
    cooldownUntil = 0;
    renderSkeletons(12);
    if (btn) {
      btn.classList.add("busy");
      void loadMore().finally(() => btn.classList.remove("busy"));
    } else {
      void loadMore();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function switchSource(s) {
    if (s === source) return;
    source = s;
    try {
      localStorage.setItem("bilikit:feed.tab", s);
    } catch {
    }
    webFreshIdx = 1;
    refreshFeed();
  }
  function findNativeFeed() {
    const card = document.querySelector(".feed-card, .bili-video-card");
    const byCard = card && card.closest(".container");
    if (byCard) return byCard;
    return [...document.querySelectorAll(".container")].find((c) => c.querySelector(".feed-card, .bili-video-card")) || null;
  }
  function takeover() {
    if (grid && grid.isConnected) return true;
    const native = findNativeFeed();
    if (!native || !native.parentElement) return false;
    if (gridRo) {
      gridRo.disconnect();
      gridRo = null;
    }
    if (cardIo) cardIo.disconnect();
    if (sentinelIo) sentinelIo.disconnect();
    if (renderRaf) {
      cancelAnimationFrame(renderRaf);
      renderRaf = 0;
    }
    teardownRenderedCards();
    document.querySelectorAll(`.${NS}`).forEach((g) => g.remove());
    feedGen++;
    loading = false;
    items.length = 0;
    seen.clear();
    exhausted = false;
    cooldownUntil = 0;
    invalidateLayout();
    const returnSession = takeFeedReturnSession();
    if (returnSession) {
      source = returnSession.source;
      webFreshIdx = returnSession.webFreshIdx;
      exhausted = returnSession.exhausted;
      items.push(...returnSession.items.slice(0, MAX_ITEMS));
      for (const card of items) seen.add(card.bvid);
    }
    injectStyle();
    native.style.setProperty("display", "none", "important");
    cardIo = new IntersectionObserver(
      (ents) => {
        var _a;
        for (const e of ents) {
          const card = e.target;
          const img = card.querySelector("img");
          const sources = card.querySelectorAll("picture source[data-srcset]");
          if (e.isIntersecting) {
            if (img && (!img.getAttribute("src") || img.src.startsWith("data:")) && img.dataset.src) {
              (_a = img.parentElement) == null ? void 0 : _a.classList.remove("failed");
              sources.forEach((s) => {
                const ss = s.dataset.srcset;
                if (ss) s.srcset = ss;
              });
              img.src = img.dataset.src;
            }
          } else {
            if (img && img.src && !img.src.startsWith("data:")) {
              sources.forEach((s) => {
                s.srcset = "";
              });
              img.src = BLANK;
            }
          }
        }
      },
      { rootMargin: "1000px 0px" }
    );
    grid = document.createElement("div");
    grid.className = NS;
    grid.classList.toggle("bk-dark", pageIsDark());
    topSpacer = document.createElement("div");
    topSpacer.className = `${NS}-spacer`;
    bottomSpacer = document.createElement("div");
    bottomSpacer.className = `${NS}-spacer`;
    sentinel = document.createElement("div");
    sentinel.className = `${NS}-sentinel`;
    grid.append(topSpacer, bottomSpacer, sentinel);
    native.parentElement.insertBefore(grid, native);
    sentinelIo = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: "1000px 0px" });
    sentinelIo.observe(sentinel);
    lastGridW = 0;
    if ("ResizeObserver" in window) {
      gridRo = new ResizeObserver((es) => {
        const w = es[0].contentRect.width;
        if (w && w !== lastGridW) {
          lastGridW = w;
          invalidateLayout();
          scheduleRender();
        }
      });
      gridRo.observe(grid);
    }
    mountControls((btn) => refreshFeed(btn), { initial: source, onSwitch: switchSource });
    if (returnSession) {
      const scrollY = returnSession.scrollY;
      render();
      requestAnimationFrame(() => {
        invalidateLayout();
        render();
        window.scrollTo(0, scrollY);
        scheduleRender();
        if (!exhausted && sentinelInView()) void loadMore();
      });
    } else {
      renderSkeletons(12);
      void loadMore();
    }
    return true;
  }
  const REPO = "https://github.com/shiinayane/BiliKit";
  function warnCoreMissing() {
    if (!grid || !topSpacer) return;
    if (localStorage.getItem("bilikit:dismiss.core-missing") || grid.querySelector(`.${NS}-warn`)) return;
    const bar = document.createElement("div");
    bar.className = `${NS}-warn`;
    bar.innerHTML = `<span>未检测到 <b>BiliKit Core</b>：登录、设置、抽屉净化都需要它。</span><a href="${REPO}" target="_blank" rel="noopener">前往安装</a><button class="bk-x" aria-label="关闭">✕</button>`;
    bar.querySelector(".bk-x").addEventListener("click", () => {
      try {
        localStorage.setItem("bilikit:dismiss.core-missing", "1");
      } catch {
      }
      bar.remove();
    });
    grid.insertBefore(bar, topSpacer);
    invalidateLayout();
  }
  function checkCore() {
    const alive = Number(localStorage.getItem("bilikit:alive.core") || 0);
    if (Date.now() - alive > 15e3) warnCoreMissing();
  }
  function mountFeed() {
    if (window.top !== window.self) return;
    const beat = () => {
      try {
        localStorage.setItem("bilikit:alive.feed", String(Date.now()));
      } catch {
      }
    };
    beat();
    let lastHeartbeatAt = Date.now();
    try {
      localStorage.setItem("bilikit:feed.version", FEED_VERSION);
    } catch {
    }
    window.addEventListener("scroll", scheduleRender, { passive: true });
    window.addEventListener("resize", () => {
      invalidateLayout();
      scheduleRender();
    });
    let themeRaf = 0;
    const syncDark = () => {
      if (themeRaf) return;
      themeRaf = requestAnimationFrame(() => {
        themeRaf = 0;
        if (grid) grid.classList.toggle("bk-dark", pageIsDark());
      });
    };
    try {
      new MutationObserver(syncDark).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    } catch {
    }
    const onHome = () => location.pathname === "/" || location.pathname === "/index.html";
    const tick = () => {
      if (onHome()) {
        hideNativeChrome();
        takeover();
      }
    };
    tick();
    setTimeout(() => {
      if (onHome()) checkCore();
    }, 2500);
    setInterval(() => {
      if (!onHome()) return;
      const now = Date.now();
      if (now - lastHeartbeatAt >= 5e3) {
        beat();
        lastHeartbeatAt = now;
      }
      hideNativeChrome();
      takeover();
    }, 2e3);
  }
  mountFeed();

})();