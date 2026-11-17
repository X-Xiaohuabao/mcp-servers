/**
 * 资产字节纯函数（lib/：零 jsDesign API、零副作用，同输入同输出可单测）
 * base64 编码供资产字节过 WS JSON 帧（沙箱无 Buffer/未实测 btoa，自实现）；
 * 魔数探测给 original 格式定扩展名（无需解码整图）。
 */

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Uint8Array → base64（标准字母表，带尾部 = 补位；纯 JS 实现，沙箱与 Node 行为一致） */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64_ALPHABET[(n >>> 18) & 63] + B64_ALPHABET[(n >>> 12) & 63] + B64_ALPHABET[(n >>> 6) & 63] + B64_ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64_ALPHABET[(n >>> 18) & 63] + B64_ALPHABET[(n >>> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64_ALPHABET[(n >>> 18) & 63] + B64_ALPHABET[(n >>> 12) & 63] + B64_ALPHABET[(n >>> 6) & 63] + '=';
  }
  return out;
}

/** 原图字节魔数 → 扩展名：JPEG(SOI FF D8 FF) / PNG(89 50 4E 47)；未知 → 'bin' */
export function detectImageExt(bytes: Uint8Array): 'jpg' | 'png' | 'bin' {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  return 'bin';
}
