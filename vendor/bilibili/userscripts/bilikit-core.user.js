// ==UserScript==
// @name         BiliKit Core
// @namespace    https://github.com/shiinayane/BiliKit
// @version      0.5.33
// @author       shiinayane
// @description  B 站体验增强核心，一装到位：CDN 优选（救海外卡顿）· 免登录看评论/动态/1080p · 主题跟随系统深浅 · 评论显性别/IP 属地 · 播放不息屏——统一设置面板集中开关。Safari 友好、无需扩展、零外部依赖。
// @license      MIT
// @icon         data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20512%20512%22%3E%3Crect%20width%3D%22512%22%20height%3D%22512%22%20rx%3D%22116%22%20fill%3D%22%23FB7299%22%2F%3E%3Cg%20stroke%3D%22%23fff%22%20stroke-width%3D%2226%22%20stroke-linecap%3D%22round%22%3E%3Cline%20x1%3D%22212%22%20y1%3D%22182%22%20x2%3D%22166%22%20y2%3D%22104%22%2F%3E%3Cline%20x1%3D%22300%22%20y1%3D%22182%22%20x2%3D%22346%22%20y2%3D%22104%22%2F%3E%3C%2Fg%3E%3Crect%20x%3D%22108%22%20y%3D%22176%22%20width%3D%22296%22%20height%3D%22236%22%20rx%3D%2254%22%20fill%3D%22%23fff%22%2F%3E%3Cpath%20d%3D%22M234%20258%20302%20294%20234%20330Z%22%20fill%3D%22%2300AEEC%22%20stroke%3D%22%2300AEEC%22%20stroke-width%3D%2218%22%20stroke-linejoin%3D%22round%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E
// @match        *://*.bilibili.com/*
// @grant        none
// @run-at       document-start
// @downloadURL https://update.greasyfork.org/scripts/585248/BiliKit%20Core.user.js
// @updateURL https://update.greasyfork.org/scripts/585248/BiliKit%20Core.meta.js
// ==/UserScript==

(function () {
  'use strict';

  const KEY = "bilikit:settings";
  const CK = "bilikit_settings";
  const SENSITIVE = /accessKey|token|secret|passwd|password/i;
  const SETTINGS_EVENT = "bilikit:settings-changed";
  function readLocal() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}") ?? {};
    } catch {
      return {};
    }
  }
  function readCookie() {
    try {
      const m = document.cookie.match(/(?:^|;\s*)bilikit_settings=([^;]*)/);
      if (!m || !m[1]) return null;
      return JSON.parse(decodeURIComponent(m[1]));
    } catch {
      return null;
    }
  }
  function toCookieStore(s) {
    const out = {};
    for (const k in s) if (!SENSITIVE.test(k)) out[k] = s[k];
    return out;
  }
  function writeCookie(s) {
    try {
      const v = encodeURIComponent(JSON.stringify(toCookieStore(s)));
      document.cookie = `${CK}=${v}; path=/; domain=.bilibili.com; max-age=31536000; SameSite=Lax`;
    } catch {
    }
  }
  let cache$1 = null;
  function load() {
    if (cache$1) return cache$1;
    const local = readLocal();
    const c = readCookie();
    cache$1 = c ? { ...local, ...c } : local;
    return cache$1;
  }
  try {
    window.addEventListener("storage", (e) => {
      if (!e.key || e.key === KEY) cache$1 = null;
    });
  } catch {
  }
  function save(s) {
    cache$1 = s;
    writeCookie(s);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
      try {
        window.dispatchEvent(new Event(SETTINGS_EVENT));
      } catch {
      }
      return true;
    } catch {
      return false;
    }
  }
  function syncSharedSettings() {
    const c = readCookie();
    const local = readLocal();
    if (c) {
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...local, ...c }));
      } catch {
      }
    } else if (Object.keys(local).length) {
      writeCookie(local);
    }
  }
  function get(key, fallback) {
    const s = load();
    return key in s ? s[key] : fallback;
  }
  function set(key, value) {
    const s = load();
    s[key] = value;
    return save(s);
  }
  const enabledKey = (id) => `module.${id}.enabled`;
  function isModuleEnabled(m) {
    return get(enabledKey(m.id), m.defaultEnabled !== false);
  }
  function setModuleEnabled(id, on) {
    set(enabledKey(id), on);
  }
  const cfgKey = (id, key) => `module.${id}.cfg.${key}`;
  function getField(m, key) {
    var _a;
    const field = (_a = m.settings) == null ? void 0 : _a.find((f) => f.key === key);
    return get(cfgKey(m.id, key), field ? field.default : void 0);
  }
  function setField(id, key, value) {
    return set(cfgKey(id, key), value);
  }
  function makeCfg(m) {
    return {
      get: (key) => getField(m, key)
    };
  }
  const registry = [];
  function register(...mods) {
    for (const m of mods) {
      if (registry.some((x) => x.id === m.id)) {
        console.warn(`[BiliKit] 模块 id 重复，已忽略：${m.id}`);
        continue;
      }
      registry.push(m);
    }
  }
  function getModules() {
    return registry;
  }
  function runAll() {
    for (const m of registry) {
      if (!isModuleEnabled(m)) continue;
      const go = () => {
        try {
          m.init(makeCfg(m));
        } catch (e) {
          console.error(`[BiliKit] 模块「${m.id}」初始化出错：`, e);
        }
      };
      if (m.runAt === "idle" && document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", go, { once: true });
      } else {
        go();
      }
    }
  }
  const qrcode = function(typeNumber, errorCorrectionLevel) {
    const PAD0 = 236;
    const PAD1 = 17;
    let _typeNumber = typeNumber;
    const _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    let _modules = null;
    let _moduleCount = 0;
    let _dataCache = null;
    const _dataList = [];
    const _this = {};
    const makeImpl = function(test, maskPattern) {
      _moduleCount = _typeNumber * 4 + 17;
      _modules = (function(moduleCount) {
        const modules = new Array(moduleCount);
        for (let row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (let col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      })(_moduleCount);
      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);
      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }
      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }
      mapData(_dataCache, maskPattern);
    };
    const setupPositionProbePattern = function(row, col) {
      for (let r = -1; r <= 7; r += 1) {
        if (row + r <= -1 || _moduleCount <= row + r) continue;
        for (let c = -1; c <= 7; c += 1) {
          if (col + c <= -1 || _moduleCount <= col + c) continue;
          if (0 <= r && r <= 6 && (c == 0 || c == 6) || 0 <= c && c <= 6 && (r == 0 || r == 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };
    const getBestMaskPattern = function() {
      let minLostPoint = 0;
      let pattern = 0;
      for (let i = 0; i < 8; i += 1) {
        makeImpl(true, i);
        const lostPoint = QRUtil.getLostPoint(_this);
        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }
      return pattern;
    };
    const setupTimingPattern = function() {
      for (let r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = r % 2 == 0;
      }
      for (let c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = c % 2 == 0;
      }
    };
    const setupPositionAdjustPattern = function() {
      const pos = QRUtil.getPatternPosition(_typeNumber);
      for (let i = 0; i < pos.length; i += 1) {
        for (let j = 0; j < pos.length; j += 1) {
          const row = pos[i];
          const col = pos[j];
          if (_modules[row][col] != null) {
            continue;
          }
          for (let r = -2; r <= 2; r += 1) {
            for (let c = -2; c <= 2; c += 1) {
              if (r == -2 || r == 2 || c == -2 || c == 2 || r == 0 && c == 0) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };
    const setupTypeNumber = function(test) {
      const bits = QRUtil.getBCHTypeNumber(_typeNumber);
      for (let i = 0; i < 18; i += 1) {
        const mod = !test && (bits >> i & 1) == 1;
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }
      for (let i = 0; i < 18; i += 1) {
        const mod = !test && (bits >> i & 1) == 1;
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };
    const setupTypeInfo = function(test, maskPattern) {
      const data = _errorCorrectionLevel << 3 | maskPattern;
      const bits = QRUtil.getBCHTypeInfo(data);
      for (let i = 0; i < 15; i += 1) {
        const mod = !test && (bits >> i & 1) == 1;
        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }
      for (let i = 0; i < 15; i += 1) {
        const mod = !test && (bits >> i & 1) == 1;
        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }
      _modules[_moduleCount - 8][8] = !test;
    };
    const mapData = function(data, maskPattern) {
      let inc = -1;
      let row = _moduleCount - 1;
      let bitIndex = 7;
      let byteIndex = 0;
      const maskFunc = QRUtil.getMaskFunction(maskPattern);
      for (let col = _moduleCount - 1; col > 0; col -= 2) {
        if (col == 6) col -= 1;
        while (true) {
          for (let c = 0; c < 2; c += 1) {
            if (_modules[row][col - c] == null) {
              let dark = false;
              if (byteIndex < data.length) {
                dark = (data[byteIndex] >>> bitIndex & 1) == 1;
              }
              const mask2 = maskFunc(row, col - c);
              if (mask2) {
                dark = !dark;
              }
              _modules[row][col - c] = dark;
              bitIndex -= 1;
              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }
          row += inc;
          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };
    const createBytes = function(buffer, rsBlocks) {
      let offset = 0;
      let maxDcCount = 0;
      let maxEcCount = 0;
      const dcdata = new Array(rsBlocks.length);
      const ecdata = new Array(rsBlocks.length);
      for (let r = 0; r < rsBlocks.length; r += 1) {
        const dcCount = rsBlocks[r].dataCount;
        const ecCount = rsBlocks[r].totalCount - dcCount;
        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);
        dcdata[r] = new Array(dcCount);
        for (let i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 255 & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;
        const rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        const rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);
        const modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (let i = 0; i < ecdata[r].length; i += 1) {
          const modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = modIndex >= 0 ? modPoly.getAt(modIndex) : 0;
        }
      }
      let totalCodeCount = 0;
      for (let i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }
      const data = new Array(totalCodeCount);
      let index = 0;
      for (let i = 0; i < maxDcCount; i += 1) {
        for (let r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }
      for (let i = 0; i < maxEcCount; i += 1) {
        for (let r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }
      return data;
    };
    const createData = function(typeNumber2, errorCorrectionLevel2, dataList) {
      const rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, errorCorrectionLevel2);
      const buffer = qrBitBuffer();
      for (let i = 0; i < dataList.length; i += 1) {
        const data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
        data.write(buffer);
      }
      let totalDataCount = 0;
      for (let i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }
      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw "code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")";
      }
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }
      while (true) {
        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);
        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }
      return createBytes(buffer, rsBlocks);
    };
    _this.addData = function(data, mode) {
      mode = mode || "Byte";
      let newData = null;
      switch (mode) {
        case "Numeric":
          newData = qrNumber(data);
          break;
        case "Alphanumeric":
          newData = qrAlphaNum(data);
          break;
        case "Byte":
          newData = qr8BitByte(data);
          break;
        case "Kanji":
          newData = qrKanji(data);
          break;
        default:
          throw "mode:" + mode;
      }
      _dataList.push(newData);
      _dataCache = null;
    };
    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + "," + col;
      }
      return _modules[row][col];
    };
    _this.getModuleCount = function() {
      return _moduleCount;
    };
    _this.make = function() {
      if (_typeNumber < 1) {
        let typeNumber2 = 1;
        for (; typeNumber2 < 40; typeNumber2++) {
          const rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, _errorCorrectionLevel);
          const buffer = qrBitBuffer();
          for (let i = 0; i < _dataList.length; i++) {
            const data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
            data.write(buffer);
          }
          let totalDataCount = 0;
          for (let i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }
          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }
        _typeNumber = typeNumber2;
      }
      makeImpl(false, getBestMaskPattern());
    };
    _this.createTableTag = function(cellSize, margin) {
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      let qrHtml = "";
      qrHtml += '<table style="';
      qrHtml += " border-width: 0px; border-style: none;";
      qrHtml += " border-collapse: collapse;";
      qrHtml += " padding: 0px; margin: " + margin + "px;";
      qrHtml += '">';
      qrHtml += "<tbody>";
      for (let r = 0; r < _this.getModuleCount(); r += 1) {
        qrHtml += "<tr>";
        for (let c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += " border-width: 0px; border-style: none;";
          qrHtml += " border-collapse: collapse;";
          qrHtml += " padding: 0px; margin: 0px;";
          qrHtml += " width: " + cellSize + "px;";
          qrHtml += " height: " + cellSize + "px;";
          qrHtml += " background-color: ";
          qrHtml += _this.isDark(r, c) ? "#000000" : "#ffffff";
          qrHtml += ";";
          qrHtml += '"/>';
        }
        qrHtml += "</tr>";
      }
      qrHtml += "</tbody>";
      qrHtml += "</table>";
      return qrHtml;
    };
    _this.createSvgTag = function(cellSize, margin, alt, title) {
      let opts = {};
      if (typeof arguments[0] == "object") {
        opts = arguments[0];
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      alt = typeof alt === "string" ? { text: alt } : alt || {};
      alt.text = alt.text || null;
      alt.id = alt.text ? alt.id || "qrcode-description" : null;
      title = typeof title === "string" ? { text: title } : title || {};
      title.text = title.text || null;
      title.id = title.text ? title.id || "qrcode-title" : null;
      const size = _this.getModuleCount() * cellSize + margin * 2;
      let c, mc, r, mr, qrSvg = "", rect;
      rect = "l" + cellSize + ",0 0," + cellSize + " -" + cellSize + ",0 0,-" + cellSize + "z ";
      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : "";
      qrSvg += ' viewBox="0 0 ' + size + " " + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += title.text || alt.text ? ' role="img" aria-labelledby="' + escapeXml([title.id, alt.id].join(" ").trim()) + '"' : "";
      qrSvg += ">";
      qrSvg += title.text ? '<title id="' + escapeXml(title.id) + '">' + escapeXml(title.text) + "</title>" : "";
      qrSvg += alt.text ? '<description id="' + escapeXml(alt.id) + '">' + escapeXml(alt.text) + "</description>" : "";
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';
      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c)) {
            mc = c * cellSize + margin;
            qrSvg += "M" + mc + "," + mr + rect;
          }
        }
      }
      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += "</svg>";
      return qrSvg;
    };
    _this.createDataURL = function(cellSize, margin) {
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      const size = _this.getModuleCount() * cellSize + margin * 2;
      const min = margin;
      const max = size - margin;
      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          const c = Math.floor((x - min) / cellSize);
          const r = Math.floor((y - min) / cellSize);
          return _this.isDark(r, c) ? 0 : 1;
        } else {
          return 1;
        }
      });
    };
    _this.createImgTag = function(cellSize, margin, alt) {
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      const size = _this.getModuleCount() * cellSize + margin * 2;
      let img = "";
      img += "<img";
      img += ' src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += ' width="';
      img += size;
      img += '"';
      img += ' height="';
      img += size;
      img += '"';
      if (alt) {
        img += ' alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += "/>";
      return img;
    };
    const escapeXml = function(s) {
      let escaped = "";
      for (let i = 0; i < s.length; i += 1) {
        const c = s.charAt(i);
        switch (c) {
          case "<":
            escaped += "&lt;";
            break;
          case ">":
            escaped += "&gt;";
            break;
          case "&":
            escaped += "&amp;";
            break;
          case '"':
            escaped += "&quot;";
            break;
          default:
            escaped += c;
            break;
        }
      }
      return escaped;
    };
    const _createHalfASCII = function(margin) {
      const cellSize = 1;
      margin = typeof margin == "undefined" ? cellSize * 2 : margin;
      const size = _this.getModuleCount() * cellSize + margin * 2;
      const min = margin;
      const max = size - margin;
      let y, x, r1, r2, p;
      const blocks = {
        "██": "█",
        "█ ": "▀",
        " █": "▄",
        "  ": " "
      };
      const blocksLastLineNoMargin = {
        "██": "▀",
        "█ ": "▀",
        " █": " ",
        "  ": " "
      };
      let ascii = "";
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = "█";
          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = " ";
          }
          if (min <= x && x < max && min <= y + 1 && y + 1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += " ";
          } else {
            p += "█";
          }
          ascii += margin < 1 && y + 1 >= max ? blocksLastLineNoMargin[p] : blocks[p];
        }
        ascii += "\n";
      }
      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size + 1).join("▀");
      }
      return ascii.substring(0, ascii.length - 1);
    };
    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;
      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }
      cellSize -= 1;
      margin = typeof margin == "undefined" ? cellSize * 2 : margin;
      const size = _this.getModuleCount() * cellSize + margin * 2;
      const min = margin;
      const max = size - margin;
      let y, x, r, p;
      const white = Array(cellSize + 1).join("██");
      const black = Array(cellSize + 1).join("  ");
      let ascii = "";
      let line = "";
      for (y = 0; y < size; y += 1) {
        r = Math.floor((y - min) / cellSize);
        line = "";
        for (x = 0; x < size; x += 1) {
          p = 1;
          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }
          line += p ? white : black;
        }
        for (r = 0; r < cellSize; r += 1) {
          ascii += line + "\n";
        }
      }
      return ascii.substring(0, ascii.length - 1);
    };
    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      const length = _this.getModuleCount();
      for (let row = 0; row < length; row++) {
        for (let col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? "black" : "white";
          context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    };
    return _this;
  };
  qrcode.stringToBytes = function(s) {
    const bytes = [];
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i);
      bytes.push(c & 255);
    }
    return bytes;
  };
  qrcode.createStringToBytes = function(unicodeData, numChars) {
    const unicodeMap = (function() {
      const bin = base64DecodeInputStream(unicodeData);
      const read = function() {
        const b = bin.read();
        if (b == -1) throw "eof";
        return b;
      };
      let count = 0;
      const unicodeMap2 = {};
      while (true) {
        const b0 = bin.read();
        if (b0 == -1) break;
        const b1 = read();
        const b2 = read();
        const b3 = read();
        const k = String.fromCharCode(b0 << 8 | b1);
        const v = b2 << 8 | b3;
        unicodeMap2[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + " != " + numChars;
      }
      return unicodeMap2;
    })();
    const unknownChar = "?".charCodeAt(0);
    return function(s) {
      const bytes = [];
      for (let i = 0; i < s.length; i += 1) {
        const c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          const b = unicodeMap[s.charAt(i)];
          if (typeof b == "number") {
            if ((b & 255) == b) {
              bytes.push(b);
            } else {
              bytes.push(b >>> 8);
              bytes.push(b & 255);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };
  const QRMode = {
    MODE_NUMBER: 1 << 0,
    MODE_ALPHA_NUM: 1 << 1,
    MODE_8BIT_BYTE: 1 << 2,
    MODE_KANJI: 1 << 3
  };
  const QRErrorCorrectionLevel = {
    L: 1,
    M: 0,
    Q: 3,
    H: 2
  };
  const QRMaskPattern = {
    PATTERN000: 0,
    PATTERN001: 1,
    PATTERN010: 2,
    PATTERN011: 3,
    PATTERN100: 4,
    PATTERN101: 5,
    PATTERN110: 6,
    PATTERN111: 7
  };
  const QRUtil = (function() {
    const PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    const G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
    const G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
    const G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
    const _this = {};
    const getBCHDigit = function(data) {
      let digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };
    _this.getBCHTypeInfo = function(data) {
      let d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= G15 << getBCHDigit(d) - getBCHDigit(G15);
      }
      return (data << 10 | d) ^ G15_MASK;
    };
    _this.getBCHTypeNumber = function(data) {
      let d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= G18 << getBCHDigit(d) - getBCHDigit(G18);
      }
      return data << 12 | d;
    };
    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };
    _this.getMaskFunction = function(maskPattern) {
      switch (maskPattern) {
        case QRMaskPattern.PATTERN000:
          return function(i, j) {
            return (i + j) % 2 == 0;
          };
        case QRMaskPattern.PATTERN001:
          return function(i, j) {
            return i % 2 == 0;
          };
        case QRMaskPattern.PATTERN010:
          return function(i, j) {
            return j % 3 == 0;
          };
        case QRMaskPattern.PATTERN011:
          return function(i, j) {
            return (i + j) % 3 == 0;
          };
        case QRMaskPattern.PATTERN100:
          return function(i, j) {
            return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
          };
        case QRMaskPattern.PATTERN101:
          return function(i, j) {
            return i * j % 2 + i * j % 3 == 0;
          };
        case QRMaskPattern.PATTERN110:
          return function(i, j) {
            return (i * j % 2 + i * j % 3) % 2 == 0;
          };
        case QRMaskPattern.PATTERN111:
          return function(i, j) {
            return (i * j % 3 + (i + j) % 2) % 2 == 0;
          };
        default:
          throw "bad maskPattern:" + maskPattern;
      }
    };
    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      let a = qrPolynomial([1], 0);
      for (let i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0));
      }
      return a;
    };
    _this.getLengthInBits = function(mode, type) {
      if (1 <= type && type < 10) {
        switch (mode) {
          case QRMode.MODE_NUMBER:
            return 10;
          case QRMode.MODE_ALPHA_NUM:
            return 9;
          case QRMode.MODE_8BIT_BYTE:
            return 8;
          case QRMode.MODE_KANJI:
            return 8;
          default:
            throw "mode:" + mode;
        }
      } else if (type < 27) {
        switch (mode) {
          case QRMode.MODE_NUMBER:
            return 12;
          case QRMode.MODE_ALPHA_NUM:
            return 11;
          case QRMode.MODE_8BIT_BYTE:
            return 16;
          case QRMode.MODE_KANJI:
            return 10;
          default:
            throw "mode:" + mode;
        }
      } else if (type < 41) {
        switch (mode) {
          case QRMode.MODE_NUMBER:
            return 14;
          case QRMode.MODE_ALPHA_NUM:
            return 13;
          case QRMode.MODE_8BIT_BYTE:
            return 16;
          case QRMode.MODE_KANJI:
            return 12;
          default:
            throw "mode:" + mode;
        }
      } else {
        throw "type:" + type;
      }
    };
    _this.getLostPoint = function(qrcode2) {
      const moduleCount = qrcode2.getModuleCount();
      let lostPoint = 0;
      for (let row = 0; row < moduleCount; row += 1) {
        for (let col = 0; col < moduleCount; col += 1) {
          let sameCount = 0;
          const dark = qrcode2.isDark(row, col);
          for (let r = -1; r <= 1; r += 1) {
            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }
            for (let c = -1; c <= 1; c += 1) {
              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }
              if (r == 0 && c == 0) {
                continue;
              }
              if (dark == qrcode2.isDark(row + r, col + c)) {
                sameCount += 1;
              }
            }
          }
          if (sameCount > 5) {
            lostPoint += 3 + sameCount - 5;
          }
        }
      }
      for (let row = 0; row < moduleCount - 1; row += 1) {
        for (let col = 0; col < moduleCount - 1; col += 1) {
          let count = 0;
          if (qrcode2.isDark(row, col)) count += 1;
          if (qrcode2.isDark(row + 1, col)) count += 1;
          if (qrcode2.isDark(row, col + 1)) count += 1;
          if (qrcode2.isDark(row + 1, col + 1)) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }
      for (let row = 0; row < moduleCount; row += 1) {
        for (let col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode2.isDark(row, col) && !qrcode2.isDark(row, col + 1) && qrcode2.isDark(row, col + 2) && qrcode2.isDark(row, col + 3) && qrcode2.isDark(row, col + 4) && !qrcode2.isDark(row, col + 5) && qrcode2.isDark(row, col + 6)) {
            lostPoint += 40;
          }
        }
      }
      for (let col = 0; col < moduleCount; col += 1) {
        for (let row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode2.isDark(row, col) && !qrcode2.isDark(row + 1, col) && qrcode2.isDark(row + 2, col) && qrcode2.isDark(row + 3, col) && qrcode2.isDark(row + 4, col) && !qrcode2.isDark(row + 5, col) && qrcode2.isDark(row + 6, col)) {
            lostPoint += 40;
          }
        }
      }
      let darkCount = 0;
      for (let col = 0; col < moduleCount; col += 1) {
        for (let row = 0; row < moduleCount; row += 1) {
          if (qrcode2.isDark(row, col)) {
            darkCount += 1;
          }
        }
      }
      const ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;
      return lostPoint;
    };
    return _this;
  })();
  const QRMath = (function() {
    const EXP_TABLE = new Array(256);
    const LOG_TABLE = new Array(256);
    for (let i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (let i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
    }
    for (let i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i]] = i;
    }
    const _this = {};
    _this.glog = function(n) {
      if (n < 1) {
        throw "glog(" + n + ")";
      }
      return LOG_TABLE[n];
    };
    _this.gexp = function(n) {
      while (n < 0) {
        n += 255;
      }
      while (n >= 256) {
        n -= 255;
      }
      return EXP_TABLE[n];
    };
    return _this;
  })();
  const qrPolynomial = function(num, shift) {
    if (typeof num.length == "undefined") {
      throw num.length + "/" + shift;
    }
    const _num = (function() {
      let offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      const _num2 = new Array(num.length - offset + shift);
      for (let i = 0; i < num.length - offset; i += 1) {
        _num2[i] = num[i + offset];
      }
      return _num2;
    })();
    const _this = {};
    _this.getAt = function(index) {
      return _num[index];
    };
    _this.getLength = function() {
      return _num.length;
    };
    _this.multiply = function(e) {
      const num2 = new Array(_this.getLength() + e.getLength() - 1);
      for (let i = 0; i < _this.getLength(); i += 1) {
        for (let j = 0; j < e.getLength(); j += 1) {
          num2[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i)) + QRMath.glog(e.getAt(j)));
        }
      }
      return qrPolynomial(num2, 0);
    };
    _this.mod = function(e) {
      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }
      const ratio = QRMath.glog(_this.getAt(0)) - QRMath.glog(e.getAt(0));
      const num2 = new Array(_this.getLength());
      for (let i = 0; i < _this.getLength(); i += 1) {
        num2[i] = _this.getAt(i);
      }
      for (let i = 0; i < e.getLength(); i += 1) {
        num2[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i)) + ratio);
      }
      return qrPolynomial(num2, 0).mod(e);
    };
    return _this;
  };
  const QRRSBlock = (function() {
    const RS_BLOCK_TABLE = [
      // L
      // M
      // Q
      // H
      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],
      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],
      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],
      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],
      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],
      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],
      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],
      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],
      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],
      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],
      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],
      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],
      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],
      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],
      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],
      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],
      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],
      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],
      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],
      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],
      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],
      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],
      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],
      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],
      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],
      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],
      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],
      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],
      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],
      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],
      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],
      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],
      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],
      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],
      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],
      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],
      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],
      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],
      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],
      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];
    const qrRSBlock = function(totalCount, dataCount) {
      const _this2 = {};
      _this2.totalCount = totalCount;
      _this2.dataCount = dataCount;
      return _this2;
    };
    const _this = {};
    const getRsBlockTable = function(typeNumber, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case QRErrorCorrectionLevel.L:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
        case QRErrorCorrectionLevel.M:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
        case QRErrorCorrectionLevel.Q:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
        case QRErrorCorrectionLevel.H:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {
      const rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);
      if (typeof rsBlock == "undefined") {
        throw "bad rs block @ typeNumber:" + typeNumber + "/errorCorrectionLevel:" + errorCorrectionLevel;
      }
      const length = rsBlock.length / 3;
      const list = [];
      for (let i = 0; i < length; i += 1) {
        const count = rsBlock[i * 3 + 0];
        const totalCount = rsBlock[i * 3 + 1];
        const dataCount = rsBlock[i * 3 + 2];
        for (let j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount));
        }
      }
      return list;
    };
    return _this;
  })();
  const qrBitBuffer = function() {
    const _buffer = [];
    let _length = 0;
    const _this = {};
    _this.getBuffer = function() {
      return _buffer;
    };
    _this.getAt = function(index) {
      const bufIndex = Math.floor(index / 8);
      return (_buffer[bufIndex] >>> 7 - index % 8 & 1) == 1;
    };
    _this.put = function(num, length) {
      for (let i = 0; i < length; i += 1) {
        _this.putBit((num >>> length - i - 1 & 1) == 1);
      }
    };
    _this.getLengthInBits = function() {
      return _length;
    };
    _this.putBit = function(bit) {
      const bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }
      if (bit) {
        _buffer[bufIndex] |= 128 >>> _length % 8;
      }
      _length += 1;
    };
    return _this;
  };
  const qrNumber = function(data) {
    const _mode = QRMode.MODE_NUMBER;
    const _data = data;
    const _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return _data.length;
    };
    _this.write = function(buffer) {
      const data2 = _data;
      let i = 0;
      while (i + 2 < data2.length) {
        buffer.put(strToNum(data2.substring(i, i + 3)), 10);
        i += 3;
      }
      if (i < data2.length) {
        if (data2.length - i == 1) {
          buffer.put(strToNum(data2.substring(i, i + 1)), 4);
        } else if (data2.length - i == 2) {
          buffer.put(strToNum(data2.substring(i, i + 2)), 7);
        }
      }
    };
    const strToNum = function(s) {
      let num = 0;
      for (let i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i));
      }
      return num;
    };
    const chatToNum = function(c) {
      if ("0" <= c && c <= "9") {
        return c.charCodeAt(0) - "0".charCodeAt(0);
      }
      throw "illegal char :" + c;
    };
    return _this;
  };
  const qrAlphaNum = function(data) {
    const _mode = QRMode.MODE_ALPHA_NUM;
    const _data = data;
    const _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return _data.length;
    };
    _this.write = function(buffer) {
      const s = _data;
      let i = 0;
      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i)) * 45 + getCode(s.charAt(i + 1)),
          11
        );
        i += 2;
      }
      if (i < s.length) {
        buffer.put(getCode(s.charAt(i)), 6);
      }
    };
    const getCode = function(c) {
      if ("0" <= c && c <= "9") {
        return c.charCodeAt(0) - "0".charCodeAt(0);
      } else if ("A" <= c && c <= "Z") {
        return c.charCodeAt(0) - "A".charCodeAt(0) + 10;
      } else {
        switch (c) {
          case " ":
            return 36;
          case "$":
            return 37;
          case "%":
            return 38;
          case "*":
            return 39;
          case "+":
            return 40;
          case "-":
            return 41;
          case ".":
            return 42;
          case "/":
            return 43;
          case ":":
            return 44;
          default:
            throw "illegal char :" + c;
        }
      }
    };
    return _this;
  };
  const qr8BitByte = function(data) {
    const _mode = QRMode.MODE_8BIT_BYTE;
    const _bytes = qrcode.stringToBytes(data);
    const _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return _bytes.length;
    };
    _this.write = function(buffer) {
      for (let i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };
    return _this;
  };
  const qrKanji = function(data) {
    const _mode = QRMode.MODE_KANJI;
    const stringToBytes = qrcode.stringToBytes;
    !(function(c, code) {
      const test = stringToBytes(c);
      if (test.length != 2 || (test[0] << 8 | test[1]) != code) {
        throw "sjis not supported.";
      }
    })("友", 38726);
    const _bytes = stringToBytes(data);
    const _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };
    _this.write = function(buffer) {
      const data2 = _bytes;
      let i = 0;
      while (i + 1 < data2.length) {
        let c = (255 & data2[i]) << 8 | 255 & data2[i + 1];
        if (33088 <= c && c <= 40956) {
          c -= 33088;
        } else if (57408 <= c && c <= 60351) {
          c -= 49472;
        } else {
          throw "illegal char at " + (i + 1) + "/" + c;
        }
        c = (c >>> 8 & 255) * 192 + (c & 255);
        buffer.put(c, 13);
        i += 2;
      }
      if (i < data2.length) {
        throw "illegal char at " + (i + 1);
      }
    };
    return _this;
  };
  const byteArrayOutputStream = function() {
    const _bytes = [];
    const _this = {};
    _this.writeByte = function(b) {
      _bytes.push(b & 255);
    };
    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };
    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (let i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };
    _this.writeString = function(s) {
      for (let i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i));
      }
    };
    _this.toByteArray = function() {
      return _bytes;
    };
    _this.toString = function() {
      let s = "";
      s += "[";
      for (let i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ",";
        }
        s += _bytes[i];
      }
      s += "]";
      return s;
    };
    return _this;
  };
  const base64EncodeOutputStream = function() {
    let _buffer = 0;
    let _buflen = 0;
    let _length = 0;
    let _base64 = "";
    const _this = {};
    const writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 63));
    };
    const encode = function(n) {
      if (n < 0) {
        throw "n:" + n;
      } else if (n < 26) {
        return 65 + n;
      } else if (n < 52) {
        return 97 + (n - 26);
      } else if (n < 62) {
        return 48 + (n - 52);
      } else if (n == 62) {
        return 43;
      } else if (n == 63) {
        return 47;
      } else {
        throw "n:" + n;
      }
    };
    _this.writeByte = function(n) {
      _buffer = _buffer << 8 | n & 255;
      _buflen += 8;
      _length += 1;
      while (_buflen >= 6) {
        writeEncoded(_buffer >>> _buflen - 6);
        _buflen -= 6;
      }
    };
    _this.flush = function() {
      if (_buflen > 0) {
        writeEncoded(_buffer << 6 - _buflen);
        _buffer = 0;
        _buflen = 0;
      }
      if (_length % 3 != 0) {
        const padlen = 3 - _length % 3;
        for (let i = 0; i < padlen; i += 1) {
          _base64 += "=";
        }
      }
    };
    _this.toString = function() {
      return _base64;
    };
    return _this;
  };
  const base64DecodeInputStream = function(str) {
    const _str = str;
    let _pos = 0;
    let _buffer = 0;
    let _buflen = 0;
    const _this = {};
    _this.read = function() {
      while (_buflen < 8) {
        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw "unexpected end of file./" + _buflen;
        }
        const c = _str.charAt(_pos);
        _pos += 1;
        if (c == "=") {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/)) {
          continue;
        }
        _buffer = _buffer << 6 | decode(c.charCodeAt(0));
        _buflen += 6;
      }
      const n = _buffer >>> _buflen - 8 & 255;
      _buflen -= 8;
      return n;
    };
    const decode = function(c) {
      if (65 <= c && c <= 90) {
        return c - 65;
      } else if (97 <= c && c <= 122) {
        return c - 97 + 26;
      } else if (48 <= c && c <= 57) {
        return c - 48 + 52;
      } else if (c == 43) {
        return 62;
      } else if (c == 47) {
        return 63;
      } else {
        throw "c:" + c;
      }
    };
    return _this;
  };
  const gifImage = function(width, height) {
    const _width = width;
    const _height = height;
    const _data = new Array(width * height);
    const _this = {};
    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };
    _this.write = function(out) {
      out.writeString("GIF87a");
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(128);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(255);
      out.writeByte(255);
      out.writeByte(255);
      out.writeString(",");
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);
      const lzwMinCodeSize = 2;
      const raster = getLZWRaster(lzwMinCodeSize);
      out.writeByte(lzwMinCodeSize);
      let offset = 0;
      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }
      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0);
      out.writeString(";");
    };
    const bitOutputStream = function(out) {
      const _out = out;
      let _bitLength = 0;
      let _bitBuffer = 0;
      const _this2 = {};
      _this2.write = function(data, length) {
        if (data >>> length != 0) {
          throw "length over";
        }
        while (_bitLength + length >= 8) {
          _out.writeByte(255 & (data << _bitLength | _bitBuffer));
          length -= 8 - _bitLength;
          data >>>= 8 - _bitLength;
          _bitBuffer = 0;
          _bitLength = 0;
        }
        _bitBuffer = data << _bitLength | _bitBuffer;
        _bitLength = _bitLength + length;
      };
      _this2.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };
      return _this2;
    };
    const getLZWRaster = function(lzwMinCodeSize) {
      const clearCode = 1 << lzwMinCodeSize;
      const endCode = (1 << lzwMinCodeSize) + 1;
      let bitLength = lzwMinCodeSize + 1;
      const table = lzwTable();
      for (let i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i));
      }
      table.add(String.fromCharCode(clearCode));
      table.add(String.fromCharCode(endCode));
      const byteOut = byteArrayOutputStream();
      const bitOut = bitOutputStream(byteOut);
      bitOut.write(clearCode, bitLength);
      let dataIndex = 0;
      let s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;
      while (dataIndex < _data.length) {
        const c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;
        if (table.contains(s + c)) {
          s = s + c;
        } else {
          bitOut.write(table.indexOf(s), bitLength);
          if (table.size() < 4095) {
            if (table.size() == 1 << bitLength) {
              bitLength += 1;
            }
            table.add(s + c);
          }
          s = c;
        }
      }
      bitOut.write(table.indexOf(s), bitLength);
      bitOut.write(endCode, bitLength);
      bitOut.flush();
      return byteOut.toByteArray();
    };
    const lzwTable = function() {
      const _map = {};
      let _size = 0;
      const _this2 = {};
      _this2.add = function(key) {
        if (_this2.contains(key)) {
          throw "dup key:" + key;
        }
        _map[key] = _size;
        _size += 1;
      };
      _this2.size = function() {
        return _size;
      };
      _this2.indexOf = function(key) {
        return _map[key];
      };
      _this2.contains = function(key) {
        return typeof _map[key] != "undefined";
      };
      return _this2;
    };
    return _this;
  };
  const createDataURL = function(width, height, getPixel) {
    const gif = gifImage(width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y));
      }
    }
    const b = byteArrayOutputStream();
    gif.write(b);
    const base64 = base64EncodeOutputStream();
    const bytes = b.toByteArray();
    for (let i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();
    return "data:image/gif;base64," + base64;
  };
  qrcode.stringToBytes;
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
  const PASSPORT = "https://passport.bilibili.com";
  async function postSigned(path, params) {
    const ts = String(Math.floor(Date.now() / 1e3));
    const body = signAppQuery({ ...params, local_id: "0", ts });
    const res = await fetch(PASSPORT + path, {
      method: "POST",
      credentials: "include",
      // 带 web 登录 cookie → SEC 视为可信会话
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("响应非 JSON（可能被风控拦截）");
    }
  }
  let root = null;
  let qrImg = null;
  let statusEl = null;
  let running = false;
  let pollTimer = null;
  function resetOverlayDom() {
    if (root) root.remove();
    root = qrImg = statusEl = null;
  }
  function closeOverlay() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    running = false;
    resetOverlayDom();
  }
  function openOverlay() {
    resetOverlayDom();
    root = document.createElement("div");
    const sr = root.attachShadow({ mode: "open" });
    sr.innerHTML = `<style>
    :host{ all:initial }
    .ov{ position:fixed; inset:0; z-index:2147483600; background:rgba(0,0,0,.55);
      display:flex; align-items:center; justify-content:center;
      font-family:-apple-system,"PingFang SC",sans-serif; -webkit-backdrop-filter:blur(2px); backdrop-filter:blur(2px); }
    .card{ width:300px; background:#1c1d22; color:#e3e5e7; border-radius:16px; padding:22px; text-align:center;
      box-shadow:0 16px 56px rgba(0,0,0,.5); }
    .title{ font-size:15px; font-weight:600; margin-bottom:4px } .title b{ color:#fb7299 }
    .hint{ font-size:12px; color:rgba(255,255,255,.45); margin-bottom:16px }
    .qr{ width:200px; height:200px; background:#fff; border-radius:10px; margin:0 auto; display:flex; align-items:center; justify-content:center; overflow:hidden }
    .qr img{ width:184px; height:184px; display:block }
    .status{ font-size:13px; color:rgba(255,255,255,.75); margin-top:16px; min-height:18px }
    .close{ margin-top:14px; cursor:pointer; color:rgba(255,255,255,.5); font-size:12px }
    .close:hover{ color:#fff }
    @media (prefers-color-scheme: light){
      .card{ background:#fff; color:#18191c; box-shadow:0 16px 56px rgba(0,0,0,.22) }
      .title b{ color:#d6336c } .hint{ color:rgba(0,0,0,.45) } .status{ color:rgba(0,0,0,.7) }
      .close{ color:rgba(0,0,0,.45) } .close:hover{ color:#000 }
    }
  </style>
  <div class="ov"><div class="card">
    <div class="title"><b>BiliKit</b> · 登录 App 推荐</div>
    <div class="hint">用手机哔哩哔哩 App 扫码</div>
    <div class="qr"><img alt=""></div>
    <div class="status">正在获取二维码…</div>
    <div class="close">取消</div>
  </div></div>`;
    qrImg = sr.querySelector("img");
    statusEl = sr.querySelector(".status");
    sr.querySelector(".close").addEventListener("click", closeOverlay);
    sr.querySelector(".ov").addEventListener("click", (e) => {
      if (e.target.classList.contains("ov")) closeOverlay();
    });
    document.body.appendChild(root);
  }
  function setStatus(t) {
    if (statusEl) statusEl.textContent = t;
  }
  function renderQR(url) {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    if (qrImg) qrImg.src = qr.createDataURL(6, 8);
    setStatus("等待扫码…");
  }
  function startTvLogin(onSuccess) {
    if (running || window.top !== window.self) return;
    running = true;
    openOverlay();
    (async () => {
      try {
        const auth = await postSigned("/x/passport-tv-login/qrcode/auth_code", {});
        if (!root) {
          running = false;
          return;
        }
        if (auth.code !== 0 || !auth.data) {
          setStatus(`获取二维码失败：${auth.code} ${auth.message || ""}`);
          running = false;
          return;
        }
        const { url, auth_code } = auth.data;
        renderQR(url);
        const started = Date.now();
        let polling = false;
        let failStreak = 0;
        pollTimer = setInterval(async () => {
          if (!root) {
            closeOverlay();
            return;
          }
          if (Date.now() - started > 18e4) {
            setStatus("二维码已过期，请重新登录");
            closeOverlay();
            return;
          }
          if (polling) return;
          polling = true;
          try {
            const poll = await postSigned("/x/passport-tv-login/qrcode/poll", { auth_code });
            failStreak = 0;
            if (poll.code === 0 && poll.data && poll.data.access_token) {
              const t = pollTimer;
              pollTimer = null;
              if (t) clearInterval(t);
              running = false;
              onSuccess(poll.data.access_token);
              setStatus("登录成功，即将刷新…");
              setTimeout(() => {
                resetOverlayDom();
                location.reload();
              }, 1e3);
            } else if (poll.code === 86038) {
              setStatus("二维码已失效，请重新登录");
              closeOverlay();
            } else if (poll.code === 86090) {
              setStatus("已扫码，请在手机上确认");
            } else if (poll.code === 86039) {
            } else {
              setStatus(`登录失败：${poll.code} ${poll.message || ""}`);
              closeOverlay();
            }
          } catch (_) {
            if (++failStreak >= 5) {
              setStatus("网络或风控异常，请稍后重试");
              closeOverlay();
            }
          } finally {
            polling = false;
          }
        }, 2e3);
      } catch (e) {
        setStatus("登录出错：" + e.message);
        running = false;
      }
    })();
  }
  const VERSION = "0.5.33";
  const DEFAULT_OPEN_MODE = "newtab";
  const NEW_TAB_HISTORY_FLATTEN_KEY = "feed.newTabHistoryFlatten";
  const DEFAULT_NEW_TAB_HISTORY_FLATTEN = false;
  const WAYBACK_STACK_KEY = "bilikit-wayback-stack";
  const NEW_TAB_TARGET_PREFIX = "bilikit-newtab-flatten-";
  const NEW_TAB_TOKEN = /^[0-9a-z-]{8,}$/i;
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
  function isHistoryFlattenTargetName(name) {
    if (!name.startsWith(NEW_TAB_TARGET_PREFIX)) return false;
    return NEW_TAB_TOKEN.test(name.slice(NEW_TAB_TARGET_PREFIX.length));
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
  function consumeHistoryFlattenTarget() {
    if (window.top !== window.self || !isHistoryFlattenTargetName(window.name)) return false;
    try {
      window.name = "";
    } catch {
    }
    return true;
  }
  const PANEL_ID = "bilikit-panel-root";
  const FEED_ID = "__feed__";
  const OPEN_ID = "__open__";
  const PREVIEW_ID = "__preview__";
  const ABOUT_ID = "__about__";
  const FEED_CAT = "推荐";
  const ABOUT_CAT = "关于";
  let selected = "";
  let navEl = null;
  let detailEl = null;
  let footEl = null;
  const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, "PingFang SC", sans-serif; }

