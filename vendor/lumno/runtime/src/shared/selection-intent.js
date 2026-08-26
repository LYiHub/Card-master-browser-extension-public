(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSelectionIntent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const ACTIONS = Object.freeze([
    'ask',
    'translate',
    'explain',
    'summarize',
    'search',
    'calculate'
  ]);
  const MAX_SELECTION_LENGTH = 2400;
  const MIN_SELECTION_LENGTH = 2;
  const LOW_INTENT_ENGLISH_TERMS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by',
    'for', 'from', 'had', 'has', 'have', 'he', 'her', 'here', 'hers', 'him',
    'his', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'me', 'more', 'my',
    'no', 'not', 'of', 'on', 'or', 'our', 'ours', 'she', 'so', 'that', 'the',
    'their', 'theirs', 'them', 'there', 'these', 'they', 'this', 'those', 'to',
    'too', 'up', 'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
    'who', 'why', 'with', 'you', 'your', 'yours'
  ]);
  const LOW_INTENT_CJK_TERMS = new Set([
    '这个', '那个', '这些', '那些', '这里', '那里', '我们', '你们', '他们',
    '可以', '需要', '已经', '现在', '更多', '其他', '内容', '资料',
    'これ', 'それ', 'あれ', 'ここ', 'そこ', 'こちら', 'もっと'
  ]);

  function normalizeText(value) {
    return String(value || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function normalizeLocale(value) {
    const locale = String(value || '').replace(/_/g, '-').toLowerCase();
    if (locale.startsWith('zh')) {
      return 'zh';
    }
    if (locale.startsWith('ja')) {
      return 'ja';
    }
    return 'en';
  }

  function countMatches(text, pattern) {
    const matches = String(text || '').match(pattern);
    return matches ? matches.length : 0;
  }

  function getScriptStats(text) {
    const source = String(text || '');
    const latin = countMatches(source, /[A-Za-z\u00C0-\u024F]/g);
    const han = countMatches(source, /[\u3400-\u4DBF\u4E00-\u9FFF]/g);
    const kana = countMatches(source, /[\u3040-\u30FF\u31F0-\u31FF]/g);
    const hangul = countMatches(source, /[\uAC00-\uD7AF]/g);
    const letters = latin + han + kana + hangul;
    return Object.freeze({
      latin,
      han,
      kana,
      hangul,
      letters,
      latinRatio: letters > 0 ? latin / letters : 0,
      cjkRatio: letters > 0 ? (han + kana + hangul) / letters : 0
    });
  }

  function getSymbolRatio(text) {
    const compact = String(text || '').replace(/\s/g, '');
    if (!compact) {
      return 0;
    }
    const symbols = countMatches(compact, /[^A-Za-z0-9\u00C0-\u024F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/g);
    return symbols / compact.length;
  }

  function isQuestionLike(text) {
    const source = String(text || '').trim();
    return /[?？]\s*$/.test(source) ||
      /^(?:how|why|what|when|where|who|which|can|could|would|should|is|are|do|does|did)\b/i.test(source) ||
      /^(?:为什么|为何|怎么|如何|什么|何时|哪里|谁|是否|能否|可否|有没有)/.test(source) ||
      /^(?:なぜ|どうして|どのように|何|いつ|どこ|誰)/.test(source);
  }

  function isUrlLike(text) {
    return /^(?:https?:\/\/|www\.)\S+$/i.test(String(text || '').trim());
  }

  function isEmailLike(text) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(text || '').trim());
  }

  function isErrorLike(text, options) {
    const source = String(text || '');
    const settings = options && typeof options === 'object' ? options : {};
    const structuredError = /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|Exception|Traceback|Caused by|Unhandled|ERR_[A-Z_]+|HTTP\s*[45]\d\d)\b/i.test(source) ||
      /(?:^|\n)\s*at\s+[\w$.<>]+\s*\([^\n]+:\d+(?::\d+)?\)/.test(source);
    const naturalFailure = /\b(?:cannot|failed|failure|denied|undefined|null pointer|not found|timed? out)\b/i.test(source) ||
      /(?:错误|异常|失败|无法|未定义|拒绝访问|超时)/.test(source);
    return structuredError || (naturalFailure && (settings.insideCode === true || settings.codeLike === true));
  }

  function isCodeLike(text, options) {
    const source = String(text || '');
    const settings = options && typeof options === 'object' ? options : {};
    if (settings.insideCode === true) {
      return true;
    }
    const codeKeyword = /\b(?:const|let|var|function|class|import|export|return|async|await|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|def|lambda|public|private|interface|package)\b/.test(source);
    const structuredLine = /(?:^|\n)\s{2,}\S/.test(source) || /[{}()[\];]|=>|===|!==|::/.test(source);
    return (codeKeyword && structuredLine) ||
      (source.includes('\n') && getSymbolRatio(source) >= 0.24);
  }

  function isNumericLike(text) {
    const source = String(text || '').trim();
    if (!/\d/.test(source) || source.length > 80) {
      return false;
    }
    const hasUnitOrCurrency = /(?:[$€£¥￥]\s*\d|\d\s*(?:%|°[CF]|km|cm|mm|kg|g|lb|oz|mph|km\/h|ms|s|min|h|GB|MB|TB|USD|CNY|RMB|EUR|JPY)\b)/i.test(source);
    const hasConversion = /\d\s*(?:to|in|转|换算成)\s*\w+/i.test(source);
    const hasArithmetic = /[+\-*/.^%=]/.test(source) && /^[\d\s()+\-*/.^%=]+$/.test(source);
    return hasUnitOrCurrency || hasConversion || hasArithmetic;
  }

  function isGenericUiText(text) {
    const source = String(text || '').trim();
    const lower = source.toLowerCase();
    if (LOW_INTENT_ENGLISH_TERMS.has(lower) || LOW_INTENT_CJK_TERMS.has(source)) {
      return true;
    }
    return /^(?:(?:click|tap|press)\s+(?:here|this|below)|(?:learn|read|see|show|view)\s+more|(?:next|previous|back|home)(?:\s+page)?|(?:sign|log)\s+(?:in|out|up))$/i.test(source) ||
      /^(?:continue|cancel|submit|save|close)$/i.test(source) ||
      /^welcome\s+(?:to|back)\b.+/i.test(source) ||
      /^(?:(?:点击|点按|轻触)(?:这里|此处|下方)?|(?:了解|查看|阅读)更多|下一步|上一步|返回|首页|继续|取消|提交|保存|关闭|登录|注册)$/.test(source) ||
      /^欢迎(?:访问|来到).+/.test(source) ||
      /^(?:(?:ここ|こちら)を(?:クリック|タップ)|続きを読む|次へ|前へ|戻る|続ける|キャンセル|保存|閉じる)$/.test(source);
  }

  function isMeaningfulTermLike(text, options) {
    const source = String(text || '').trim();
    const settings = options && typeof options === 'object' ? options : {};
    if (!source || settings.genericUiLike === true) {
      return false;
    }
    const latinTokens = source.match(/[A-Za-z\u00C0-\u024F][A-Za-z0-9\u00C0-\u024F+.#'’-]*/g) || [];
    const cjkCount = countMatches(source, /[\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/g);
    if (latinTokens.length === 1 && latinTokens[0].length === source.length) {
      const token = latinTokens[0];
      const lower = token.toLowerCase();
      return !LOW_INTENT_ENGLISH_TERMS.has(lower) && (
        /^[A-Z][A-Z0-9+.#-]+$/.test(token) ||
        token.length >= 3
      );
    }
    if (latinTokens.length >= 2) {
      return latinTokens.some((token) => (
        token.length >= 3 && !LOW_INTENT_ENGLISH_TERMS.has(token.toLowerCase())
      ));
    }
    return cjkCount >= 2 && cjkCount >= source.replace(/\s/g, '').length * 0.72;
  }

  function isSearchLike(text, shortTermLike) {
    if (!shortTermLike) {
      return false;
    }
    const source = String(text || '');
    return /\b(?:latest|news|price|pricing|review|reviews|release|releases|documentation|docs|official|website|status|version|download|update|updates)\b/i.test(source) ||
      /(?:最新|新闻|资讯|价格|定价|评测|测评|发布|官网|文档|版本|下载|更新)/.test(source) ||
      /(?:最新|ニュース|価格|料金|レビュー|リリース|公式|ドキュメント|バージョン|更新)/.test(source);
  }

  function getFallbackSentenceCount(text) {
    const source = String(text || '').trim();
    if (!source) {
      return 0;
    }
    const terminalCount = countMatches(source, /[。！？]/g) +
      countMatches(source, /[.!?](?:\s|$)/g);
    const trailingClause = terminalCount > 0 && !/[.!?。！？]\s*$/.test(source) ? 1 : 0;
    return Math.max(1, terminalCount + trailingClause);
  }

  function getSegmentationLocale(value) {
    const locale = String(value || '').replace(/_/g, '-').trim();
    if (!locale || typeof Intl !== 'object' || typeof Intl.getCanonicalLocales !== 'function') {
      return undefined;
    }
    try {
      return Intl.getCanonicalLocales(locale)[0];
    } catch (_error) {
      return undefined;
    }
  }

  function getTextStructureStats(text, locale) {
    const source = String(text || '');
    const sentenceSource = source.replace(/\n+/g, ' ');
    const segmentationLocale = getSegmentationLocale(locale);
    let lexicalUnits = [];
    let sentenceCount = 0;

    if (typeof Intl === 'object' && typeof Intl.Segmenter === 'function') {
      try {
        lexicalUnits = Array.from(
          new Intl.Segmenter(segmentationLocale, { granularity: 'word' }).segment(source)
        )
          .filter((segment) => segment.isWordLike === true)
          .map((segment) => segment.segment.toLowerCase());
        sentenceCount = Array.from(
          new Intl.Segmenter(segmentationLocale, { granularity: 'sentence' }).segment(sentenceSource)
        ).filter((segment) => segment.segment.trim()).length;
      } catch (_error) {
        lexicalUnits = [];
      }
    }

    if (!lexicalUnits.length && source) {
      lexicalUnits = source.match(/[A-Za-z\u00C0-\u024F0-9]+|[\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/g) || [];
      lexicalUnits = lexicalUnits.map((unit) => unit.toLowerCase());
    }
    if (sentenceCount === 0) {
      sentenceCount = getFallbackSentenceCount(sentenceSource);
    }

    const compactCharacters = Array.from(source).filter((character) => !/\s/u.test(character));
    const contentCharacterCount = compactCharacters.filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
    const lexicalUnitCount = lexicalUnits.length;
    const uniqueLexicalUnitCount = new Set(lexicalUnits).size;
    return Object.freeze({
      averageSentenceUnits: lexicalUnitCount / Math.max(1, sentenceCount),
      contentCharacterRatio: compactCharacters.length > 0
        ? contentCharacterCount / compactCharacters.length
        : 0,
      lexicalDiversity: lexicalUnitCount > 0 ? uniqueLexicalUnitCount / lexicalUnitCount : 0,
      lexicalUnitCount,
      sentenceCount,
      uniqueLexicalUnitCount
    });
  }

  function isLanguageMismatch(text, options, scriptStats, codeLike) {
    if (codeLike || !scriptStats || scriptStats.letters < 2) {
      return false;
    }
    const settings = options && typeof options === 'object' ? options : {};
    const locale = normalizeLocale(settings.uiLanguage || settings.pageLanguage);
    const wordCount = String(text || '').split(/\s+/).filter(Boolean).length;
    const singleLatinWord = /^[A-Za-z\u00C0-\u024F'-]+$/.test(text);
    const lowerSingleLatinWord = singleLatinWord && text === text.toLowerCase() && text.length >= 6;
    if (locale === 'en') {
      return scriptStats.cjkRatio >= 0.72;
    }
    if (scriptStats.latinRatio < 0.76) {
      return false;
    }
    return wordCount >= 2 || lowerSingleLatinWord;
  }

  function rankScores(scores) {
    return ACTIONS
      .map((action) => ({ action, score: Math.min(1, Math.max(0, Number(scores[action]) || 0)) }))
      .sort((left, right) => right.score - left.score);
  }

  function classifySelection(value, options) {
    const text = normalizeText(value);
    const settings = options && typeof options === 'object' ? options : {};
    const length = text.length;
    const lineCount = text ? text.split('\n').length : 0;
    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const textStructure = getTextStructureStats(
      text,
      settings.pageLanguage || settings.uiLanguage
    );
    const sentenceCount = textStructure.sentenceCount;
    const scriptStats = getScriptStats(text);
    const symbolRatio = getSymbolRatio(text);
    const urlLike = isUrlLike(text);
    const emailLike = isEmailLike(text);
    const codeLike = isCodeLike(text, settings);
    const errorLike = isErrorLike(text, { ...settings, codeLike });
    const questionLike = isQuestionLike(text);
    const numericLike = isNumericLike(text);
    const genericUiLike = isGenericUiText(text);
    const developedMultiSentenceProse = sentenceCount >= 2 &&
      textStructure.lexicalUnitCount >= 16 &&
      textStructure.averageSentenceUnits >= 6;
    const sustainedSingleSentenceProse = sentenceCount === 1 &&
      textStructure.lexicalUnitCount >= 28;
    const substantialProseLike =
      textStructure.contentCharacterRatio >= 0.7 &&
      textStructure.uniqueLexicalUnitCount >= 8 &&
      (developedMultiSentenceProse || sustainedSingleSentenceProse) &&
      !codeLike &&
      !errorLike &&
      !questionLike &&
      !numericLike &&
      !genericUiLike;
    const plainClauseLike = /^(?:这是|这个|这些|那是|那个|那些|我们|你们|他们|我在|你在|他在|她在|它在|これは|それは|あれは)/.test(text);
    const shortTermLike = length >= MIN_SELECTION_LENGTH &&
      length <= 48 &&
      lineCount === 1 &&
      wordCount <= 6 &&
      !/[.!?。！？]\s*$/.test(text) &&
      !plainClauseLike &&
      !genericUiLike &&
      symbolRatio < 0.3;
    const languageMismatch = isLanguageMismatch(text, settings, scriptStats, codeLike);
    const meaningfulTermLike = shortTermLike && isMeaningfulTermLike(text, { genericUiLike });
    const searchLike = isSearchLike(text, shortTermLike);
    const explicitIntentLike = questionLike ||
      (languageMismatch && !numericLike && !genericUiLike) ||
      (errorLike && (codeLike || !questionLike)) ||
      codeLike ||
      numericLike ||
      searchLike;
    const suppressed = !text ||
      length < MIN_SELECTION_LENGTH ||
      length > MAX_SELECTION_LENGTH ||
      urlLike ||
      emailLike ||
      settings.sensitive === true;
    const scores = Object.fromEntries(ACTIONS.map((action) => [action, 0]));

    if (!suppressed) {
      if (questionLike) {
        scores.ask = 0.9;
        scores.search = 0.2;
      }
      if (languageMismatch && !numericLike && !genericUiLike) {
        scores.translate = 0.82;
        scores.explain = Math.max(scores.explain, 0.18);
      }
      if (errorLike && (codeLike || !questionLike)) {
        scores.explain = 0.96;
        scores.search = Math.max(scores.search, 0.52);
      } else if (codeLike) {
        scores.explain = 0.84;
        scores.ask = Math.max(scores.ask, 0.2);
      }
      if (substantialProseLike) {
        scores.summarize = 0.9;
      }
      if (numericLike) {
        scores.calculate = 0.96;
        scores.ask = Math.max(scores.ask, 0.16);
      }
      if (searchLike && !numericLike && !questionLike && !errorLike) {
        scores.search = 0.88;
        scores.explain = Math.max(scores.explain, 0.24);
      } else if (meaningfulTermLike && !numericLike && !questionLike && !languageMismatch && !errorLike) {
        scores.explain = 0.5;
        scores.search = 0.46;
      }
      if (!substantialProseLike && !shortTermLike && length >= 20) {
        scores.ask = Math.max(scores.ask, 0.3);
      }
    }

    const ranked = rankScores(scores);
    const top = ranked[0];
    const second = ranked[1];
    const margin = top.score - second.score;
    const confidence = suppressed || top.score < 0.42
      ? 'low'
      : (top.score >= 0.72 && margin >= 0.16 ? 'high' : 'medium');

    return Object.freeze({
      action: top.action,
      confidence,
      margin,
      score: top.score,
      scores: Object.freeze({ ...scores }),
      suppressed,
      text,
      features: Object.freeze({
        codeLike,
        emailLike,
        errorLike,
        genericUiLike,
        languageMismatch,
        lineCount,
        meaningfulTermLike,
        numericLike,
        questionLike,
        searchLike,
        scriptStats,
        sentenceCount,
        shortTermLike,
        substantialProseLike,
        symbolRatio,
        textStructure,
        urlLike,
        wordCount
      }),
      triggerable: !suppressed && !genericUiLike && (
        explicitIntentLike ||
        meaningfulTermLike ||
        substantialProseLike
      )
    });
  }

  function buildPrompt(action, value, locale) {
    const text = normalizeText(value);
    const rawLocale = String(locale || '').replace(/_/g, '-').toLowerCase();
    const targetLocale = rawLocale.startsWith('zh-tw') ||
      rawLocale.startsWith('zh-hk') ||
      rawLocale.includes('hant')
      ? 'zh_TW'
      : normalizeLocale(locale);
    if (!text || action === 'ask') {
      return text;
    }
    const templates = {
      zh: {
        translate: '请将下面内容翻译成简体中文，只输出自然准确的译文：',
        explain: '请结合上下文解释下面内容；如果是代码或报错，请说明原因和解决方向：',
        summarize: '请用简洁的要点总结下面内容：',
        search: '请查找并解释下面这个主题，给出可靠的信息来源：',
        calculate: '请计算或换算下面的内容，并简要说明结果：'
      },
      zh_TW: {
        translate: '請將下面內容翻譯成繁體中文，只輸出自然準確的譯文：',
        explain: '請結合上下文解釋下面內容；如果是程式碼或錯誤，請說明原因和解決方向：',
        summarize: '請用簡潔的重點總結下面內容：',
        search: '請查找並解釋下面這個主題，提供可靠的資訊來源：',
        calculate: '請計算或換算下面的內容，並簡要說明結果：'
      },
      ja: {
        translate: '次の内容を自然で正確な日本語に翻訳し、訳文だけを出力してください：',
        explain: '次の内容を文脈に沿って説明してください。コードやエラーの場合は、原因と解決の方向性も示してください：',
        summarize: '次の内容を簡潔な箇条書きで要約してください：',
        search: '次のテーマを調べて説明し、信頼できる情報源を示してください：',
        calculate: '次の内容を計算または換算し、結果を簡潔に説明してください：'
      },
      en: {
        translate: 'Translate the following into natural, accurate English. Output only the translation:',
        explain: 'Explain the following in context. If it is code or an error, include the likely cause and direction for a fix:',
        summarize: 'Summarize the following as concise key points:',
        search: 'Research and explain the following topic, citing reliable sources:',
        calculate: 'Calculate or convert the following and briefly explain the result:'
      }
    };
    const prefix = (templates[targetLocale] || templates.en)[action] || templates[targetLocale].explain;
    return `${prefix}\n\n${text}`;
  }

  return Object.freeze({
    ACTIONS,
    MAX_SELECTION_LENGTH,
    MIN_SELECTION_LENGTH,
    buildPrompt,
    classifySelection,
    getScriptStats,
    normalizeLocale,
    normalizeText
  });
});
