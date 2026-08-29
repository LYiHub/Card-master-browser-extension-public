import type { ImageServiceProtocol } from './types';

export interface ImageGenerationRequestInput {
  prompt: string;
  model: string;
  /** 统一 '宽x高'（小写 x 分隔），各适配器按需转换 */
  size: string;
  count?: number;
  quality?: string;
  outputFormat?: string;
}

export interface ImageGenerationProtocolAdapter {
  readonly protocol: ImageServiceProtocol;
  readonly label: string;
  readonly description: string;
  readonly defaultBaseUrl: string;
  /** 拼接该协议的完整请求 URL */
  buildUrl(baseUrl: string): string;
  /** 构建该协议请求体 */
  buildRequestBody(input: ImageGenerationRequestInput): Record<string, unknown>;
  /** 解析响应，统一产出 { url } 或 { b64 }（至少一个），解析失败返回 null */
  parseResponse(payload: unknown): { url?: string; b64?: string } | null;
}