.gear {
  position: fixed; right: 24px; bottom: 32px; z-index: 99990; /* 与 Feed 右下悬浮按钮同位对齐；低于抽屉遮罩(100000)：抽屉一开即被盖住 */
  width: 40px; height: 40px; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255,255,255,.1); background: rgba(22,23,28,.9); color: #fff;
  box-shadow: 0 3px 14px rgba(0,0,0,.3); opacity: .92;
  transition: opacity .18s ease, transform .16s ease, box-shadow .16s ease;
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
}
.gear:hover { opacity: 1; transform: translateY(-2px); box-shadow: 0 5px 16px rgba(0,0,0,.2); }
.gear:hover svg { transform: rotate(30deg); }
.gear:active { transform: scale(.94); }
.gear svg { width: 20px; height: 20px; display: block; transition: transform .16s ease; }
.gear.hidden { display: none; } /* Feed 在场时并入其 FAB，隐藏这颗独立齿轮 */

.overlay {
  position: fixed; inset: 0; z-index: 2147483501; background: rgba(0,0,0,.5);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; visibility: hidden; transition: opacity .2s ease, visibility 0s linear .2s;
  -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
}
.overlay.open { opacity: 1; visibility: visible; transition: opacity .2s ease; }

.card {
  width: min(660px, calc(100vw - 32px)); height: 560px; max-height: 90vh;
  display: flex; flex-direction: column;
  background: #1c1d22; color: #e3e5e7; border-radius: 18px;
  box-shadow: 0 16px 56px rgba(0,0,0,.5); overflow: hidden;
  transform: translateY(10px) scale(.98); transition: transform .2s ease;
}
.overlay.open .card { transform: none; }

