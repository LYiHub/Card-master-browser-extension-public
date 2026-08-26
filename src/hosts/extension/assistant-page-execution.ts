const MAX_PAGE_EXPRESSION_LENGTH = 64 * 1024;
const MAX_PAGE_EXECUTION_OUTPUT_LENGTH = 64 * 1024;

export function validateAssistantPageExpression(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > MAX_PAGE_EXPRESSION_LENGTH
  ) {
    throw new Error(
      `expression 必须是非空字符串，且不能超过 ${MAX_PAGE_EXPRESSION_LENGTH} 个字符。`,
    );
  }
  return value.trim();
}

export function assistantPageExecutionSource(expression: string) {
  return `(() => {
  const MAX_DEPTH = 5;
  const MAX_COLLECTION_SIZE = 200;
  const MAX_OBJECT_KEYS = 200;
  const MAX_STRING_LENGTH = 16000;
  const MAX_LOG_ENTRIES = 100;
  const seen = new WeakSet();
  const clip = (value) =>
    value.length > MAX_STRING_LENGTH
      ? value.slice(0, MAX_STRING_LENGTH) + "…"
      : value;
  const serialize = (value, depth = 0) => {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return clip(value);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint" || typeof value === "symbol") {
      return String(value);
    }
    if (typeof value === "function") return "[函数]";
    if (depth >= MAX_DEPTH) return "[达到最大深度]";
    if (value instanceof Error) {
      return {
        _type: "Error",
        name: value.name,
        message: clip(value.message || String(value)),
        stack: clip(value.stack || ""),
      };
    }
    if (value instanceof Date) return value.toISOString();
    if (value instanceof RegExp) return value.toString();
    if (typeof Promise !== "undefined" && value instanceof Promise) {
      return "[Promise 对象]";
    }
    if (
      typeof Element !== "undefined" &&
      value instanceof Element
    ) {
      const bounds = value.getBoundingClientRect();
      return {
        _type: "Element",
        tag: value.localName,
        id: value.id || null,
        classes: Array.from(value.classList).slice(0, 24),
        text: clip((value.textContent || "").replace(/\\s+/g, " ").trim()),
        rect: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
      };
    }
    if (typeof Node !== "undefined" && value instanceof Node) {
      return {
        _type: "Node",
        nodeType: value.nodeType,
        nodeName: value.nodeName,
        text: clip((value.textContent || "").replace(/\\s+/g, " ").trim()),
      };
    }
    if (value instanceof ArrayBuffer) {
      return { _type: "ArrayBuffer", byteLength: value.byteLength };
    }
    if (ArrayBuffer.isView(value)) {
      return {
        _type: value.constructor.name,
        byteLength: value.byteLength,
      };
    }
    if (value instanceof Map) {
      return {
        _type: "Map",
        entries: Array.from(value.entries())
          .slice(0, MAX_COLLECTION_SIZE)
          .map(([key, entry]) => [
            serialize(key, depth + 1),
            serialize(entry, depth + 1),
          ]),
      };
    }
    if (value instanceof Set) {
      return {
        _type: "Set",
        values: Array.from(value.values())
          .slice(0, MAX_COLLECTION_SIZE)
          .map((entry) => serialize(entry, depth + 1)),
      };
    }
    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_COLLECTION_SIZE)
        .map((entry) => serialize(entry, depth + 1));
    }
    if (typeof value === "object") {
      if (seen.has(value)) return "[循环引用]";
      seen.add(value);
      const result = {};
      for (const key of Object.keys(value).slice(0, MAX_OBJECT_KEYS)) {
        try {
          result[key] = serialize(value[key], depth + 1);
        } catch (error) {
          result[key] = "[读取属性失败：" +
            (error instanceof Error ? error.message : String(error)) +
            "]";
        }
      }
      return result;
    }
    return String(value);
  };
  const logs = [];
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  };
  const capture = (level) => (...args) => {
    if (logs.length < MAX_LOG_ENTRIES) {
      logs.push({
        level,
        args: args.map((value) => serialize(value)),
      });
    }
  };
  console.log = capture("log");
  console.warn = capture("warn");
  console.error = capture("error");
  console.info = capture("info");
  console.debug = capture("debug");
  try {
    const result = (${expression});
    return {
      success: true,
      result: serialize(result),
      logs,
      url:
        typeof location === "undefined"
          ? ""
          : location.href,
    };
  } catch (error) {
    return {
      success: false,
      error: serialize(
        error instanceof Error ? error : new Error(String(error)),
      ),
      logs,
      url:
        typeof location === "undefined"
          ? ""
          : location.href,
    };
  } finally {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
  }
})()`;
}

export function boundedAssistantPageExecutionOutput(result: unknown) {
  const output = JSON.stringify(result);
  if (output.length <= MAX_PAGE_EXECUTION_OUTPUT_LENGTH) return output;
  return JSON.stringify({
    success: false,
    truncated: true,
    error: `页面执行结果超过 ${MAX_PAGE_EXECUTION_OUTPUT_LENGTH} 个字符。`,
    preview: output.slice(0, MAX_PAGE_EXECUTION_OUTPUT_LENGTH - 512),
  });
}