.head { display: flex; align-items: baseline; gap: 10px; padding: 18px 22px 14px; border-bottom: 1px solid rgba(255,255,255,.06); flex: 0 0 auto; }
.head .title { font-size: 17px; font-weight: 600; letter-spacing: .2px; }
.head .brand { color: #fb7299; }
.head .close { margin-left: auto; cursor: pointer; width: 30px; height: 30px; border-radius: 50%; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: rgba(255,255,255,.7); font-size: 18px; line-height: 1; display: flex; align-items: center; justify-content: center; transition: color .16s ease, border-color .16s ease, transform .12s ease; }
.head .close:hover { color: #fb7299; border-color: #fb7299; }
.head .close:active { transform: scale(.92); }

.main { flex: 1; display: flex; min-height: 0; }
.nav { width: 228px; flex: 0 0 auto; border-right: 1px solid rgba(255,255,255,.06); overflow: auto; padding: 12px 10px; }
.nav-cat { font-size: 12px; letter-spacing: .3px; color: rgba(255,255,255,.35); padding: 12px 8px 5px; }
.nav-cat:first-child { padding-top: 4px; }
.nav-item { display: flex; align-items: center; gap: 8px; padding: 9px 9px; border-radius: 9px; cursor: pointer; }
.nav-item:hover { background: rgba(255,255,255,.05); }
.nav-item.sel { background: rgba(251,114,153,.16); }
.nm-wrap { flex: 1; min-width: 0; display: flex; align-items: center; gap: 5px; }
.nav-item .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; color: rgba(255,255,255,.85); }
.nav-item.sel .nm { color: #fb7299; font-weight: 500; }
.gear-ico { flex: 0 0 auto; width: 13px; height: 13px; color: rgba(255,255,255,.38); display: flex; }
.gear-ico svg { width: 13px; height: 13px; display: block; }
.nav-item:hover .gear-ico, .nav-item.sel .gear-ico { color: #fb7299; }

.detail { flex: 1; min-width: 0; overflow: auto; padding: 26px; display: flex; flex-direction: column; }
.detail-title { font-size: 19px; font-weight: 600; }
.detail-desc { font-size: 14px; color: rgba(255,255,255,.5); margin-top: 7px; line-height: 1.55; }
.fields { margin-top: 22px; display: flex; flex-direction: column; gap: 18px; }
.field { display: flex; flex-direction: column; gap: 8px; }
.field.row { flex-direction: row; align-items: center; justify-content: space-between; gap: 14px; }
.field.row .flabel { flex: 1; }
/* 开关行：标签+开关一行（space-between），hint 由 .field 的列布局落到下一行，避免三者挤成一排 */
.field .toggle-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.field .toggle-head .flabel { flex: 1; }
.field .flabel { font-size: 14px; color: rgba(255,255,255,.8); line-height: 1.4; }
.field .hint { font-size: 13px; color: rgba(255,255,255,.4); line-height: 1.45; }
.field input[type=text], .field textarea, .field select {
  width: 100%; background: rgba(255,255,255,.06); color: #e3e5e7;
  border: 1px solid rgba(255,255,255,.14); border-radius: 9px; padding: 9px 12px;
  font-size: 14px; font-family: inherit; outline: none;
}
.field input[type=text]:focus, .field textarea:focus, .field select:focus { border-color: #fb7299; }
.field textarea { min-height: 72px; resize: vertical; line-height: 1.5; }

.empty { margin: auto; text-align: center; color: rgba(255,255,255,.3); font-size: 14px; padding: 24px; }
.empty .ei { font-size: 30px; opacity: .5; margin-bottom: 8px; }
.empty .es { margin-top: 3px; font-size: 13px; }

.sw { position: relative; flex: 0 0 auto; width: 44px; height: 24px; }
.sw.sm { width: 34px; height: 19px; }
.sw input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; z-index: 1; }
.sw .track { position: absolute; inset: 0; border-radius: 24px; background: rgba(255,255,255,.16); transition: background .16s ease; }
.sw .track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .16s ease; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.sw.sm .track::after { width: 15px; height: 15px; }
.sw input:checked + .track { background: #fb7299; }
.sw input:checked + .track::after { transform: translateX(20px); }
.sw.sm input:checked + .track::after { transform: translateX(15px); }

/* 提示块：淡底圆角 + 图标，取代浮着的灰字。info 常规 / warn 品牌色调 */
.callout { display: flex; gap: 9px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,.055); font-size: 12.5px; line-height: 1.5; color: rgba(255,255,255,.62); }
.callout .ci { flex: 0 0 auto; margin-top: 1px; opacity: .85; }
.callout .ci svg { display: block; width: 14px; height: 14px; }
.callout a { color: #fb7299; text-decoration: none; font-weight: 500; }
.callout a:hover { text-decoration: underline; }
.callout.warn { background: rgba(251,114,153,.13); color: rgba(255,255,255,.82); }
.callout.warn .ci { color: #fb7299; opacity: 1; }
/* 状态徽章：带色点的 pill */
.status { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; padding: 5px 12px; border-radius: 20px; background: rgba(255,255,255,.07); color: rgba(255,255,255,.6); }
.status .dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,.35); flex: 0 0 auto; }
.status.on { background: rgba(251,114,153,.15); color: #fb7299; }
.status.on .dot { background: #fb7299; box-shadow: 0 0 0 3px rgba(251,114,153,.2); }
.feed-btn { align-self: flex-start; cursor: pointer; color: #fff; background: #fb7299; border: none; border-radius: 9px; padding: 9px 18px; font-size: 14px; font-family: inherit; font-weight: 500; }
.feed-btn.ghost { background: transparent; border: 1px solid rgba(255,255,255,.2); color: #e3e5e7; }
.feed-btn:hover { filter: brightness(1.08); }

.foot { padding: 12px 22px 15px; font-size: 12px; color: rgba(255,255,255,.4); display: flex; align-items: center; gap: 12px; border-top: 1px solid rgba(255,255,255,.06); flex: 0 0 auto; }
.foot .legend { margin-left: auto; display: flex; align-items: center; gap: 5px; }
.foot .legend .gear-ico { width: 12px; height: 12px; color: #fb7299; }
.foot .legend .gear-ico svg { width: 12px; height: 12px; }
.reload { display: none; cursor: pointer; color: #fff; background: #fb7299; border: none; border-radius: 9px; padding: 6px 14px; font-size: 12px; font-family: inherit; font-weight: 500; }
.foot.dirty .reload { display: inline-block; }
.foot.dirty .note { color: #fb7299; }

@media (prefers-color-scheme: light) {
  .gear { background: rgba(255,255,255,.95); color: #18191c; border-color: rgba(0,0,0,.08); box-shadow: 0 3px 14px rgba(0,0,0,.14); }
  .card { background: #fff; color: #18191c; box-shadow: 0 16px 56px rgba(0,0,0,.22); }
  .head { border-bottom-color: rgba(0,0,0,.07); }
  .head .brand { color: #d6336c; }
  .head .close { border-color: rgba(0,0,0,.12); background: rgba(0,0,0,.04); color: rgba(0,0,0,.55); }
  .head .close:hover { color: #d6336c; border-color: #d6336c; }
  .main .nav { border-right-color: rgba(0,0,0,.07); }
  .nav-cat { color: rgba(0,0,0,.4); }
  .nav-item:hover { background: rgba(0,0,0,.05); }
  .nav-item.sel { background: rgba(214,51,108,.12); }
  .nav-item .nm { color: rgba(0,0,0,.82); }
  .nav-item.sel .nm { color: #d6336c; }
  .nav-item:hover .gear-ico, .nav-item.sel .gear-ico, .foot .legend .gear-ico { color: #d6336c; }
  .detail-desc { color: rgba(0,0,0,.5); }
  .field .flabel { color: rgba(0,0,0,.75); }
  .field .hint { color: rgba(0,0,0,.42); }
  .field input[type=text], .field textarea, .field select { background: rgba(0,0,0,.04); color: #18191c; border-color: rgba(0,0,0,.14); }
  .field input[type=text]:focus, .field textarea:focus, .field select:focus { border-color: #d6336c; }
  .empty { color: rgba(0,0,0,.35); }
  .sw .track { background: rgba(0,0,0,.16); }
  .sw input:checked + .track { background: #d6336c; }
  .callout { background: rgba(0,0,0,.04); color: rgba(0,0,0,.6); }
  .callout.warn { background: rgba(214,51,108,.1); color: rgba(0,0,0,.75); }
  .callout.warn .ci { color: #d6336c; }
  .callout a { color: #d6336c; }
  .status { background: rgba(0,0,0,.05); color: rgba(0,0,0,.55); }
  .status .dot { background: rgba(0,0,0,.3); }
  .status.on { background: rgba(214,51,108,.12); color: #d6336c; }
  .status.on .dot { background: #d6336c; box-shadow: 0 0 0 3px rgba(214,51,108,.18); }
  .feed-btn { background: #d6336c; }
  .feed-btn.ghost { border-color: rgba(0,0,0,.2); color: #18191c; }
  .foot { color: rgba(0,0,0,.45); border-top-color: rgba(0,0,0,.07); }
  .reload { background: #d6336c; }
  .foot.dirty .note { color: #d6336c; }
}
`;
  const GEAR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const INFO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  const WARN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  function callout(html, variant = "info") {
    const c = el("div", "callout" + (variant === "warn" ? " warn" : ""));
    c.innerHTML = `<span class="ci">${variant === "warn" ? WARN_SVG : INFO_SVG}</span><span class="ctext">${html}</span>`;
    return c;
  }
  function markDirty() {
    if (footEl) footEl.classList.add("dirty");
  }
  function switchEl(checked, onChange, small = false) {
    const sw = el("span", "sw" + (small ? " sm" : ""));
    const inp = document.createElement("input");
    inp.type = "checkbox";
    inp.checked = checked;
    const track = el("span", "track");
    inp.addEventListener("change", () => onChange(inp.checked));
    sw.append(inp, track);
    return sw;
  }
  function renderField(m, f) {
    const wrap = el("div");
    const cur = getField(m, f.key);
    if (f.type === "toggle") {
      wrap.className = "field";
      const head = el("div", "toggle-head");
      const lab = el("span", "flabel", f.label);
      const sw = switchEl(!!cur, (on) => {
        setField(m.id, f.key, on);
        markDirty();
      });
      head.append(lab, sw);
      wrap.append(head);
    } else if (f.type === "select") {
      wrap.className = "field";
      wrap.appendChild(el("span", "flabel", f.label));
      const sel = document.createElement("select");
      const presets = f.options.map((o) => o.value);
      for (const o of f.options) {
        const opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
        sel.appendChild(opt);
      }
      const CUSTOM = "__custom__";
      let input = null;
      if (f.allowCustom) {
        const opt = document.createElement("option");
        opt.value = CUSTOM;
        opt.textContent = "自定义…";
        sel.appendChild(opt);
        input = document.createElement("input");
        input.type = "text";
        if (f.customPlaceholder) input.placeholder = f.customPlaceholder;
        input.addEventListener("input", () => {
          setField(m.id, f.key, input.value);
          markDirty();
        });
      }
      const isPreset = presets.includes(cur);
      if (f.allowCustom && !isPreset && cur) {
        sel.value = CUSTOM;
        input.value = String(cur);
        input.style.display = "";
      } else {
        const useDefault = !isPreset;
        sel.value = useDefault ? f.default : String(cur);
        if (useDefault && String(cur) !== f.default) setField(m.id, f.key, f.default);
        if (input) input.style.display = "none";
      }
      sel.addEventListener("change", () => {
        if (sel.value === CUSTOM && input) {
          input.style.display = "";
          setField(m.id, f.key, input.value);
          input.focus();
        } else {
          if (input) input.style.display = "none";
          setField(m.id, f.key, sel.value);
        }
        markDirty();
      });
      wrap.appendChild(sel);
      if (input) wrap.appendChild(input);
    } else if (f.type === "textarea") {
      wrap.className = "field";
      wrap.appendChild(el("span", "flabel", f.label));
      const ta = document.createElement("textarea");
      ta.value = String(cur ?? "");
      if (f.placeholder) ta.placeholder = f.placeholder;
      ta.addEventListener("change", () => {
        setField(m.id, f.key, ta.value);
        markDirty();
      });
      wrap.appendChild(ta);
    } else {
      wrap.className = "field";
      wrap.appendChild(el("span", "flabel", f.label));
      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = String(cur ?? "");
      if (f.placeholder) inp.placeholder = f.placeholder;
      inp.addEventListener("change", () => {
        setField(m.id, f.key, inp.value);
        markDirty();
      });
      wrap.appendChild(inp);
    }
    if (f.hint) wrap.appendChild(el("div", "hint", f.hint));
    return wrap;
  }
  function emptyState(main, sub) {
    const e = el("div", "empty");
    e.appendChild(el("div", "ei", "◔"));
    e.appendChild(el("div", null, main));
    if (sub) e.appendChild(el("div", "es", sub));
    return e;
  }
  function navItemModule(m) {
    const row = el("div", "nav-item" + (selected === m.id ? " sel" : ""));
    const wrap = el("div", "nm-wrap");
    wrap.appendChild(el("span", "nm", m.name));
    if (m.settings && m.settings.length) {
      const g = el("span", "gear-ico");
      g.innerHTML = GEAR_SVG;
      wrap.appendChild(g);
    }
    row.appendChild(wrap);
    const sw = switchEl(isModuleEnabled(m), (on) => {
      setModuleEnabled(m.id, on);
      markDirty();
    }, true);
    sw.addEventListener("click", (e) => e.stopPropagation());
    row.appendChild(sw);
    row.addEventListener("click", () => select(m.id));
    return row;
  }
  function navItemSpecial(id, name) {
    const row = el("div", "nav-item" + (selected === id ? " sel" : ""));
    const wrap = el("div", "nm-wrap");
    wrap.appendChild(el("span", "nm", name));
    const g = el("span", "gear-ico");
    g.innerHTML = GEAR_SVG;
    wrap.appendChild(g);
    row.appendChild(wrap);
    row.addEventListener("click", () => select(id));
    return row;
  }
  function renderNav() {
    if (!navEl) return;
    navEl.textContent = "";
    const cats = [];
    const byCat = /* @__PURE__ */ new Map();
    for (const m of getModules()) {
      const c = m.category || "其它";
      if (!byCat.has(c)) {
        byCat.set(c, []);
        cats.push(c);
      }
      byCat.get(c).push(m);
    }
    if (!cats.includes(FEED_CAT)) cats.push(FEED_CAT);
    for (const c of cats) {
      navEl.appendChild(el("div", "nav-cat", c));
      for (const m of byCat.get(c) || []) navEl.appendChild(navItemModule(m));
      if (c === "播放") navEl.appendChild(navItemSpecial(OPEN_ID, "打开方式"));
      if (c === FEED_CAT) {
        navEl.appendChild(navItemSpecial(FEED_ID, "App 推荐 Feed"));
        navEl.appendChild(navItemSpecial(PREVIEW_ID, "封面预览"));
      }
    }
    navEl.appendChild(el("div", "nav-cat", ABOUT_CAT));
    navEl.appendChild(navItemSpecial(ABOUT_ID, "关于 BiliKit"));
  }
  function renderFeedDetail(d) {
    const loggedIn = !!get("feed.accessKey", "");
    d.appendChild(el("div", "detail-title", "App 推荐 Feed"));
    d.appendChild(el("div", "detail-desc", "首页换成手机 App 的推荐流（需另装 BiliKit Feed 脚本）"));
    const onHome = location.pathname === "/" || location.pathname === "/index.html";
    const feedAlive = Number(localStorage.getItem("bilikit:alive.feed") || 0);
    if (onHome && Date.now() - feedAlive > 8e3) {
      d.appendChild(callout('未检测到 <b>BiliKit Feed</b>，首页推荐流需要它。<a href="https://github.com/shiinayane/BiliKit" target="_blank" rel="noopener">前往安装</a>', "warn"));
    }
    const fields = el("div", "fields");
    const row = el("div", "field row");
    row.appendChild(el("span", "flabel", "登录状态"));
    const st = el("span", "status" + (loggedIn ? " on" : ""));
    const setStatus2 = (t) => {
      st.innerHTML = `<span class="dot"></span>${t}`;
    };
    setStatus2(loggedIn ? "已登录 · 个性化推荐" : "未登录 · 匿名（内容有限）");
    row.appendChild(st);
    fields.appendChild(row);
    const btn = el("button", "feed-btn" + (loggedIn ? " ghost" : ""), loggedIn ? "退出登录" : "扫码登录（TV）");
    btn.addEventListener("click", () => {
      if (loggedIn) {
        set("feed.accessKey", "");
        location.reload();
      } else {
        setStatus2("正在拉起二维码…");
        startTvLogin((accessKey) => {
          if (!set("feed.accessKey", accessKey)) console.error("[BiliKit] access_key 持久化失败：刷新后可能仍为匿名（浏览器隐私模式或存储已满）。");
        });
      }
    });
    fields.appendChild(btn);
    fields.appendChild(callout(loggedIn ? "退出后回到匿名推荐并刷新。" : "用手机哔哩哔哩扫码，获得个性化、不重复的 App 推荐。"));
    d.appendChild(fields);
  }
  function renderOpenDetail(d) {
    d.appendChild(el("div", "detail-title", "打开方式"));
    d.appendChild(el("div", "detail-desc", "全站（首页 / 搜索 / 收藏 / 历史 / 空间…）点视频时如何打开"));
    const fields = el("div", "fields");
    const modeRow = el("div", "field");
    modeRow.appendChild(el("span", "flabel", "视频打开方式"));
    const modeSel = document.createElement("select");
    for (const [val, label] of [["drawer", "抽屉"], ["drawer-web", "抽屉 · 网页全屏"], ["newtab", "新标签页"], ["current", "当前页"]]) {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = label;
      modeSel.appendChild(o);
    }
    modeSel.value = get("feed.openMode", DEFAULT_OPEN_MODE);
    modeRow.appendChild(modeSel);
    fields.appendChild(modeRow);
    const immRow = el("div", "field");
    const immHead = el("div", "toggle-head");
    immHead.append(el("span", "flabel", "隐藏切换过程"), switchEl(get("feed.drawerImmersive", true), (on) => set("feed.drawerImmersive", on)));
    immRow.append(immHead, el("div", "hint", "开：等播放器铺满后再显示，看不到从普通页切到全屏的过程（加载稍久一点）。关：先显示、再当场铺满，会瞥见这下切换。"));
    fields.appendChild(immRow);
    const flattenRow = el("div", "field");
    const flattenHead = el("div", "toggle-head");
    flattenHead.append(
      el("span", "flabel", "Safari 左滑回到来源页"),
      switchEl(
        get(NEW_TAB_HISTORY_FLATTEN_KEY, DEFAULT_NEW_TAB_HISTORY_FLATTEN),
        (on) => set(NEW_TAB_HISTORY_FLATTEN_KEY, on)
      )
    );
    const safari = isSafariUserAgent(navigator.userAgent, navigator.vendor);
    flattenRow.append(
      flattenHead,
      el("div", "hint", safari ? "实验性：保留来源关系并把子标签里的跨视频 SPA 历史压成一层，让 Safari 两指左滑关闭视频标签并回到来源页。分 P、整页跳转仍保留原生历史。" : "仅 Safari 生效；Chrome、Edge、Firefox不会改变历史。实验性开关默认关闭。")
    );
    fields.appendChild(flattenRow);
    const syncModeRows = () => {
      immRow.style.display = modeSel.value === "drawer-web" ? "" : "none";
      flattenRow.style.display = modeSel.value === "newtab" ? "" : "none";
    };
    syncModeRows();
    modeSel.addEventListener("change", () => {
      set("feed.openMode", modeSel.value);
      syncModeRows();
    });
    fields.appendChild(callout("作用于「浏览 / 列表」页（首页 / 搜索 / 收藏 / 历史 / 空间 / 动态…）点视频。<br><b>新标签页（默认）</b>：首页原样保留，关掉视频标签即可完整结束这一播放上下文。<br><b>当前页</b>：顶层导航最利于回收；返回后恢复 Feed 卡片、游标和滚动位置。<br><b>抽屉</b>：不离开列表、切换最快，但会常驻最后一个完整视频文档。<br><b>视频播放页内</b>点相关视频走原生跳转，配合左下角「回程」胶囊一键跳回。"));
    d.appendChild(fields);
  }
  function renderPreviewDetail(d) {
    d.appendChild(el("div", "detail-title", "封面预览"));
    d.appendChild(el("div", "detail-desc", "鼠标悬停封面时的预览方式"));
    const fields = el("div", "fields");
    const row = el("div", "field");
    row.appendChild(el("span", "flabel", "预览方式"));
    const sel = document.createElement("select");
    for (const [val, label] of [["video", "真视频"], ["sprite", "雪碧图"], ["off", "关闭"]]) {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = label;
      sel.appendChild(o);
    }
    sel.value = get("feed.previewMode", "video");
    sel.addEventListener("change", () => {
      set("feed.previewMode", sel.value);
      markDirty();
    });
    row.appendChild(sel);
    fields.appendChild(row);
    fields.appendChild(callout("<b>真视频</b>：悬停即拉低清视频、静音自动播，最接近手机 App 的秒开（比雪碧图费流量）。<br><b>雪碧图</b>：只拉缩略帧轮播，省流量、更轻。<br><b>关闭</b>：悬停不预览。"));
    d.appendChild(fields);
  }
  function renderAboutDetail(d) {
    d.appendChild(el("div", "detail-title", "关于 BiliKit"));
    d.appendChild(el("div", "detail-desc", "B 站体验增强套件 · Safari 友好、无需扩展、零外部依赖 · 作者 shiinayane · MIT"));
    const fields = el("div", "fields");
    const vrow = el("div", "field row");
    vrow.appendChild(el("span", "flabel", "版本"));
    const pill = el("span", "status on");
    pill.innerHTML = `<span class="dot"></span>Core v${VERSION}`;
    vrow.appendChild(pill);
    fields.appendChild(vrow);
    const feedAlive = Date.now() - Number(localStorage.getItem("bilikit:alive.feed") || 0) < 15e3;
    const feedVer = localStorage.getItem("bilikit:feed.version") || "";
    const frow = el("div", "field row");
    frow.appendChild(el("span", "flabel", "Feed"));
    const fpill = el("span", "status" + (feedAlive && feedVer ? " on" : ""));
    fpill.innerHTML = `<span class="dot"></span>${feedAlive && feedVer ? `Feed v${feedVer}` : "未安装"}`;
    frow.appendChild(fpill);
    fields.appendChild(frow);
    fields.appendChild(callout(
      '<a href="https://github.com/shiinayane/BiliKit" target="_blank" rel="noopener">GitHub 仓库</a> · <a href="https://github.com/shiinayane/BiliKit/issues" target="_blank" rel="noopener">反馈 / 报 Bug</a> · <a href="https://greasyfork.org/zh-CN/scripts/585248-bilikit-core" target="_blank" rel="noopener">GreasyFork 主页</a>'
    ));
    fields.appendChild(callout("<b>开发期 · 快速迭代中</b>：功能可能随时调整，偶有不稳定属正常；B 站接口一变也可能短暂失效。欢迎提 Issue 或建议。", "warn"));
    d.appendChild(fields);
  }
  function renderDetail() {
    if (!detailEl) return;
    detailEl.textContent = "";
    if (selected === FEED_ID) {
      renderFeedDetail(detailEl);
      return;
    }
    if (selected === OPEN_ID) {
      renderOpenDetail(detailEl);
      return;
    }
    if (selected === PREVIEW_ID) {
      renderPreviewDetail(detailEl);
      return;
    }
    if (selected === ABOUT_ID) {
      renderAboutDetail(detailEl);
      return;
    }
    const m = getModules().find((x) => x.id === selected);
    if (!m) {
      detailEl.appendChild(emptyState("选择左侧一项"));
      return;
    }
    detailEl.appendChild(el("div", "detail-title", m.name));
    if (m.description) detailEl.appendChild(el("div", "detail-desc", m.description));
    const hasSettings = !!(m.settings && m.settings.length);
    if (hasSettings || m.note) {
      const fields = el("div", "fields");
      if (m.note) fields.appendChild(callout(m.note));
      if (m.settings) for (const f of m.settings) fields.appendChild(renderField(m, f));
      detailEl.appendChild(fields);
    } else {
      detailEl.appendChild(emptyState("此模块无额外配置", "开关在左侧列表"));
    }
  }
  function firstNavId() {
    const ms = getModules();
    return ms.length ? ms[0].id : FEED_ID;
  }
  function select(id) {
    selected = id;
    renderNav();
    renderDetail();
  }
  function mountPanel() {
    if (window.top !== window.self) return;
    const home = (location.hostname === "www.bilibili.com" || location.hostname === "bilibili.com") && (location.pathname === "/" || location.pathname === "/index.html");
    if (!home) return;
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", mountPanel, { once: true });
      return;
    }
    if (document.getElementById(PANEL_ID)) return;
    const root2 = el("div");
    root2.id = PANEL_ID;
    const sr = root2.attachShadow({ mode: "open" });
    sr.innerHTML = `<style>${STYLE}</style>`;
    const gear = el("div", "gear");
    gear.title = "BiliKit 设置";
    gear.innerHTML = GEAR_SVG;
    const overlay = el("div", "overlay");
    const card = el("div", "card");
    const head = el("div", "head");
    head.innerHTML = `<span class="title"><span class="brand">BiliKit</span> 设置</span>`;
    const close = el("span", "close", "×");
    head.appendChild(close);
    const main = el("div", "main");
    navEl = el("div", "nav");
    detailEl = el("div", "detail");
    main.append(navEl, detailEl);
    footEl = el("div", "foot");
    const note = el("span", "note", "改动需刷新页面生效");
    const reload = el("button", "reload", "刷新");
    reload.addEventListener("click", () => location.reload());
    const legend = el("div", "legend");
    const lg = el("span", "gear-ico");
    lg.innerHTML = GEAR_SVG;
    legend.append(lg, el("span", null, "有可调项"));
    footEl.append(note, reload, legend);
    card.append(head, main, footEl);
    overlay.appendChild(card);
    const open = () => {
      if (!selected || selected !== FEED_ID && selected !== OPEN_ID && selected !== PREVIEW_ID && selected !== ABOUT_ID && !getModules().some((m) => m.id === selected)) selected = firstNavId();
      renderNav();
      renderDetail();
      overlay.classList.add("open");
    };
    const closePanel = () => overlay.classList.remove("open");
    gear.addEventListener("click", open);
    close.addEventListener("click", closePanel);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePanel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });
    sr.append(gear, overlay);
    document.body.appendChild(root2);
    const FAB_GEAR = GEAR_SVG.replace("<svg ", '<svg width="20" height="20" ');
    const syncFab = () => {
      const fab = document.querySelector(".bk-feed-fab");
      if (fab) {
        if (!fab.querySelector(".bk-settings")) {
          const b = document.createElement("button");
          b.className = "bk-settings";
          b.title = "BiliKit 设置";
          b.setAttribute("aria-label", "BiliKit 设置");
          b.innerHTML = FAB_GEAR;
          b.addEventListener("click", open);
          fab.insertBefore(b, fab.querySelector(".bk-refresh"));
        }
        gear.classList.add("hidden");
      } else {
        gear.classList.remove("hidden");
      }
    };
    syncFab();
    try {
      new MutationObserver(syncFab).observe(document.body, { childList: true });
    } catch {
    }
  }
  const UPOS_RE = /^(?:https?:)?\/\/[^/]*\.(?:bilivideo\.com|acgvideo\.(?:com|cn))\//;
  const isUpos = (u) => typeof u === "string" && UPOS_RE.test(u);
  const CDN_SUFFIXES = ["bilivideo.com", "acgvideo.com", "acgvideo.cn"];
  const HOST_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  function normalizeCdnHost(value) {
    if (typeof value !== "string") return null;
    const host = value.trim().toLowerCase();
    if (!host || host.length > 253) return null;
    const suffix = CDN_SUFFIXES.find((s) => host.endsWith(`.${s}`));
    if (!suffix) return null;
    const prefix = host.slice(0, -(suffix.length + 1));
    if (!prefix || !prefix.split(".").every((label) => HOST_LABEL_RE.test(label))) return null;
    return host;
  }
  function swapHost(u, host) {
    const safeHost = normalizeCdnHost(host);
    return safeHost ? u.replace(/^(?:https?:)?\/\/[^/]+\//, `https://${safeHost}/`) : u;
  }
  function fixEntry(e, targetHost, backupHosts) {
    if (!e || typeof e !== "object") return false;
    const safeTarget = normalizeCdnHost(targetHost);
    if (!safeTarget) return false;
    const safeBackups = backupHosts.map(normalizeCdnHost).filter((h) => !!h);
    const cands = [];
    for (const k of ["baseUrl", "base_url", "url"]) if (typeof e[k] === "string") cands.push(e[k]);
    for (const k of ["backupUrl", "backup_url"]) if (Array.isArray(e[k])) cands.push(...e[k].filter((x) => typeof x === "string"));
    const upos = cands.find(isUpos);
    if (!upos) return false;
    const primary = swapHost(upos, safeTarget);
    const backups = safeBackups.map((h) => swapHost(upos, h));
    for (const k of ["baseUrl", "base_url", "url"]) if (typeof e[k] === "string") e[k] = primary;
    if (Array.isArray(e.backupUrl)) e.backupUrl = [primary, ...backups];
    if (Array.isArray(e.backup_url)) e.backup_url = [primary, ...backups];
    return true;
  }
  function rewritePlayurl(root2, targetHost, backupHosts) {
    if (!root2 || typeof root2 !== "object") return false;
    if (root2.code !== void 0 && root2.code !== 0) return false;
    const d = root2.data || root2.result || root2;
    if (!d || typeof d !== "object") return false;
    let hit = false;
    const dash = d.dash;
    if (dash) {
      for (const list of [dash.video, dash.audio, dash.dolby && dash.dolby.audio]) {
        if (Array.isArray(list)) list.forEach((e) => {
          if (fixEntry(e, targetHost, backupHosts)) hit = true;
        });
      }
      if (dash.flac && dash.flac.audio && fixEntry(dash.flac.audio, targetHost, backupHosts)) hit = true;
    }
    if (Array.isArray(d.durl)) d.durl.forEach((e) => {
      if (fixEntry(e, targetHost, backupHosts)) hit = true;
    });
    return hit;
  }
  function init$5(cfg) {
    if (window.__BILIKIT_CDN_PICK__) return;
    window.__BILIKIT_CDN_PICK__ = true;
    const configuredHost = cfg.get("targetHost");
    const TARGET_HOST = configuredHost ? normalizeCdnHost(configuredHost) : null;
    const BACKUP_HOSTS = ["upos-sz-upcdnbda2.bilivideo.com", "upos-sz-mirrorhw.bilivideo.com"];
    const log = (...a) => {
    };
    if (!TARGET_HOST) {
      if (configuredHost) console.warn("[BiliKit] CDN 优选已禁用：自定义节点必须是 bilivideo/acgvideo 受信后缀下的纯主机名。");
      return;
    }
    const rewritePlayurl$1 = (root2) => rewritePlayurl(root2, TARGET_HOST, BACKUP_HOSTS);
    const PLAYURL_PATHS = [
      "/x/player/wbi/playurl",
      "/x/player/playurl",
      "/pgc/player/web/playurl",
      "/pgc/player/web/v2/playurl",
      "/pgc/player/api/playurl",
      "/pugv/player/web/playurl"
    ];
    const isPlayurl = (u) => typeof u === "string" && PLAYURL_PATHS.some((p) => u.includes(p));
    let playinfo;
    try {
      Object.defineProperty(window, "__playinfo__", {
        configurable: true,
        get: () => playinfo,
        set: (v) => {
          try {
            if (rewritePlayurl$1(v)) log("__playinfo__ 改写", TARGET_HOST);
          } catch (_) {
          }
          playinfo = v;
        }
      });
    } catch (_) {
    }
    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = async function(input, _init) {
        const url = typeof input === "string" ? input : input && input.url || String(input || "");
        const resp = await origFetch.apply(this, arguments);
        if (!isPlayurl(url)) return resp;
        try {
          const text = await resp.clone().text();
          const obj = JSON.parse(text);
          if (rewritePlayurl$1(obj)) {
            log("fetch playurl 改写", TARGET_HOST);
            const headers = new Headers(resp.headers);
            headers.delete("content-length");
            headers.delete("content-encoding");
            return new Response(JSON.stringify(obj), { status: resp.status, statusText: resp.statusText, headers });
          }
        } catch (_) {
        }
        return resp;
      };
    }
    const OX = window.XMLHttpRequest;
    if (OX) {
      class X extends OX {
        open(method, url) {
          this.__cdnUrl = url;
          return super.open.apply(this, arguments);
        }
        get responseText() {
          const rt = this.responseType;
          if (rt !== "" && rt !== "text") return super.responseText;
          return this.__cdnText(super.responseText);
        }
        get response() {
          const r = super.response;
          if (this.readyState !== 4 || !isPlayurl(this.__cdnUrl)) return r;
          if (typeof r === "string") return this.__cdnText(r);
          if (r && typeof r === "object") {
            try {
              if (rewritePlayurl$1(r)) log("xhr(json) playurl 改写", TARGET_HOST);
            } catch (_) {
            }
          }
          return r;
        }
        __cdnText(raw) {
          if (this.readyState !== 4 || typeof raw !== "string" || !isPlayurl(this.__cdnUrl)) return raw;
          try {
            const obj = JSON.parse(raw);
            if (rewritePlayurl$1(obj)) {
              log("xhr playurl 改写", TARGET_HOST);
              return JSON.stringify(obj);
            }
          } catch (_) {
          }
          return raw;
        }
      }
      window.XMLHttpRequest = X;
    }
  }
  const cdnPick = {
    id: "cdn-pick",
    name: "CDN 优选",
    description: "视频分片重定向到更快的大陆镜像",
    category: "播放",
    runAt: "start",
    settings: [
      {
        key: "targetHost",
        type: "select",
        label: "CDN 镜像节点",
        default: "upos-sz-mirrorhwb.bilivideo.com",
        options: [
          { label: "华为 hwb（日本实测首选）", value: "upos-sz-mirrorhwb.bilivideo.com" },
          { label: "百度 bda2（地板最高）", value: "upos-sz-upcdnbda2.bilivideo.com" },
          { label: "华为 hw", value: "upos-sz-mirrorhw.bilivideo.com" },
          { label: "阿里 alib", value: "upos-sz-mirroralib.bilivideo.com" },
          { label: "阿里 ali", value: "upos-sz-mirrorali.bilivideo.com" },
          { label: "腾讯 cos", value: "upos-sz-mirrorcos.bilivideo.com" },
          { label: "腾讯 cosb", value: "upos-sz-mirrorcosb.bilivideo.com" },
          { label: "网宿 ws", value: "upos-sz-upcdnws.bilivideo.com" },
          { label: "关闭（用 B 站默认分配）", value: "" }
        ],
        allowCustom: true,
        customPlaceholder: "upos-sz-mirrorXXX.bilivideo.com",
        hint: "把视频分片钉到该大陆镜像，绕开慢节点；选「自定义…」可手填镜像主机（须 upos 系 .bilivideo.com，否则会 403）"
      }
    ],
    init: init$5
  };
  function rootBootstrapBackground(dark, readyState) {
    return dark && readyState === "loading" ? "#18191c" : "";
  }
  function init$4(cfg) {
    if (window.top !== window.self && !location.hash.includes("bk-drawer")) return;
    if (window.__BILIKIT_THEME_SYNC__) return;
    window.__BILIKIT_THEME_SYNC__ = true;
    const COOKIE_NAME = "theme_style";
    const COOKIE_DOMAIN = ".bilibili.com";
    const THEME_LINK_RE = /\/bili-theme\/(light|dark)\.css/;
    const mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const systemDark = () => !!(mql && mql.matches);
    const wantDark = () => {
      const mode = cfg.get("mode") || "auto";
      if (mode === "dark") return true;
      if (mode === "light") return false;
      return systemDark();
    };
    function readCookie2(name) {
      const m = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
      return m ? m[1] : null;
    }
    function setCookie(name, value) {
      if (readCookie2(name) === value) return;
      document.cookie = `${name}=${value}; path=/; domain=${COOKIE_DOMAIN}; max-age=31536000; SameSite=Lax`;
    }
    function swapThemeStylesheet(doc, dark) {
      const want = dark ? "/dark.css" : "/light.css";
      for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
        if (!THEME_LINK_RE.test(link.href)) continue;
        if (!link.href.includes(want)) link.href = link.href.replace(/\/(light|dark)\.css/, want);
      }
    }
    function syncComponentTheme(dark) {
      const want = dark ? "dark" : "light";
      for (const el2 of document.querySelectorAll("bili-comments")) {
        try {
          if (el2.theme !== want) el2.theme = want;
        } catch (_) {
        }
      }
    }
    function apply() {
      const dark = wantDark();
      setCookie(COOKIE_NAME, dark ? "dark" : "light");
      swapThemeStylesheet(document, dark);
      const root2 = document.documentElement;
      root2.classList.toggle("bili_dark", dark);
      root2.classList.toggle("night-mode", dark);
      root2.style.backgroundColor = rootBootstrapBackground(dark, document.readyState);
      syncComponentTheme(dark);
    }
    apply();
    document.addEventListener("DOMContentLoaded", apply);
    if (mql) {
      if (typeof mql.addEventListener === "function") mql.addEventListener("change", apply);
      else if (typeof mql.addListener === "function") mql.addListener(apply);
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") apply();
    });
    window.addEventListener(SETTINGS_EVENT, apply);
    window.addEventListener("storage", (e) => {
      if (!e.key || e.key === "bilikit:settings") apply();
    });
    let syncPending = 0;
    const scheduleComponentSync = () => {
      if (syncPending) return;
      syncPending = requestAnimationFrame(() => {
        syncPending = 0;
        syncComponentTheme(wantDark());
      });
    };
    function watchComments() {
      const app = document.querySelector("#commentapp");
      if (app) {
        new MutationObserver(scheduleComponentSync).observe(app, { childList: true, subtree: true });
        return;
      }
      let tries = 0;
      const t = setInterval(() => {
        const a = document.querySelector("#commentapp");
        if (a) {
          clearInterval(t);
          new MutationObserver(scheduleComponentSync).observe(a, { childList: true, subtree: true });
        } else if (++tries > 40) clearInterval(t);
      }, 500);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchComments);
    else watchComments();
  }
  const themeSync = {
    id: "theme-sync",
    name: "主题同步",
    description: "跟随系统深浅色，全站无刷新实时切换",
    category: "界面",
    runAt: "start",
    settings: [
      {
        key: "mode",
        type: "select",
        label: "主题模式",
        default: "auto",
        options: [
          { label: "跟随系统", value: "auto" },
          { label: "始终深色", value: "dark" },
          { label: "始终浅色", value: "light" }
        ],
        hint: "跟随系统深浅，或强制固定一种"
      }
    ],
    init: init$4
  };
  const PROFILE_ICON_BASE = "https://i0.hdslb.com/bfs/seed/jinkela/short/webui/user-profile/img/";
  function normalizeCommentSex(value) {
    return value === "男" || value === "女" ? value : null;
  }
  function commentSexIconUrl(sex) {
    return `${PROFILE_ICON_BASE}gender_${sex === "男" ? "male" : "female"}.png@.avif`;
  }
  function init$3(cfg) {
    if (window.__BILIKIT_COMMENT_LOC__) return;
    window.__BILIKIT_COMMENT_LOC__ = true;
    const PIN = cfg.get("pin") || "";
    const SHOW_SEX = cfg.get("showSex") !== false;
    function resolveLocation(el2) {
      let n = el2, hop = 0;
      while (n && hop++ < 8) {
        for (const key of ["data", "reply", "_data"]) {
          const d = n[key];
          const loc = d && d.reply_control && d.reply_control.location;
          if (typeof loc === "string" && loc) return loc;
        }
        const root2 = n.getRootNode ? n.getRootNode() : null;
        n = root2 instanceof ShadowRoot ? root2.host : n.parentElement;
      }
      return null;
    }
    const format = (loc) => loc.replace(/^\s*IP属地[:：]\s*/, "");
    let observers = [];
    const observed = /* @__PURE__ */ new WeakSet();
    function observeRoot(sr) {
      if (observed.has(sr)) return;
      observed.add(sr);
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type !== "childList") continue;
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && !n.isContentEditable) {
              schedule();
              return;
            }
          }
        }
      });
      mo.observe(sr, { childList: true, subtree: true });
      observers.push(mo);
    }
    function process(el2) {
      if (el2.localName === "bili-comment-user-info") injectSex(el2);
      else if (el2.localName === "bili-comment-action-buttons-renderer") injectLocation(el2);
    }
    function walk(root2) {
      process(root2);
      let nodes;
      try {
        nodes = root2.querySelectorAll("*");
      } catch (_) {
        return;
      }
      for (const n of nodes) {
        process(n);
        const sr = n.shadowRoot;
        if (sr) {
          observeRoot(sr);
          walk(sr);
        }
      }
    }
    function injectSex(userInfo) {
      var _a, _b;
      if (!SHOW_SEX) return false;
      const sr = userInfo.shadowRoot;
      if (!sr || sr.querySelector(".bilikit-sex")) return false;
      const userName = sr.querySelector("#user-name");
      const sex = normalizeCommentSex((_b = (_a = userInfo.data) == null ? void 0 : _a.member) == null ? void 0 : _b.sex);
      if (!userName || !sex) return false;
      const icon = document.createElement("img");
      icon.className = "bilikit-sex";
      icon.src = commentSexIconUrl(sex);
      icon.width = 16;
      icon.height = 16;
      icon.alt = "";
      icon.decoding = "async";
      icon.draggable = false;
      icon.title = sex;
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", sex);
      icon.style.cssText = "display:block;flex:0 0 16px;width:16px;height:16px;margin-left:6px;object-fit:contain;vertical-align:middle;";
      userName.after(icon);
      return true;
    }
    let nativeGap = "";
    function blockGap(sr) {
      if (!nativeGap) {
        const sib = sr.querySelector("#like") || sr.querySelector("#reply") || sr.querySelector("#dislike");
        const m = sib ? getComputedStyle(sib).marginLeft : "";
        if (m && m !== "0px") nativeGap = m;
      }
      return nativeGap || "16px";
    }
    function injectLocation(ab) {
      const sr = ab.shadowRoot;
      if (!sr || sr.querySelector(".bilikit-loc")) return false;
      const pubdate = sr.querySelector("#pubdate");
      if (!pubdate) return false;
      const loc = resolveLocation(ab);
      if (!loc) {
        return false;
      }
      const span = document.createElement("span");
      span.className = "bilikit-loc";
      span.textContent = PIN + format(loc);
      span.style.cssText = `margin-left:calc(${blockGap(sr)} / 2);color:var(--text3,#9499a0);font-size:inherit;white-space:nowrap;`;
      pubdate.after(span);
      return true;
    }
    let topRoot = null;
    let rafId = 0;
    function schedule() {
      if (rafId || !topRoot) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        walk(topRoot);
      });
    }
    function bind(comments) {
      const sr = comments.shadowRoot;
      if (!sr) return;
      for (const o of observers) o.disconnect();
      observers = [];
      topRoot = sr;
      observeRoot(sr);
      walk(sr);
    }
    let current = null;
    let currentApp = null;
    let appObserver = null;
    function releaseCommentTree() {
      for (const o of observers) o.disconnect();
      observers = [];
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      current = null;
      topRoot = null;
    }
    function tryBind() {
      const c = currentApp == null ? void 0 : currentApp.querySelector("bili-comments");
      if (c && c !== current && c.shadowRoot) {
        current = c;
        bind(c);
      }
    }
    function watch(app) {
      if (app === currentApp && appObserver) {
        tryBind();
        return;
      }
      appObserver == null ? void 0 : appObserver.disconnect();
      releaseCommentTree();
      currentApp = app;
      appObserver = new MutationObserver(tryBind);
      appObserver.observe(app, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-params"]
      });
      tryBind();
    }
    function ensureApp() {
      if (currentApp == null ? void 0 : currentApp.isConnected) return;
      if (currentApp) {
        appObserver == null ? void 0 : appObserver.disconnect();
        appObserver = null;
        currentApp = null;
        releaseCommentTree();
      }
      const app = document.querySelector("#commentapp");
      if (app) watch(app);
    }
    ensureApp();
    setInterval(() => {
      if (currentApp == null ? void 0 : currentApp.isConnected) return;
      ensureApp();
    }, 2e3);
  }
  const commentLocation = {
    id: "comment-location",
    name: "评论信息",
    description: "姓名旁显示性别，时间旁显示 IP 属地",
    category: "界面",
    runAt: "idle",
    settings: [
      { key: "showSex", type: "toggle", label: "姓名旁显示性别", default: true, hint: "直接读取评论已有数据；保密用户不显示，不额外请求接口" },
      { key: "pin", type: "text", label: "地名前缀符", default: "", placeholder: "如 📍 ", hint: "显示在属地前，默认无；想加自己填" }
    ],
    init: init$3
  };
  function isWakeLockIgnoredVideo(v) {
    return v.classList.contains("bk-feed-vpreview");
  }
  function init$2() {
    const nav = navigator;
    if (!("wakeLock" in navigator)) return;
    if (window.__BILIKIT_WAKE_LOCK__) return;
    window.__BILIKIT_WAKE_LOCK__ = true;
    const log = (...args) => {
    };
    let sentinel = null;
    let currentVideo = null;
    let retryTimer = null;
    let acquiring = false;
    async function requestWakeLock() {
      if (sentinel || acquiring) return;
      if (!currentVideo || currentVideo.paused) return;
      if (document.visibilityState !== "visible") return;
      acquiring = true;
      try {
        sentinel = await nav.wakeLock.request("screen");
        log("acquired");
        sentinel.addEventListener("release", () => {
          log("released");
          sentinel = null;
          if (currentVideo && !currentVideo.paused) retryWakeLock();
        });
        if (!currentVideo || currentVideo.paused || document.visibilityState !== "visible") {
          log("stale acquire, releasing");
          await sentinel.release();
        }
      } catch (err) {
        retryWakeLock();
      } finally {
        acquiring = false;
      }
    }
    function retryWakeLock() {
      if (retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        requestWakeLock();
      }, 2e3);
    }
    async function releaseWakeLock() {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      try {
        if (sentinel) {
          await sentinel.release();
          sentinel = null;
          log("manually released");
        }
      } catch {
      }
    }
    const onMediaStop = (e) => {
      if (e.target === currentVideo) releaseWakeLock();
    };
    const onEmptied = (e) => {
      const v = e.target;
      if (v !== currentVideo) return;
      setTimeout(() => {
        if (v === currentVideo && (v.paused || v.ended || !v.isConnected)) releaseWakeLock();
      }, 800);
    };
    function bindVideo(v) {
      if (currentVideo === v) return;
      if (currentVideo) {
        currentVideo.removeEventListener("pause", onMediaStop);
        currentVideo.removeEventListener("ended", onMediaStop);
        currentVideo.removeEventListener("emptied", onEmptied);
      }
      currentVideo = v;
      v.addEventListener("pause", onMediaStop);
      v.addEventListener("ended", onMediaStop);
      v.addEventListener("emptied", onEmptied);
    }
    document.addEventListener(
      "playing",
      (e) => {
        if (!(e.target instanceof HTMLVideoElement)) return;
        if (isWakeLockIgnoredVideo(e.target)) return;
        bindVideo(e.target);
        requestWakeLock();
      },
      true
    );
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && currentVideo && !currentVideo.paused) {
        requestWakeLock();
      }
    });
    const initial = document.querySelector("video");
    if (initial && !initial.paused) {
      bindVideo(initial);
      requestWakeLock();
    }
  }
  const wakeLock = {
    id: "wake-lock",
    name: "防睡眠",
    description: "播放视频时阻止 Safari 休眠 / 屏保",
    category: "播放",
    runAt: "idle",
    init: init$2
  };
  const urlOf = (input) => {
    if (typeof input === "string") return input;
    if (input && typeof input.url === "string") return input.url;
    try {
      return String(input);
    } catch {
      return "";
    }
  };
  function requestToInit(req) {
    const headers = {};
    try {
      req.headers.forEach((v, k) => {
        headers[k] = v;
      });
    } catch {
    }
    return { method: req.method, headers, credentials: req.credentials, referrer: req.referrer, signal: req.signal };
  }
  function installNetHook(rules) {
    if (window.__BILIKIT_NET_HOOK__) return;
    window.__BILIKIT_NET_HOOK__ = true;
    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = async function(input, init2) {
        var _a;
        const url = urlOf(input);
        const rule = rules.find((r) => r.match(url));
        if (!rule) return origFetch.apply(this, arguments);
        let realInput = input;
        let realInit = init2;
        const rw = (_a = rule.rewriteRequest) == null ? void 0 : _a.call(rule, url);
        if (rw && (rw.url || rw.credentials)) {
          if (input instanceof Request && !rw.url) {
            realInput = new Request(input, rw.credentials ? { credentials: rw.credentials } : {});
            realInit = init2;
          } else {
            const base = input instanceof Request ? requestToInit(input) : init2 || {};
            realInput = rw.url || url;
            realInit = { ...base, ...rw.credentials ? { credentials: rw.credentials } : {} };
          }
        }
        const resp = await origFetch.call(this, realInput, realInit);
        if (!rule.rewriteResponse) return resp;
        try {
          const text = await resp.clone().text();
          const out = rule.rewriteResponse(JSON.parse(text), url);
          const headers = new Headers(resp.headers);
          headers.delete("content-length");
          headers.delete("content-encoding");
          return new Response(JSON.stringify(out), { status: resp.status, statusText: resp.statusText, headers });
        } catch {
          return resp;
        }
      };
    }
    const OX = window.XMLHttpRequest;
    if (OX) {
      class X extends OX {
        constructor() {
          super(...arguments);
          this.__nlUrl = "";
          this.__nlOpenArgs = ["GET", ""];
          this.__nlHeaders = [];
          this.__nlGeneration = 0;
          this.__nlAborted = false;
        }
        open(method, url, ...rest) {
          var _a, _b, _c;
          this.__nlGeneration++;
          this.__nlAborted = false;
          this.__nlUrl = String(url);
          this.__nlOpenArgs = [method, url, ...rest];
          this.__nlHeaders = [];
          this.__nlRule = rules.find((r) => r.match(this.__nlUrl));
          this.__nlRw = (_b = (_a = this.__nlRule) == null ? void 0 : _a.rewriteRequest) == null ? void 0 : _b.call(_a, this.__nlUrl);
          return super.open(method, ((_c = this.__nlRw) == null ? void 0 : _c.url) || url, ...rest);
        }
        abort() {
          this.__nlAborted = true;
          this.__nlGeneration++;
          return super.abort();
        }
        setRequestHeader(name, value) {
          try {
            this.__nlHeaders.push([name, value]);
          } catch {
          }
          return super.setRequestHeader(name, value);
        }
        __nlApplyCreds(c) {
          if (c === "omit") this.withCredentials = false;
          else if (c) this.withCredentials = true;
        }
        send(body) {
          var _a, _b, _c;
          if (((_a = this.__nlRule) == null ? void 0 : _a.awaitRewrite) && !((_b = this.__nlRw) == null ? void 0 : _b.url)) {
            const generation = this.__nlGeneration;
            const openArgs = [...this.__nlOpenArgs];
            const headers = [...this.__nlHeaders];
            const stillCurrent = () => !this.__nlAborted && this.__nlGeneration === generation;
            const sendCurrent = (rw) => {
              if (!stillCurrent()) return;
              try {
                if (rw == null ? void 0 : rw.url) {
                  const [method, _oldUrl, ...rest] = openArgs;
                  super.open(method, rw.url, ...rest);
                  for (const h of headers) {
                    try {
                      super.setRequestHeader(h[0], h[1]);
                    } catch {
                    }
                  }
                }
                this.__nlApplyCreds(rw == null ? void 0 : rw.credentials);
              } catch {
              }
              if (!stillCurrent()) return;
              try {
                super.send(body);
              } catch {
              }
            };
            this.__nlRule.awaitRewrite(this.__nlUrl).then((rw) => {
              sendCurrent(rw);
            }, () => sendCurrent());
            return;
          }
          this.__nlApplyCreds((_c = this.__nlRw) == null ? void 0 : _c.credentials);
          return super.send(body);
        }
        get responseText() {
          var _a;
          const rt = this.responseType;
          if (rt !== "" && rt !== "text") return super.responseText;
          const raw = super.responseText;
          if (this.readyState === 4 && ((_a = this.__nlRule) == null ? void 0 : _a.rewriteResponse) && typeof raw === "string") {
            try {
              return JSON.stringify(this.__nlRule.rewriteResponse(JSON.parse(raw), this.__nlUrl));
            } catch {
              return raw;
            }
          }
          return raw;
        }
        get response() {
          var _a;
          const raw = super.response;
          if (this.readyState === 4 && ((_a = this.__nlRule) == null ? void 0 : _a.rewriteResponse)) {
            if (typeof raw === "string") {
              try {
                return JSON.stringify(this.__nlRule.rewriteResponse(JSON.parse(raw), this.__nlUrl));
              } catch {
                return raw;
              }
            }
            if (raw && typeof raw === "object") {
              try {
                return this.__nlRule.rewriteResponse(raw, this.__nlUrl);
              } catch {
                return raw;
              }
            }
          }
          return raw;
        }
      }
      window.XMLHttpRequest = X;
    }
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
  const keyFromUrl = (u) => u ? u.slice(u.lastIndexOf("/") + 1, u.lastIndexOf(".")) : "";
  function signParams(params, imgKey, subKey, wts) {
    const mk = mixinKey(imgKey + subKey);
    const q = { ...params, wts };
    const query = Object.keys(q).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(q[k]).replace(/[!'()*]/g, ""))}`).join("&");
    return `${query}&w_rid=${md5(query + mk)}`;
  }
  const LS = "bilikit:wbi-core";
  const today = () => Math.floor(Date.now() / 864e5);
  let cache = null;
  function readKeys() {
    try {
      const img = keyFromUrl(localStorage.getItem("wbi_img_url") || "");
      const sub = keyFromUrl(localStorage.getItem("wbi_sub_url") || "");
      if (img && sub) return { img, sub };
    } catch {
    }
    if (cache && cache.day === today()) return { img: cache.img, sub: cache.sub };
    try {
      const c = JSON.parse(localStorage.getItem(LS) || "null");
      if (c && c.day === today() && c.img && c.sub) {
        cache = c;
        return { img: c.img, sub: c.sub };
      }
    } catch {
    }
    return null;
  }
  let warmInFlight = null;
  function doWarm(pureFetch) {
    if (warmInFlight) return warmInFlight;
    warmInFlight = pureFetch("https://api.bilibili.com/x/web-interface/nav", { credentials: "omit" }).then((r) => r.json()).then((j) => {
      var _a;
      const w = (_a = j == null ? void 0 : j.data) == null ? void 0 : _a.wbi_img;
      const img = keyFromUrl((w == null ? void 0 : w.img_url) || ""), sub = keyFromUrl((w == null ? void 0 : w.sub_url) || "");
      if (img && sub) {
        cache = { img, sub, day: today() };
        try {
          localStorage.setItem(LS, JSON.stringify(cache));
        } catch {
        }
      }
    }).catch(() => {
    }).finally(() => {
      warmInFlight = null;
    });
    return warmInFlight;
  }
  function warmKeys(pureFetch) {
    if (readKeys()) return;
    doWarm(pureFetch);
  }
  function ensureKeys(pureFetch, timeoutMs = 1500) {
    if (readKeys()) return Promise.resolve(true);
    const timed = new Promise((res) => setTimeout(res, timeoutMs));
    return Promise.race([doWarm(pureFetch), timed]).then(() => !!readKeys());
  }
  function signQuery(params) {
    const keys = readKeys();
    if (!keys) return null;
    return signParams(params, keys.img, keys.sub, Math.floor(Date.now() / 1e3));
  }
  function playurlParams(url) {
    const [base, qs = ""] = url.split("?");
    const params = Object.fromEntries(new URLSearchParams(qs));
    delete params.w_rid;
    delete params.wts;
    params.qn = "80";
    params.try_look = "1";
    params.platform = "pc";
    params.fnval = "4048";
    params.fourk = "1";
    return { base, params };
  }
  const AUTH_CACHE_KEY = "bilikit:no-login-auth";
  const VALID_TTL_MS = 5 * 60 * 1e3;
  function cookieValue(cookie, name) {
    for (const part of cookie.split(";")) {
      const item = part.trim();
      const eq = item.indexOf("=");
      if (eq < 0 || item.slice(0, eq) !== name) continue;
      const value = item.slice(eq + 1);
      return value || null;
    }
    return null;
  }
  function loginCookieFingerprint(cookie) {
    const value = cookieValue(cookie, "DedeUserID__ckMd5");
    return value ? md5(value) : null;
  }
  function readCachedStatus(storage, fingerprint, now) {
    try {
      const record = JSON.parse(storage.getItem(AUTH_CACHE_KEY) || "null");
      if (!record || record.fingerprint !== fingerprint) return "unknown";
      if (record.status === "invalid") return "invalid";
      if (record.status === "valid" && now - record.checkedAt <= VALID_TTL_MS) return "valid";
    } catch {
    }
    return "unknown";
  }
  function initialAuthAction(cookie, storage, now = Date.now()) {
    const fingerprint = loginCookieFingerprint(cookie);
    if (!fingerprint) return "activate-guest";
    const cached = readCachedStatus(storage, fingerprint, now);
    if (cached === "invalid") return "activate-guest";
    if (cached === "valid") return "skip";
    return "verify";
  }
  function loginStatusFromNav(json) {
    var _a, _b;
    if ((json == null ? void 0 : json.code) === 0 && ((_a = json == null ? void 0 : json.data) == null ? void 0 : _a.isLogin) === true) return "valid";
    if (((json == null ? void 0 : json.code) === 0 || (json == null ? void 0 : json.code) === -101) && ((_b = json == null ? void 0 : json.data) == null ? void 0 : _b.isLogin) === false) return "invalid";
    return "unknown";
  }
  async function verifyLogin(pureFetch, timeoutMs = 2500) {
    const controller = new AbortController();
    let timer;
    const request = pureFetch("https://api.bilibili.com/x/web-interface/nav", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal
    }).then(async (response) => {
      if (!response.ok) return "unknown";
      return loginStatusFromNav(await response.json());
    }).catch(() => "unknown");
    const timeout = new Promise((resolve2) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve2("unknown");
      }, timeoutMs);
    });
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  function rememberVerifiedLogin(storage, fingerprint, status, now = Date.now()) {
    if (status === "unknown") return "skip";
    try {
      const record = { fingerprint, status, checkedAt: now };
      storage.setItem(AUTH_CACHE_KEY, JSON.stringify(record));
      return status === "invalid" ? "reload" : "skip";
    } catch {
      return "skip";
    }
  }
  const AUTH_HOSTS = ["message.bilibili.com", "account.bilibili.com", "member.bilibili.com", "pay.bilibili.com", "big.bilibili.com"];
  const AUTH_PATHS = ["/history", "/watchlater", "/favlist", "/medialist", "/account", "/pincenter"];
  function needsRealLogin() {
    if (AUTH_HOSTS.includes(location.hostname)) return true;
    return AUTH_PATHS.some((p) => location.pathname.includes(p));
  }
  function clearFakeUid() {
    try {
      if (/DedeUserID=/.test(document.cookie)) document.cookie = "DedeUserID=; path=/; domain=.bilibili.com; max-age=0";
    } catch {
    }
  }
  function getSessionStorage() {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
  function init$1(_cfg) {
    var _a;
    if (window.__BILIKIT_NO_LOGIN__) return;
    if (window.top !== window.self && !location.hash.includes("bk-drawer")) return;
    if (location.hostname === "passport.bilibili.com") return;
    const fingerprint = loginCookieFingerprint(document.cookie);
    const authStorage = fingerprint ? getSessionStorage() : null;
    const authAction = fingerprint ? authStorage ? initialAuthAction(document.cookie, authStorage) : "skip" : "activate-guest";
    if (authAction === "skip") return;
    if (authAction === "verify") {
      if (window.top !== window.self || window.__BILIKIT_NO_LOGIN_AUTH_CHECK__) return;
      window.__BILIKIT_NO_LOGIN_AUTH_CHECK__ = true;
      const pureFetch2 = (_a = window.fetch) == null ? void 0 : _a.bind(window);
      if (!fingerprint || !authStorage || !pureFetch2) return;
      void verifyLogin(pureFetch2).then((status) => {
        if (loginCookieFingerprint(document.cookie) !== fingerprint) return;
        if (rememberVerifiedLogin(authStorage, fingerprint, status) !== "reload") return;
        try {
          location.reload();
        } catch {
        }
      });
      return;
    }
    if (needsRealLogin()) {
      clearFakeUid();
      return;
    }
    window.__BILIKIT_NO_LOGIN__ = true;
    showGuestNotice();
    installLogoutIntercept();
    if (!/DedeUserID=/.test(document.cookie)) {
      try {
        document.cookie = `DedeUserID=${Math.floor(Math.random() * 2 ** 50)}; path=/; domain=.bilibili.com`;
      } catch {
      }
    }
    try {
      const st = document.createElement("style");
      st.textContent = ".van-message.van-message-error{display:none!important}";
      (document.head || document.documentElement).appendChild(st);
    } catch {
    }
    try {
      Object.defineProperty(window, "__playinfo__", { configurable: true, get: () => null, set: () => {
      } });
    } catch {
    }
    try {
      const sc = document.createElement("script");
      sc.textContent = "const playurlSSRData = {}";
      (document.head || document.documentElement).appendChild(sc);
      sc.remove();
    } catch {
    }
    const pureFetch = window.fetch.bind(window);
    warmKeys(pureFetch);
    const MID = Math.floor(Math.random() * 1e15);
    const MOCK_USER = {
      isLogin: true,
      is_login: true,
      mid: MID,
      uname: "bilibili",
      face: "https://i0.hdslb.com/bfs/face/member/noface.jpg",
      email_verified: 1,
      mobile_verified: 1,
      money: 0,
      moral: 70,
      level_info: { current_level: 6, current_min: 28800, current_exp: 29050, next_exp: "--" },
      official: { role: 0, title: "", desc: "", type: -1 },
      officialVerify: { type: -1, desc: "" },
      vipStatus: 0,
      vipType: 0
    };
    const MOCK_MYINFO = {
      profile: {
        mid: MID,
        name: "bilibili",
        sex: "保密",
        face: "https://i0.hdslb.com/bfs/face/member/noface.jpg",
        sign: "",
        rank: 1e4,
        level: 6,
        jointime: 0,
        moral: 70,
        silence: 0,
        email_status: 0,
        tel_status: 1,
        identification: 0,
        vip: {
          type: 0,
          status: 0,
          due_date: 0,
          vip_pay_type: 0,
          theme_type: 0,
          label: { path: "", text: "", label_theme: "", text_color: "", bg_style: 0, bg_color: "", border_color: "", use_img_label: true, img_label_uri_hans: "", img_label_uri_hant: "", img_label_uri_hans_static: "", img_label_uri_hant_static: "", label_id: 0, label_goto: null },
          avatar_subscript: 0,
          nickname_color: "",
          role: 0,
          avatar_subscript_url: "",
          tv_vip_status: 0,
          tv_vip_pay_type: 0,
          tv_due_date: 0,
          avatar_icon: { icon_resource: {} },
          ott_info: { vip_type: 0, pay_type: 0, pay_channel_id: "", status: 0, overdue_time: 0 },
          super_vip: { is_super_vip: false }
        },
        pendant: { pid: 0, name: "", image: "", expire: 0, image_enhance: "", image_enhance_frame: "", n_pid: 0 },
        nameplate: { nid: 0, name: "", image: "", image_small: "", level: "", condition: "" },
        official: { role: 0, title: "", desc: "", type: -1 },
        birthday: 315504e3,
        is_tourist: 0,
        is_fake_account: 0,
        pin_prompting: 0,
        is_deleted: 0,
        in_reg_audit: 0,
        is_rip_user: false,
        profession: { id: 0, name: "", show_name: "", is_show: 0, category_one: "", realname: "", title: "", department: "", certificate_no: "", certificate_show: false },
        face_nft: 0,
        face_nft_new: 0,
        is_senior_member: 0,
        honours: { mid: MID, colour: { dark: "#CE8620", normal: "#F0900B" }, tags: null, is_latest_100honour: 0 },
        digital_id: "",
        digital_type: -2,
        attestation: { type: 0, common_info: { title: "", prefix: "", prefix_title: "" }, splice_info: { title: "" }, icon: "", desc: "" },
        expert_info: { title: "", state: 0, type: 0, desc: "" },
        name_render: null,
        country_code: "86",
        handle: ""
      },
      level_exp: { current_level: 6, current_min: 28800, current_exp: 29050, next_exp: "--" },
      coins: 0,
      following: 0,
      follower: 0
    };
    const rules = [
      // space/v2/myinfo：伪造成功响应压掉空间页「会话失效 → 自刷」路径（真登录成功不动）
      {
        match: (u) => u.includes("/x/space/v2/myinfo"),
        rewriteResponse: (j) => {
          var _a2;
          try {
            if ((j == null ? void 0 : j.code) === 0 && ((_a2 = j == null ? void 0 : j.data) == null ? void 0 : _a2.profile)) return j;
          } catch {
          }
          return { code: 0, message: "0", ttl: 1, data: MOCK_MYINFO };
        }
      },
      // nav：合并成「已登录」，保留 wbi_img 等原字段（→ 登录态 UI + 动态可见）
      {
        match: (u) => u.includes("/x/web-interface/nav"),
        rewriteResponse: (j) => {
          var _a2;
          try {
            if ((_a2 = j == null ? void 0 : j.data) == null ? void 0 : _a2.isLogin) return j;
            j.code = 0;
            j.message = "0";
            j.data = Object.assign({}, j.data, MOCK_USER);
          } catch {
          }
          return j;
        }
      },
      // reply：匿名请求（假 cookie 会被拒，去掉反而正常返公开评论）→ 视频/动态下方评论
      {
        match: (u) => u.includes("/x/v2/reply/wbi/main") || u.includes("/x/v2/reply/reply"),
        rewriteRequest: () => ({ credentials: "omit" })
      },
      // player/wbi/v2：改 login_mid / 等级 / 字幕字段 → 播放器 UI 认账（清晰度、字幕可选）
      {
        match: (u) => u.includes("/x/player/wbi/v2"),
        rewriteResponse: (j) => {
          try {
            const d = j == null ? void 0 : j.data;
            if (d) {
              d.login_mid = MID;
              d.need_login_subtitle = false;
              if (d.level_info) d.level_info.current_level = 6;
            }
          } catch {
          }
          return j;
        }
      },
      // relation：与 UP 的关注关系——假 cookie 下真接口返 -101 → 关注按钮/粉丝数报错、
      // 视频页红 toast 的源头之一。mock 成「无关注关系」（照抄 beefreely useRelation）。
      // 注意 match 写全 'web-interface/relation?'：别误吞 archive/relation（下一条单独管）。
      {
        match: (u) => u.includes("/x/web-interface/relation?"),
        rewriteResponse: (j) => {
          try {
            if ((j == null ? void 0 : j.code) === 0 && (j == null ? void 0 : j.data)) return j;
          } catch {
          }
          return { code: 0, message: "0", ttl: 1, data: {
            relation: { mid: 0, attribute: 0, mtime: 0, tag: null, special: 0 },
            be_relation: { mid: 0, attribute: 0, mtime: 0, tag: null, special: 0 }
          } };
        }
      },
      // archive/relation：与本视频的互动状态（点赞/投币/收藏）——同样返 -101 触发未登录提示。
      // mock 成「均未互动」（照抄 beefreely useArchiveRelation）。
      {
        match: (u) => u.includes("/x/web-interface/archive/relation"),
        rewriteResponse: (j) => {
          try {
            if ((j == null ? void 0 : j.code) === 0 && (j == null ? void 0 : j.data)) return j;
          } catch {
          }
          return { code: 0, message: "0", ttl: 1, data: {
            attention: false,
            favorite: false,
            season_fav: false,
            like: false,
            dislike: false,
            coin: 0
          } };
        }
      },
      // 搜索页热搜接口拼接损坏（B 站自身 bug，只在未登录时出现）：api.bilibili.comx/... 少了个 /
      // → 404、热搜/搜索结果拿不到。补上斜杠（照抄 beefreely useSearch）。
      {
        match: (u) => u.includes("/api.bilibili.comx/web-interface/search"),
        rewriteRequest: (u) => ({ url: u.replace(/\.com(?!\/)/, ".com/") })
      },
      // 番剧/PGC（ogv/player/playview）：把 user_status.is_login 掰成 true → 播放器不再弹
      // 「登录后观看」、清晰度不锁最低。PGC 无需重签 playurl，is_login 即全部机制（beefreely 同）。
      {
        match: (u) => u.includes("/ogv/player/playview"),
        rewriteResponse: (j) => {
          var _a2;
          try {
            if ((_a2 = j == null ? void 0 : j.data) == null ? void 0 : _a2.user_status) j.data.user_status.is_login = true;
          } catch {
          }
          return j;
        }
      },
      // playurl：塞 qn=80(1080p) + try_look=1(试看)、去掉旧签名重签 wbi → 1080p 取流。
      // iPad/移动 Safari 触发 B 站触屏判定 → 播放器发 platform=html5(MP4)，服务端对 html5 的免登录
      // 试看只给到 480p，qn=80 也被打回。故强行掰回桌面 DASH 路径：platform=pc + fnval=4048(全 DASH)
      // + fourk=1，让服务端按桌面策略放行 1080p 试看（桌面本就这套，零风险；iPad 靠 MSE 放 DASH）。
      {
        match: (u) => u.includes("/x/player/wbi/playurl"),
        // 快路径：key 已缓存 → 同步签名，零延迟
        rewriteRequest: (u) => {
          try {
            const { base, params } = playurlParams(u);
            const signed = signQuery(params);
            if (!signed) return;
            return { url: `${base}?${signed}` };
          } catch {
            return;
          }
        },
        // 慢路径：无痕会话**首个视频** key 还没暖好 → 等 nav 拉到 key（≤1.5s）再签名发出，
        // 否则首帧只能 480p、要刷新一次才 1080p（issue #? 追加反馈的根因）。等到即 1080p，超时则原样发。
        awaitRewrite: async (u) => {
          try {
            if (!await ensureKeys(pureFetch, 1500)) return;
            const { base, params } = playurlParams(u);
            const signed = signQuery(params);
            return signed ? { url: `${base}?${signed}` } : void 0;
          } catch {
            return;
          }
        }
      }
    ];
    installNetHook(rules);
  }
  const NOTICE_KEY = "no-login.notified";
  const NOTICE_CSS = `
.bk-nl-toast{ position:fixed; left:50%; bottom:24px; transform:translateX(-50%) translateY(10px);
  z-index:2147483000; display:flex; align-items:center; gap:10px; max-width:min(94vw,540px);
  padding:11px 12px 11px 15px; border-radius:12px; background:rgba(22,23,28,.94); color:#e3e5e7;
  border:1px solid rgba(255,255,255,.1); box-shadow:0 8px 32px rgba(0,0,0,.42);
  -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px);
  font-family:-apple-system,"PingFang SC",sans-serif; font-size:13px; line-height:1.5;
  opacity:0; transition:opacity .28s ease, transform .28s ease; }
.bk-nl-toast.on{ opacity:1; transform:translateX(-50%) translateY(0); }
.bk-nl-toast .bk-nl-txt{ flex:1; min-width:0; }
.bk-nl-toast .bk-nl-txt b{ color:#fff; font-weight:600; }
.bk-nl-toast .bk-nl-sub{ color:rgba(255,255,255,.5); font-size:11px; margin-top:2px; }
.bk-nl-toast .bk-nl-btn{ flex:0 0 auto; height:30px; padding:0 13px; border-radius:8px; cursor:pointer; white-space:nowrap;
  font-size:12.5px; font-weight:500; font-family:inherit; transition:background .15s ease, border-color .15s ease; }
.bk-nl-toast .bk-nl-off{ border:1px solid rgba(255,255,255,.16); background:rgba(255,255,255,.06); color:#e3e5e7; }
.bk-nl-toast .bk-nl-off:hover{ background:rgba(255,255,255,.13); }
.bk-nl-toast .bk-nl-login{ border:1px solid transparent; background:#fb7299; color:#fff; }
.bk-nl-toast .bk-nl-login:hover{ background:#fb8bab; }
.bk-nl-toast .bk-nl-x{ flex:0 0 auto; width:22px; height:22px; padding:0; border:none; background:none;
  color:rgba(255,255,255,.4); font-size:17px; line-height:1; cursor:pointer; transition:color .15s ease; }
.bk-nl-toast .bk-nl-x:hover{ color:rgba(255,255,255,.75); }`;
  function exitToLogin() {
    clearFakeUid();
    const login = "https://passport.bilibili.com/login?gourl=" + encodeURIComponent(location.href);
    try {
      (window.top || window).location.href = login;
    } catch {
      location.href = login;
    }
  }
  function disableNoLogin() {
    try {
      setModuleEnabled("no-login", false);
    } catch {
    }
    clearFakeUid();
    try {
      location.reload();
    } catch {
    }
  }
  function showGuestNotice() {
    if (window.top !== window.self) return;
    if (get(NOTICE_KEY, false)) return;
    const run = () => {
      var _a, _b, _c;
      if (!document.body) return;
      set(NOTICE_KEY, true);
      try {
        let dismiss = function() {
          if (fadeTimer) {
            clearTimeout(fadeTimer);
            fadeTimer = null;
          }
          box.classList.remove("on");
          setTimeout(() => {
            try {
              box.remove();
            } catch {
            }
          }, 320);
        };
        const style = document.createElement("style");
        style.textContent = NOTICE_CSS;
        (document.head || document.documentElement).appendChild(style);
        const box = document.createElement("div");
        box.className = "bk-nl-toast";
        box.innerHTML = '<div class="bk-nl-txt"><b>已开启免登录</b>——未登录也能看评论 / 1080p。<div class="bk-nl-sub">想用自己的账号点「我要登录」；不需要此功能点「关闭功能」。</div></div><button class="bk-nl-btn bk-nl-off" type="button">关闭功能</button><button class="bk-nl-btn bk-nl-login" type="button">我要登录</button><button class="bk-nl-x" type="button" aria-label="忽略">×</button>';
        document.body.appendChild(box);
        requestAnimationFrame(() => box.classList.add("on"));
        let fadeTimer = setTimeout(dismiss, 8e3);
        const stopFade = () => {
          if (fadeTimer) {
            clearTimeout(fadeTimer);
            fadeTimer = null;
          }
        };
        (_a = box.querySelector(".bk-nl-x")) == null ? void 0 : _a.addEventListener("click", dismiss);
        (_b = box.querySelector(".bk-nl-off")) == null ? void 0 : _b.addEventListener("click", () => {
          stopFade();
          disableNoLogin();
        });
        (_c = box.querySelector(".bk-nl-login")) == null ? void 0 : _c.addEventListener("click", () => {
          stopFade();
          exitToLogin();
        });
      } catch {
      }
    };
    if (document.body) run();
    else document.addEventListener("DOMContentLoaded", run, { once: true });
  }
  function isLogoutClick(start) {
    var _a;
    let el2 = start;
    for (let i = 0; el2 && i < 6; i++, el2 = el2.parentElement) {
      const cls = typeof el2.className === "string" ? el2.className : "";
      if (/(^|[\s_-])logout/i.test(cls)) return true;
      const href = (_a = el2.getAttribute) == null ? void 0 : _a.call(el2, "href");
      if (href && /login\/exit/i.test(href)) return true;
      const txt = (el2.textContent || "").trim();
      if (txt === "退出登录") return true;
    }
    return false;
  }
  function installLogoutIntercept() {
    if (window.__BILIKIT_NL_LOGOUT__) return;
    window.__BILIKIT_NL_LOGOUT__ = true;
    document.addEventListener("click", (e) => {
      try {
        if (!isLogoutClick(e.target)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        exitToLogin();
      } catch {
      }
    }, true);
  }
  const noLogin = {
    id: "no-login",
    name: "免登录",
    description: "未登录也能看评论 / 他人动态 / 1080p（装它即可替代 beefreely，避免脚本冲突）",
    note: "开启后未登录也能：看视频/动态下方<b>评论</b>、看他人<b>动态</b>、看 <b>1080p</b> 视频。装了它就能卸载 beefreely 等免登录脚本，避免多个脚本抢改请求导致的时好时坏。<br><b>取舍（务必知悉）</b>：① 纯<b>只读</b>——页面「以为」你已登录（显示假账号），但发评论/点赞/投币/收藏/历史同步等需真鉴权的操作都会失败；② <b>看不到评论 IP 属地</b>——评论走匿名请求，B 站服务端只对真登录返回属地字段，免登录下拿不到（「评论信息」里的性别仍可显示）；③ 1080p 上限为官方<b>试看</b>，4K/HDR/大会员专享清晰度仍拿不到；④ 仅<b>未登录</b>时生效，检测到已登录会自动让路、不干扰真账号。<br>若浏览器残留了服务端已失效的登录状态，会自动确认并<b>刷新一次</b>后恢复免登录，不会清除你的 Cookie。<br><b>默认开启</b>：只在未登录时激活（已登录零影响），首次激活会在底部弹一次可关闭的提示。这样无痕/未登录浏览打开即 1080p，无需每次手动开。<br><b>想真正登录</b>：直接点顶栏用户菜单里的「退出登录」即可——会跳到登录页，登录后自动回到当前页面；免登录本身<b>不会被关掉</b>，下次未登录时照常自动生效。",
    category: "增强",
    // 默认开：仅未登录时激活（真登录由 nav 确认后 return、零影响），首次激活弹一次性可关提示告知。
    // 目的：无痕模式存不住任何页面侧开关（localStorage/cookie 关窗即清、@grant none 无法用 GM 存储跨会话），
    // 唯一能让「无痕未登录时默认免登录」成立的就是把默认值设对；用一次性披露弹框换取透明、避免静默吓到人。
    defaultEnabled: true,
    runAt: "start",
    init: init$1
  };
  const DRAWER_HISTORY_KEY = "__bilikitDrawer";
  const DRAWER_ORIGIN_KEY = "__bilikitDrawerOrigin";
  const DRAWER_FRAME_PREFIX = "bilikit-drawer:";
  const DRAWER_DOCUMENT_NAV_KEY = "bilikit-drawer-document-navigation";
  const DRAWER_MARK = "#bk-drawer";
  const DRAWER_WEB_MARK = "#bk-drawer-web";
  function canReuseDrawerDocument(loaded, route) {
    return !!loaded.token && loaded.token === route.token && loaded.url === route.url && loaded.webFull === route.webFull;
  }
  function drawerFrameName(route) {
    return `${DRAWER_FRAME_PREFIX}${route.token}:${route.webFull ? "web" : "plain"}`;
  }
  function readDrawerFrameName(name) {
    if (!name.startsWith(DRAWER_FRAME_PREFIX)) return null;
    const rest = name.slice(DRAWER_FRAME_PREFIX.length);
    const split = rest.lastIndexOf(":");
    if (split <= 0) return null;
    const token = rest.slice(0, split);
    const mode = rest.slice(split + 1);
    if (!/^[0-9a-z-]{8,}$/i.test(token) || mode !== "web" && mode !== "plain") return null;
    return { token, webFull: mode === "web" };
  }
  function drawerMark(hash) {
    if (hash === DRAWER_MARK) return DRAWER_MARK;
    if (hash === DRAWER_WEB_MARK) return DRAWER_WEB_MARK;
    return null;
  }
  function safeDrawerVideoUrl(target, expectedOrigin) {
    try {
      const next = new URL(target);
      if (next.origin !== expectedOrigin || !/(^|\.)bilibili\.com$/i.test(next.hostname)) return null;
      if (!/^\/(?:video\/(?:BV[0-9A-Za-z]+|av\d+)|bangumi\/play\/(?:ep|ss)\d+|cheese\/play\/(?:ep|ss)\d+|list\/|festival\/)/i.test(next.pathname)) return null;
      if (drawerMark(next.hash)) next.hash = "";
      return next.href;
    } catch {
      return null;
    }
  }
  function drawerPlayableId(target, base = target) {
    var _a, _b, _c;
    try {
      const url = new URL(target, base);
      const path = url.pathname;
      const video = (_a = path.match(/^\/video\/(BV[0-9A-Za-z]+|av\d+)/i)) == null ? void 0 : _a[1];
      if (video) return `video:${video.toLowerCase()}`;
      const bangumi = (_b = path.match(/^\/bangumi\/play\/((?:ep|ss)\d+)/i)) == null ? void 0 : _b[1];
      if (bangumi) return `bangumi:${bangumi.toLowerCase()}`;
      const cheese = (_c = path.match(/^\/cheese\/play\/((?:ep|ss)\d+)/i)) == null ? void 0 : _c[1];
      if (cheese) return `cheese:${cheese.toLowerCase()}`;
      if (/^\/(?:list|festival)\//i.test(path)) {
        const bvid = url.searchParams.get("bvid");
        if (bvid && /^BV[0-9A-Za-z]+$/i.test(bvid)) return `video:${bvid.toLowerCase()}`;
        const aid = url.searchParams.get("aid") || url.searchParams.get("oid");
        if (aid && /^\d+$/.test(aid)) return `video:av${aid}`;
      }
      return null;
    } catch {
      return null;
    }
  }
  function shouldReplaceDrawerDocument(current, target, allowSeasonCanonicalization = false) {
    let currentUrl;
    let targetUrl;
    try {
      currentUrl = new URL(current);
      targetUrl = new URL(target, currentUrl);
    } catch {
      return false;
    }
    if (currentUrl.origin !== targetUrl.origin) return false;
    const from = drawerPlayableId(currentUrl.href);
    const to = drawerPlayableId(targetUrl.href);
    if (!from && !to) return false;
    if (!from || !to) return true;
    if (from === to) {
      if (from.startsWith("video:")) {
        const fromPart = currentUrl.searchParams.get("p") || "1";
        const toPart = targetUrl.searchParams.get("p") || "1";
        if (fromPart !== toPart) return true;
        const routeFamily = (url) => {
          if (/^\/video\//i.test(url.pathname)) return "video";
          if (/^\/list\//i.test(url.pathname)) return "list";
          if (/^\/festival\//i.test(url.pathname)) return "festival";
          return "other";
        };
        if (routeFamily(currentUrl) !== routeFamily(targetUrl)) return true;
      }
      return false;
    }
    if (allowSeasonCanonicalization) {
      const canonicalizedBangumi = from.startsWith("bangumi:ss") && to.startsWith("bangumi:ep");
      const canonicalizedCheese = from.startsWith("cheese:ss") && to.startsWith("cheese:ep");
      if (canonicalizedBangumi || canonicalizedCheese) return false;
    }
    return true;
  }
  function drawerDisplayUrl(target, currentHref) {
    try {
      const current = new URL(currentHref);
      const next = new URL(target, current);
      if (next.origin !== current.origin) return null;
      if (drawerMark(next.hash)) next.hash = "";
      return next.href;
    } catch {
      return null;
    }
  }
  function withDrawerRoute(state, route) {
    const base = state && typeof state === "object" && !Array.isArray(state) ? state : {};
    const out = { ...base, [DRAWER_HISTORY_KEY]: route };
    delete out[DRAWER_ORIGIN_KEY];
    return out;
  }
  function withDrawerOrigin(state, token) {
    const base = state && typeof state === "object" && !Array.isArray(state) ? state : {};
    const out = { ...base, [DRAWER_ORIGIN_KEY]: token };
    delete out[DRAWER_HISTORY_KEY];
    return out;
  }
  function readDrawerOrigin(state) {
    if (!state || typeof state !== "object") return null;
    const token = state[DRAWER_ORIGIN_KEY];
    return typeof token === "string" ? token : null;
  }
  function readDrawerRoute(state) {
    if (!state || typeof state !== "object") return null;
    const route = state[DRAWER_HISTORY_KEY];
    if (!route || typeof route !== "object") return null;
    const r = route;
    if (typeof r.token !== "string" || !r.token || typeof r.url !== "string" || typeof r.cover !== "string" || typeof r.webFull !== "boolean" || typeof r.immersive !== "boolean") return null;
    return r;
  }
  function isPlayPage(pathname = location.pathname) {
    return /^\/(video\/|bangumi\/play\/|cheese\/play\/|list\/|festival\/)/.test(pathname);
  }
  const TITLE_SUFFIX = /[_-](哔哩哔哩|bilibili|番剧|动画|电影|电视剧|纪录片|综艺|国创|在线观看|全集)([_-]?(哔哩哔哩|bilibili|番剧|动画|电影|电视剧|纪录片|综艺|国创|在线观看|全集))*$/i;
  function videoIdOf(href, base = "https://www.bilibili.com") {
    var _a, _b, _c, _d;
    try {
      const u = new URL(href, base);
      const p = u.pathname;
      return ((_b = (_a = p.match(/\/video\/(BV\w+|av\d+)/i)) == null ? void 0 : _a[1]) == null ? void 0 : _b.toLowerCase()) || ((_d = (_c = p.match(/\/(?:bangumi|cheese)\/play\/((ep|ss)\d+)/i)) == null ? void 0 : _c[1]) == null ? void 0 : _d.toLowerCase()) || (u.searchParams.get("bvid") || "").toLowerCase() || "";
    } catch {
      return "";
    }
  }
  function shouldFlattenVideoNavigation(current, target) {
    try {
      const fromUrl = new URL(current);
      const toUrl = new URL(target, fromUrl);
      if (fromUrl.origin !== toUrl.origin) return false;
      const from = videoIdOf(fromUrl.href, fromUrl.href);
      const to = videoIdOf(toUrl.href, fromUrl.href);
      return !!from && !!to && from !== to;
    } catch {
      return false;
    }
  }
  function cleanTitle(raw) {
    return (raw || "").replace(TITLE_SUFFIX, "").trim();
  }
  function dedupeArrival(stack, curId, base = "https://www.bilibili.com", backRestore = false) {
    if (!curId) return stack;
    let s = stack;
    if (backRestore) {
      let i = s.length - 1;
      while (i >= 0 && videoIdOf(s[i].url, base) !== curId) i--;
      if (i >= 0) s = s.slice(0, i + 1);
    }
    let n = s.length;
    while (n && videoIdOf(s[n - 1].url, base) === curId) n--;
    return n !== s.length ? s.slice(0, n) : s;
  }
  const STACK_KEY = WAYBACK_STACK_KEY;
  const STACK_MAX = 20;
  const NS$1 = "bwb";
  function init(cfg) {
    if (!isPlayPage()) return;
    if (window.top !== window.self && !location.hash.includes("bk-drawer")) return;
    if (window.__BILIKIT_WAY_BACK__) return;
    window.__BILIKIT_WAY_BACK__ = true;
    const resumeTime = cfg.get("resumeTime") !== false;
    const inDrawer2 = window.top !== window.self;
    const drawerMark2 = (location.hash.match(/#bk-drawer(?:-web)?/) || [""])[0] || (inDrawer2 ? "#bk-drawer" : "");
    const JUMP_FLAG = "bilikit-wb-jump";
    if (inDrawer2) {
      try {
        const continuedUrl = sessionStorage.getItem(DRAWER_DOCUMENT_NAV_KEY) || "";
        sessionStorage.removeItem(DRAWER_DOCUMENT_NAV_KEY);
        const continued = !!continuedUrl && videoIdOf(continuedUrl, location.href) === videoIdOf(location.href, location.href);
        if (sessionStorage.getItem(JUMP_FLAG)) sessionStorage.removeItem(JUMP_FLAG);
        else if (!continued) sessionStorage.removeItem(STACK_KEY);
      } catch {
      }
    }
    const videoIdOf$1 = (href) => videoIdOf(href, location.href);
    const readStack = () => {
      try {
        const a = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
        return Array.isArray(a) ? a : [];
      } catch {
        return [];
      }
    };
    const writeStack = (s) => {
      try {
        sessionStorage.setItem(STACK_KEY, JSON.stringify(s.slice(-STACK_MAX)));
      } catch {
      }
    };
    const titleById = /* @__PURE__ */ new Map();
    const noteTitle = () => {
      const id = videoIdOf$1(location.href), t = cleanTitle(document.title);
      if (!id || !t) return;
      titleById.delete(id);
      titleById.set(id, t);
      while (titleById.size > STACK_MAX * 2) titleById.delete(titleById.keys().next().value);
    };
    let titleEl = null;
    const titleMo = new MutationObserver(() => {
      if (titleEl && !titleEl.isConnected) {
        titleEl = null;
        titleMo.disconnect();
        watchTitle();
      }
      noteTitle();
      updateNowRow();
    });
    function watchTitle() {
      const el2 = document.querySelector("title");
      if (el2 && el2 !== titleEl) {
        titleMo.disconnect();
        titleEl = el2;
        titleMo.observe(el2, { childList: true, characterData: true, subtree: true });
        noteTitle();
      }
    }
    watchTitle();
    document.addEventListener("DOMContentLoaded", () => watchTitle());
    let playerVideo = null;
    const getVideo = () => playerVideo && playerVideo.isConnected ? playerVideo : document.querySelector("video");
    const currentVideoTime = () => {
      const v = getVideo();
      return v && Number.isFinite(v.currentTime) ? v.currentTime : 0;
    };
    let lastPlayedT = 0;
    let lastTU = 0;
    document.addEventListener("timeupdate", (e) => {
      const now = performance.now();
      if (now - lastTU < 1e3) return;
      lastTU = now;
      const v = e.target;
      if (!(v && v.tagName === "VIDEO" && Number.isFinite(v.currentTime))) return;
      const inPlayer = !!v.closest("#bilibili-player, .bpx-player-container");
      if (inPlayer) playerVideo = v;
      if ((inPlayer || !playerVideo) && v.currentTime > 0) lastPlayedT = v.currentTime;
    }, true);
    const departureTime = () => {
      const t = currentVideoTime();
      return t > 0 ? t : lastPlayedT;
    };
    function recordEntry(prevHref, prevTitle, t, rerender = true) {
      const id = videoIdOf$1(prevHref);
      if (!id) return;
      const stack = readStack();
      if (stack.length && videoIdOf$1(stack[stack.length - 1].url) === id) return;
      stack.push({ url: prevHref, title: titleById.get(id) || cleanTitle(prevTitle) || id, t: resumeTime && t > 0 ? Math.floor(t) : 0 });
      const trimmed = stack.length > STACK_MAX ? stack.slice(-STACK_MAX) : stack;
      writeStack(trimmed);
      if (rerender) renderChip(trimmed);
    }
    const origPush = history.pushState.bind(history);
    history.pushState = function(...args) {
      try {
        const url = args[2];
        if (url != null) {
          const prevId = videoIdOf$1(location.href);
          const curId = videoIdOf$1(new URL(url, location.href).href);
          if (prevId && curId && prevId !== curId) {
            if (!(prevId.startsWith("ss") && curId.startsWith("ep"))) {
              recordEntry(location.href, document.title, departureTime());
              lastPlayedT = 0;
            }
          }
        }
        watchTitle();
      } catch {
      }
      return origPush.apply(this, args);
    };
    let leavingViaJump = false;
    window.addEventListener("pagehide", () => {
      if (leavingViaJump) return;
      recordEntry(location.href, document.title, departureTime(), false);
    });
    function jumpTo(i) {
      const stack = readStack();
      if (i < 0) i = stack.length - 1;
      const entry = stack[i];
      if (!entry) return;
      writeStack(stack.slice(0, i));
      leavingViaJump = true;
      let href = entry.url;
      try {
        const u = new URL(entry.url, location.href);
        if (entry.t > 5) u.searchParams.set("t", String(entry.t));
        href = u.href;
      } catch {
      }
      if (drawerMark2) {
        if (!href.includes("#")) href += drawerMark2;
        try {
          sessionStorage.setItem(JUMP_FLAG, "1");
        } catch {
        }
      }
      location.replace(href);
    }
    const jumpToUrl = (url) => {
      const s = readStack();
      for (let i = s.length - 1; i >= 0; i--) if (s[i].url === url) return jumpTo(i);
    };
    function dedupeOnArrival(backRestore = false) {
      const curId = videoIdOf$1(location.href);
      if (!curId) return;
      const stack = readStack();
      const out = dedupeArrival(stack, curId, location.href, backRestore);
      if (out.length !== stack.length) writeStack(out);
    }
    const BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10H11"/></svg>';
    const CSS2 = `
.${NS$1}-root{ position:fixed; left:16px; bottom:24px; z-index:99990; font-family:-apple-system,"PingFang SC",sans-serif; }
.${NS$1}-chip{ display:inline-flex; align-items:center; gap:6px; height:34px; padding:0 13px; border-radius:18px; cursor:pointer;
  background:rgba(22,23,28,.9); border:1px solid rgba(255,255,255,.1); color:#e3e5e7; box-shadow:0 3px 14px rgba(0,0,0,.3);
  font-size:13px; font-weight:500; opacity:.5; transition:opacity .18s ease, transform .16s ease;
  -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); }
.${NS$1}-root:hover .${NS$1}-chip{ opacity:1; }
.${NS$1}-chip:active{ transform:scale(.96); }
.${NS$1}-chip svg{ width:16px; height:16px; color:#fb7299; }
.${NS$1}-empty .${NS$1}-chip{ opacity:.32; cursor:default; }
.${NS$1}-empty .${NS$1}-chip svg{ color:rgba(255,255,255,.5); }
.${NS$1}-list{ position:absolute; left:0; bottom:calc(100% + 8px); width:290px;
  background:#1c1d22; border:1px solid rgba(255,255,255,.08); border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,.5);
  opacity:0; visibility:hidden; transform:translateY(6px); pointer-events:none;
  /* 离开延迟 .15s 再淡出：给指针跨间隙迁移留宽限，不丢 hover */
  transition:opacity .16s ease .15s, transform .16s ease .15s, visibility 0s linear .31s; }
.${NS$1}-root:hover .${NS$1}-list{ opacity:1; visibility:visible; transform:none; pointer-events:auto; transition-delay:0s; }
/* 滚动收在内层，卡片自身不裁剪 → ::after 悬停桥才能伸出盒外（放 .list 上会被 overflow 裁掉=没有桥） */
.${NS$1}-scroll{ overflow:hidden auto; max-height:60vh; min-height:0; border-radius:12px; }
/* 胶囊与列表间隙的悬停桥：从卡片盒外伸出、指针穿过间隙仍算在列表上，hover 不断链 */
.${NS$1}-list::after{ content:''; position:absolute; top:100%; left:0; right:0; height:12px; }
.${NS$1}-head{ font-size:11px; color:rgba(255,255,255,.35); padding:9px 12px 5px; }
.${NS$1}-item{ display:flex; align-items:center; gap:9px; padding:8px 12px; cursor:pointer; }
.${NS$1}-item:hover{ background:rgba(251,114,153,.16); }
.${NS$1}-item:hover .${NS$1}-num{ background:#fb7299; color:#fff; }
.${NS$1}-item:hover .${NS$1}-title{ color:#fb7299; }
.${NS$1}-num{ flex:0 0 auto; width:19px; height:19px; border-radius:50%; background:rgba(255,255,255,.08); color:rgba(255,255,255,.55);
  font-size:11px; display:flex; align-items:center; justify-content:center; transition:background .14s ease, color .14s ease; }
.${NS$1}-title{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; color:rgba(255,255,255,.82); }
.${NS$1}-time{ flex:0 0 auto; font-size:11px; color:rgba(255,255,255,.4); font-variant-numeric:tabular-nums; }
/* 「正在播放」行（序号 0）：不可点、带动画声波条 */
.${NS$1}-now{ cursor:default; border-top:1px solid rgba(255,255,255,.06); }
.${NS$1}-now:hover{ background:none; }
.${NS$1}-now .${NS$1}-num{ background:rgba(255,255,255,.06); }
.${NS$1}-now:hover .${NS$1}-title{ color:rgba(255,255,255,.4); }
.${NS$1}-now .${NS$1}-title{ color:rgba(255,255,255,.4); }
.${NS$1}-bars{ flex:0 0 auto; display:flex; align-items:flex-end; gap:2px; height:12px; }
.${NS$1}-bars i{ width:2.5px; height:12px; background:#fb7299; border-radius:1px; transform-origin:bottom; transform:scaleY(.33); }
/* 只在面板展开(hover)时才跑动画——收起时(99% 时间)零成本；用 transform:scaleY 代替 height 动画，
   走合成层、不触发每帧布局（原 height 动画是发热主因之一）。 */
.${NS$1}-root:hover .${NS$1}-playing .${NS$1}-bars i{ animation:${NS$1}-eq .9s ease-in-out infinite; }
.${NS$1}-playing .${NS$1}-bars i:nth-child(2){ animation-delay:.3s; }
.${NS$1}-playing .${NS$1}-bars i:nth-child(3){ animation-delay:.6s; }
@keyframes ${NS$1}-eq{ 0%,100%{ transform:scaleY(.33); } 50%{ transform:scaleY(1); } }
@media (prefers-color-scheme: light){
  .${NS$1}-chip{ background:rgba(255,255,255,.95); border-color:rgba(0,0,0,.08); color:#18191c; box-shadow:0 3px 14px rgba(0,0,0,.14); }
  .${NS$1}-empty .${NS$1}-chip svg{ color:rgba(0,0,0,.35); }
  .${NS$1}-list{ background:#fff; border-color:rgba(0,0,0,.08); box-shadow:0 12px 40px rgba(0,0,0,.18); }
  .${NS$1}-head{ color:rgba(0,0,0,.4); }
  .${NS$1}-num{ background:rgba(0,0,0,.06); color:rgba(0,0,0,.5); }
  .${NS$1}-title{ color:rgba(0,0,0,.85); }
  .${NS$1}-time{ color:rgba(0,0,0,.4); }
  .${NS$1}-now{ border-top-color:rgba(0,0,0,.06); }
  .${NS$1}-now .${NS$1}-title, .${NS$1}-now:hover .${NS$1}-title{ color:rgba(0,0,0,.4); }
  .${NS$1}-now .${NS$1}-num{ background:rgba(0,0,0,.05); }
}
`;
    let root2 = null;
    let listEl = null;
    let countEl = null;
    let nowRow = null;
    let nowTitleEl = null;
    const fmtTime = (t) => {
      const m = Math.floor(t / 60), s = Math.floor(t % 60);
      return `${m}:${s < 10 ? "0" : ""}${s}`;
    };
    function ensureChip() {
      if (root2 || !document.body) return;
      const style = document.createElement("style");
      style.textContent = CSS2;
      root2 = document.createElement("div");
      root2.className = `${NS$1}-root`;
      const list = document.createElement("div");
      list.className = `${NS$1}-list`;
      const scroll = document.createElement("div");
      scroll.className = `${NS$1}-scroll`;
      list.appendChild(scroll);
      listEl = scroll;
      const chip = document.createElement("div");
      chip.className = `${NS$1}-chip`;
      chip.title = "回退上一个视频（悬停看来时路）";
      chip.innerHTML = `${BACK_SVG}<span class="${NS$1}-count">0</span>`;
      countEl = chip.querySelector(`.${NS$1}-count`);
      chip.addEventListener("click", () => {
        if (readStack().length) jumpTo(-1);
      });
      root2.append(style, list, chip);
      root2.addEventListener("mouseleave", () => {
        if (rebuildHeldByHover) rebuildList();
      });
      document.body.appendChild(root2);
    }
    function updateNowRow() {
      if (!nowRow || !nowTitleEl) return;
      nowTitleEl.textContent = titleById.get(videoIdOf$1(location.href)) || cleanTitle(document.title) || "正在播放";
      const v = getVideo();
      nowRow.classList.toggle(`${NS$1}-playing`, !!v && !v.paused);
    }
    let rebuildQueued = false;
    let rebuildHeldByHover = false;
    function renderChip(known) {
      if (!document.body) return;
      ensureChip();
      if (!root2) return;
      const stack = known || readStack();
      root2.classList.toggle(`${NS$1}-empty`, !stack.length);
      if (countEl) countEl.textContent = String(stack.length);
      if (!rebuildQueued) {
        rebuildQueued = true;
        queueMicrotask(rebuildList);
      }
    }
    function rebuildList() {
      rebuildQueued = false;
      if (!listEl || !root2) return;
      if (root2.matches(":hover")) {
        rebuildHeldByHover = true;
        return;
      }
      rebuildHeldByHover = false;
      const stack = readStack();
      listEl.textContent = "";
      const head = document.createElement("div");
      head.className = `${NS$1}-head`;
      head.textContent = stack.length ? `来时路 · ${stack.length} 层` : "还没有来时路 · 当前是起点";
      listEl.appendChild(head);
      stack.forEach((entry, i) => {
        const item = document.createElement("div");
        item.className = `${NS$1}-item`;
        item.title = entry.title;
        const num2 = document.createElement("span");
        num2.className = `${NS$1}-num`;
        num2.textContent = String(stack.length - i);
        const title = document.createElement("span");
        title.className = `${NS$1}-title`;
        title.textContent = entry.title;
        item.append(num2, title);
        if (entry.t > 5) {
          const tm = document.createElement("span");
          tm.className = `${NS$1}-time`;
          tm.textContent = fmtTime(entry.t);
          item.appendChild(tm);
        }
        item.addEventListener("click", () => jumpToUrl(entry.url));
        listEl.appendChild(item);
      });
      nowRow = document.createElement("div");
      nowRow.className = `${NS$1}-item ${NS$1}-now`;
      const num = document.createElement("span");
      num.className = `${NS$1}-num`;
      num.textContent = "0";
      nowTitleEl = document.createElement("span");
      nowTitleEl.className = `${NS$1}-title`;
      const bars = document.createElement("span");
      bars.className = `${NS$1}-bars`;
      bars.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
      nowRow.append(num, nowTitleEl, bars);
      listEl.appendChild(nowRow);
      updateNowRow();
      listEl.scrollTop = listEl.scrollHeight;
    }
    document.addEventListener("play", updateNowRow, true);
    document.addEventListener("pause", updateNowRow, true);
    function onReady(backRestore = false) {
      dedupeOnArrival(backRestore);
      renderChip();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => onReady());
    else onReady();
    window.addEventListener("pageshow", (e) => {
      if (!e.persisted) return;
      leavingViaJump = false;
      onReady(true);
    });
  }
  const wayBack = {
    id: "way-back",
    name: "回程",
    description: "视频页左下角回退栈：记住来时路，点一下跳回上一个视频并续播（顶层与抽屉内都生效）",
    category: "播放",
    defaultEnabled: true,
    runAt: "start",
    // 需在 B 站用 pushState 跳视频之前包上
    settings: [
      { key: "resumeTime", type: "toggle", label: "跳回时续播", default: true, hint: "跳回上一个视频时带上离开时的播放进度（?t=），从原处接着看" }
    ],
    init
  };
  const NS = "bk";
  const NEWTAB_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
  const CLOSE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  const CSS = `
/* 按钮体**跟随页面主题**（--bg1/--text2）：浅色页浅按钮、深色页深按钮。
   凸显靠**阴影随主题反相**：浅色→黑色投影压出立体，深色→白色辉光(halo)把深按钮从暗遮罩里托起来（见 @media dark）。 */
.${NS}-dctrls button{ width:40px; height:40px; border-radius:50%; padding:0; display:flex; align-items:center; justify-content:center; border:1px solid var(--line_regular,#e3e5e7); background:var(--bg1,#fff); color:var(--text2,#61666d); cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.5); transition:color .16s ease, transform .16s ease, box-shadow .16s ease, opacity .18s ease; }
.${NS}-dctrls button:hover{ color:var(--brand_blue,#00aeec); transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,.6); }
.${NS}-dctrls button:active{ transform:scale(.94); }
/* 深色模式：按钮体仍跟主题（深底），阴影反相为白色辉光，把深按钮从暗遮罩里托起来 */
@media (prefers-color-scheme: dark){ .${NS}-dctrls button{ box-shadow:0 0 8px rgba(255,255,255,.45); } .${NS}-dctrls button:hover{ box-shadow:0 0 12px rgba(255,255,255,.6); } }
@keyframes bk-dspin{ to{ transform:rotate(360deg); } }
.${NS}-dmask{ position:fixed; inset:0; z-index:100000; background:rgba(0,0,0,.5); opacity:0; pointer-events:none; transition:opacity .3s ease; }
.${NS}-dmask.on{ opacity:1; pointer-events:auto; }
.${NS}-drawer{ position:fixed; left:0; right:0; bottom:0; height:calc(100% - 64px); z-index:100001; display:flex; flex-direction:column; background:var(--bg1,#fff); border-radius:14px 14px 0 0; box-shadow:0 -8px 40px rgba(0,0,0,.35); transform:translateY(100%); transition:transform .32s cubic-bezier(.32,.72,0,1); overflow:hidden; }
.${NS}-drawer.on{ transform:translateY(0); }
.${NS}-drawer.parked{ visibility:hidden; }
.${NS}-dframe{ flex:1; width:100%; border:0; display:block; }
.${NS}-dload{ position:absolute; inset:0; z-index:1; display:flex; align-items:center; justify-content:center; background:#18191c; opacity:0; pointer-events:none; transition:opacity .3s ease; }
.${NS}-drawer.loading .${NS}-dload{ opacity:1; }
.${NS}-dload-cover{ position:absolute; inset:0; background-size:cover; background-position:center; filter:blur(24px) brightness(.6); transform:scale(1.1); }
.${NS}-dspin{ position:relative; width:42px; height:42px; border:3px solid rgba(255,255,255,.2); border-top-color:var(--brand_blue,#00aeec); border-radius:50%; animation:bk-dspin .8s linear infinite; }
@media (prefers-color-scheme: light){ .${NS}-dload{ background:#f4f4f5; } .${NS}-dspin{ border-color:rgba(0,0,0,.12); border-top-color:var(--brand_blue,#00aeec); } }
.${NS}-dctrls{ position:fixed; top:14px; right:18px; z-index:100002; display:flex; gap:10px; opacity:0; pointer-events:none; transition:opacity .3s ease; }
.${NS}-dctrls.on{ opacity:1; pointer-events:auto; }
`;
  let styled = false;
  let mask = null;
  let panel = null;
  let frame = null;
  let ctrls = null;
  let loadCover = null;
  let closeTimer = null;
  let loadTimer = null;
  let drawerOpen = false;
  let curUrl = "";
  let curWebFull = false;
  let curImmersive = false;
  let gotReady = false;
  let gotWebfull = false;
  let historyActive = false;
  let historyOwned = false;
  let historyClosing = false;
  let historyOriginUrl = "";
  let historyOriginState = null;
  let activeRoute = null;
  let historyCloseFallback = null;
  let pendingOpen = null;
  let frameToken = "";
  let frameRouteToken = "";
  let framePublicUrl = "";
  let frameWebFull = false;
  let frameReady = false;
  let pendingFrameReplace = null;
  let queuedFrameReplace = null;
  let suspendRetryTimer = null;
  const FRAME_LANDING_TIMEOUT = 15e3;
  const nativePushState = History.prototype.pushState;
  const nativeReplaceState = History.prototype.replaceState;
  function newHistoryToken() {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }
  }
  function displayUrlFor(route) {
    return drawerDisplayUrl(route.url, location.href) || location.href;
  }
  function replaceDrawerHistory(route) {
    try {
      const state = withDrawerRoute(history.state, route);
      nativeReplaceState.call(history, state, "", displayUrlFor(route));
      activeRoute = route;
      historyActive = true;
      historyOwned = true;
      return true;
    } catch {
      return false;
    }
  }
  function pushDrawerHistory(route) {
    historyOriginUrl = location.href;
    historyOriginState = history.state;
    try {
      nativeReplaceState.call(history, withDrawerOrigin(historyOriginState, route.token), "", historyOriginUrl);
      nativePushState.call(history, withDrawerRoute(historyOriginState, route), "", displayUrlFor(route));
      activeRoute = route;
      historyActive = true;
      historyOwned = true;
      return true;
    } catch {
      try {
        nativeReplaceState.call(history, historyOriginState, "", historyOriginUrl);
      } catch {
      }
      historyActive = false;
      historyOwned = false;
      return false;
    }
  }
  function syncDrawerHistory(url) {
    if (!drawerOpen || historyClosing || !historyActive || !activeRoute) return;
    const expectedOrigin = new URL(activeRoute.url, location.href).origin;
    const publicUrl = safeDrawerVideoUrl(url, expectedOrigin);
    if (!publicUrl) return;
    curUrl = publicUrl;
    framePublicUrl = publicUrl;
    replaceDrawerHistory({ ...activeRoute, url: publicUrl });
  }
  function finishHistoryClose() {
    if (historyCloseFallback) {
      clearTimeout(historyCloseFallback);
      historyCloseFallback = null;
    }
    historyClosing = false;
    historyActive = false;
    try {
      nativeReplaceState.call(history, historyOriginState, "", historyOriginUrl);
    } catch {
    }
    const next = pendingOpen;
    pendingOpen = null;
    if (next) queueMicrotask(() => openDrawer(next.url, next.cover, next.webFull, next.immersive));
  }
  function consumeDrawerHistory() {
    if (!historyOwned || !historyActive || !activeRoute || historyClosing) return;
    historyClosing = true;
    replaceDrawerHistory(activeRoute);
    try {
      history.back();
    } catch {
      finishHistoryClose();
      return;
    }
    historyCloseFallback = setTimeout(() => {
      if (!historyClosing) return;
      historyOwned = false;
      finishHistoryClose();
    }, 1200);
  }
  function tryReveal() {
    var _a;
    if (!drawerOpen) return false;
    if (!gotReady) return false;
    if (curWebFull && curImmersive && !gotWebfull) return false;
    setLoading(false);
    try {
      frame == null ? void 0 : frame.focus({ preventScroll: true });
    } catch {
    }
    try {
      (_a = frameWin()) == null ? void 0 : _a.focus();
    } catch {
    }
    return true;
  }
  function frameWin() {
    try {
      return (frame == null ? void 0 : frame.contentWindow) || null;
    } catch {
      return null;
    }
  }
  function postFrameCommand(type) {
    var _a;
    if (!frame || !frameToken || !framePublicUrl) return;
    let origin;
    try {
      origin = new URL(framePublicUrl, location.href).origin;
    } catch {
      return;
    }
    try {
      (_a = frame.contentWindow) == null ? void 0 : _a.postMessage({ type, token: frameToken }, origin);
    } catch {
    }
  }
  function stopSuspendRetries() {
    if (suspendRetryTimer) {
      clearInterval(suspendRetryTimer);
      suspendRetryTimer = null;
    }
  }
  function suspendFrameWithRetry() {
    stopSuspendRetries();
    postFrameCommand("bk-drawer-suspend");
    let left = 12;
    suspendRetryTimer = setInterval(() => {
      if (drawerOpen || --left <= 0) {
        stopSuspendRetries();
        return;
      }
      postFrameCommand("bk-drawer-suspend");
    }, 150);
  }
  function cancelPendingFrameReplace() {
    if (!pendingFrameReplace) return;
    if (pendingFrameReplace.timer) clearTimeout(pendingFrameReplace.timer);
    pendingFrameReplace = null;
  }
  function rebuildFrameDocument(route, marked) {
    cancelPendingFrameReplace();
    queuedFrameReplace = null;
    const previous = frame;
    if (previous == null ? void 0 : previous.isConnected) previous.remove();
    frame = createFrame();
    if (loadCover) loadCover.style.backgroundImage = route.cover ? `url("${route.cover}")` : "";
    setLoading(true);
    finishFrameReplace(route, marked);
    panel.insertBefore(frame, panel.firstChild);
  }
  function armFrameLandingWatchdog(pending) {
    if (pending.phase !== "navigate") return;
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      if (pendingFrameReplace !== pending) return;
      if (!drawerOpen) {
        pending.timer = null;
        return;
      }
      const fallback = queuedFrameReplace || { route: pending.route, marked: pending.marked };
      rebuildFrameDocument(fallback.route, fallback.marked);
    }, FRAME_LANDING_TIMEOUT);
  }
  function finishFrameReplace(route, marked, fresh, nextToken = newHistoryToken()) {
    cancelPendingFrameReplace();
    frameRouteToken = route.token;
    frameToken = nextToken;
    framePublicUrl = route.url;
    frameWebFull = route.webFull;
    frameReady = false;
    gotReady = false;
    gotWebfull = false;
    frame.name = drawerFrameName({ token: frameToken, webFull: route.webFull });
    {
      frame.src = marked;
    }
  }
  function acceptFrameReplace(pending) {
    if (pending.phase !== "navigate" || !pending.nextToken || pending.accepted) return;
    pending.accepted = true;
    frameRouteToken = pending.route.token;
    frameToken = pending.nextToken;
    framePublicUrl = pending.route.url;
    frameWebFull = pending.route.webFull;
    frameReady = false;
    gotReady = false;
    gotWebfull = false;
    frame.name = drawerFrameName({ token: frameToken, webFull: frameWebFull });
  }
  function recoverFrameReplace(route) {
    if ((pendingFrameReplace == null ? void 0 : pendingFrameReplace.route) !== route) return;
    const failedPhase = pendingFrameReplace.phase;
    cancelPendingFrameReplace();
    if (failedPhase === "suspend" && !frameReady && drawerOpen) {
      const fallback = queuedFrameReplace || { route, marked: route.url.split("#")[0] + (route.webFull ? DRAWER_WEB_MARK : DRAWER_MARK) };
      rebuildFrameDocument(fallback.route, fallback.marked);
      return;
    }
    if ((activeRoute == null ? void 0 : activeRoute.token) === route.token && activeRoute.url === route.url && framePublicUrl) {
      const restored = { ...activeRoute, url: framePublicUrl, webFull: frameWebFull };
      activeRoute = restored;
      curUrl = restored.url;
      curWebFull = restored.webFull;
      if (drawerOpen && historyActive && !historyClosing) replaceDrawerHistory(restored);
    }
    const queued = queuedFrameReplace;
    queuedFrameReplace = null;
    if (drawerOpen && queued) {
      replaceFrameDocument(queued.route, queued.marked, false);
      return;
    }
    setLoading(false);
    if (drawerOpen && frameReady && tryReveal()) postFrameCommand("bk-drawer-resume");
  }
  function requestFrameReplace(route, marked) {
    var _a;
    const previousToken = frameToken;
    let previousOrigin;
    try {
      previousOrigin = new URL(framePublicUrl, location.href).origin;
    } catch {
      recoverFrameReplace(route);
      return;
    }
    const nextToken = newHistoryToken();
    if (pendingFrameReplace == null ? void 0 : pendingFrameReplace.timer) clearTimeout(pendingFrameReplace.timer);
    pendingFrameReplace = { route, marked, phase: "navigate", nextToken, accepted: false, timer: null };
    armFrameLandingWatchdog(pendingFrameReplace);
    try {
      (_a = frame.contentWindow) == null ? void 0 : _a.postMessage({
        type: "bk-drawer-replace",
        token: previousToken,
        nextToken,
        url: marked,
        webFull: route.webFull
      }, previousOrigin);
    } catch {
      recoverFrameReplace(route);
    }
  }
  function replaceFrameDocument(route, marked, fresh) {
    cancelPendingFrameReplace();
    if (loadCover) loadCover.style.backgroundImage = route.cover ? `url("${route.cover}")` : "";
    setLoading(true);
    if (fresh) {
      finishFrameReplace(route, marked);
      return;
    }
    const timer = setTimeout(() => {
      if ((pendingFrameReplace == null ? void 0 : pendingFrameReplace.route) !== route) return;
      recoverFrameReplace(route);
    }, 350);
    pendingFrameReplace = { route, marked, phase: "suspend", timer };
    postFrameCommand("bk-drawer-suspend");
  }
  function setLoading(on) {
    panel == null ? void 0 : panel.classList.toggle("loading", on);
    if (loadTimer) {
      clearTimeout(loadTimer);
      loadTimer = null;
    }
    if (on) loadTimer = setTimeout(() => setLoading(false), 6e3);
  }
  function createFrame() {
    const f = document.createElement("iframe");
    f.className = `${NS}-dframe`;
    f.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write";
    f.allowFullscreen = true;
    f.setAttribute("sandbox", "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-modals allow-downloads");
    f.addEventListener("load", () => {
      if (!drawerOpen && f === frame) postFrameCommand("bk-drawer-suspend");
    });
    return f;
  }
  function ensureDom() {
    if (mask) return;
    if (!styled) {
      styled = true;
      const s = document.createElement("style");
      s.textContent = CSS;
      (document.head || document.documentElement).appendChild(s);
    }
    mask = document.createElement("div");
    mask.className = `${NS}-dmask`;
    panel = document.createElement("div");
    panel.className = `${NS}-drawer`;
    window.addEventListener("message", (e) => {
      if (e.source !== frameWin()) return;
      const route = activeRoute;
      if (!route || !e.data || typeof e.data !== "object") return;
      const pendingAtArrival = pendingFrameReplace;
      const fromCurrentDocument = e.data.token === frameToken;
      const fromPendingDocument = (pendingAtArrival == null ? void 0 : pendingAtArrival.phase) === "navigate" && e.data.token === pendingAtArrival.nextToken;
      if (!fromCurrentDocument && !fromPendingDocument) return;
      let expectedOrigin;
      try {
        expectedOrigin = new URL(fromPendingDocument ? pendingAtArrival.route.url : framePublicUrl, location.href).origin;
      } catch {
        return;
      }
      if (e.origin !== expectedOrigin) return;
      if (fromPendingDocument && (pendingAtArrival == null ? void 0 : pendingAtArrival.nextToken)) {
        acceptFrameReplace(pendingAtArrival);
        cancelPendingFrameReplace();
        const queued = queuedFrameReplace;
        queuedFrameReplace = null;
        if (drawerOpen && queued) {
          replaceFrameDocument(queued.route, queued.marked, false);
          return;
        }
      }
      if (e.data.type === "bk-drawer-ready") {
        if (pendingFrameReplace) return;
        frameReady = true;
        gotReady = true;
        if (!drawerOpen) postFrameCommand("bk-drawer-suspend");
        else if (tryReveal()) postFrameCommand("bk-drawer-resume");
      } else if (e.data.type === "bk-drawer-suspended") {
        stopSuspendRetries();
        const pending = pendingFrameReplace;
        if ((pending == null ? void 0 : pending.phase) === "suspend" && drawerOpen) requestFrameReplace(pending.route, pending.marked);
      } else if (e.data.type === "bk-drawer-replacing" && (pendingFrameReplace == null ? void 0 : pendingFrameReplace.phase) === "navigate" && e.data.nextToken === pendingFrameReplace.nextToken) {
        const pending = pendingFrameReplace;
        acceptFrameReplace(pending);
      } else if (e.data.type === "bk-drawer-replace-failed" && (pendingFrameReplace == null ? void 0 : pendingFrameReplace.phase) === "navigate" && e.data.nextToken === pendingFrameReplace.nextToken) {
        recoverFrameReplace(pendingFrameReplace.route);
      } else if (e.data.type === "bk-drawer-navigating" && typeof e.data.url === "string" && typeof e.data.nextToken === "string" && /^[0-9a-z-]{8,}$/i.test(e.data.nextToken)) {
        const expectedOrigin2 = new URL(framePublicUrl, location.href).origin;
        const publicUrl = safeDrawerVideoUrl(e.data.url, expectedOrigin2);
        if (!publicUrl) return;
        const superseded = pendingFrameReplace;
        const latestParentTarget = drawerOpen ? queuedFrameReplace || (superseded ? { route: superseded.route, marked: superseded.marked } : null) : null;
        cancelPendingFrameReplace();
        const internalRoute = {
          ...route,
          token: frameRouteToken || route.token,
          url: publicUrl,
          webFull: frameWebFull
        };
        const internalMarked = publicUrl.split("#")[0] + (internalRoute.webFull ? DRAWER_WEB_MARK : DRAWER_MARK);
        pendingFrameReplace = {
          route: internalRoute,
          marked: internalMarked,
          phase: "navigate",
          nextToken: e.data.nextToken,
          accepted: false,
          timer: null
        };
        armFrameLandingWatchdog(pendingFrameReplace);
        acceptFrameReplace(pendingFrameReplace);
        const sameAsParent = (latestParentTarget == null ? void 0 : latestParentTarget.route.url) === publicUrl && latestParentTarget.route.webFull === internalRoute.webFull;
        queuedFrameReplace = sameAsParent ? null : latestParentTarget;
        if (!queuedFrameReplace) {
          curUrl = publicUrl;
          activeRoute = internalRoute;
          if (drawerOpen && historyActive && !historyClosing) replaceDrawerHistory(internalRoute);
        }
        if (drawerOpen) setLoading(true);
      } else if (e.data.type === "bk-drawer-webfull") {
        if (pendingFrameReplace) return;
        gotWebfull = true;
        if (tryReveal()) postFrameCommand("bk-drawer-resume");
      } else if (e.data.type === "bk-drawer-reveal-timeout") {
        if (pendingFrameReplace) return;
        gotWebfull = true;
        if (drawerOpen && gotReady && tryReveal()) postFrameCommand("bk-drawer-resume");
      } else if (e.data.type === "bk-drawer-close") closeDrawer();
      else if (e.data.type === "bk-drawer-location" && typeof e.data.url === "string") {
        if (!pendingFrameReplace) syncDrawerHistory(e.data.url);
      }
    });
    window.addEventListener("popstate", (e) => {
      const stateRoute = readDrawerRoute(e.state);
      const token = (activeRoute == null ? void 0 : activeRoute.token) || "";
      const route = (stateRoute == null ? void 0 : stateRoute.token) === token ? stateRoute : null;
      const atOrigin = !!token && (readDrawerOrigin(e.state) === token || !route && location.href === historyOriginUrl);
      if (historyClosing) {
        e.stopImmediatePropagation();
        if (atOrigin) {
          finishHistoryClose();
          return;
        }
        try {
          history.back();
        } catch {
          finishHistoryClose();
        }
        return;
      }
      if (route) {
        e.stopImmediatePropagation();
        historyActive = true;
        historyOwned = true;
        activeRoute = route;
        showDrawer(route);
        return;
      }
      if (!historyActive && historyOwned && activeRoute) {
        const display = drawerDisplayUrl(activeRoute.url, historyOriginUrl);
        if (display === location.href) {
          e.stopImmediatePropagation();
          replaceDrawerHistory(activeRoute);
          showDrawer(activeRoute);
          return;
        }
      }
      if (historyActive && historyOwned) {
        e.stopImmediatePropagation();
        historyActive = false;
        try {
          nativeReplaceState.call(history, historyOriginState, "", historyOriginUrl);
        } catch {
        }
        hideDrawer();
        return;
      }
      if (panel == null ? void 0 : panel.classList.contains("on")) {
        queueMicrotask(() => {
          activeRoute = null;
          hideDrawer();
        });
      }
    }, true);
    setInterval(() => {
      var _a;
      if (!drawerOpen || !historyActive || historyClosing || !activeRoute) return;
      if (((_a = readDrawerRoute(history.state)) == null ? void 0 : _a.token) === activeRoute.token) return;
      replaceDrawerHistory(activeRoute);
    }, 500);
    const load2 = document.createElement("div");
    load2.className = `${NS}-dload`;
    loadCover = document.createElement("div");
    loadCover.className = `${NS}-dload-cover`;
    const spinner = document.createElement("div");
    spinner.className = `${NS}-dspin`;
    load2.append(loadCover, spinner);
    panel.appendChild(load2);
    ctrls = document.createElement("div");
    ctrls.className = `${NS}-dctrls`;
    ctrls.innerHTML = `<button class="bk-newtab" title="在新标签页打开" aria-label="在新标签页打开">${NEWTAB_SVG}</button><button class="bk-close" title="关闭" aria-label="关闭">${CLOSE_SVG}</button>`;
    ctrls.querySelector(".bk-newtab").addEventListener("click", () => {
      if (curUrl) {
        openBiliKitVideoTab(
          curUrl,
          get(NEW_TAB_HISTORY_FLATTEN_KEY, DEFAULT_NEW_TAB_HISTORY_FLATTEN)
        );
      }
      closeDrawer();
    });
    ctrls.querySelector(".bk-close").addEventListener("click", closeDrawer);
    mask.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && (panel == null ? void 0 : panel.classList.contains("on"))) closeDrawer();
    });
    document.body.append(mask, panel, ctrls);
  }
  function showDrawer(route) {
    ensureDom();
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    drawerOpen = true;
    panel.classList.remove("parked");
    curUrl = route.url;
    curWebFull = route.webFull;
    curImmersive = route.immersive;
    const marked = route.url.split("#")[0] + (route.webFull ? DRAWER_WEB_MARK : DRAWER_MARK);
    const fresh = !frame;
    if (!frame) frame = createFrame();
    const irreversibleReplace = (pendingFrameReplace == null ? void 0 : pendingFrameReplace.phase) === "navigate" ? pendingFrameReplace : null;
    if (irreversibleReplace) {
      const sameTarget = irreversibleReplace.route.url === route.url && irreversibleReplace.route.webFull === route.webFull;
      queuedFrameReplace = sameTarget ? null : { route, marked };
      if (!irreversibleReplace.timer) armFrameLandingWatchdog(irreversibleReplace);
      setLoading(true);
    } else {
      cancelPendingFrameReplace();
      const reuseLoadedDocument = frameReady && canReuseDrawerDocument(
        { token: frameRouteToken, url: framePublicUrl, webFull: frameWebFull },
        route
      );
      const alreadyNavigating = !frameReady && frameRouteToken === route.token && framePublicUrl === route.url && frameWebFull === route.webFull;
      if (alreadyNavigating) {
        setLoading(true);
      } else if (!reuseLoadedDocument) {
        replaceFrameDocument(route, marked, fresh);
      } else {
        if (tryReveal()) postFrameCommand("bk-drawer-resume");
      }
    }
    if (fresh) panel.insertBefore(frame, panel.firstChild);
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(() => {
      mask.classList.add("on");
      panel.classList.add("on");
      ctrls.classList.add("on");
    });
  }
  function openDrawer(url, cover = "", webFull = false, immersive = false) {
    if (historyClosing) {
      pendingOpen = { url, cover, webFull, immersive };
      return;
    }
    const existing = historyActive ? activeRoute : null;
    const route = {
      // history 会话 token 跨 Document 沿用；window.name 里的 Document nonce 每次换页更新。
      token: (existing == null ? void 0 : existing.token) || frameRouteToken || newHistoryToken(),
      url,
      cover,
      webFull,
      immersive
    };
    if (existing) {
      replaceDrawerHistory(route);
    } else {
      activeRoute = route;
      pushDrawerHistory(route);
    }
    showDrawer(route);
  }
  function hideDrawer() {
    if (!panel || !mask || !ctrls) return;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    drawerOpen = false;
    queuedFrameReplace = null;
    if ((pendingFrameReplace == null ? void 0 : pendingFrameReplace.phase) === "suspend") cancelPendingFrameReplace();
    suspendFrameWithRetry();
    try {
      frame == null ? void 0 : frame.blur();
    } catch {
    }
    try {
      window.focus();
    } catch {
    }
    mask.classList.remove("on");
    panel.classList.remove("on");
    ctrls.classList.remove("on");
    setLoading(false);
    document.documentElement.style.overflow = "";
    closeTimer = setTimeout(() => {
      if (drawerOpen) return;
      panel == null ? void 0 : panel.classList.add("parked");
    }, 340);
  }
  function closeDrawer() {
    hideDrawer();
    if (historyOwned && historyActive) consumeDrawerHistory();
  }
  const PC_HOSTS = ["https://api.bilibili.com", "https://s1.hdslb.com", "https://i0.hdslb.com", "https://i1.hdslb.com", "https://i2.hdslb.com"];
  const PC_WINDOW = 12e3;
  let lastPc = -Infinity;
  let pcLinks = [];
  function preconnect() {
    const now = performance.now();
    if (now - lastPc < PC_WINDOW) return;
    lastPc = now;
    pcLinks.forEach((l) => l.remove());
    pcLinks = PC_HOSTS.map((href) => {
      const l = document.createElement("link");
      l.rel = "preconnect";
      l.href = href;
      document.head.appendChild(l);
      return l;
    });
  }
  function isVideoUrl(u) {
    try {
      const url = new URL(u, location.href);
      if (!/(^|\.)bilibili\.com$/.test(url.hostname)) return false;
      return /^\/video\/(BV[0-9A-Za-z]+|av\d+)/i.test(url.pathname) || /^\/bangumi\/play\/(ep|ss)\d+/i.test(url.pathname);
    } catch {
      return false;
    }
  }
  function resolve(target) {
    if (target.closest(".bk-feed-noopen")) return null;
    const pick = (root2, url) => {
      const img = root2.querySelector("img");
      return { url, cover: img && (img.currentSrc || img.src) || "" };
    };
    const a = target.closest("a[href]");
    if (a && isVideoUrl(a.href)) return pick(a, a.href.split("#")[0]);
    const card = target.closest("[data-bvid]");
    if (card && card.dataset.bvid && !target.closest(".bk-feed-face, .bk-feed-up")) {
      return pick(card, `https://www.bilibili.com/video/${card.dataset.bvid}`);
    }
    return null;
  }
  function installSiteDrawer() {
    if (window.__BILIKIT_SITE_DRAWER__) return;
    if (window.top !== window.self) return;
    window.__BILIKIT_SITE_DRAWER__ = true;
    document.addEventListener("click", (e) => {
      if (isPlayPage()) return;
      const mode = get("feed.openMode", DEFAULT_OPEN_MODE);
      if (mode === "current") return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const hit = resolve(e.target);
      if (!hit) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (mode === "newtab") {
        openBiliKitVideoTab(
          hit.url,
          get(NEW_TAB_HISTORY_FLATTEN_KEY, DEFAULT_NEW_TAB_HISTORY_FLATTEN)
        );
        return;
      }
      const web = mode === "drawer-web";
      openDrawer(hit.url, hit.cover, web, web && get("feed.drawerImmersive", true));
    }, true);
    document.addEventListener("mouseover", (e) => {
      if (isPlayPage()) return;
      const mode = get("feed.openMode", DEFAULT_OPEN_MODE);
      if (mode !== "drawer" && mode !== "drawer-web") return;
      if (resolve(e.target)) preconnect();
    }, true);
  }
  const drawerFrame = window.top !== window.self ? readDrawerFrameName(window.name) : null;
  if (drawerFrame && !drawerMark(location.hash)) {
    try {
      const url = new URL(location.href);
      url.hash = drawerFrame.webFull ? DRAWER_WEB_MARK : DRAWER_MARK;
      History.prototype.replaceState.call(history, history.state, "", url.href);
    } catch {
    }
  }
  const inDrawer = window.top !== window.self && (!!drawerFrame || !!drawerMark(location.hash));
  const drawerToken = (drawerFrame == null ? void 0 : drawerFrame.token) || "";
  const drawerWebFull = (drawerFrame == null ? void 0 : drawerFrame.webFull) ?? location.hash === DRAWER_WEB_MARK;
  function setupMarkedNewTabHistoryFlatten() {
    if (!consumeHistoryFlattenTarget()) return;
    const originalPush = history.pushState.bind(history);
    const originalReplace = history.replaceState.bind(history);
    history.pushState = function(...args) {
      const target = args[2];
      if (target != null && shouldFlattenVideoNavigation(location.href, String(target))) {
        originalReplace(...args);
        return;
      }
      originalPush(...args);
    };
  }
  setupMarkedNewTabHistoryFlatten();
  function postDrawer(type, extra = {}) {
    if (!drawerToken) return;
    try {
      window.parent.postMessage({ type, token: drawerToken, ...extra }, "*");
    } catch {
    }
  }
  let suspendDrawerMedia = (_preserveResume = true) => {
  };
  syncSharedSettings();
  try {
    localStorage.setItem("bilikit:alive.core", String(Date.now()));
  } catch {
  }
  function hideDrawerChrome() {
    if (!inDrawer) return;
    const ads = [".ad-report", ".video-page-special-card-small", ".video-page-game-card-small", ".slide-ad-exp", ".activity-m-v1", ".pop-live-small-mode", ".right-bottom-banner", ".eva-banner", ".gg-floor-module", ".video-card-ad-small"];
    const s = document.createElement("style");
    s.textContent = `#biliMainHeader,.bili-header,.fixed-header,.international-header{display:none!important}` + ads.join(",") + `{display:none!important}`;
    (document.head || document.documentElement).appendChild(s);
  }
  hideDrawerChrome();
  function setupDrawerEscape() {
    if (!inDrawer) return;
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" && e.code !== "Escape" || e.isComposing) return;
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      const editing = e.composedPath().some((n) => n instanceof HTMLElement && (n.isContentEditable || n.matches("input,textarea,select")));
      if (editing) return;
      e.preventDefault();
      e.stopPropagation();
      postDrawer("bk-drawer-close");
    }, true);
  }
  setupDrawerEscape();
  function setupDrawerLocationSync() {
    if (!inDrawer) return;
    let lastUrl = "";
    let leavingDocument = false;
    let leavingPublicUrl = "";
    let leavingToken = "";
    let observedDocumentUrl = location.href;
    const mark = drawerWebFull ? DRAWER_WEB_MARK : DRAWER_MARK;
    const notify = () => {
      const url = new URL(location.href);
      if (drawerMark(url.hash)) url.hash = "";
      const href = url.href;
      if (href === lastUrl) return;
      lastUrl = href;
      postDrawer("bk-drawer-location", { url: href });
    };
    const originalReplace = history.replaceState.bind(history);
    const markedUrl = (raw) => {
      if (raw == null) return raw;
      try {
        const url = new URL(String(raw), location.href);
        if (url.origin === location.origin) url.hash = mark;
        return url.href;
      } catch {
        return raw;
      }
    };
    const newDocumentToken = () => {
      try {
        return crypto.randomUUID();
      } catch {
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      }
    };
    const replaceDocument = (raw, preserveWayBack, token = newDocumentToken(), webFull = drawerWebFull) => {
      if (leavingDocument) {
        if (!preserveWayBack && leavingPublicUrl && leavingToken) {
          postDrawer("bk-drawer-navigating", { url: leavingPublicUrl, nextToken: leavingToken });
        }
        return;
      }
      let expectedOrigin = location.origin;
      if (!preserveWayBack) {
        try {
          expectedOrigin = new URL(String(raw), location.href).origin;
        } catch {
        }
      }
      const publicUrl = safeDrawerVideoUrl(String(raw), expectedOrigin);
      if (!publicUrl || !/^[0-9a-z-]{8,}$/i.test(token)) {
        if (!preserveWayBack) postDrawer("bk-drawer-replace-failed", { nextToken: token });
        return;
      }
      const target = new URL(publicUrl);
      target.hash = webFull ? DRAWER_WEB_MARK : DRAWER_MARK;
      leavingDocument = true;
      leavingPublicUrl = publicUrl;
      leavingToken = token;
      if (preserveWayBack) {
        try {
          sessionStorage.setItem(DRAWER_DOCUMENT_NAV_KEY, publicUrl);
        } catch {
        }
      }
      suspendDrawerMedia(false);
      window.name = drawerFrameName({ token, webFull });
      try {
        location.replace(target.href);
        if (preserveWayBack) postDrawer("bk-drawer-navigating", { url: publicUrl, nextToken: token });
        if (!preserveWayBack) postDrawer("bk-drawer-replacing", { url: publicUrl, nextToken: token });
      } catch {
        leavingDocument = false;
        leavingPublicUrl = "";
        leavingToken = "";
        if (drawerToken) window.name = drawerFrameName({ token: drawerToken, webFull: drawerWebFull });
        if (preserveWayBack) {
          try {
            sessionStorage.removeItem(DRAWER_DOCUMENT_NAV_KEY);
          } catch {
          }
        } else postDrawer("bk-drawer-replace-failed", { nextToken: token });
      }
    };
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.composedPath().find((node) => node instanceof HTMLAnchorElement && !!node.href);
      if (!anchor || anchor.download || anchor.target && anchor.target !== "_self") return;
      const target = markedUrl(anchor.href);
      if (target == null || !shouldReplaceDrawerDocument(location.href, String(target))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      replaceDocument(String(target), true);
    }, true);
    history.pushState = ((state, unused, url) => {
      const next = markedUrl(url);
      if (next != null && shouldReplaceDrawerDocument(location.href, String(next))) {
        replaceDocument(String(next), true);
        return;
      }
      const result = originalReplace(state, unused, next);
      queueMicrotask(notify);
      return result;
    });
    history.replaceState = ((state, unused, url) => {
      const next = markedUrl(url);
      if (next != null && shouldReplaceDrawerDocument(location.href, String(next), true)) {
        replaceDocument(String(next), true);
        return;
      }
      const result = originalReplace(state, unused, next);
      queueMicrotask(notify);
      return result;
    });
    window.addEventListener("popstate", notify);
    window.addEventListener("hashchange", notify);
    setInterval(() => {
      if (!leavingDocument && shouldReplaceDrawerDocument(observedDocumentUrl, location.href, true)) {
        replaceDocument(location.href, true);
        return;
      }
      observedDocumentUrl = location.href;
      notify();
    }, 500);
    window.addEventListener("message", (e) => {
      var _a, _b;
      if (e.source !== window.parent || ((_a = e.data) == null ? void 0 : _a.token) !== drawerToken || ((_b = e.data) == null ? void 0 : _b.type) !== "bk-drawer-replace") return;
      if (typeof e.data.url !== "string" || typeof e.data.nextToken !== "string" || typeof e.data.webFull !== "boolean") return;
      replaceDocument(e.data.url, false, e.data.nextToken, e.data.webFull);
    });
    notify();
  }
  function setupDrawerReveal() {
    if (!inDrawer) return;
    const wantWeb = drawerWebFull;
    let readyDone = false;
    let webDone = !wantWeb;
    let bound = false;
    let clicked = false;
    let tries = 0;
    let lateReadyTimer = null;
    const focusPlayer = () => {
      var _a;
      try {
        const box = document.querySelector(".bpx-player-container");
        if (box) {
          if (!box.hasAttribute("tabindex")) box.setAttribute("tabindex", "-1");
          box.focus({ preventScroll: true });
        } else (_a = document.querySelector("video")) == null ? void 0 : _a.focus({ preventScroll: true });
      } catch {
      }
    };
    const onReady = () => {
      if (readyDone) return;
      readyDone = true;
      if (lateReadyTimer) {
        clearInterval(lateReadyTimer);
        lateReadyTimer = null;
      }
      postDrawer("bk-drawer-ready");
      focusPlayer();
      setTimeout(focusPlayer, 150);
      setTimeout(focusPlayer, 400);
    };
    const timer = setInterval(() => {
      if (!readyDone) {
        const v = document.querySelector("video");
        if (v) {
          if (v.readyState >= 2) onReady();
          else if (!bound) {
            bound = true;
            v.addEventListener("loadeddata", onReady, { once: true });
            v.addEventListener("canplay", onReady, { once: true });
          }
        }
      }
      if (!webDone) {
        if (document.querySelector('.bpx-player-container[data-screen="web"]')) {
          webDone = true;
          postDrawer("bk-drawer-webfull");
        } else if (!clicked) {
          const btn = document.querySelector(".bpx-player-ctrl-web");
          if (btn) {
            btn.click();
            clicked = true;
          }
        }
      }
      if (readyDone && webDone) clearInterval(timer);
      else if (++tries > 60) {
        clearInterval(timer);
        postDrawer("bk-drawer-reveal-timeout");
        if (!readyDone) {
          let lateTries = 0;
          lateReadyTimer = setInterval(() => {
            const video = document.querySelector("video");
            if ((video == null ? void 0 : video.readyState) && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onReady();
            if (++lateTries > 120 && lateReadyTimer) {
              clearInterval(lateReadyTimer);
              lateReadyTimer = null;
            }
          }, 500);
        }
      }
    }, 150);
  }
  setupDrawerReveal();
  function setupDrawerMediaLifecycle() {
    if (!inDrawer) return;
    let parked = false;
    let cleaned = false;
    let pauseWatchdog = null;
    const resumeSet = /* @__PURE__ */ new Set();
    const mediaElements = () => {
      const found = [...document.querySelectorAll("video,audio")];
      document.querySelectorAll("iframe").forEach((child) => {
        try {
          if (child.contentDocument) found.push(...child.contentDocument.querySelectorAll("video,audio"));
        } catch {
        }
      });
      return found;
    };
    const pauseNow = (preserveResume) => {
      var _a;
      const media = mediaElements();
      if (preserveResume) {
        media.forEach((item) => {
          if (!item.paused && !item.ended) resumeSet.add(item);
        });
      }
      try {
        const player = window.player;
        (_a = player == null ? void 0 : player.pause) == null ? void 0 : _a.call(player);
      } catch {
      }
      media.forEach((item) => {
        try {
          item.pause();
        } catch {
        }
      });
    };
    const stopPauseWatchdog = () => {
      if (pauseWatchdog) {
        clearInterval(pauseWatchdog);
        pauseWatchdog = null;
      }
    };
    const suspend = (preserveResume = true) => {
      parked = true;
      if (!preserveResume) resumeSet.clear();
      pauseNow(preserveResume);
      stopPauseWatchdog();
      let left = 12;
      pauseWatchdog = setInterval(() => {
        pauseNow(preserveResume);
        if (--left <= 0) stopPauseWatchdog();
      }, 250);
      postDrawer("bk-drawer-suspended");
    };
    const resume = () => {
      stopPauseWatchdog();
      parked = false;
      const pending = [...resumeSet];
      resumeSet.clear();
      for (const media of pending) {
        if (!media.isConnected || media.ended) continue;
        try {
          void media.play().catch(() => {
          });
        } catch {
        }
      }
    };
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      stopPauseWatchdog();
      resumeSet.clear();
      try {
        mediaElements().forEach((media) => {
          media.pause();
          media.removeAttribute("src");
          media.srcObject = null;
          media.load();
        });
      } catch {
      }
    };
    document.addEventListener("play", (e) => {
      if (!parked || !(e.target instanceof HTMLMediaElement)) return;
      resumeSet.add(e.target);
      try {
        e.target.pause();
      } catch {
      }
    }, true);
    window.addEventListener("pagehide", cleanup);
    window.addEventListener("unload", cleanup);
    window.addEventListener("message", (e) => {
      var _a;
      if (e.source !== window.parent || ((_a = e.data) == null ? void 0 : _a.token) !== drawerToken) return;
      if (e.data.type === "bk-drawer-suspend") suspend();
      else if (e.data.type === "bk-drawer-resume") resume();
    });
    suspendDrawerMedia = suspend;
  }
  setupDrawerMediaLifecycle();
  setupDrawerLocationSync();
  suspendDrawerMedia(false);
  register(
    cdnPick,
    themeSync,
    commentLocation,
    wakeLock,
    noLogin,
    // 注册在 cdn-pick 之后：其 fetch/XHR 与 __playinfo__ hook 需叠在最外层（改请求；cdn-pick 改响应 host）
    wayBack
    // 视频页回退栈胶囊（顶层 + 抽屉 iframe）
  );
  runAll();
  installSiteDrawer();
  mountPanel();

})();
