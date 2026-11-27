var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/endpoint.ts
function upstreamModel(model) {
  const m = String(model ?? "").trim();
  if (/-pro\b|v4-pro|v4\.pro/i.test(m)) return "deepseek-v4-pro";
  return "deepseek-flash";
}
function normalizeBase(input2) {
  let s = String(input2 ?? "").trim();
  if (!s) return UPSTREAM_BASE;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  s = s.replace(/\/+$/, "");
  if (!/\/v\d/i.test(s) && !/compatible-mode/i.test(s) && !/paas\/v\d/i.test(s)) s += "/v1";
  return s;
}
function endpointOf(path, cfg2, provider = "text") {
  const key = String(cfg2.apiKey ?? "").trim();
  if (key) {
    return {
      url: `${normalizeBase(String(cfg2.baseUrl ?? ""))}${path}`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      byok: true
    };
  }
  return {
    url: `${provider === "image" ? PROXY_IMAGE : PROXY_TEXT}${path}`,
    headers: { "Content-Type": "application/json" },
    byok: false
  };
}
var PROXY_TEXT, PROXY_IMAGE, DEEPSEEK_BASE, UPSTREAM_BASE;
var init_endpoint = __esm({
  "src/lib/endpoint.ts"() {
    "use strict";
    PROXY_TEXT = "/api/ds";
    PROXY_IMAGE = "/api/sf";
    DEEPSEEK_BASE = "https://api.deepseek.com/v1";
    UPSTREAM_BASE = DEEPSEEK_BASE;
  }
});

// src/lib/watermark.ts
async function zlib(mode, bytes) {
  const isNode = typeof process !== "undefined" && Boolean(process.versions?.node);
  if (isNode) {
    const name = "node:zlib";
    const mod = await import(
      /* @vite-ignore */
      name
    );
    return mode === "inflate" ? new Uint8Array(mod.inflateSync(bytes)) : new Uint8Array(mod.deflateSync(bytes, { level: 9 }));
  }
  const g2 = globalThis;
  const Ctor = mode === "inflate" ? g2.DecompressionStream : g2.CompressionStream;
  if (!Ctor) throw new Error("\u8FD9\u4E2A\u73AF\u5883\u6CA1\u6709 zlib\uFF0C\u4E5F\u6CA1\u6709 CompressionStream");
  const stream = new Blob([bytes]).stream().pipeThrough(new Ctor("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function crc32(bytes) {
  let c = 4294967295;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function u32(n) {
  return new Uint8Array([n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255]);
}
function chunk(type, data) {
  const head = new Uint8Array([...new TextEncoder().encode(type), ...data]);
  return new Uint8Array([...u32(data.length), ...head, ...u32(crc32(head))]);
}
function isPng(bytes) {
  return PNG_SIG.every((v2, i) => bytes[i] === v2);
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
async function decodePng(buf) {
  if (!isPng(buf)) return null;
  let at = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let bitDepth = 0;
  let interlace = 0;
  const idat = [];
  while (at + 8 <= buf.length) {
    const len = buf[at] << 24 | buf[at + 1] << 16 | buf[at + 2] << 8 | buf[at + 3];
    const type = String.fromCharCode(buf[at + 4], buf[at + 5], buf[at + 6], buf[at + 7]);
    const body = buf.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      width = body[0] << 24 | body[1] << 16 | body[2] << 8 | body[3];
      height = body[4] << 24 | body[5] << 16 | body[6] << 8 | body[7];
      bitDepth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    at += 12 + len;
  }
  if (!width || !height || bitDepth !== 8 || interlace !== 0) return null;
  if (colorType !== 2 && colorType !== 6) return null;
  const channels = colorType === 6 ? 4 : 3;
  const raw = await zlib("inflate", concat(idat));
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      const v2 = filter === 0 ? line[x] : filter === 1 ? line[x] + a : filter === 2 ? line[x] + b : filter === 3 ? line[x] + (a + b >> 1) : line[x] + paeth(a, b, c);
      cur[x] = v2 & 255;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      out[d] = cur[s];
      out[d + 1] = cur[s + 1];
      out[d + 2] = cur[s + 2];
      out[d + 3] = channels === 4 ? cur[s + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, pixels: out };
}
function concat(list) {
  const total = list.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const b of list) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}
async function encodePng(img) {
  const { width, height, pixels } = img;
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(pixels.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 6, 0, 0, 0]);
  const body = await zlib("deflate", raw);
  return concat([
    new Uint8Array(PNG_SIG),
    chunk("IHDR", ihdr),
    chunk("IDAT", body),
    chunk("IEND", new Uint8Array(0))
  ]);
}
function medianOf(values) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function paperRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function patchWatermark(img, paperHex) {
  const { width: w, height: h } = img;
  const src = img.pixels;
  const out = new Uint8Array(src);
  const bx0 = Math.floor(WM_BAND.x0 * w);
  const bx1 = Math.max(bx0 + 1, Math.floor(WM_BAND.x1 * w));
  const by0 = Math.floor(WM_BAND.y0 * h);
  const rs = [];
  const gs = [];
  const bs = [];
  for (let y = by0; y < h; y++) {
    for (let x = bx0; x < bx1; x++) {
      const i = (y * w + x) * 4;
      rs.push(src[i]);
      gs.push(src[i + 1]);
      bs.push(src[i + 2]);
    }
  }
  const band = [medianOf(rs), medianOf(gs), medianOf(bs)];
  const fill = paperRgb(paperHex) ?? band;
  if (paperHex && Math.hypot(fill[0] - band[0], fill[1] - band[1], fill[2] - band[2]) > 60) {
    fill.splice(0, 3, ...band);
  }
  const px0 = Math.floor(WM_PATCH.x0 * w);
  const py0 = Math.floor(WM_PATCH.y0 * h);
  const pw = w - px0;
  const ph = h - py0;
  const featherX = Math.max(1, Math.floor(pw * WM_FEATHER.left));
  const featherY = Math.max(1, Math.floor(ph * WM_FEATHER.top));
  const mask = new Float32Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    const fy = Math.min(1, y / featherY);
    for (let x = 0; x < pw; x++) {
      const fx = Math.min(1, x / featherX);
      mask[y * pw + x] = Math.min(fx, fy);
    }
  }
  const blurred = boxBlur(mask, pw, ph, WM_BLUR);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const a = blurred[y * pw + x];
      if (a <= 2e-3) continue;
      const i = ((py0 + y) * w + (px0 + x)) * 4;
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(src[i + c] * (1 - a) + fill[c] * a);
    }
  }
  return { width: w, height: h, pixels: out };
}
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const win = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[y * w + Math.min(w - 1, Math.max(0, x + k))];
      tmp[y * w + x] = sum / win;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      out[y * w + x] = sum / win;
    }
  }
  return out;
}
function bytesToDataUrl(bytes, mime = "image/png") {
  let bin = "";
  const step = 32768;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}
function dataUrlToBytes(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !/;base64,/.test(dataUrl.slice(0, comma + 8))) return null;
  try {
    const bin = atob(dataUrl.slice(comma + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
async function stripWatermark(dataUrl, paperHex) {
  try {
    const bytes = dataUrlToBytes(dataUrl);
    if (!bytes || !isPng(bytes)) return dataUrl;
    const img = await decodePng(bytes);
    if (!img) return dataUrl;
    const patched = patchWatermark(img, paperHex);
    return bytesToDataUrl(await encodePng(patched));
  } catch {
    return dataUrl;
  }
}
var WM_BAND, WM_PATCH, WM_FEATHER, WM_BLUR, CRC_TABLE, PNG_SIG;
var init_watermark = __esm({
  "src/lib/watermark.ts"() {
    "use strict";
    WM_BAND = { x0: 0.72, x1: 0.8, y0: 0.74 };
    WM_PATCH = { x0: 0.8, y0: 0.76 };
    WM_FEATHER = { left: 0.18, top: 0.35 };
    WM_BLUR = 6;
    CRC_TABLE = (() => {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        t[n] = c >>> 0;
      }
      return t;
    })();
    PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  }
});

// src/lib/vector.ts
function vectorMessages(brief, opts = {}) {
  const paper = String(opts.paper ?? "#faf8f3").trim() || "#faf8f3";
  const palette = (opts.palette ?? ["#8a9a7b", "#c2a06b", "#7d8b8c", "#4a4a44"]).slice(0, 5);
  const empty = opts.empty === "left" ? "\u5DE6\u534A\u8FB9" : opts.empty === "right" ? "\u53F3\u534A\u8FB9" : "\u53F3\u4FA7";
  const system = [
    "\u4F60\u662F\u4E00\u4F4D\u7ED9\u5C0F\u5B66\u8BED\u6587\u8BFE\u4EF6\u753B\u63D2\u753B\u7684\u77E2\u91CF\u753B\u5E08\uFF0C\u753B\u98CE\u662F\u300C\u7EB8\u58A8\u7EBF\u7A3F + \u6DE1\u5F69\u300D\uFF1A\u7EBF\u6761\u7565\u6296\u3001\u989C\u8272\u6DE1\u3001\u7559\u767D\u591A\u3002",
    "",
    "\u53EA\u8F93\u51FA\u4E00\u6BB5 SVG \u4EE3\u7801\u3002\u4E0D\u8981\u89E3\u91CA\u3001\u4E0D\u8981 Markdown \u4EE3\u7801\u5757\u6807\u8BB0\u3001\u4E0D\u8981\u524D\u540E\u7F00\u4E00\u4E2A\u5B57\u3002",
    "",
    "\u786C\u7EA6\u675F\uFF08\u8FDD\u53CD\u4EFB\u4F55\u4E00\u6761\u8FD9\u6BB5\u4EE3\u7801\u5C31\u4F1A\u88AB\u4E22\u5F03\uFF09\uFF1A",
    `1. \u6839\u5143\u7D20\u5FC5\u987B\u662F\uFF1A<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VECTOR_W} ${VECTOR_H}" width="${VECTOR_W}" height="${VECTOR_H}">`,
    "2. \u53EA\u8BB8\u7528\u8FD9\u4E9B\u5143\u7D20\uFF1Apath\u3001rect\u3001circle\u3001ellipse\u3001line\u3001polyline\u3001polygon\u3001g",
    "3. \u7981\u6B62 text\u3001tspan\u3001image\u3001foreignObject\u3001script\u3001style\u3001filter\u3001pattern\u3001use\u3001marker\u3001animate",
    "4. \u753B\u9762\u91CC\u4E00\u4E2A\u6C49\u5B57\u3001\u4E00\u4E2A\u5B57\u6BCD\u3001\u4E00\u4E2A\u6570\u5B57\u3001\u4E00\u4E2A\u6807\u70B9\u90FD\u4E0D\u8BB8\u6709\u2014\u2014\u53EA\u80FD\u7528\u5F62\u72B6\u753B\u753B",
    "5. \u4E0D\u8BB8\u4EFB\u4F55\u5916\u90E8\u5F15\u7528\uFF08href\u3001xlink:href\u3001url(...)\uFF09",
    "6. \u53EA\u7528\u7EAF\u8272\u586B\u5145\u52A0 fill-opacity / stroke-opacity \u505A\u5C42\u6B21\uFF0C\u4E0D\u8BB8\u6E10\u53D8\u3001\u4E0D\u8BB8\u9634\u5F71",
    `7. \u7EBF\u6761 stroke-width \u53D6 ${STROKE}\uFF0Cstroke-linecap="round"\uFF0Cstroke-linejoin="round"`,
    "8. \u5143\u7D20\u603B\u6570 15\u201345 \u4E2A\uFF0C\u5B81\u53EF\u5C11\uFF0C\u522B\u5806\u7EC6\u8282\uFF1B\u4E00\u672C\u4E66\u91CC\u7684\u63D2\u56FE\u5C31\u8BE5\u662F\u8FD9\u6837",
    "9. \u5148\u94FA\u4E00\u5C42\u586B\u6EE1\u6574\u5F20\u753B\u5E03\u7684\u5E95\u8272 rect\uFF0C\u989C\u8272\u7528\u7EB8\u8272\uFF1B\u4E3B\u4F53\u4E0D\u8BB8\u8D34\u8FB9",
    "",
    `\u6784\u56FE\uFF1A\u4E3B\u4F53\u753B\u5728${empty}\uFF0C\u53E6\u4E00\u8FB9\u4FDD\u6301\u7EB8\u8272\u7A7A\u5730\uFF08\u8001\u5E08\u8981\u628A\u5B57\u538B\u5728\u7A7A\u5730\u4E0A\uFF09\u3002`
  ].join("\n");
  const user = [
    `\u7EB8\u8272\uFF1A${paper}`,
    `\u53EA\u8BB8\u7528\u8FD9\u51E0\u4E2A\u989C\u8272\uFF08\u5916\u52A0\u5B83\u4EEC\u7684\u900F\u660E\u5EA6\u53D8\u5316\uFF09\uFF1A${palette.join(" ")}`,
    opts.title ? `\u8FD9\u4E00\u9875\u8BB2\u7684\u662F\uFF1A${opts.title}\uFF08\u4E0D\u8981\u628A\u8FD9\u4E9B\u5B57\u5199\u8FDB\u753B\u91CC\uFF09` : "",
    "\u753B\u9762\u5185\u5BB9\uFF08\u82F1\u6587\uFF0C\u6765\u81EA\u5BFC\u6F14\uFF09\uFF1A",
    String(brief ?? "").trim()
  ].filter(Boolean).join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}
function sanitizeSvg(raw) {
  const text = String(raw ?? "");
  if (!text) return null;
  const unfenced = text.replace(/```[a-zA-Z]*\s*/g, " ").replace(/```/g, " ");
  const start = unfenced.search(/<svg\b/i);
  const end = unfenced.toLowerCase().lastIndexOf("</svg>");
  if (start < 0 || end < 0 || end <= start) return null;
  let svg = unfenced.slice(start, end + 6).trim();
  if (svg.length > 24e4) return null;
  if (BANNED_TAG.test(svg)) return null;
  if (EXTERNAL_REF.test(svg)) return null;
  if (!/<(path|rect|circle|ellipse|line|polyline|polygon)\b/i.test(svg)) return null;
  svg = svg.replace(/<svg\b[^>]*>/i, () => {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VECTOR_W} ${VECTOR_H}" width="${VECTOR_W}" height="${VECTOR_H}">`;
  });
  return svg;
}
async function rasterInBrowser(svg, width, height) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (!img) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function rasterInNode(svg, width, height) {
  const pkg = "@resvg/resvg-js";
  try {
    const mod = await import(
      /* @vite-ignore */
      pkg
    );
    const png = new mod.Resvg(svg, {
      fitTo: { mode: "width", value: width },
      font: { loadSystemFonts: false }
    }).render().asPng();
    return bytesToDataUrl(new Uint8Array(png), "image/png");
  } catch (e) {
    console.warn("[vector] \u6805\u683C\u5316\u5931\u8D25\uFF08resvg \u6CA1\u88C5\uFF1F\uFF09", e instanceof Error ? e.message : e);
    return null;
  }
}
async function rasterizeSvg(svg, width = VECTOR_W, height = VECTOR_H) {
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    return rasterInBrowser(svg, width, height);
  }
  return rasterInNode(svg, width, height);
}
function retryable(detail) {
  return /model|not.?found|invalid|unsupported|400|404/i.test(detail);
}
async function askOnce(cfg2, messages, model, timeoutMs, signal) {
  const ep = endpointOf("/chat/completions", cfg2);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const relay = () => ctrl.abort();
  signal?.addEventListener("abort", relay);
  vectorCount += 1;
  try {
    const res = await fetch(ep.url, {
      method: "POST",
      headers: ep.headers,
      body: JSON.stringify({ model, messages, temperature: 0.4 }),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const err = new Error(`${res.status} ${detail.slice(0, 160)}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    return String(data?.choices?.[0]?.message?.content ?? "");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relay);
  }
}
async function generateVectorArt(brief, cfg2, opts = {}) {
  const prompt = String(brief ?? "").trim();
  if (!prompt) return { ok: false, prompt, error: "\u6CA1\u6709\u753B\u9762\u63CF\u8FF0" };
  const models = [String(cfg2.model ?? "").trim() || VECTOR_MODEL, ...VECTOR_CHAIN].filter((m) => !!m).map((m) => cfg2.apiKey ? m : upstreamModel(m)).filter((m, i, all) => all.indexOf(m) === i);
  const started = Date.now();
  let last = "";
  for (const model of models) {
    if (opts.signal?.aborted) return { ok: false, prompt, error: "\u5DF2\u53D6\u6D88" };
    const left = BUDGET_MS - (Date.now() - started);
    if (left < 5e3) break;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      try {
        const messages = vectorMessages(prompt, opts);
        if (attempt > 0) {
          messages.push({
            role: "user",
            content: `\u4E0A\u4E00\u6BB5\u4E0D\u80FD\u7528\u7684\u539F\u56E0\uFF1A${last}\u3002\u6574\u6BB5\u91CD\u753B\uFF0C\u53EA\u8F93\u51FA SVG\uFF0C\u753B\u9762\u91CC\u4E0D\u8BB8\u6709\u4EFB\u4F55\u5B57\u3002`
          });
        }
        const raw = await askOnce(cfg2, messages, model, Math.min(STEP_MS, left), opts.signal);
        const svg = sanitizeSvg(raw);
        if (!svg) {
          last = "\u6CA1\u8FD4\u56DE\u5408\u6CD5\u7684 SVG\uFF08\u6216\u91CC\u9762\u5E26\u4E86 text / image / \u5916\u90E8\u5F15\u7528\uFF09";
          continue;
        }
        const dataUrl = await rasterizeSvg(svg);
        if (!dataUrl) {
          last = "\u8FD9\u6BB5 SVG \u6E32\u67D3\u4E0D\u51FA\u6765";
          continue;
        }
        return { ok: true, prompt, dataUrl, svg };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e ?? "");
        if (opts.signal?.aborted) return { ok: false, prompt, error: "\u5DF2\u53D6\u6D88" };
        last = msg;
        const status = e.status;
        if (status === 401 || status === 402 || status === 403) return { ok: false, prompt, error: msg };
        if (!retryable(msg)) break;
      }
    }
  }
  return { ok: false, prompt, error: last || "\u6A21\u578B\u6CA1\u4EA4\u51FA\u80FD\u7528\u7684 SVG" };
}
var VECTOR_MODEL, VECTOR_W, VECTOR_H, STROKE, vectorCount, BANNED_TAG, EXTERNAL_REF, VECTOR_CHAIN, STEP_MS, BUDGET_MS, MAX_TRIES;
var init_vector = __esm({
  "src/lib/vector.ts"() {
    "use strict";
    init_endpoint();
    init_watermark();
    VECTOR_MODEL = "deepseek-ai/DeepSeek-V4.1-Flash";
    VECTOR_W = 1024;
    VECTOR_H = 576;
    STROKE = "3\u20136";
    vectorCount = 0;
    BANNED_TAG = /<\s*(text|tspan|image|foreignObject|script|style|filter|pattern|use|marker|animate)\b/i;
    EXTERNAL_REF = /(?:href|xlink:href)\s*=\s*["'](?:https?:|\/\/|data:(?!image\/))/i;
    VECTOR_CHAIN = [VECTOR_MODEL, "deepseek-v4-pro"];
    STEP_MS = 45e3;
    BUDGET_MS = 9e4;
    MAX_TRIES = 2;
  }
});

// src/lib/illustrate.ts
function paperPhrase(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return "warm textured paper background";
  const n = parseInt(m[1], 16);
  const r = n >> 16 & 255;
  const g2 = n >> 8 & 255;
  const b = n & 255;
  const mx = Math.max(r, g2, b);
  const mn = Math.min(r, g2, b);
  const l = (mx + mn) / 2 / 255;
  const c = (mx - mn) / 255;
  let word = l < 0.5 ? "slate grey" : "cream";
  if (c >= 0.035) {
    const d = mx - mn;
    const raw = mx === r ? (g2 - b) / d % 6 : mx === g2 ? (b - r) / d + 2 : (r - g2) / d + 4;
    const h = (raw * 60 + 360) % 360;
    word = HUE_WORDS.find(([edge]) => h < edge)?.[1] ?? "red";
  }
  const tone = l >= 0.7 ? "soft" : l >= 0.45 ? "muted" : "deep ink-";
  return `${tone.endsWith("-") ? `${tone}${word}` : `${tone} ${word}`} paper background`;
}
function illustCountFor(durationSeconds) {
  const minutes = Number(durationSeconds) / 60;
  if (!Number.isFinite(minutes) || minutes <= 20) return 4;
  if (minutes <= 30) return 5;
  return ILLUST_MAX;
}
function composePrompt(brief, opts = {}) {
  const bits = [STYLE];
  if (opts.cover) bits.push(COVER_COMPOSITION[opts.cover]);
  else bits.push(paperPhrase(opts.paper));
  bits.push(String(brief ?? "").trim());
  const look = String(opts.look ?? "").trim();
  if (look && !/[\u3400-\u9fff]/.test(look)) bits.push(`recurring motif of this lesson: ${look}`);
  const who = opts.grade && /[一二三四五六]/.test(opts.grade) ? "primary school children" : "";
  if (who) bits.push(who);
  if (opts.subjectName) bits.push(`${opts.subjectName} lesson context`);
  bits.push(opts.cover ? COVER_NO_TEXT : NO_TEXT);
  if (opts.hardNoText) bits.push(NO_TEXT_HARD);
  return bits.filter(Boolean).join(", ");
}
function isStopError(message) {
  return /\b402\b|insufficient|余额|额度|quota|payment/i.test(message);
}
async function generateOne(prompt, cfg2, signal, paperHex) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  requestCount += 1;
  try {
    const ep = endpointOf("/images/generations", cfg2, "image");
    const res = await fetch(ep.url, {
      method: "POST",
      headers: ep.headers,
      body: JSON.stringify({
        // §三 实测通过的四个参数，别再随手加 guidance_scale
        model: cfg2.model || ILLUST_MODEL,
        prompt,
        image_size: "1024x576",
        batch_size: 1,
        num_inference_steps: ILLUST_STEPS
      }),
      signal: signal ?? ctrl.signal
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, prompt, error: `${res.status} ${t.slice(0, 160)}` };
    }
    const data = await res.json();
    const item = data?.images?.[0] ?? data?.data?.[0];
    const b64 = item?.b64_json;
    const url = item?.url;
    if (b64) {
      const raw = dataUrlToBytes(`data:image/png;base64,${b64}`);
      const dataUrl = raw && isPng(raw) ? await stripWatermark(bytesToDataUrl(raw), paperHex) : `data:image/png;base64,${b64}`;
      return { ok: true, prompt, dataUrl };
    }
    if (!url) return { ok: false, prompt, error: "\u63A5\u53E3\u6CA1\u8FD4\u56DE\u56FE\u7247" };
    const img = await fetch(url).catch(() => null);
    if (!img || !img.ok) return { ok: false, prompt, error: "\u56FE\u7247\u4E0B\u8F7D\u5931\u8D25" };
    const bytes = new Uint8Array(await img.arrayBuffer());
    if (isPng(bytes)) return { ok: true, prompt, dataUrl: await stripWatermark(bytesToDataUrl(bytes), paperHex) };
    const mime = (img.headers.get("content-type") ?? "image/jpeg").split(";")[0];
    return { ok: true, prompt, dataUrl: bytesToDataUrl(bytes, mime) };
  } catch (e) {
    return { ok: false, prompt, error: e instanceof Error ? e.message : "\u672A\u77E5\u9519\u8BEF" };
  } finally {
    clearTimeout(timer);
  }
}
async function generateIllustration(brief, cfg2, opts = {}) {
  let vectorError = "";
  if ((cfg2.engine ?? "vector") === "vector") {
    const empty = /empty space on the left/i.test(brief) ? "left" : "right";
    const v2 = await generateVectorArt(brief, cfg2, {
      paper: opts.paper,
      title: opts.title,
      empty,
      signal: opts.signal
    });
    if (v2.ok && v2.dataUrl) return { ok: true, prompt: v2.prompt ?? brief, dataUrl: v2.dataUrl };
    if (opts.signal?.aborted) return { ok: false, prompt: brief, error: "\u5DF2\u53D6\u6D88" };
    vectorError = v2.error ?? "\u6CA1\u7528";
  }
  const prompt = composePrompt(brief, opts);
  const first = await generateOne(prompt, cfg2, opts.signal, opts.paper);
  if (first.ok || opts.signal?.aborted) return first;
  const withVector = (r) => r.ok || !vectorError ? r : { ...r, error: `\u77E2\u91CF\uFF1A${vectorError}\uFF1B\u751F\u56FE\uFF1A${r.error ?? "\u5931\u8D25"}` };
  if (first.error && isStopError(first.error)) return withVector(first);
  const backup = { ...cfg2, model: ILLUST_FALLBACK_MODEL };
  if (backup.model === cfg2.model) return withVector(first);
  const second = await generateOne(prompt, backup, opts.signal, opts.paper);
  if (second.ok) return second;
  if (second.error && isStopError(second.error)) return withVector(second);
  return {
    ok: false,
    prompt,
    error: [vectorError && `\u77E2\u91CF\uFF1A${vectorError}`, `\u4E3B\u6A21\u578B\uFF1A${first.error ?? "\u5931\u8D25"}`, `\u5907\u7528\uFF1A${second.error ?? "\u5931\u8D25"}`].filter(Boolean).join("\uFF1B")
  };
}
var ILLUST_MODEL, ILLUST_FALLBACK_MODEL, ILLUST_STEPS, ILLUST_MAX, STYLE, HUE_WORDS, NO_TEXT, NO_TEXT_HARD, COVER_COMPOSITION, COVER_NO_TEXT, TIMEOUT_MS, requestCount;
var init_illustrate = __esm({
  "src/lib/illustrate.ts"() {
    "use strict";
    init_endpoint();
    init_watermark();
    init_vector();
    ILLUST_MODEL = "Tongyi-MAI/Z-Image-Turbo";
    ILLUST_FALLBACK_MODEL = "Kwai-Kolors/Kolors";
    ILLUST_STEPS = 8;
    ILLUST_MAX = 6;
    STYLE = "children's picture book illustration, soft watercolor washes with light colored-pencil lines, muted natural palette, hand-drawn outlines that are slightly wobbly, never pure black, generous empty space around the subject, gentle and quiet mood";
    HUE_WORDS = [
      [20, "rust"],
      [45, "sand"],
      [70, "olive"],
      [110, "moss"],
      [160, "green"],
      [200, "teal"],
      [240, "blue"],
      [285, "indigo"],
      [325, "violet"],
      [350, "plum"],
      [361, "red"]
    ];
    NO_TEXT = "no text, no letters, no numbers, no signature, no watermark, no border, no frame";
    NO_TEXT_HARD = "the picture must contain absolutely no writing anywhere, no words, no captions, no signage, no chinese characters, no alphabet letters, no numerals";
    COVER_COMPOSITION = {
      left: "composition: subject on the RIGHT third, the LEFT third is empty soft paper, generous negative space, no text, no letters, no characters",
      bottom: "composition: subject in the UPPER half, the LOWER third is empty soft paper, generous negative space, no text, no letters, no characters",
      rightTop: "composition: subject in the LOWER LEFT, the UPPER RIGHT corner is empty soft paper, generous negative space, no text, no letters, no characters"
    };
    COVER_NO_TEXT = "no text, no letters, no numbers, no signature, no watermark";
    TIMEOUT_MS = 6e4;
    requestCount = 0;
  }
});

// src/lib/density.ts
function isDensity(x) {
  return x === "lean" || x === "standard" || x === "rich";
}
function limitsOf(lock) {
  return isDensity(lock) ? DENSITY[lock] : ENVELOPE;
}
var DENSITY_ORDER, DENSITY_LABELS, DEFAULT_DENSITY, DENSITY, WORDS_ITEMS_MAX, DEFAULT_LIMITS, ENVELOPE, PAGE_RANGE;
var init_density = __esm({
  "src/lib/density.ts"() {
    "use strict";
    DENSITY_ORDER = ["lean", "standard", "rich"];
    DENSITY_LABELS = {
      lean: "\u7CBE\u7B80",
      standard: "\u6807\u51C6",
      rich: "\u5145\u5B9E"
    };
    DEFAULT_DENSITY = "standard";
    DENSITY = {
      lean: { bodyChars: 30, pagesMin: 10, pagesMax: 10, itemsMax: 4, closeReadMax: 2 },
      standard: { bodyChars: 60, pagesMin: 10, pagesMax: 12, itemsMax: 5, closeReadMax: 3 },
      rich: { bodyChars: 90, pagesMin: 12, pagesMax: 14, itemsMax: 6, closeReadMax: 3 }
    };
    WORDS_ITEMS_MAX = 4;
    DEFAULT_LIMITS = DENSITY[DEFAULT_DENSITY];
    ENVELOPE = {
      bodyChars: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].bodyChars)),
      pagesMin: Math.min(...DENSITY_ORDER.map((d) => DENSITY[d].pagesMin)),
      pagesMax: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].pagesMax)),
      itemsMax: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].itemsMax)),
      closeReadMax: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].closeReadMax))
    };
    PAGE_RANGE = { min: ENVELOPE.pagesMin, max: ENVELOPE.pagesMax };
  }
});

// src/lib/scale.ts
function scaleOf(duration) {
  const d = Number(duration);
  if (!Number.isFinite(d) || d < LESSON_MIN_SECONDS) return "clip";
  return "lesson";
}
function planOfScale(scale) {
  return PLANS[scale];
}
function tierOf(duration) {
  const d = Number(duration);
  if (!Number.isFinite(d) || d < LESSON_MIN_SECONDS) return "clip";
  if (d <= M20_MAX_SECONDS) return "m20";
  if (d <= M30_MAX_SECONDS) return "m30";
  return "m40";
}
function tierPlanOf(tier) {
  if (tier === "clip") {
    const base = PLANS.clip;
    return {
      deckPages: base.deckPages,
      slidePages: base.slidePages,
      segments: base.segments,
      skeleton: "\u5BFC\u5165 \u2192 \u521D\u8BFB \u2192 \u7CBE\u8BFB \u2192 \u62D3\u5C55 \u2192 \u5C0F\u7ED3"
    };
  }
  return TIERS[tier];
}
function slideRangeFor(duration) {
  return tierPlanOf(tierOf(duration)).slidePages;
}
function limitsFor(densityLock, scale, duration) {
  const base = limitsOf(densityLock);
  if (scale !== "lesson") return base;
  const plan2 = planOfScale(scale);
  const hasTier = typeof duration === "number" && Number.isFinite(duration);
  const pages = hasTier ? slideRangeFor(duration) : plan2.slidePages;
  const segMax = hasTier ? tierPlanOf(tierOf(duration)).segments.max : plan2.segments.max;
  return {
    ...base,
    pagesMin: pages.min,
    pagesMax: pages.max,
    closeReadMax: Math.max(base.closeReadMax, segMax)
  };
}
var LESSON_MIN_SECONDS, PLANS, M20_MAX_SECONDS, M30_MAX_SECONDS, TIERS;
var init_scale = __esm({
  "src/lib/scale.ts"() {
    "use strict";
    init_density();
    LESSON_MIN_SECONDS = 1200;
    PLANS = {
      clip: {
        scale: "clip",
        deckPages: { min: 12, max: 16 },
        slidePages: { min: 10, max: 14 },
        segments: { min: 4, max: 6 },
        pagesPerSegment: { min: 2, max: 3 }
      },
      lesson: {
        scale: "lesson",
        deckPages: { min: 22, max: 28 },
        slidePages: { min: 16, max: 24 },
        segments: { min: 6, max: 7 },
        pagesPerSegment: { min: 3, max: 4 }
      }
    };
    M20_MAX_SECONDS = 1500;
    M30_MAX_SECONDS = 2100;
    TIERS = {
      m20: {
        deckPages: { min: 12, max: 16 },
        /** 3 个环节 × 3–4 页 + 首尾 4–5 页。
         *  第二十六轮下调（不是回退）：TASKS/25 起「没有材料的页不许上屏」——
         *  只剩一个动作、页面上找不到读什么/看哪句的页一律不出（《桂花雨》27 页里 11 页是这种）。
         *  薄教案三个环节的讲稿加起来不到 300 字，能站住的页就 11–13 张;
         *  硬凑回 16 张只能把「闭眼闻一闻」这类空页再请回来，正是用户指着骂的那一種。 */
        slidePages: { min: 11, max: 16 },
        segments: { min: 3, max: 3 },
        skeleton: "\u5BFC\u5165 + \u7CBE\u8BFB + \u5C0F\u7ED3"
      },
      m30: {
        deckPages: { min: 16, max: 20 },
        /** 4 个环节 × 3–4 页 + 首尾 4–5 页；同上，下限跟着素材走（实测 13 页） */
        slidePages: { min: 13, max: 18 },
        segments: { min: 4, max: 4 },
        skeleton: "\u5BFC\u5165 + \u521D\u8BFB + \u7CBE\u8BFB + \u5C0F\u7ED3"
      },
      m40: {
        deckPages: { min: 22, max: 28 },
        /** 6–7 个环节 × 2–4 页 + 首尾 5–6 页；同上，下限跟着素材走（薄教案实测 16–20 页） */
        slidePages: { min: 16, max: 24 },
        segments: { min: 6, max: 7 },
        skeleton: "\u5BFC\u5165 + \u521D\u8BFB + \u7CBE\u8BFB + \u54C1\u53E5 + \u62D3\u5C55 + \u5C0F\u7ED3\uFF08\u542B\u5B57\u8BCD / \u7EC3\u4E60 / \u68C0\u6D4B\uFF09"
      }
    };
  }
});

// src/lib/scene.ts
import { GIFEncoder } from "gifenc/dist/gifenc.esm.js";
var SCENE_KINDS, SCENE, isSceneKind, PAL;
var init_scene = __esm({
  "src/lib/scene.ts"() {
    "use strict";
    SCENE_KINDS = ["petals", "snow", "rain"];
    SCENE = {
      /** 800×450 = 16:9，与 LAYOUT_WIDE 同比例；60 帧实测原样嵌入 WPS / PowerPoint 都会循环播 */
      width: 800,
      height: 450,
      frames: 60,
      /**
       * 一帧 130ms → 整段 7.8s 一循环（TASKS 10 §十一：7.5–10 秒一轮）。
       * 比网页演示的雪花慢：这是投影上的背景板，不是动画片。
       */
      delayMs: 130
    };
    isSceneKind = (v2) => SCENE_KINDS.includes(v2);
    PAL = SCENE.width * SCENE.height;
  }
});

// src/lib/deck.ts
function isTeacherPage(page) {
  if (!page) return false;
  if (TEACHER_PAGE_KINDS.has(page.kind)) return true;
  if (TEACHER_VOICE.test(String(page.title ?? ""))) return true;
  const hits = (page.bullets ?? []).filter((b) => TEACHER_VOICE.test(String(b ?? "")));
  return hits.length >= 2;
}
var PAGE_LAYOUTS, LAYOUT_NAME, TEACHER_VOICE, TEACHER_PAGE_KINDS;
var init_deck = __esm({
  "src/lib/deck.ts"() {
    "use strict";
    init_scale();
    init_scene();
    PAGE_LAYOUTS = ["full", "split", "cards", "timeline", "cloze"];
    LAYOUT_NAME = {
      full: "\u6574\u9875\u5927\u56FE",
      split: "\u5DE6\u53F3\u5206\u680F",
      cards: "\u5361\u7247\u5899",
      timeline: "\u65F6\u95F4\u8F74",
      cloze: "\u6316\u7A7A\u731C"
    };
    TEACHER_VOICE = /我准备|我打算|我这样|我要先|先给什么|然后再问|卡在哪|学情|预设|我会问|板书设计|这个环节|本环节的设计|谁读给大家听|谁来说|全班对答案|同桌互查/;
    TEACHER_PAGE_KINDS = /* @__PURE__ */ new Set(["design", "prep"]);
  }
});

// src/lib/voice.ts
function scanTaste(text) {
  const raw = String(text ?? "");
  const hits = [];
  for (const m of raw.matchAll(new RegExp(DUI_OU.source, "g"))) {
    const a = m[1] ?? "";
    const b = m[2] ?? "";
    if (DUI_OU_FUNC.test(a) || DUI_OU_FUNC.test(b)) continue;
    const tail = raw.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 1);
    if (DUI_OU_ASK.test(b) && (tail === "\uFF1F" || tail === "?" || /[吗呢]$/.test(b))) continue;
    hits.push({
      id: "dui-ou",
      label: "\u56DB\u5B57\u5BF9\u5076",
      matched: `${a}\uFF0C${b}`,
      note: "\u524D\u540E\u5404\u56DB\u5B57\uFF0C\u5FF5\u8D77\u6765\u50CF\u53E3\u53F7\uFF1B\u6539\u6210\u4E00\u53E5\u76F4\u8BF4\u7684\u8BDD\uFF0C\u628A\u540E\u534A\u53E5\u60F3\u62BC\u7684\u90A3\u4E2A\u97F5\u6254\u6389\u3002"
    });
  }
  for (const m of raw.matchAll(new RegExp(VIA_TRIPLE.source, "g"))) {
    hits.push({
      id: "paibi-via",
      label: "\u4E09\u8FDE\u6392\u6BD4",
      matched: m[0] ?? "",
      note: "\u300C\u901A\u8FC7 A\u3001B\u3001C\u300D\u662F\u6559\u7814\u6750\u6599\u7684\u5199\u6CD5\uFF1B\u8BF4\u6E05\u8FD9\u4E00\u8BFE\u5230\u5E95\u8BA9\u5B66\u751F\u505A\u4E86\u54EA\u4E00\u4EF6\u4E8B\u3002"
    });
  }
  for (const clause of raw.split(/[。！？；\n]/)) {
    const used = ACTION_WORDS.filter((w) => clause.includes(w));
    if (used.length >= 3) {
      hits.push({
        id: "liushuizhang",
        label: "\u52A8\u4F5C\u6D41\u6C34\u8D26",
        matched: clause.trim().slice(0, 30),
        note: "\u51FA\u793A\u3001\u64AD\u653E\u3001\u63D0\u95EE\u6392\u6210\u4E00\u4E32\uFF0C\u50CF\u6D41\u7A0B\u5355\u3002\u6311\u4E00\u4E2A\u52A8\u4F5C\u5199\u900F\uFF0C\u5176\u4F59\u4EA4\u7ED9\u8BFE\u5802\u73B0\u573A\u3002"
      });
    }
  }
  return hits;
}
function tasteProblems(text) {
  return scanTaste(text).map((h) => `${h.label}\u300C${h.matched}\u300D`);
}
function getVoiceProfile(kind) {
  const hit = VOICE_PROFILES.find((p) => p.kind === kind);
  if (!hit) throw new Error(`\u6CA1\u6709\u8FD9\u5957\u8BED\u6C14\u6863\u6848\uFF1A${kind}`);
  return hit;
}
function voicePromptBlock(kind) {
  const p = getVoiceProfile(kind);
  const patterns = FORBIDDEN_PATTERNS.map((x) => `
- ${x.label}\uFF1A${x.note}`).join("");
  const words = BANNED_WORDS.map((x) => `
- ${x.word}\uFF1A${x.note}`).join("");
  const examples = p.examples.map((e) => `
\u274C ${e.bad}
\u2705 ${e.good}`).join("\n");
  return [
    `\u3010\u8BED\u6C14 \xB7 ${p.name}\u3011${p.audience}\u3002`,
    ...p.rules.map((r, i) => `${i + 1}. ${r}`),
    `\u4E3B\u8BED\u89C4\u5219\uFF1A${p.subjectRules.join(" ")}`,
    `\u5355\u53E5\u4E0D\u8D85\u8FC7 ${p.maxSentenceChars} \u5B57\u3002`,
    `\u6B63\u53CD\u4F8B\uFF08\u4F1A\u88AB\u7528 / \u4F1A\u88AB\u9000\u56DE\uFF09\uFF1A${examples}`,
    `\u8FD9\u4E9B\u53E5\u5F0F\u5728\u4EA7\u7269\u6587\u672C\u91CC\u547D\u4E2D\u6570\u5FC5\u987B\u4E3A 0\uFF1A${patterns}${words}`,
    "\u4E0A\u5C4F\u77ED\u53E5\uFF08\u5927\u6807\u9898 / \u4E00\u884C\u5B57 / \u6761\u76EE\uFF09\u518D\u5B88\u4E09\u6761\uFF1A\u4E0D\u5199\u56DB\u5B57\u5BF9\u5076\uFF08\u300C\u91CD\u70B9\u8BB2\u900F\uFF0C\u96BE\u70B9\u7ED5\u5F00\u300D\uFF09\uFF0C\u4E0D\u5199\u300C\u901A\u8FC7 A\u3001B\u3001C\u300D\u5F0F\u7684\u4E09\u8FDE\uFF0C\u4E0D\u5199\u300C\u51FA\u793A X\u3001\u64AD\u653E Y\u3001\u63D0\u95EE Z\u300D\u7684\u52A8\u4F5C\u6D41\u6C34\u8D26\u3002",
    "\u8F93\u51FA\u524D\u81EA\u68C0\uFF1A\u628A\u5168\u90E8\u6587\u5B57\u4ECE\u5934\u8BFB\u4E00\u904D\uFF0C\u4E0A\u9762\u8FD9\u4E9B\u53E5\u5F0F\u4E0E\u7981\u8BCD\u7684\u547D\u4E2D\u6570\u5FC5\u987B\u4E3A 0\uFF1B\u547D\u4E2D\u5C31\u6539\u5199\u8FD9\u4E00\u53E5\u518D\u8F93\u51FA\uFF0C\u4E0D\u8981\u4EA4\u51FA\u6765\u7B49\u9000\u56DE\u3002"
  ].join("\n");
}
function visibleChars(text) {
  return (String(text ?? "").match(VISIBLE) ?? []).length;
}
function splitSentences(text) {
  return (String(text ?? "").match(/[^。！？!?；;\n]+[。！？!?；;\n]?/g) ?? []).map((s) => s.trim()).filter((s) => visibleChars(s) > 0);
}
function snippetOf(text, start, end) {
  const from = Math.max(0, start - 14);
  const to = Math.min(text.length, end + 14);
  return `${from > 0 ? "\u2026" : ""}${text.slice(from, to).replace(/\s+/g, " ")}${to < text.length ? "\u2026" : ""}`;
}
function matchAll(re, text) {
  return [...text.matchAll(new RegExp(re.source, re.flags))];
}
function scanVoice(text) {
  const raw = String(text ?? "");
  const patternCounts = {};
  const bannedCounts = {};
  const hits = [];
  for (const p of FORBIDDEN_PATTERNS) {
    const found = matchAll(p.re, raw);
    patternCounts[p.id] = found.length;
    for (const m of found) {
      const matched = m[0] ?? "";
      hits.push({
        kind: "pattern",
        id: p.id,
        label: p.label,
        note: p.note,
        index: m.index ?? 0,
        matched: matched.length > 40 ? `${matched.slice(0, 39)}\u2026` : matched,
        snippet: snippetOf(raw, m.index ?? 0, (m.index ?? 0) + matched.length)
      });
    }
  }
  for (const b of BANNED_WORDS) {
    const found = matchAll(b.re, raw);
    bannedCounts[b.word] = found.length;
    for (const m of found) {
      const matched = m[0] ?? "";
      hits.push({
        kind: "word",
        id: b.word,
        label: b.word,
        note: b.note,
        index: m.index ?? 0,
        matched: matched.length > 40 ? `${matched.slice(0, 39)}\u2026` : matched,
        snippet: snippetOf(raw, m.index ?? 0, (m.index ?? 0) + matched.length)
      });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  const sentences = splitSentences(raw);
  const lens = sentences.map((s) => visibleChars(s));
  const total = lens.reduce((a, b) => a + b, 0);
  const questions = sentences.filter((s) => /[？?]$/.test(s)).length;
  const softSubjectCounts = {};
  let softSubjectTotal = 0;
  for (const s of SOFT_SUBJECTS) {
    const n = raw.split(s).length - 1;
    softSubjectCounts[s] = n;
    softSubjectTotal += n;
  }
  return {
    text: raw,
    patternCounts,
    bannedCounts,
    hits,
    sentences: sentences.length,
    avgSentenceChars: sentences.length ? Math.round(total / sentences.length * 10) / 10 : 0,
    maxSentenceChars: lens.length ? Math.max(...lens) : 0,
    questions,
    questionShare: sentences.length ? Math.round(questions / sentences.length * 100) / 100 : 0,
    hasQuestion: questions > 0,
    softSubjectCounts,
    softSubjectTotal
  };
}
function emptyCounts(keys) {
  const o = {};
  for (const k of keys) o[k] = 0;
  return o;
}
function scanVoiceDocs(entries, opts) {
  const questionFields = opts?.questionFields ?? /(notes|页面|line|items)$/;
  const sentenceFields = opts?.sentenceFields ?? /\.(notes|answer|script)$|^speech/;
  const softLimit = opts?.softLimit ?? SOFT_SUBJECT_LIMIT;
  const patternCounts = emptyCounts(FORBIDDEN_PATTERNS.map((p) => p.id));
  const bannedCounts = emptyCounts(BANNED_WORD_TEXTS);
  const softSubjectCounts = emptyCounts(SOFT_SUBJECTS);
  const problems = [];
  const questionMissing = [];
  let sentences = 0;
  let sentenceChars = 0;
  let maxSentenceChars = 0;
  let questionCovered = 0;
  let questionTracked = 0;
  let softSubjectTotal = 0;
  const detailed = entries.map((e) => {
    const stats = scanVoice(e.text);
    for (const [k, v2] of Object.entries(stats.patternCounts)) patternCounts[k] += v2;
    for (const [k, v2] of Object.entries(stats.bannedCounts)) bannedCounts[k] += v2;
    for (const [k, v2] of Object.entries(stats.softSubjectCounts)) softSubjectCounts[k] += v2;
    softSubjectTotal += stats.softSubjectTotal;
    if (sentenceFields.test(e.field)) {
      sentences += stats.sentences;
      sentenceChars += stats.avgSentenceChars * stats.sentences;
      maxSentenceChars = Math.max(maxSentenceChars, stats.maxSentenceChars);
    }
    for (const h of stats.hits) problems.push({ ...h, entry: e });
    if (questionFields.test(e.field)) {
      questionTracked++;
      if (stats.hasQuestion) questionCovered++;
      else questionMissing.push(e);
    }
    return { ...e, stats };
  });
  const overByDoc = /* @__PURE__ */ new Map();
  for (const e of detailed) {
    for (const s of SOFT_SUBJECTS) {
      const n = e.stats.softSubjectCounts[s] ?? 0;
      if (n > 0) overByDoc.set(`${e.doc}\uFF5C${s}`, (overByDoc.get(`${e.doc}\uFF5C${s}`) ?? 0) + n);
    }
  }
  const softOverLimit = [...overByDoc.entries()].filter(([, n]) => n > softLimit).map(([k, n]) => {
    const [doc, subject] = k.split("\uFF5C");
    return { doc, subject, count: n };
  });
  problems.sort((a, b) => a.entry.doc.localeCompare(b.entry.doc) || a.index - b.index);
  return {
    entries: detailed,
    patternCounts,
    bannedCounts,
    problems,
    avgSentenceChars: sentences ? Math.round(sentenceChars / sentences * 10) / 10 : 0,
    maxSentenceChars,
    sentences,
    questionCovered,
    questionTracked,
    questionMissing,
    softSubjectCounts,
    softSubjectTotal,
    softOverLimit
  };
}
var FORBIDDEN_PATTERNS, BANNED_WORDS, DUI_OU_FUNC, DUI_OU, DUI_OU_ASK, VIA_TRIPLE, ACTION_WORDS, BANNED_WORD_TEXTS, SOFT_SUBJECTS, SOFT_SUBJECT_LIMIT, SHUOKE, CLASSROOM, DEFENSE, VOICE_PROFILES, VISIBLE;
var init_voice = __esm({
  "src/lib/voice.ts"() {
    "use strict";
    FORBIDDEN_PATTERNS = [
      {
        id: "bu-ershi",
        label: "\u4E0D\u662F\u2026\u2026\u800C\u662F\u2026\u2026",
        // 「不 / 非 / 没」起头，中间最多 18 个不带句末标点与逗号的字，再一个可选逗号，落在「而是」。
        // 前缀 (?:^|[^而]) + 中间段至少 1 字，是为了放掉倒装的「……，而不是……」——
        // §D.2 第 1 类只列正装式，倒装那句（「符号是关系的简写，而不是三个孤立的图案」）是人话，不判。
        // 中间段不禁换行与省略号，所以「不是…\n而是」「不是……而是」都能抓住；但逗号只能有一个且必须紧贴而是。
        re: /(?:^|[^而])(?:不|非|没)[^。！？，,；;、]{1,18}[，,、]?[\s]*而是/g,
        note: "\u5148\u5426\u5B9A\u4E00\u4E2A\u8BF4\u6CD5\u518D\u6446\u51FA\u81EA\u5DF1\u7684\u8BF4\u6CD5\uFF0C\u662F\u8BF4\u8BFE\u7A3F\u91CC\u6700\u5E38\u89C1\u7684\u6392\u573A\u8BDD\uFF1B\u628A\u88AB\u5426\u5B9A\u7684\u90A3\u4E2A\u5220\u6389\uFF0C\u76F4\u63A5\u8BF4\u8981\u505A\u4EC0\u4E48\u3002"
      },
      {
        id: "ningke-ye",
        label: "\u5B81\u53EF\u2026\u2026\u4E5F\u2026\u2026",
        // 让步复句：宁可 + ≤24 字（可含逗号与换行，不跨句末标点）+ 也 / 都要 / 得。
        re: /宁可[^。！？]{1,24}?(?:也|都要|得)/g,
        note: "\u6559\u7814\u8154\u7684\u53D6\u820D\u53E5\u5F0F\uFF0C\u8BFE\u5802\u4E0A\u6CA1\u4EBA\u8FD9\u4E48\u8BF4\u8BDD\uFF1B\u6362\u6210\u300C\u6211\u5B81\u613F X\uFF0C\u6240\u4EE5 Y\u300D\u6216\u8005\u76F4\u63A5\u8BF4 Y\u3002"
      },
      {
        id: "yuqi-buru",
        label: "\u4E0E\u5176\u2026\u2026\u4E0D\u5982\u2026\u2026",
        // 「与其 / 与其说」+ ≤24 字 + 「不如 / 还不如」；「与其说」也一并抓掉，防止改稿时换成它。
        re: /与其(?:还)?说?[^。！？]{1,24}?(?:也)?不如/g,
        note: "\u4E66\u9762\u6BD4\u8F83\u53E5\u5F0F\uFF0C\u8DDF\u300C\u4E0D\u662F\u2026\u2026\u800C\u662F\u2026\u2026\u300D\u662F\u540C\u4E00\u5F20\u8138\u4E0A\u7684\u4E24\u79CD\u5986\uFF1B\u76F4\u63A5\u7ED9\u8981\u9009\u7684\u90A3\u4E2A\u3002"
      },
      {
        id: "paibi-3",
        label: "\u4E09\u53E5\u4EE5\u4E0A\u6392\u6BD4\uFF08\u65E2\u2026\u2026\u53C8\u2026\u2026\u66F4\u2026\u2026\uFF09",
        // 三联关联词：既 + 一段 + 又/也 + 一段 + 更/还 + 一段。两个槽之间各限 ≤20 字，
        // 且都不许跨过句末标点，保证抓的是「一句话里连排三层」而不是隔了两句的巧合。
        // 「不仅…而且…更…」是同一毛病的另外两种壳，合并在这条里。
        re: /(?:既[^。！？]{1,20}?[又也][^。！？]{1,20}?(?:更|还))|(?:不仅|不但)[^。！？]{1,20}?(?:而且|同时)[^。！？]{1,20}?(?:更|还)/g,
        note: "\u4E09\u4E2A\u5173\u8054\u8BCD\u4E32\u8D77\u6765\u7684\u9012\u8FDB\u6392\u6BD4\uFF0C\u5FF5\u8D77\u6765\u50CF\u6C47\u62A5\u6750\u6599\uFF1B\u7559\u4E00\u4E2A\u6700\u91CD\u7684\u8BF4\u6E05\u695A\u5C31\u884C\u3002"
      }
    ];
    BANNED_WORDS = [
      {
        word: "\u672C\u73AF\u8282\u65E8\u5728",
        re: /本环节旨在/g,
        note: "\u6863\u6848\u8154\u5F00\u5934\uFF0C\u300C\u65E8\u5728\u300D\u4E24\u4E2A\u5B57\u6700\u4E0D\u50CF\u4EBA\u8BDD\u3002"
      },
      {
        word: "\u901A\u8FC7\u2026\u2026\u4F7F\u5B66\u751F",
        re: /通过(?:[^。！？]{1,24}?)(?:使|让)学生/g,
        note: "\u628A\u624B\u6BB5\u548C\u5B66\u751F\u6346\u6210\u4E00\u53E5\u6D41\u7A0B\u8BF4\u660E\uFF1B\u4E3B\u8BED\u6362\u6210\u300C\u6211\u300D\uFF0C\u8BF4\u6E05\u6211\u505A\u4E86\u4EC0\u4E48\u3001\u5B66\u751F\u505A\u4EC0\u4E48\u3002"
      },
      {
        word: "\u5145\u5206\u4F53\u73B0\u4E86",
        re: /充?分体现(?:了|出)/g,
        note: "\u81EA\u6211\u8BC4\u4EF7\u5F0F\u7ED3\u8BBA\uFF0C\u8BC4\u59D4\u770B\u7684\u662F\u4F60\u505A\u4E86\u4EC0\u4E48\uFF0C\u4E0D\u662F\u4F60\u7ED9\u81EA\u5DF1\u6253\u7684\u52FE\u3002"
      },
      {
        word: "\u6709\u6548\u63D0\u5347",
        // 这一桶管的是「提升 + 素养 / 能力 / 水平」这类无法检验的效果承诺，不只抓「有效提升」四字；
        // 修饰语可缺（切实提升、明显提升、直接一句「提升学生能力」都是同一个毛病）。
        re: /(?:有效|切实|明显|大幅)?提升(?:了)?(?:学生|儿童)?(?:的)?[^。！？]{0,6}?(?:核心素养|素养|能力|水平|成绩|效率)/g,
        note: "\u65E0\u6CD5\u68C0\u9A8C\u7684\u6548\u679C\u627F\u8BFA\uFF0C\u5220\u6389\u6362\u6210\u5177\u4F53\u90A3\u4E00\u9875\u53D1\u751F\u4E86\u4EC0\u4E48\u3002"
      },
      {
        word: "\u6838\u5FC3\u7D20\u517B",
        re: /核心素养/g,
        note: "\u53E3\u53F7\u7EA7\u540D\u8BCD\uFF0C\u5199\u8FDB\u7A3F\u5B50\u7B49\u4E8E\u4EC0\u4E48\u90FD\u6CA1\u5199\u3002"
      },
      /* TASKS 10 §十三 第 12 件：三维目标那套格子，连同它的三个格名一起禁 */
      {
        word: "\u77E5\u8BC6\u4E0E\u80FD\u529B",
        re: /知识(?:与|和)能力/g,
        note: "\u4E09\u7EF4\u76EE\u6807\u7684\u65E7\u58F3\u5B50\u3002\u76F4\u63A5\u8BF4\u8FD9\u4E00\u8BFE\u5B66\u751F\u8981\u5B66\u4F1A\u505A\u4EC0\u4E48\u3002"
      },
      {
        word: "\u8FC7\u7A0B\u4E0E\u65B9\u6CD5",
        re: /过程(?:与|和)方法/g,
        note: "\u600E\u4E48\u5B66\u662F\u548C\u5185\u5BB9\u957F\u5728\u4E00\u8D77\u7684\uFF0C\u53E6\u8D77\u4E00\u683C\u5C31\u53EA\u5269\u7A7A\u8BDD\u3002"
      },
      {
        word: "\u60C5\u611F\u6001\u5EA6\u4E0E\u4EF7\u503C\u89C2",
        re: /情感态度(?:与|和)价值观/g,
        note: "\u8981\u8C08\u611F\u60C5\uFF0C\u5C31\u8BF4\u8BFE\u6587\u91CC\u54EA\u4E00\u53E5\u8BA9\u4EBA\u5FC3\u91CC\u4E00\u52A8\u3002"
      },
      {
        word: "\u4E09\u7EF4\u76EE\u6807",
        re: /三维目标/g,
        note: "\u4E09\u4E2A\u683C\u5B50\u586B\u6EE1\uFF0C\u4E0D\u7B49\u4E8E\u628A\u8BFE\u8BF4\u6E05\u695A\u3002"
      }
    ];
    DUI_OU_FUNC = /[的了是在和也就都很会能要把被让给对从向与及或而且并且再又更才先却着过]/;
    DUI_OU = /(?:^|[。！？；\s])([^，,。！？；：\s]{4})[，,]([^，,。！？；：\s]{4})(?=[。！？；]|$)/g;
    DUI_OU_ASK = /哪|什么|怎么|怎样|多少|几|谁|为什么|是否|是不是|有没有/;
    VIA_TRIPLE = /(?:通过|借助|运用|凭借)[^。！？；\n]{1,24}?、[^。！？；\n]{1,24}?、/g;
    ACTION_WORDS = ["\u51FA\u793A", "\u64AD\u653E", "\u63D0\u95EE", "\u8FFD\u95EE", "\u8BB2\u89E3", "\u677F\u4E66", "\u5F15\u5BFC"];
    BANNED_WORD_TEXTS = BANNED_WORDS.map((b) => b.word);
    SOFT_SUBJECTS = ["\u8BA9\u6211\u4EEC", "\u8BF7\u5927\u5BB6", "\u540C\u5B66\u4EEC", "\u8BF7\u4F60\u8BF4", "\u5927\u5BB6\u53EF\u4EE5"];
    SOFT_SUBJECT_LIMIT = 1;
    SHUOKE = {
      kind: "shuoke",
      name: "\u8BF4\u8BFE",
      audience: "\u8BB2\u7ED9\u8BC4\u59D4\u542C\uFF1A\u5750\u5728\u5BF9\u9762\u7684\u662F\u6253\u5206\u7684\u4EBA\uFF0C\u4E0D\u662F\u5B66\u751F",
      rules: [
        "\u7B2C\u4E00\u4EBA\u79F0\u627F\u62C5\uFF1A\u5199\u300C\u6211\u8FD9\u6837\u8BBE\u8BA1\u300D\u300C\u6211\u628A\u8FD9\u4E00\u9875\u653E\u6162\u300D\uFF0C\u4E0D\u5199\u300C\u672C\u8BBE\u8BA1\u65E8\u5728\u300D\u3002",
        "\u6BCF\u4E2A\u8BBE\u8BA1\u70B9\u540E\u9762\u5FC5\u987B\u8DDF\u4E00\u53E5\u300C\u56E0\u4E3A\u300D\u6216\u300C\u8003\u8651\u5230\u300D\uFF0C\u8BF4\u6E05\u4F60\u4E3A\u4EC0\u4E48\u8FD9\u4E48\u505A\u3002",
        "\u5C11\u5F62\u5BB9\u8BCD\u3002\u60F3\u8BF4\u300C\u751F\u52A8\u5F62\u8C61\u300D\uFF0C\u5C31\u6362\u6210\u4F60\u5177\u4F53\u505A\u4E86\u4EC0\u4E48\u52A8\u4F5C\u3001\u5B66\u751F\u505A\u4E86\u4EC0\u4E48\u52A8\u4F5C\u3002",
        "\u4E0D\u5199\u300C\u73AF\u73AF\u76F8\u6263\u300D\u300C\u5C42\u5C42\u9012\u8FDB\u300D\u300C\u5145\u5206\u8C03\u52A8\u300D\u8FD9\u7C7B\u81EA\u6211\u8BC4\u4EF7\uFF1B\u53EA\u5199\u8FD9\u4E00\u9875\u771F\u6B63\u53D1\u751F\u4E86\u4EC0\u4E48\u4E8B\u3002",
        "\u4E00\u53E5\u8BDD\u53EA\u8BB2\u4E00\u4E2A\u8BBE\u8BA1\u70B9\uFF0C\u8BB2\u5B8C\u5C31\u6362\u884C\uFF0C\u4E0D\u8981\u628A\u4E09\u4E2A\u7406\u7531\u645E\u5728\u540C\u4E00\u53E5\u91CC\u3002"
      ],
      examples: [
        {
          bad: "\u672C\u73AF\u8282\u65E8\u5728\u901A\u8FC7\u53CD\u590D\u6717\u8BFB\uFF0C\u4F7F\u5B66\u751F\u4F53\u4F1A\u4F5C\u8005\u5BF9\u6545\u4E61\u7684\u601D\u5FF5\u4E4B\u60C5\u3002",
          good: "\u8FD9\u4E00\u6BB5\u6211\u8BA9\u5B66\u751F\u8BFB\u4E09\u904D\u3002\u7B2C\u4E00\u904D\u8BFB\u987A\uFF0C\u7B2C\u4E8C\u904D\u8BFB\u5230\u81EA\u5DF1\u5FC3\u91CC\u53D1\u9178\uFF0C\u7B2C\u4E09\u904D\u624D\u95EE\u4ED6\u4EEC\u60F3\u8D77\u4E86\u4EC0\u4E48\u3002"
        }
      ],
      forbiddenPatterns: FORBIDDEN_PATTERNS.map((p) => p.id),
      bannedWords: BANNED_WORD_TEXTS.slice(),
      subjectRules: [
        "\u627F\u8BFA\u843D\u5728\u81EA\u5DF1\u8EAB\u4E0A\uFF1A\u591A\u7528\u300C\u6211\u6765\u300D\u300C\u6211\u8FD9\u6837\u505A\u300D\u300C\u6211\u5148\u8BF4\u6E05\u695A\u300D\u3002",
        "\u5C11\u7528\u300C\u8BF7\u4F60\u8BF4\u300D\u300C\u8BA9\u6211\u4EEC\u300D\u300C\u5927\u5BB6\u53EF\u4EE5\u300D\u2014\u2014\u8BC4\u59D4\u4E0D\u662F\u4F60\u7684\u5B66\u751F\uFF0C\u4E0D\u8981\u6307\u6325\u4ED6\u3002"
      ],
      // 与既有 SYSTEM_PROMPT 第 5 条同口径（每句 ≤120 字），这里不另立一条更紧的数，
      // 免得 D 块顺手把 A/B 块之外的生成口径改了。
      maxSentenceChars: 120,
      slots: ["speech\uFF08\u8BF4\u8BFE\u7A3F\u516D\u6BB5\uFF09", "segments[].script\uFF08\u73AF\u8282\u53E3\u64AD\u7A3F\uFF09", "objectives / keyPoint / hardPoint"]
    };
    CLASSROOM = {
      kind: "classroom",
      name: "\u8BFE\u5802",
      audience: "\u8BB2\u7ED9\u5B66\u751F\u62AC\u5934\u542C\uFF1A\u4E00\u9875\u4E00\u53E5\u8BDD\uFF0C\u5FF5\u51FA\u6765\u5C31\u662F\u8BFE\u5802\u73B0\u573A",
      rules: [
        "\u53E5\u5B50\u77ED\uFF0C\u4E00\u53E5\u53EA\u8BF4\u4E00\u4E2A\u610F\u601D\uFF1B\u80FD\u8BF4\u4E03\u4E2A\u5B57\u8BF4\u5B8C\u7684\u4E0D\u8981\u7528\u4E8C\u5341\u4E2A\u5B57\u3002",
        "\u6BCF\u9875\u5907\u6CE8\u81F3\u5C11\u5E26\u4E00\u4E2A\u95EE\u53E5\uFF0C\u95EE\u53E5\u540E\u9762\u6807\u505C\u987F\uFF1A\uFF08\u505C\u4E09\u79D2\uFF09\u3002\u4E0D\u7B49\u5B66\u751F\u7B54\u5B8C\u4E0D\u8BB8\u5F80\u4E0B\u5FF5\u3002",
        "\u4E0D\u7528\u300C\u56E0\u6B64\u300D\u300C\u7EFC\u4E0A\u6240\u8FF0\u300D\u300C\u7531\u6B64\u53EF\u89C1\u300D\u300C\u603B\u800C\u8A00\u4E4B\u300D\u8FD9\u7C7B\u4E66\u9762\u8FDE\u63A5\u8BCD\uFF0C\u76F4\u63A5\u8BF4\u4E0B\u4E00\u53E5\u3002",
        "\u4E0D\u53EB\u300C\u6559\u5B66\u76EE\u6807\u300D\u300C\u73AF\u8282\u300D\u300C\u65F6\u957F\u300D\u8FD9\u4E9B\u6559\u7814\u540D\u8BCD\uFF1B\u5634\u4E0A\u8BF4\u7684\u662F\u300C\u8FD9\u4E00\u6BB5\u300D\u300C\u8FD9\u90E8\u5206\u300D\u3002",
        "\u7B54\u6848\u4E0D\u8FDB\u9875\u9762\u6587\u5B57\uFF0C\u53EA\u8FDB\u5907\u6CE8\uFF1B\u9875\u9762\u4E0A\u7559\u7ED9\u5B66\u751F\u7684\u53EA\u6709\u95EE\u53E5\u548C\u753B\u9762\u3002"
      ],
      examples: [
        {
          bad: "\u7531\u6B64\u53EF\u89C1\uFF0C\u4F5C\u8005\u6B63\u662F\u501F\u6842\u82B1\u8FD9\u4E00\u8F7D\u4F53\uFF0C\u5145\u5206\u4F53\u73B0\u51FA\u5BF9\u6545\u4E61\u6DF1\u5207\u7684\u601D\u5FF5\u4E4B\u60C5\u3002",
          good: "\u6842\u82B1\u4E3A\u4EC0\u4E48\u8001\u5FD8\u4E0D\u6389\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u56E0\u4E3A\u5B83\u8FDE\u7740\u9662\u5B50\u91CC\u7684\u90A3\u4E2A\u4EBA\u3002"
        }
      ],
      forbiddenPatterns: FORBIDDEN_PATTERNS.map((p) => p.id),
      bannedWords: BANNED_WORD_TEXTS.slice(),
      subjectRules: [
        "\u5C11\u7528\u300C\u8BF7\u4F60\u8BF4\u300D\u300C\u8BA9\u6211\u4EEC\u300D\u300C\u5927\u5BB6\u53EF\u4EE5\u300D\uFF0C\u591A\u7528\u300C\u6211\u6765\u300D\u300C\u6211\u8FD9\u6837\u505A\u300D\u3002",
        "\u8981\u5B66\u751F\u505A\u4E8B\u65F6\uFF0C\u5148\u8BF4\u6E05\u6211\u8981\u505A\u4EC0\u4E48\uFF0C\u518D\u8BF4\u4ED6\u505A\u4EC0\u4E48\u3002"
      ],
      maxSentenceChars: 30,
      slots: ["slides[].notes\uFF08\u5B66\u751F\u7248\u6BCF\u9875\u5907\u6CE8\uFF09", "slides[].title / line / items\uFF08\u9875\u9762\u53EF\u89C1\u6587\u5B57\uFF09"]
    };
    DEFENSE = {
      kind: "defense",
      name: "\u7B54\u8FA9",
      audience: "\u4E34\u573A\u7B54\uFF1A\u8BC4\u59D4\u8FFD\u95EE\uFF0C\u4E09\u5341\u79D2\u5185\u5FC5\u987B\u6536\u53E3",
      rules: [
        "\u5148\u7ED9\u5224\u65AD\uFF0C\u518D\u7ED9\u7406\u7531\uFF1A\u7B2C\u4E00\u53E5\u5C31\u662F\u7B54\u6848\uFF0C\u4E0D\u8981\u94FA\u57AB\u3002",
        "\u603B\u5171 60 \u5B57\u4EE5\u5185\uFF0C\u8BF4\u5B8C\u5C31\u505C\uFF0C\u4E0D\u8981\u8865\u7B2C\u4E09\u5C42\u7406\u7531\u3002",
        "\u5F00\u5934\u4E0D\u8BB8\u300C\u8FD9\u4E2A\u95EE\u9898\u53EF\u4EE5\u4ECE\u4E09\u4E2A\u65B9\u9762\u6765\u770B\u300D\uFF1B\u4E5F\u4E0D\u8BB8\u300C\u8C22\u8C22\u8BC4\u59D4\u8001\u5E08\u7684\u63D0\u95EE\u300D\u3002",
        "\u7406\u7531\u8981\u843D\u5230\u8FD9\u8282\u8BFE\u7684\u5177\u4F53\u52A8\u4F5C\u4E0A\uFF1A\u54EA\u4E00\u9875\u3001\u54EA\u4E2A\u63D0\u95EE\u3001\u5B66\u751F\u505A\u4E86\u4EC0\u4E48\u3002"
      ],
      examples: [
        {
          bad: "\u8FD9\u4E2A\u95EE\u9898\u53EF\u4EE5\u4ECE\u4E09\u4E2A\u65B9\u9762\u6765\u770B\u3002\u9996\u5148\uFF0C\u4ECE\u8BFE\u7A0B\u6807\u51C6\u7684\u8981\u6C42\u6765\u8BF4\u2026\u2026\u5176\u6B21\uFF0C\u4ECE\u5B66\u60C5\u89D2\u5EA6\u800C\u8A00\u2026\u2026\u6700\u540E\uFF0C\u4ECE\u8BC4\u4EF7\u8BBE\u8BA1\u4E0A\u770B\u2026\u2026",
          good: "\u6211\u628A\u5B83\u653E\u5728\u6700\u540E\u3002\u5B66\u751F\u5148\u8981\u4F1A\u6570\u68F1\uFF0C\u624D\u77E5\u9053\u300C\u957F\u5BBD\u9AD8\u300D\u662F\u4ECE\u68F1\u91CC\u62BD\u51FA\u6765\u7684\u2014\u2014\u987A\u5E8F\u53CD\u4E86\uFF0C\u6982\u5FF5\u5C31\u662F\u80CC\u7684\u3002"
        }
      ],
      forbiddenPatterns: FORBIDDEN_PATTERNS.map((p) => p.id),
      bannedWords: BANNED_WORD_TEXTS.slice(),
      subjectRules: ["\u7B54\u7684\u662F\u81EA\u5DF1\u7684\u8BBE\u8BA1\uFF0C\u4E3B\u8BED\u4E00\u5F8B\u662F\u300C\u6211\u300D\uFF1B\u4E0D\u8981\u628A\u8BDD\u63A8\u7ED9\u300C\u6211\u4EEC\u6559\u7814\u7EC4\u300D\u300C\u65B0\u8BFE\u6807\u300D\u3002"],
      // §D.1「总共 60 字以内」落在单句上；整条 answer 仍守既有 ≤80 字口径（Result.tsx 的 QA_LIMIT），
      // 那一条不归 D 块改。
      maxSentenceChars: 60,
      slots: ["defense[].question / defense[].answer\uFF08\u7B54\u8FA9\u9884\u6848 7 \u6761\uFF09"]
    };
    VOICE_PROFILES = [SHUOKE, CLASSROOM, DEFENSE];
    VISIBLE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]|[0-9A-Za-z]/g;
  }
});

// src/data/texts.ts
var texts_exports = {};
__export(texts_exports, {
  TEXTS: () => TEXTS,
  findText: () => findText,
  splitQuotes: () => splitQuotes
});
function normalizeTopic(raw) {
  return String(raw ?? "").replace(/[《》〈〉「」『』“”"'’‘\s·•・‧\-—_]/g, "").replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248)).toLowerCase();
}
function findText(topic) {
  const t = normalizeTopic(topic);
  if (!t) return void 0;
  return TEXTS.find((e) => {
    const k = normalizeTopic(e.title);
    return Boolean(k) && (t.includes(k) || k.includes(t));
  });
}
function visibleChars2(text) {
  let n = 0;
  for (const ch of String(text ?? "")) if (VISIBLE2.test(ch)) n++;
  return n;
}
function fitQuote(raw) {
  const s = String(raw ?? "").trim();
  if (visibleChars2(s) < 8) return "";
  if ([...s].length > 60) {
    const cut = s.search(/[，,；;：:]/);
    return cut > 0 ? s.slice(0, cut).trim() : s;
  }
  return s;
}
function splitQuotes(raw) {
  const out = [];
  let carry = "";
  for (const line of String(raw ?? "").split(/\r?\n/)) {
    const text = carry + String(line ?? "").trim();
    carry = "";
    if (!text) continue;
    let buf = "";
    let depth = 0;
    const flush = () => {
      const one = fitQuote(buf);
      if (one) out.push(one);
      buf = "";
    };
    for (const ch of text) {
      buf += ch;
      if (ch === '"') depth = depth > 0 ? depth - 1 : depth + 1;
      else if (ch === "\u201C" || ch === "\u300C" || ch === "\u300E") depth += 1;
      else if ((ch === "\u201D" || ch === "\u300D" || ch === "\u300F") && depth > 0) depth -= 1;
      if (depth === 0 && SENT_END.test(ch)) flush();
    }
    const tail = buf.trim();
    if (!tail) continue;
    if (!SENT_END.test(tail) && [...tail].length <= 60 && !HEADING.test(tail)) carry = tail;
    else flush();
  }
  if (carry) {
    const one = fitQuote(carry);
    if (one) out.push(one);
  }
  return [...new Set(out)];
}
var TEXTS, VISIBLE2, SENT_END, HEADING;
var init_texts = __esm({
  "src/data/texts.ts"() {
    "use strict";
    TEXTS = [
      {
        title: "\u89C2\u6F6E",
        grade: "\u56DB\u5E74\u7EA7\u4E0A\u518C",
        quotes: [
          "\u6F6E\u6765\u4E86\uFF0C\u53EA\u89C1\u4E1C\u8FB9\u6C34\u5929\u76F8\u63A5\u7684\u5730\u65B9\u51FA\u73B0\u4E86\u4E00\u6761\u767D\u7EBF\uFF0C\u4EBA\u7FA4\u53C8\u6CB8\u817E\u8D77\u6765\u3002",
          "\u90A3\u6761\u767D\u7EBF\u5F88\u5FEB\u5730\u5411\u6211\u4EEC\u79FB\u6765\uFF0C\u9010\u6E10\u62C9\u957F\uFF0C\u53D8\u7C97\uFF0C\u6A2A\u8D2F\u6C5F\u9762\u3002",
          "\u518D\u8FD1\u4E9B\uFF0C\u53EA\u89C1\u767D\u6D6A\u7FFB\u6EDA\uFF0C\u5F62\u6210\u4E00\u5835\u4E24\u4E08\u591A\u9AD8\u7684\u6C34\u5899\u3002"
        ]
      },
      {
        title: "\u6842\u82B1\u96E8",
        grade: "\u4E94\u5E74\u7EA7\u4E0A\u518C",
        quotes: [
          "\u6842\u82B1\u5F00\u4E86\uFF0C\u6EE1\u6811\u90FD\u662F\u91D1\u9EC4\u7684\uFF0C\u597D\u770B\u5F97\u5F88\u3002",
          "\u5916\u5730\u7684\u6842\u82B1\u518D\u9999\uFF0C\u8FD8\u662F\u6BD4\u4E0D\u5F97\u5BB6\u4E61\u65E7\u5B85\u9662\u5B50\u91CC\u7684\u91D1\u6842\u3002",
          "\u6211\u558A\u7740\uFF1A\u201C\u554A\uFF01\u771F\u50CF\u4E0B\u96E8\uFF0C\u597D\u9999\u7684\u96E8\u554A\uFF01\u201D"
        ]
      },
      {
        title: "\u4E03\u5F8B\xB7\u957F\u5F81",
        grade: "\u516D\u5E74\u7EA7\u4E0A\u518C",
        quotes: [
          "\u7EA2\u519B\u4E0D\u6015\u8FDC\u5F81\u96BE\uFF0C\u4E07\u6C34\u5343\u5C71\u53EA\u7B49\u95F2\u3002",
          "\u4E94\u5CAD\u9036\u8FE4\u817E\u7EC6\u6D6A\uFF0C\u4E4C\u8499\u78C5\u7934\u8D70\u6CE5\u4E38\u3002",
          "\u91D1\u6C99\u6C34\u62CD\u4E91\u5D16\u6696\uFF0C\u5927\u6E21\u6865\u6A2A\u94C1\u7D22\u5BD2\u3002",
          "\u66F4\u559C\u5CB7\u5C71\u5343\u91CC\u96EA\uFF0C\u4E09\u519B\u8FC7\u540E\u5C3D\u5F00\u989C\u3002"
        ]
      },
      {
        title: "\u6625",
        grade: "\u4E03\u5E74\u7EA7\u4E0A\u518C",
        quotes: [
          "\u76FC\u671B\u7740\uFF0C\u76FC\u671B\u7740\uFF0C\u4E1C\u98CE\u6765\u4E86\uFF0C\u6625\u5929\u7684\u811A\u6B65\u8FD1\u4E86\u3002",
          "\u5C0F\u8349\u5077\u5077\u5730\u4ECE\u571F\u91CC\u94BB\u51FA\u6765\uFF0C\u5AE9\u5AE9\u7684\uFF0C\u7EFF\u7EFF\u7684\u3002"
        ]
      },
      {
        title: "\u8377\u5858\u6708\u8272",
        grade: "\u9AD8\u4E00\u4E0B\u518C",
        quotes: [
          "\u66F2\u66F2\u6298\u6298\u7684\u8377\u5858\u4E0A\u9762\uFF0C\u5F25\u671B\u7684\u662F\u7530\u7530\u7684\u53F6\u5B50\u3002",
          "\u6708\u5149\u5982\u6D41\u6C34\u4E00\u822C\uFF0C\u9759\u9759\u5730\u6CFB\u5728\u8FD9\u4E00\u7247\u53F6\u5B50\u548C\u82B1\u4E0A\u3002"
        ]
      },
      {
        title: "\u80CC\u5F71",
        grade: "\u516B\u5E74\u7EA7\u4E0A\u518C",
        quotes: [
          "\u6211\u770B\u89C1\u4ED6\u6234\u7740\u9ED1\u5E03\u5C0F\u5E3D\uFF0C\u7A7F\u7740\u9ED1\u5E03\u5927\u9A6C\u8902\uFF0C\u6DF1\u9752\u5E03\u68C9\u888D\uFF0C\u8E52\u8DDA\u5730\u8D70\u5230\u94C1\u9053\u8FB9\uFF0C\u6162\u6162\u63A2\u8EAB\u4E0B\u53BB\uFF0C\u5C1A\u4E0D\u5927\u96BE\u3002"
        ]
      },
      {
        title: "\u6D4E\u5357\u7684\u51AC\u5929",
        grade: "\u4E03\u5E74\u7EA7\u4E0A\u518C",
        quotes: [
          "\u6700\u5999\u7684\u662F\u4E0B\u70B9\u5C0F\u96EA\u5440\u3002",
          "\u5C71\u4E0A\u7684\u77EE\u677E\u8D8A\u53D1\u7684\u9752\u9ED1\uFF0C\u6811\u5C16\u4E0A\u9876\u7740\u4E00\u9AFB\u513F\u767D\u82B1\uFF0C\u597D\u50CF\u65E5\u672C\u770B\u62A4\u5987\u3002"
        ]
      },
      {
        title: "\u8349\u8239\u501F\u7BAD",
        grade: "\u4E94\u5E74\u7EA7\u4E0B\u518C",
        quotes: [
          "\u8BF8\u845B\u4EAE\u8BF4\uFF1A\u201C\u600E\u4E48\u6562\u8DDF\u90FD\u7763\u5F00\u73A9\u7B11\uFF1F\u6211\u613F\u610F\u7ACB\u4E0B\u519B\u4EE4\u72B6\uFF0C\u4E09\u5929\u9020\u4E0D\u597D\uFF0C\u7518\u53D7\u60E9\u7F5A\u3002\u201D"
        ]
      }
    ];
    VISIBLE2 = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF0-9A-Za-z]/;
    SENT_END = /[。！？；…]/;
    HEADING = /^(?:第[一二三四五六七八九十\d]+[段章节课页]|《[^》]*》|[（(]?[一二三四五六七八九十\d]+[）)、.．]?(?:段|章|节|课|页)?)$/;
  }
});

// src/lib/prompt.ts
function buildUserPrompt(input2) {
  const scale = scaleOf(input2.duration);
  const lesson = scale === "lesson";
  const segRule = lesson ? `- \u8FD9\u662F\u4E00\u8282 ${Math.round(input2.duration / 60)} \u5206\u949F\u7684\u5B8C\u6574\u8BFE\uFF0C\u4E0D\u662F\u7247\u6BB5\u3002segments \u6392 6\u20137 \u4E2A\u73AF\u8282\uFF1A\u9884\u4E60 / \u5BFC\u5165 / \u5B57\u8BCD\u6216\u57FA\u7840 / \u7CBE\u8BFB\u6216\u63A2\u7A76\uFF08\u53EF\u4EE5\u62C6\u6210\u4E24\u4E2A\uFF09/ \u8BFE\u4E2D\u7EC3\u4E60\u6216\u8BFE\u5802\u6D3B\u52A8 / \u5C0F\u7ED3 / \u4F5C\u4E1A\uFF0Cratio \u4E4B\u548C\u7B49\u4E8E 1\uFF0C\u5176\u4E2D\u5FC5\u987B\u6709\u4E00\u6BB5\u300C\u8BFE\u4E2D\u7EC3\u4E60\u6216\u8BFE\u5802\u6D3B\u52A8\u300D
- \u6BCF\u4E2A\u73AF\u8282\u90FD\u8981\u6709\u80FD\u5F00\u53E3\u8BB2\u7684 scripts\uFF1A\u4E0D\u662F\u63D0\u7EB2\uFF0C\u662F\u7AD9\u5728\u8BB2\u53F0\u4E0A\u80FD\u76F4\u63A5\u5FF5\u7684\u8BDD\uFF1B\u91CD\u70B9\u73AF\u8282\u7684 script \u5199\u8DB3\uFF0C\u5141\u8BB8\u5199\u5230 200 \u5B57` : `- segments \u56FA\u5B9A 5 \u4E2A\u73AF\u8282\uFF1A\u5BFC\u5165 / \u521D\u8BFB\u6216\u65B0\u6388 / \u7CBE\u8BFB\u6216\u63A2\u7A76 / \u62D3\u5C55 / \u5C0F\u7ED3\uFF0Cratio \u4F9D\u6B21\u4E3A 0.125\u30010.2\u30010.4\u30010.175\u30010.1\uFF0C\u73AF\u8282\u540D\u8981\u5177\u4F53\uFF08\u4F8B\u5982\u201C\u7CBE\u8BFB \xB7 \u54C1\u5473\u6447\u82B1\u4E50\u201D\uFF09`;
  return `\u8BF7\u4E3A\u4EE5\u4E0B\u8BFE\u9898\u751F\u6210\u5907\u8BFE\u5305\uFF1A

- \u8BFE\u9898\uFF1A\u300A${input2.topic}\u300B
- \u5B66\u79D1\uFF1A${input2.subject || "\u672A\u586B\u2014\u2014\u4F60\u81EA\u5DF1\u6309\u8BFE\u9898\u5224\u5B9A\uFF0C\u586B\u8FDB meta.subject"}
- \u5B66\u6BB5\uFF1A${input2.stage || "\u672A\u586B\u2014\u2014\u4F60\u81EA\u5DF1\u5224\u5B9A\uFF0C\u586B\u8FDB meta.stage"}
- \u5E74\u7EA7\uFF1A${input2.grade || "\u672A\u586B\u2014\u2014\u4F60\u81EA\u5DF1\u5224\u5B9A\uFF0C\u586B\u8FDB meta.grade"}
- \u8BFE\u65F6\uFF1A${input2.period}
- \u6559\u6750\u7248\u672C\uFF1A${input2.textbook || "\u4E0D\u9650"}
- \u65F6\u957F\uFF1A${Math.round(input2.duration / 60)} \u5206\u949F\uFF08\u6309\u533A\u95F4\u9009\u9AA8\u67B6\uFF0C\u4E0D\u662F\u628A\u77ED\u8BFE\u62C9\u957F\uFF09

\u4E25\u683C\u6309\u7167\u4EE5\u4E0B JSON \u7ED3\u6784\u8F93\u51FA\uFF08\u4E0D\u8981\u589E\u5220\u5B57\u6BB5\uFF09\uFF1A

{
  "meta": { "topic": "", "subject": "", "stage": "", "grade": "", "period": "", "textbook": "", "duration": ${input2.duration} },
  "objectives": { "knowledge": "", "process": "", "emotion": "" },
  "keyPoint": "",
  "hardPoint": "",
  "preparation": "",
  "segments": [
    { "name": "\u73AF\u8282\u540D", "ratio": 0.125, "goal": "\u8FD9\u4E2A\u73AF\u8282\u8981\u8FBE\u6210\u4EC0\u4E48", "teacher": "\u6559\u5E08\u6D3B\u52A8", "student": "\u5B66\u751F\u6D3B\u52A8", "script": "\u8FD9\u4E00\u73AF\u8282\u7684\u53E3\u64AD\u7A3F\uFF0C\u80FD\u76F4\u63A5\u5FF5", "pauses": [{ "afterText": "\u63D2\u5728\u54EA\u53E5\u8BDD\u4E4B\u540E", "seconds": 5, "question": "\u4E0D\u8D85\u8FC7 20 \u5B57\u7684\u95EE\u53E5", "type": "\u786E\u8BA4\u7406\u89E3" }] }
  ],
  "homework": { "must": "", "optional": "" },
  "blackboard": { "layout": "\u7528 ASCII \u753B\u51FA\u677F\u4E66\u5E03\u5C40", "order": ["\u4E66\u5199\u987A\u5E8F1", "\u4E66\u5199\u987A\u5E8F2"] },
  "prep": {
    "courseware": [{ "name": "\u8BFE\u4EF6\u7D20\u6750\u540D", "usage": "\u4EC0\u4E48\u65F6\u5019\u7528", "searchHint": "\u53EF\u76F4\u63A5\u590D\u5236\u53BB\u641C\u7684\u5173\u952E\u8BCD" }],
    "physical": [{ "name": "\u5B9E\u7269\u6559\u5177\u540D", "usage": "\u4EC0\u4E48\u65F6\u5019\u7528" }],
    "media": [{ "name": "\u97F3\u89C6\u9891\u540D", "usage": "\u4EC0\u4E48\u65F6\u5019\u7528", "searchHint": "\u68C0\u7D22\u5173\u952E\u8BCD" }]
  },
  "speech": [ { "section": "\u8BF4\u6559\u6750", "text": "" } ],
  "defense": [ { "question": "", "answer": "" } ]
}

\u6CE8\u610F\uFF1A
- meta \u91CC\u7684 subject / stage / grade \u5FC5\u987B\u6309\u4F60\u7684\u5224\u65AD\u586B\u597D\uFF1B\u786E\u5B9E\u5224\u4E0D\u51FA\u6765\u7684\u5B57\u6BB5\u624D\u7559\u7A7A\u5B57\u7B26\u4E32\uFF0C\u4E0D\u8981\u778E\u731C
${segRule}
- speech \u8981\u6709 6 \u6BB5\uFF1A\u8BF4\u6559\u6750\u3001\u8BF4\u5B66\u60C5\u3001\u8BF4\u76EE\u6807\u3001\u8BF4\u6559\u6CD5\u4E0E\u5B66\u6CD5\u3001\u8BF4\u6559\u5B66\u8FC7\u7A0B\u3001\u8BF4\u677F\u4E66
- defense \u7ED9 7 \u6761\uFF0C\u6BCF\u6761 answer \u4E0D\u8D85\u8FC7 80 \u4E2A\u6C49\u5B57
- \u6BCF\u4E2A\u73AF\u8282 pauses \u6700\u591A 2 \u4E2A\uFF0Cseconds \u5728 3\u201310 \u4E4B\u95F4\uFF1B\u6CA1\u6709\u5FC5\u8981\u5C31\u4E0D\u7ED9\uFF0C\u4E0D\u8981\u4E3A\u4E86\u51D1\u6570\u786C\u52A0
- pauses[].type \u53EA\u80FD\u662F\u201C\u786E\u8BA4\u7406\u89E3\u201D\u201C\u5F15\u53D1\u601D\u8003\u201D\u201C\u8FC7\u6E21\u201D\u4E09\u8005\u4E4B\u4E00
- prep \u4E09\u7EC4\u5404\u7ED9 2\u20133 \u9879\uFF0CsearchHint \u5199\u6210\u8001\u5E08\u80FD\u76F4\u63A5\u7C98\u8D34\u7684\u641C\u7D22\u8BCD\uFF1B\u6CA1\u6709\u97F3\u89C6\u9891\u5C31\u7559\u7A7A\u6570\u7EC4\uFF0C\u4E0D\u8981\u786C\u51D1
- blackboard.layout \u7528\u7B49\u5BBD\u5B57\u7B26\u753B\uFF0C\u4E0D\u8981\u4F7F\u7528\u4EFB\u4F55 markdown \u4EE3\u7801\u56F4\u680F\u7B26\u53F7
- homework \u5206\u5FC5\u505A\u4E0E\u9009\u505A\uFF0Cpreparation \u5217\u51FA\u5177\u4F53\u6559\u5177`;
}
function planToTeacherText(plan2) {
  const clip2 = (t, n) => {
    const s = String(t ?? "").replace(/\s+/g, " ").trim();
    return s.length > n ? `${s.slice(0, n)}\u2026` : s;
  };
  const lines2 = [];
  lines2.push(`\u4E09\u6761\u76EE\u6807\uFF1A
- \u77E5\u8BC6\uFF1A${clip2(plan2.objectives?.knowledge, 120)}
- \u8FC7\u7A0B\uFF1A${clip2(plan2.objectives?.process, 120)}
- \u60C5\u611F\uFF1A${clip2(plan2.objectives?.emotion, 120)}`);
  lines2.push(`\u8981\u8BB2\u900F\u7684\uFF1A${clip2(plan2.keyPoint, 100)}`);
  lines2.push(`\u96BE\u7A81\u7834\u7684\uFF1A${clip2(plan2.hardPoint, 100)}`);
  lines2.push(
    "\u5404\u6BB5\u8BB2\u4EC0\u4E48\u3001\u8001\u5E08\u600E\u4E48\u8BF4\uFF1A\n" + (plan2.segments ?? []).map((seg) => {
      const qs = (seg.pauses ?? []).map((p) => p.question).filter(Boolean).join(" / ");
      return `\u3010${seg.name}\u3011${clip2(seg.goal, 60)}\uFF5C\u8BB2\u53F0\u4E0A\u7684\u8BDD\uFF1A${clip2(seg.script, 140)}${qs ? `\uFF5C\u95EE\u5B66\u751F\uFF1A${qs}` : ""}`;
    }).join("\n")
  );
  lines2.push(`\u8BFE\u540E\uFF1A\u5FC5\u505A ${clip2(plan2.homework?.must, 70)}\uFF5C\u9009\u505A ${clip2(plan2.homework?.optional, 70)}`);
  lines2.push(`\u677F\u4E66\u4E66\u5199\u987A\u5E8F\uFF1A${(plan2.blackboard?.order ?? []).map((o) => clip2(o, 40)).join("\uFF1B")}`);
  lines2.push(
    `\u53EF\u4EE5\u7528\u4E0A\u7684\u68C0\u7D22\u8BCD\uFF1A${(plan2.prep?.courseware ?? []).map((c) => c.searchHint ?? c.name).filter(Boolean).slice(0, 3).join(" / ")}`
  );
  return lines2.join("\n\n");
}
function pageRangeText(lim) {
  return lim.pagesMin === lim.pagesMax ? `${lim.pagesMin} \u9875` : `${lim.pagesMin}\u2013${lim.pagesMax} \u9875`;
}
function deckToPrompt(pages) {
  const clip2 = (t, n) => {
    const s = String(t ?? "").replace(/\s+/g, " ").trim();
    return [...s].length > n ? `${[...s].slice(0, n).join("")}\u2026` : s;
  };
  return pages.filter((p) => !isTeacherPage(p)).map((p, i) => {
    const bullets = (p.bullets ?? []).map((b) => clip2(b, 30)).filter(Boolean);
    const q = p.question ? `\uFF5C\u63D0\u95EE\uFF1A${clip2(p.question, 30)}` : "";
    const body = bullets.length ? `\uFF5C${bullets.join(" / ")}` : "";
    return `${i + 1}. \u3010${p.label || p.kind}\u3011${clip2(p.title, 30)}${body}${q}`;
  }).join("\n");
}
function buildStudentSlidesPrompt(plan2, lock = "auto", scale = scaleOf(plan2?.meta?.duration), edited) {
  const lesson = scale === "lesson";
  const lim = limitsFor(lock, scale, plan2?.meta?.duration);
  const orderRule = lesson ? `2. \u9875\u5E8F\u8DDF\u7740\u73AF\u8282\u8D70\uFF0C\u4E0D\u6309\u9875\u578B\u6392\uFF1A\u5934\u4E24\u9875\u662F cover \u5C01\u9762\u3001goals \u8FD9\u8282\u8BFE\u505A\u4E09\u4EF6\u4E8B\uFF0C \u4E4B\u540E\u6BCF\u4E00\u4E2A\u73AF\u8282 3\u20134 \u9875\uFF08\u8FD9\u4E00\u6BB5\u770B\u4EC0\u4E48 / \u8BFB\u54EA\u4E00\u53E5 / \u8BD5\u4E00\u8BD5\uFF09\uFF0C\u6700\u540E\u4E09\u9875\u662F board \u677F\u4E66\u3001homework \u4F5C\u4E1A\u3001end \u6536\u5C3E\u3002\u540C\u4E00\u9875\u578B\u53EF\u4EE5\u91CD\u590D\u51FA\u73B0\u2014\u2014\u516D\u4E03\u4E2A\u73AF\u8282\u5C31\u662F\u516D\u4E03\u7EC4\u9875\u9762\uFF0C\u4E0D\u8981 \u4E3A\u4E86\u300C\u9875\u578B\u4E0D\u91CD\u590D\u300D\u628A\u56DB\u5341\u8282\u8BFE\u538B\u56DE\u5341\u6765\u9875\u3002` : `2. \u9875\u5E8F\u56FA\u5B9A\uFF1Acover \u5C01\u9762 \u2192 hook \u60C5\u5883\u5BFC\u5165 \u2192 goals \u8FD9\u8282\u8BFE\u505A\u4E09\u4EF6\u4E8B \u2192 words \u5B57\u8BCD\u5173 \u2192 close-read \u7CBE\u8BFB\uFF081\u2013${lim.closeReadMax} \u9875\uFF09\u2192 compare \u5BF9\u6BD4/\u8FC1\u79FB \u2192 board \u677F\u4E66 \u2192 drill \u7EC3\u4E00\u7EC3 \u2192 homework \u4F5C\u4E1A \u2192 end \u6536\u5C3E\u3002`;
  const tierBlock = isDensity(lock) ? `\u6863\u4F4D\u5DF2\u5728\u8BBE\u7F6E\u91CC\u9501\u5B9A\u300C${DENSITY_LABELS[lock]}\u300D\uFF08\u786C\u89C4\u5219\u91CC\u7684\u6570\u5B57\u5C31\u662F\u8FD9\u4E00\u6863\uFF0C\u4E0D\u8BB8\u8DF3\u51FA\uFF09\uFF1A\u6B63\u6587 \u2264${lim.bodyChars} \u5B57/\u9875\uFF0C${pageRangeText(lim)}\uFF0C\u975E\u5B57\u8BCD\u9875 items \u2264${lim.itemsMax}\uFF0C\u7CBE\u8BFB \u2264${lim.closeReadMax} \u9875\u3002` : `\u4F60\u6309\u5224\u636E\u81EA\u9009\u4E00\u6863\uFF08\u672A\u9501\u6863\uFF0C\u786C\u89C4\u5219\u91CC\u7684\u6570\u5B57\u662F\u4E09\u6863\u5E76\u96C6\u7684\u6700\u5BBD\u4E0A\u9650\uFF0C\u4E0D\u8D85\u5373\u53EF\uFF0C\u9009\u5B9A\u540E\u5168\u7BC7\u4FDD\u6301\u4E00\u81F4\uFF09\uFF1A
${DENSITY_MENU}`;
  const system = `\u4F60\u662F\u4E00\u4F4D\u5C0F\u5B66\u8001\u5E08\uFF0C\u6B63\u5728\u628A\u81EA\u5DF1\u5907\u597D\u7684\u8BFE\u4EF6\u91CD\u5199\u6210\u8BFE\u5802\u4E0A\u6295\u7ED9\u5B66\u751F\u770B\u7684 PPT\u3002
\u8BFE\u4EF6\u662F\u7ED9\u8001\u5E08\u8BFB\u7684\uFF0C\u8FD9\u53E0\u5E7B\u706F\u7247\u662F\u7ED9\u5B66\u751F\u62AC\u5934\u770B\u7684\u2014\u2014\u5B83\u4EEC\u4E0D\u662F\u540C\u4E00\u4EFD\u4E1C\u897F\u3002
\u5B66\u751F\u4E00\u9875\u53EA\u8BFB\u5F97\u4E0B\u4E00\u884C\u5B57\uFF0C\u770B\u5B8C\u5C31\u60F3\u8BF4\u3002\u4F60\u7684\u4EFB\u52A1\u4E0D\u662F\u7F29\u5199\uFF0C\u662F\u6362\u89C6\u89D2\u91CD\u5199\u3002

\u5BC6\u5EA6\u6863\u4F4D\uFF08\u4E09\u6863\uFF0C\u4EFB\u52A1 08 \xA7B\uFF09\uFF1A
${tierBlock}

\u539F\u6587\u4E0E\u52A8\u4F5C\uFF08\u6709\u539F\u6587\u65F6\u5FC5\u987B\u7167\u505A\uFF0C\u4E00\u6761\u4E0D\u8FC7\u6574\u4EFD\u9000\u56DE\uFF09\uFF1A
\u4E00\u3001\u6709\u539F\u6587\u65F6\u5FC5\u987B\u7528\u539F\u6587\u3002\u7ED9\u4F60\u7684\u3010\u8FD9\u8282\u8BFE\u8981\u8BB2\u7684\u53E5\u5B50\u3011\u91CC\u7684\u53E5\u5B50\uFF0C\u5FC5\u987B\u539F\u6837\u51FA\u73B0\u5728\u5B66\u751F\u7248\u91CC\uFF0C\u4E00\u4E2A\u5B57\u90FD\u4E0D\u8BB8\u6539\uFF0C\u4E0D\u8BB8\u7F29\u5199\u3001\u4E0D\u8BB8\u8865\u6807\u70B9\u3001\u4E0D\u8BB8\u628A\u4E24\u53E5\u5408\u6210\u4E00\u53E5\u3002\u5B66\u751F\u7248\u91CC\u81F3\u5C11 30% \u7684\u9875\u662F\u539F\u6587\u9875\uFF08kind \u586B "quote"\uFF09\u3002\u5982\u679C\u7ED9\u4F60\u7684\u53E5\u5B50\u5F88\u591A\uFF08\u8001\u5E08\u8D34\u4E86\u6574\u7BC7\uFF09\uFF0C\u53EA\u6311 5\u20138 \u53E5\u505A\u539F\u6587\u9875\uFF0C\u6311\u54EA\u51E0\u53E5\u7684\u4F9D\u636E\u662F\u8BFE\u4EF6\u91CC\u8BF4\u8FD9\u8282\u8BFE\u8981\u6293\u7684\u5730\u65B9\uFF08\u91CD\u70B9\u6BB5\u3001\u5173\u952E\u8BCD\u6240\u5728\u53E5\uFF09\u3002\u5269\u4E0B\u7684\u53E5\u5B50\u4E0D\u8981\u786C\u585E\uFF0C\u5B81\u53EF\u5C11\u3002
\u4E8C\u3001\u539F\u6587\u9875\u53EA\u653E\u4E24\u6837\u4E1C\u897F\uFF1Atext = \u539F\u6587\u91CC\u9010\u5B57\u5B58\u5728\u7684\u4E00\u53E5\uFF08\u957F\u7684\u53EF\u4EE5\u53EA\u53D6\u4E00\u4E2A\u5206\u53E5\uFF0C\u4F46\u4E0D\u80FD\u6539\u5B57\uFF09\uFF1Bnote = \u51FA\u5904\u6216\u4E00\u53E5\u63D0\u793A\uFF08\u53EF\u7A7A\uFF0C\u4E0D\u8D85\u8FC7 12 \u5B57\uFF09\u3002\u539F\u6587\u9875\u4E0D\u5199\u95EE\u53E5\u3001\u4E0D\u5199\u6761\u76EE\u3002
\u4E09\u3001\u9875\u9762\u4E0A\u7684\u6BCF\u4E00\u53E5\u8BDD\uFF0C\u90FD\u8981\u662F\u5B66\u751F\u80FD\u7ACB\u523B\u52A8\u624B\u7684\u52A8\u4F5C\u3002\u5408\u683C\uFF1A\u5708\u51FA\u7B2C 3 \u6BB5\u91CC\u5199\u6F6E\u58F0\u7684\u8BCD / \u7528\u201C\u5148\u2026\u2026\u63A5\u7740\u2026\u2026\u6700\u540E\u2026\u2026\u201D\u8BF4\u4E00\u904D / \u628A\u8FD9\u4E24\u4E2A\u5B57\u5199\u4E00\u904D\u3002\u4E0D\u5408\u683C\uFF08\u51FA\u73B0\u5373\u89C6\u4E3A\u9519\uFF09\uFF1A\u5168\u73ED\u3001\u540C\u684C\u3001\u4E92\u67E5\u3001\u5BF9\u7B54\u6848\u3001\u5C0F\u7EC4\u8BA8\u8BBA\u540E\u3001\u6C47\u62A5\u3001\u4EA4\u6D41\u4E00\u4E0B\u3002

\u786C\u89C4\u5219\uFF08\u4E00\u6761\u4E0D\u8FC7\uFF0C\u6574\u4EFD\u9000\u56DE\uFF09\uFF1A
0. \u9875\u5E8F\u4E0E\u5185\u5BB9\u4EE5\u8001\u5E08\u6539\u5B9A\u7684\u90A3\u4E00\u53E0\u8BFE\u4EF6\u4E3A\u51C6\uFF08\u89C1 user \u91CC\u5217\u51FA\u7684\u9875\uFF09\uFF1A\u53EF\u4EE5\u6362\u9875\u578B\u3001\u53EF\u4EE5\u88C1\u77ED\uFF0C\u4F46\u4E0D\u8BB8\u589E\u5220\u73AF\u8282\u3001\u4E0D\u8BB8\u6539\u52A8\u5B83\u8BB2\u7684\u987A\u5E8F\u3001\u4E0D\u8BB8\u52A0\u5165\u8BFE\u4EF6\u91CC\u6CA1\u6709\u7684\u5185\u5BB9\u3002\u8001\u5E08\u5220\u6389\u7684\u9875\uFF0C\u5B66\u751F\u7248\u91CC\u5BF9\u5E94\u5185\u5BB9\u4E00\u4E2A\u5B57\u90FD\u4E0D\u8BB8\u51FA\u73B0\uFF1B\u8001\u5E08\u63D2\u8FDB\u53BB\u7684\u9875\uFF0C\u5FC5\u987B\u6709\u4E00\u9875\u5BF9\u5E94\u3002
1. \u9875\u6570 ${pageRangeText(lim)}\uFF0C\u4E00\u9875\u53EA\u8BB2\u4E00\u4EF6\u4E8B\uFF0C\u5B81\u53EF\u591A\u4E00\u9875\u4E5F\u4E0D\u5728\u4E00\u9875\u91CC\u585E\u4E09\u4EF6\u3002
${orderRule}
3. kind \u53EA\u80FD\u662F\u8FD9\u5341\u4E00\u4E2A\u82F1\u6587\u503C\uFF1Acover | hook | goals | words | close-read | compare | board | drill | homework | end | quote\u3002
4. \u6BCF\u9875\u6B63\u6587\uFF08line + items \u5408\u8BA1\uFF09\u4E0D\u8D85\u8FC7 ${lim.bodyChars} \u4E2A\u5B57\uFF0C\u6807\u9898\u4E0D\u8BA1\u5165\uFF0C\u6807\u70B9\u548C\u7A7A\u767D\u4E0D\u8BA1\u5165\uFF1B\u8D85\u4E00\u4E2A\u5B57\u5C31\u9000\u56DE\u3002
5. \u6807\u9898\u53EA\u8BB8\u4E24\u79CD\uFF1A**\u6307\u4EE4**\uFF08\u201C\u5708\u51FA\u5199\u58F0\u97F3\u7684\u8BCD\u201D\uFF09\u6216**\u7ED3\u8BBA**\uFF08\u201C\u6F6E\u6C34\u662F\u4ECE\u8FDC\u5904\u4E00\u6761\u767D\u7EBF\u5F00\u59CB\u7684\u201D\uFF09\u3002\u4E0D\u8BB8\u5199\u201C\u4F60\u89C9\u5F97\u5462\u201D\u201C\u54EA\u4E00\u53E5\u6700\u91CD\u8981\u201D\u201C\u5148\u505A\u54EA\u4E00\u4EF6\u201D\u8FD9\u7C7B\u8981\u5B66\u751F\u731C\u8001\u5E08\u5FC3\u601D\u7684\u6807\u9898\u3002
6. goals \u9875\u7684\u6807\u9898\u56FA\u5B9A\u5199\u201C\u8FD9\u8282\u8BFE\u505A\u4E09\u4EF6\u4E8B\u201D\uFF0C\u4E09\u6761\u6761\u76EE\u5FC5\u987B\u662F\u201C\u52A8\u8BCD + \u672C\u8BFE\u7684\u4E1C\u897F\u201D\uFF08\u201C\u8BFB\u7B2C 3\u30014 \u6BB5\uFF0C\u5708\u51FA\u5199\u6F6E\u58F0\u7684\u8BCD\u201D\uFF09\uFF1B\u201C\u8BFB\u61C2\u201D\u201C\u8BF4\u51FA\u60F3\u6CD5\u201D\u201C\u5199\u4E00\u6BB5\u201D\u8FD9\u79CD\u4E09\u4E2A\u5B57\u7684\u7A7A\u8BDD\u6574\u4EFD\u9000\u56DE\u3002
7. \u7B54\u6848\u7EDD\u5BF9\u4E0D\u5199\u5728\u9875\u9762\u4E0A\uFF0C\u53EA\u5199\u8FDB notes\u3002\u9875\u9762\u4E0A\u53EA\u6709\u95EE\u53E5\u548C\u753B\u9762\uFF0Cnotes \u91CC\u624D\u662F\u8001\u5E08\u7684\u53E3\u8BED\u8BB2\u89E3\u4E0E\u63D0\u793A\u3002
8. \u4E03\u4E2A\u8BCD\u4E00\u4E2A\u90FD\u4E0D\u8BB8\u51FA\u73B0\uFF1A\u6559\u5B66\u76EE\u6807\u3001\u6559\u5B66\u91CD\u96BE\u70B9\u3001\u6559\u5B66\u8FC7\u7A0B\u3001\u73AF\u8282\u3001\u65F6\u957F\u3001\u672C\u73AF\u8282\u65E8\u5728\u3001\u6838\u5FC3\u7D20\u517B\uFF08\u9875\u9762\u548C notes \u90FD\u4E0D\u8981\u7528\uFF0Cnotes \u91CC\u8BF4\u201C\u8FD9\u4E00\u6BB5\u201D\u201C\u8FD9\u90E8\u5206\u201D\u5C31\u597D\uFF09\u3002
9. \u8BED\u8A00\u662F\u5B66\u751F\u8BED\u8A00\uFF1A\u5177\u4F53\u3001\u6709\u5F62\u3001\u80FD\u5FF5\u51FA\u53E3\u3002\u7981\u7528\u201C\u901A\u8FC7\u2026\u2026\u638C\u63E1\u2026\u2026\u201D\u201C\u65E8\u5728\u2026\u2026\u201D\u8FD9\u7C7B\u6559\u7814\u8154\u3002
10. \u5B57\u8BCD\u5173\u90A3\u4E00\u9875\u7528 kind: "words"\uFF0Citems \u91CC\u4E00\u4E2A\u8BCD\u4E00\u884C\uFF0C\u6700\u591A ${WORDS_ITEMS_MAX} \u4E2A\u8BCD\uFF08\u8FD9\u9875\u4F1A\u88AB\u653E\u5927\u5230 54pt\uFF0C\u6BCF\u8BCD\u4E0D\u8D85\u8FC7 4 \u5B57\uFF1B\u5B57\u8BCD\u9875\u4EFB\u4F55\u6863\u4F4D\u90FD\u4E0D\u8D85\u8FC7 ${WORDS_ITEMS_MAX} \u4E2A\u8BCD\uFF0C\u8FD9\u4E00\u6761\u4E0D\u968F\u6863\u4F4D\u653E\u5BBD\uFF09\u3002
11. notes \u662F\u4E0A\u53F0\u80FD\u76F4\u63A5\u5FF5\u7684\u53E3\u8BED\uFF0C\u5305\u542B\u8FD9\u4E00\u9875\u7684\u7B54\u6848\u6216\u63D0\u793A\uFF0C\u4E0D\u8D85\u8FC7 120 \u5B57\uFF0C\u4E0D\u8981\u5199\u201C\u672C\u9875\u8BB2\u89E3\u2026\u2026\u201D\u8FD9\u79CD\u65C1\u767D\u4F53\u3002
12. \u6BCF\u9875\u90FD\u5FC5\u987B\u5E26\u201C\u6750\u6599\u201D\u2014\u2014\u5B66\u751F\u4F4E\u5934\u5C31\u80FD\u6307\u7740\u7684\u4E1C\u897F\uFF1A\u4E00\u53E5\u5E26\u5F15\u53F7\u7684\u539F\u6587\uFF08\u9010\u5B57\uFF09\u3001\u672C\u8BFE\u7684\u5B57\u8BCD\u3001\u4E00\u4E2A\u7A7A\uFF08\uFF08\u3000\uFF09\uFF09\u3001\u4E00\u4E2A\u6570\u5B57\u6216\u4E00\u4E2A\u6B65\u9AA4\u3002\u53EA\u6709\u52A8\u4F5C\u3001\u6CA1\u6709\u6750\u6599\u7684\u9875\u6574\u4EFD\u9000\u56DE\uFF0C\u4F8B\uFF1A\u201C\u653E\u56DE\u53E5\u5B50\u91CC\u8BFB\u201D\uFF08\u8BFB\u54EA\u53E5\uFF1F\uFF09\u201C\u8BFB\u4E00\u904D\u201D\uFF08\u8BFB\u4EC0\u4E48\uFF1F\uFF09\u201C\u505A\u52A8\u4F5C\u201D\uFF08\u505A\u54EA\u4E2A\uFF1F\uFF09\u3002\u5199\u6210\u201C\u628A\u2018\u7BA9\u7B50\u3001\u676D\u5DDE\u3001\u6D78\u6DA6\u2019\u653E\u56DE\u7B2C\u4E8C\u6BB5\u90A3\u53E5\u8BDD\u91CC\u8BFB\u201D\uFF0C\u6216\u8005\u5E72\u8106\u628A\u8FD9\u51E0\u4E2A\u8BCD\u76F4\u63A5\u6446\u8FDB items\u3002
13. \u6807\u9898\u4E0D\u8BB8\u662F\u628A\u8001\u5E08\u53E3\u5934\u8BDD\u5207\u4E0B\u6765\u7684\u788E\u7247\uFF1A\u201C\u653E\u56DE\u53E5\u5B50\u91CC\u8BFB\u201D\u201C\u518D\u8BFB\u4E00\u904D\u201D\u201C\u5708\u52A8\u8BCD\u201D\u8FD9\u7C7B\u53EA\u6709\u52A8\u4F5C\u3001\u4E0D\u8BF4\u662F\u54EA\u4E2A\u5BF9\u8C61\u7684\u6807\u9898\u4E00\u5F8B\u9000\u56DE\uFF1B\u6807\u9898\u8981\u4E48\u5E26\u5BF9\u8C61\uFF08\u201C\u7BA9\u7B50\u7684\u7BA9\u201D\uFF09\uFF0C\u8981\u4E48\u5E26\u539F\u6587\uFF08\u201C\u6447\u5440\u6447\u201D\uFF09\uFF0C\u8981\u4E48\u662F\u4E00\u4E2A\u7ED3\u8BBA\u3002
13.5 items \u91CC\u6BCF\u6761\u90FD\u662F\u4E00\u4EF6\u4E1C\u897F\uFF08\u8BCD\u3001\u9010\u5B57\u539F\u6587\u3001\u6570\u5B57\u3001\u6B65\u9AA4\uFF09\uFF0C\u4E0D\u8BB8\u5199\u95EE\u53E5\u3002\u4E00\u9875\u53EA\u6709\u4E00\u4E2A\u95EE\u53E5\uFF0C\u5199\u5728 line \u91CC\uFF1Bitems \u91CC\u5199\u95EE\u53E5\u5C31\u6210\u4E86\u201C\u6B63\u6587\u662F\u539F\u6587\u3001\u6761\u76EE\u95EE\u53E6\u4E00\u4EF6\u4E8B\u201D\uFF0C\u5B66\u751F\u770B\u5230\u4E24\u5957\u8BDD\u3002
14. \u5C01\u9762\u9875\u662F\u6574\u5802\u8BFE\u7684\u95E8\u9762\uFF1Atitle \u53EA\u6709\u8BFE\u9898\u51E0\u4E2A\u5B57\uFF1Bline \u662F\u4E00\u53E5\u70B9\u9898\u7684\u526F\u9898\uFF08\u5982\u201C\u96E8\uFF0C\u4E5F\u53EF\u4EE5\u662F\u9999\u7684\u201D\uFF09\uFF0C\u4E0D\u8BB8\u5199\u6210\u63D0\u95EE\u6216\u6307\u4EE4\uFF1Bmeta\uFF08\u5B66\u6BB5\u5B66\u79D1 + \u5E74\u7EA7\u518C\u6B21\uFF0C\u5982\u201C\u5C0F\u5B66\u8BED\u6587 \xB7 \u4E94\u5E74\u7EA7\u4E0A\u518C\u201D\uFF09\u3001byline\uFF08\u5982\u201C\u4E94\u5E74\u7EA7\uFF083\uFF09\u73ED\u201D\uFF1B\u4E0D\u77E5\u9053\u73ED\u7EA7\u5C31\u5199\u201C\u4E94\u5E74\u7EA7\u3000\u3000\u73ED\u201D\uFF0C\u7559\u7A7A\u7ED9\u8001\u5E08\u586B\uFF09\u3001imageHint\uFF08\u4E00\u5F20\u80FD\u5F53\u5C01\u9762\u4E3B\u56FE\u7684\u5173\u952E\u8BCD\uFF0C\u4E0D\u5199\u6C49\u5B57\uFF09\u4E09\u6837\u90FD\u8981\u7ED9\u3002
15. \u53EA\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981 markdown \u4EE3\u7801\u56F4\u680F\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u6587\u5B57\u3002

\u7ED3\u6784\uFF1A{"slides": [{"kind":"","title":"","text":"","line":"","items":[""],"imageHint":"","meta":"","byline":"","notes":"","compareDiff":[""]}]}
- title\uFF1A\u5B66\u751F\u770B\u5230\u7684\u5927\u5B57\uFF0C\u4E0D\u8D85\u8FC7 12 \u5B57
- text\uFF1A\u53EA\u7ED9 kind \u4E3A quote \u7684\u9875\u2014\u2014\u9010\u5B57\u6284 user \u91CC\u3010\u8FD9\u8282\u8BFE\u8981\u8BB2\u7684\u53E5\u5B50\u3011\u4E2D\u7684\u4E00\u53E5\uFF0C\u5176\u4F59\u9875\u7559\u7A7A
- line\uFF1A\u4E00\u53E5\u8BDD\uFF08\u539F\u6587\u5F15\u53E5\u6216\u95EE\u53E5\uFF0C\u53EA\u80FD\u4E00\u53E5\uFF09
- items\uFF1A\u5B57\u8BCD\u9875\u3001\u4F5C\u4E1A\u9875\u3001\u5BF9\u6BD4\u9875\u7528\uFF0C\u6BCF\u9879\u4E00\u884C\uFF1B\u6BCF\u6761\u90FD\u662F\u4E00\u4EF6\u4E1C\u897F\uFF08\u8BCD / \u9010\u5B57\u539F\u6587 / \u6570\u5B57 / \u6B65\u9AA4\uFF09\uFF0C\u4E0D\u8BB8\u5199\u95EE\u53E5
- meta / byline\uFF1A\u53EA\u7ED9 cover \u9875\uFF0C\u89C1\u7B2C 14 \u6761
- compareDiff\uFF1A\u53EA\u7ED9 kind \u4E3A compare \u7684\u9875\u3002items \u6309\u5DE6\u53F3\u4E24\u680F\u4EA4\u66FF\u5206\u680F\uFF08\u7B2C 1\u30012 \u9879\u4E00\u5BF9\uFF0C\u7B2C 3\u30014 \u9879\u4E00\u5BF9\uFF0C\u843D\u5355\u7684\u5C3E\u5DF4\u4E5F\u7B97\u4E00\u5BF9\uFF09\uFF0CcompareDiff \u7B2C k \u6761\u5C31\u662F\u7B2C k \u5BF9\u300C\u54EA\u513F\u4E0D\u4E00\u6837\u300D\u7684\u63D0\u793A\uFF1A\u6761\u6570\u5FC5\u987B\u7B49\u4E8E\u5BF9\u6570\uFF0C\u6BCF\u6761\u4E0D\u8D85\u8FC7 12 \u4E2A\u5B57\uFF08\u542B\u6807\u70B9\uFF09\uFF0C\u53EA\u6307\u65B9\u5411\u4E0D\u7ED9\u7B54\u6848\uFF0C\u5B66\u751F\u70B9\u90A3\u4E00\u5BF9\u65F6\u6D6E\u5728\u4E24\u680F\u4E2D\u95F4\u3002\u7ED9\u4E0D\u9F50\u5C31\u6574\u4E2A\u5B57\u6BB5\u5B81\u53EF\u4E0D\u7ED9\uFF08\u7F51\u9875\u4F1A\u81EA\u52A8\u9000\u56DE\u4E0D\u53EF\u70B9\uFF0C\u4E0D\u4F1A\u9000\u56DE\u6574\u4EFD\u7A3F\uFF09
- imageHint\uFF1A\u53EA\u5728\u9700\u8981\u56FE\u4F4D\u65F6\u7ED9\uFF0C\u5199\u6210\u80FD\u76F4\u63A5\u7C98\u8D34\u53BB\u641C\u7684\u5173\u952E\u8BCD\uFF0C\u4E0D\u8D85\u8FC7 12 \u5B57

\u6B63\u4F8B\uFF08\u4F1A\u88AB\u7528\uFF09\uFF1A
{"kind":"close-read","title":"\u6447\u5440\u6447","line":"\u4E3A\u4EC0\u4E48\u662F\u201C\u6447\u201D\uFF0C\u4E0D\u662F\u201C\u6458\u201D\uFF1F","items":["\u201C\u6447\u5440\u6447\uFF0C\u6842\u82B1\u7EB7\u7EB7\u843D\u4E0B\u6765\u3002\u201D"],"notes":"\u63D0\u793A\uFF1A\u6447\u662F\u51E0\u4E2A\u4EBA\u62B1\u7740\u6811\u4F7F\u52B2\u6643\uFF0C\u6709\u58F0\u97F3\u3001\u6709\u52A8\u6001\u3001\u6709\u6EE1\u8EAB\u7684\u82B1\uFF1B\u6458\u662F\u4E00\u4E2A\u4EBA\u8F7B\u8F7B\u62FF\u4E0B\u6765\uFF0C\u5B89\u9759\uFF0C\u4E5F\u6CA1\u6709\u573A\u9762\u3002\u8C01\u6765\u628A\u8FD9\u53E5\u8BFB\u51FA\u6447\u7684\u52B2\u513F\uFF1F"}

\u53CD\u4F8B\uFF08\u4F1A\u88AB\u9000\u56DE\uFF09\uFF1A
{"kind":"drill","title":"\u653E\u56DE\u53E5\u5B50\u91CC\u8BFB","notes":"\u8BA9\u5B66\u751F\u628A\u8FD9\u51E0\u4E2A\u8BCD\u653E\u56DE\u53E5\u5B50\u91CC\u8BFB\u4E00\u8BFB\u3002"}
\u8FD9\u5F20\u9519\u5728\u4E24\u5904\uFF1A\u8BFB\u54EA\u51E0\u4E2A\u8BCD\u3001\u54EA\u4E00\u53E5\uFF0C\u9875\u9762\u4E0A\u4E00\u4E2A\u90FD\u6CA1\u6709\uFF1B\u6807\u9898\u662F\u4ECE\u8BB2\u7A3F\u91CC\u5207\u4E0B\u6765\u7684\u534A\u53E5\u53E3\u5934\u8BDD\u3002

{"kind":"close-read","title":"\u6559\u5B66\u91CD\u96BE\u70B9","items":["\u73AF\u8282\u65F6\u957F 4 \u5206\u949F","\u901A\u8FC7\u54C1\u8BFB\u8BFE\u6587\u638C\u63E1\u501F\u7269\u6292\u60C5\u7684\u65B9\u6CD5"],"notes":"\u672C\u73AF\u8282\u65E8\u5728\u5F15\u5BFC\u5B66\u751F\u4F53\u4F1A\u4F5C\u8005\u60C5\u611F"}
\u8FD9\u5F20\u5E7B\u706F\u7247\u9519\u5728\u4E09\u5904\uFF1A\u628A\u6559\u6848\u6807\u9898\u642C\u4E0A\u5C4F\u3001\u5199\u4E86\u65F6\u957F\u8FD9\u79CD\u53EA\u6709\u8001\u5E08\u5173\u5FC3\u7684\u6570\u5B57\u3001\u7B54\u6848\u76F4\u63A5\u5370\u5728\u5B66\u751F\u8138\u4E0A\u3002

${VOICE_CLASSROOM}
\uFF08\u4E0A\u9762\u8FD9\u5957\u8BED\u6C14\u7BA1\u6BCF\u4E00\u9875\u7684 title / line / items \u4E0E notes\u3002\uFF09

\u6700\u540E\u68C0\u67E5\u4E00\u904D\uFF1A\u6BCF\u9875\u5B57\u6570\u8D85\u6CA1\u8D85 ${lim.bodyChars}\uFF1F\u6BCF\u9875\u90FD\u6709\u4E00\u4EF6\u5B66\u751F\u80FD\u6307\u5F97\u5230\u7684\u6750\u6599\u5417\uFF1F\u4E03\u4E2A\u7981\u8BCD\u6709\u6CA1\u6709\u6DF7\u8FDB\u6765\uFF1F\u7B54\u6848\u662F\u4E0D\u662F\u53EA\u5728 notes \u91CC\uFF1F`;
  const quotes = splitQuotes(String(plan2?.meta?.text ?? ""));
  const user = `\u8BFE\u9898\uFF1A\u300A${plan2.meta.topic}\u300B\uFF08${plan2.meta.grade}${plan2.meta.subject}\uFF0C${plan2.meta.period}\uFF09
${lesson ? `\u8FD9\u662F\u4E00\u8282 ${Math.round(Number(plan2.meta.duration) / 60)} \u5206\u949F\u7684\u5B8C\u6574\u8BFE\uFF0C\u6309\u73AF\u8282\u94FA\u5F00\uFF0C\u4E0D\u662F\u628A\u6BCF\u4E00\u9875\u88C1\u77ED\u3002
` : "\n"}${quotes.length ? `\u3010\u8FD9\u8282\u8BFE\u8981\u8BB2\u7684\u53E5\u5B50\u3011\uFF08\u8BFE\u6587\u539F\u6587\uFF0C\u9010\u5B57\u7528\uFF0C\u4E00\u4E2A\u5B57\u90FD\u4E0D\u8BB8\u6539\uFF09\uFF1A
${quotes.map((q, i) => `${i + 1}. ${q}`).join("\n")}

` : ""}${edited?.length ? `\u4E0B\u9762\u662F\u8001\u5E08\u5DF2\u7ECF\u6539\u5B9A\u7684\u8BFE\u4EF6\uFF0C\u9875\u5E8F\u4E0E\u6587\u5B57\u4EE5\u5B83\u4E3A\u51C6\uFF1B\u4F60\u53EF\u4EE5\u91CD\u6392\u6210\u5B66\u751F\u80FD\u770B\u7684\u9875\u578B\uFF0C\u4F46\u4E0D\u8BB8\u589E\u5220\u73AF\u8282\u3001\u4E0D\u8BB8\u6539\u52A8\u5B83\u8BB2\u7684\u987A\u5E8F\u3001\u4E0D\u8BB8\u52A0\u5165\u8BFE\u4EF6\u91CC\u6CA1\u6709\u7684\u5185\u5BB9\u3002\uFF08\u8BBE\u8BA1\u610F\u56FE\u3001\u4E0A\u8BFE\u524D\u51C6\u5907\u8FD9\u4E24\u7C7B\u662F\u7ED9\u8001\u5E08\u81EA\u5DF1\u770B\u7684\uFF0C\u4E0D\u4E0A\u5B66\u751F\u7248\uFF0C\u6E05\u5355\u91CC\u5DF2\u7ECF\u4E0D\u5217\u3002\uFF09

${deckToPrompt(edited)}

` : "\u4E0B\u9762\u662F\u6211\u7ED9\u8001\u5E08\u5907\u7684\u8BFE\u4EF6\uFF0C\u8BF7\u6539\u5199\u6210\u5B66\u751F\u8BFE\u5802\u7248\uFF1A\n\n"}${edited?.length ? "" : `${planToTeacherText(plan2)}

`}\u6309 {"slides": [...]} \u8F93\u51FA ${pageRangeText(lim)}\uFF0C\u4E25\u683C\u6309\u9875\u5E8F\u4E0E kind\uFF0C\u4E0D\u8981\u589E\u5220\u5B57\u6BB5\u3002`;
  return { system, user };
}
var VOICE_SHUOKE, VOICE_DEFENSE, VOICE_CLASSROOM, SYSTEM_PROMPT, DENSITY_MENU;
var init_prompt = __esm({
  "src/lib/prompt.ts"() {
    "use strict";
    init_deck();
    init_density();
    init_scale();
    init_voice();
    init_texts();
    VOICE_SHUOKE = voicePromptBlock("shuoke");
    VOICE_DEFENSE = voicePromptBlock("defense");
    VOICE_CLASSROOM = voicePromptBlock("classroom");
    SYSTEM_PROMPT = `\u4F60\u662F\u4E00\u4F4D\u6709 20 \u5E74\u7ECF\u9A8C\u7684\u5E08\u8303\u751F\u6559\u5B66\u6280\u80FD\u5927\u8D5B\u8BC4\u59D4\uFF0C\u540C\u65F6\u7CBE\u901A\u4E2D\u5C0F\u5B66\u5404\u5B66\u79D1\u6559\u5B66\u8BBE\u8BA1\u3002
\u4F60\u7684\u4EFB\u52A1\u662F\u6839\u636E\u8BFE\u9898\uFF0C\u4EA7\u51FA\u4E00\u4EFD\u53EF\u4EE5\u76F4\u63A5\u62FF\u5230\u8BFE\u5802\u4E0A\u7528\u7684\u5B8C\u6574\u5907\u8BFE\u5305\u3002

\u8981\u6C42\uFF1A
1. \u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u6587\u5B57\uFF0C\u4E0D\u8981 markdown \u4EE3\u7801\u5757\u3002
2. \u6240\u6709\u6587\u672C\u7528\u4E2D\u6587\uFF0C\u53E3\u543B\u662F\u771F\u5B9E\u7684\u6559\u5B66\u8BED\u8A00\uFF0C\u4E0D\u8981\u7A7A\u8BDD\u5957\u8BDD\u3002
3. \u6559\u5B66\u76EE\u6807\u3001\u91CD\u96BE\u70B9\u5FC5\u987B\u5177\u4F53\u5230\u8FD9\u7BC7\u8BFE\u6587\u6216\u8FD9\u4E2A\u77E5\u8BC6\u70B9\uFF0C\u7981\u6B62\u5199\u201C\u7406\u89E3\u8BFE\u6587\u201D\u201C\u638C\u63E1\u77E5\u8BC6\u201D\u8FD9\u7C7B\u653E\u5230\u54EA\u8282\u8BFE\u90FD\u6210\u7ACB\u7684\u7A7A\u8BDD\u3002
4. \u201C\u7B54\u8FA9\u9884\u6848\u201D\u7ED9 7 \u6761\uFF0C\u95EE\u9898\u5FC5\u987B\u662F\u771F\u5B9E\u8BD5\u8BB2\u73B0\u573A\u8BC4\u59D4\u7684\u8FFD\u95EE\uFF0C\u6BCF\u6761 answer \u4E0D\u8D85\u8FC7 80 \u4E2A\u6C49\u5B57\uFF0C\u80CC\u4E0B\u6765\u5C31\u80FD\u7B54\u3002
5. \u201C\u53E3\u64AD\u7A3F\u201D\u5FC5\u987B\u662F\u7AD9\u5728\u8BB2\u53F0\u4E0A\u80FD\u76F4\u63A5\u8BF4\u51FA\u53E3\u7684\u8BDD\uFF0C\u53E3\u8BED\u5316\uFF0C\u6BCF\u53E5\u4E0D\u8D85\u8FC7 120 \u5B57\u3002
6. \u5404\u73AF\u8282 ratio \u76F8\u52A0\u5FC5\u987B\u7B49\u4E8E 1\u3002
7. \u677F\u4E66\u5E03\u5C40\u7528\u7B49\u5BBD\u5B57\u7B26\u753B\uFF0C\u5BBD\u5EA6\u4E0D\u8D85\u8FC7 40 \u4E2A\u5B57\u7B26\uFF0C\u65B9\u4FBF\u624B\u673A\u67E5\u770B\u548C\u6284\u5199\u3002
8. \u6BCF\u4E2A\u73AF\u8282\u7684 pauses \u7ED9 0\u20132 \u4E2A\u505C\u987F\u70B9\uFF0C\u95EE\u53E5\u5FC5\u987B\u4E00\u53E5\u8BDD\u8BF4\u5B8C\u3001\u4E0D\u8D85\u8FC7 20 \u4E2A\u6C49\u5B57\uFF0Ctype \u53EA\u80FD\u662F\u201C\u786E\u8BA4\u7406\u89E3 / \u5F15\u53D1\u601D\u8003 / \u8FC7\u6E21\u201D\u3002
9. \u6559\u5B66\u51C6\u5907\u53EA\u51FA\u6E05\u5355\u3001\u7528\u9014\u548C\u68C0\u7D22\u8BCD\uFF0C\u7981\u6B62\u7F16\u9020\u56FE\u7247\u3001\u97F3\u9891\u5185\u5BB9\uFF0C\u4E5F\u7981\u6B62\u66FF\u8001\u5E08\u201C\u751F\u6210\u201D\u7D20\u6750\u3002

${VOICE_SHUOKE}
\uFF08\u4E0A\u9762\u8FD9\u5957\u8BED\u6C14\u7BA1 speech \u516D\u6BB5\u4E0E\u6BCF\u4E2A\u73AF\u8282\u7684 script\u3002\uFF09

${VOICE_DEFENSE}
\uFF08\u4E0A\u9762\u8FD9\u5957\u8BED\u6C14\u53EA\u7BA1 defense \u6570\u7EC4\u7684 answer\u3002\uFF09`;
    DENSITY_MENU = `\u6863\u4F4D\u5224\u636E\uFF08\u5148\u6309\u8BFE\u6587\u81EA\u5DF1\u5B9A\u4E00\u6863\uFF0C\u518D\u5168\u7BC7\u5B88\u4F4F\u8FD9\u4E00\u6863\uFF0C\u522B\u4E00\u9875 lean \u4E00\u9875 rich\uFF09\uFF1A
- lean \u7CBE\u7B80\uFF1A\u8BFE\u6587\u77ED\u3001\u53E4\u8BD7\u3001\u4F4E\u5B66\u6BB5\u2014\u2014\u6B63\u6587 \u226430 \u5B57/\u9875\uFF0C10 \u9875\uFF0C\u975E\u5B57\u8BCD\u9875 items \u22644\uFF0C\u7CBE\u8BFB 2 \u9875\u3002
- standard \u6807\u51C6\uFF08\u9ED8\u8BA4\uFF0C\u62FF\u4E0D\u51C6\u5C31\u9009\u5B83\uFF09\uFF1A\u591A\u6570\u53D9\u4E8B/\u5199\u4EBA\u8BFE\u6587\u2014\u2014\u6B63\u6587 \u226460 \u5B57/\u9875\uFF0C10\u201312 \u9875\uFF0Citems \u22645\uFF0C\u7CBE\u8BFB 2\u20133 \u9875\u3002
- rich \u5145\u5B9E\uFF1A\u957F\u6587\u3001\u8BF4\u660E\u6587\u3001\u9AD8\u5B66\u6BB5\u3001\u4FE1\u606F\u5BC6\u5EA6\u5927\u2014\u2014\u6B63\u6587 \u226490 \u5B57/\u9875\uFF0C12\u201314 \u9875\uFF0Citems \u22646\uFF0C\u7CBE\u8BFB 3 \u9875\u3002`;
  }
});

// src/lib/llm.ts
var llm_exports = {};
__export(llm_exports, {
  DEFAULT_CONFIG: () => DEFAULT_CONFIG,
  FallbackExhausted: () => FallbackExhausted,
  generatePlan: () => generatePlan,
  loadConfig: () => loadConfig,
  postChatJson: () => postChatJson,
  saveConfig: () => saveConfig,
  textChain: () => textChain
});
function normalizePauses(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (out.length >= 2) break;
    const p = item ?? {};
    const question = typeof p.question === "string" ? p.question.trim() : "";
    if (!question) continue;
    const seconds = Math.round(Number(p.seconds));
    const type = PAUSE_TYPES.includes(p.type) ? p.type : "\u786E\u8BA4\u7406\u89E3";
    out.push({
      afterText: typeof p.afterText === "string" ? p.afterText.trim() : "",
      seconds: Number.isFinite(seconds) ? Math.min(10, Math.max(3, seconds)) : 5,
      question: [...question].length > PAUSE_MAX_QUESTION ? `${[...question].slice(0, PAUSE_MAX_QUESTION - 1).join("")}\uFF1F` : question,
      type
    });
  }
  return out;
}
function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const saved = JSON.parse(raw);
    const untouched = saved.baseUrl === LEGACY_DEFAULT.baseUrl && saved.model === LEGACY_DEFAULT.model;
    const base = untouched ? DEFAULT_CONFIG.baseUrl : saved.baseUrl;
    const model = untouched ? DEFAULT_CONFIG.model : saved.model;
    const textKey = String(saved.apiKey ?? "").trim();
    const imageKey = String(saved.imageKey ?? "").trim();
    return {
      ...DEFAULT_CONFIG,
      ...saved,
      apiKey: textKey,
      imageKey: imageKey || void 0,
      ...base ? { baseUrl: normalizeBase(base) } : {},
      ...model ? { model } : {}
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
function saveConfig(cfg2) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg2));
}
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}
function describeError(status, detail) {
  const zh = chineseMessage(detail);
  if (zh) return zh;
  if (status === 502 || status === 504) return "\u6A21\u578B\u8FD9\u4F1A\u513F\u6CA1\u56DE\u8BDD\uFF0C\u5148\u7528\u5185\u7F6E\u7A3F\u770B\u6D41\u7A0B\uFF0C\u7A0D\u540E\u518D\u70B9\u4E00\u6B21\u3002";
  if (status === 503) return "\u670D\u52A1\u5668\u8FD8\u6CA1\u914D\u597D\uFF0C\u8054\u7CFB\u90E8\u7F72\u7684\u4EBA\u3002";
  if (status === 401 || status === 403) return "\u63A5\u53E3\u4E0D\u8BA4\u8FD9\u628A key\uFF1B\u6E05\u7A7A\u8BBE\u7F6E\u9875\u91CC\u7684 key \u5C31\u8D70\u670D\u52A1\u7AEF\u3002";
  if (status === 404) return "\u63A5\u53E3\u5730\u5740\u6216\u6A21\u578B\u540D\u79F0\u4E0D\u5B58\u5728\uFF0C\u8BF7\u68C0\u67E5 Base URL \u548C\u6A21\u578B\u540D\u3002";
  if (status === 402) return "\u989D\u5EA6\u7528\u5B8C\u4E86\uFF0C\u5148\u7528\u5185\u7F6E\u7A3F\u770B\u5B8C\u6D41\u7A0B\u3002";
  if (status === 429) return "\u8BF7\u6C42\u592A\u9891\u7E41\uFF0C\u6B47\u4E00\u4F1A\u513F\u518D\u8BD5\u3002";
  return `\u6A21\u578B\u6CA1\u6709\u56DE\u8BDD\uFF08${status}\uFF09\uFF0C\u5148\u7528\u5185\u7F6E\u7A3F\u770B\u6D41\u7A0B\uFF0C\u7A0D\u540E\u518D\u70B9\u4E00\u6B21\u3002`;
}
function chineseMessage(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  try {
    const msg = JSON.parse(raw)?.error?.message;
    if (typeof msg === "string" && /[\u4e00-\u9fa5]/.test(msg)) return msg.trim();
  } catch {
  }
  if (/[\u4e00-\u9fa5]/.test(raw) && raw.length <= 80) return raw;
  return "";
}
function textChain(cfg2) {
  const head = String(cfg2.model ?? "").trim() || TEXT_CHAIN[0];
  if (String(cfg2.apiKey ?? "").trim()) return [head];
  const raw = [head, ...TEXT_CHAIN.filter((m) => m !== head)];
  return [...new Set(raw.map(upstreamModel))];
}
function warnSwitch(from, to, why) {
  const short = (m) => m.split("/").pop()?.toLowerCase() ?? m;
  console.warn(`[fallback] \u6587\u672C ${short(from)}\u2192${short(to)} \u56E0\u4E3A ${why}`);
}
function whyOf(e) {
  const msg = (e instanceof Error ? e.message : String(e ?? "")).replace(/\s+/g, " ").trim();
  if (/超时|timeout|abort/i.test(msg)) return "timeout";
  if (/JSON|json/i.test(msg)) return "bad json";
  if (e instanceof ApiError) return `http ${e.status}`;
  return "network";
}
function reasonOf(e) {
  const msg = (e instanceof Error ? e.message : String(e ?? "")).replace(/\s+/g, " ").trim();
  if (/超时|timeout|abort/i.test(msg)) return "\u7B49\u592A\u4E45\u4E86";
  if (/JSON|json/i.test(msg)) return "\u56DE\u7684\u8BDD\u6CA1\u770B\u61C2";
  if (e instanceof ApiError) return "\u670D\u52A1\u90A3\u8FB9\u51FA\u4E86\u70B9\u72B6\u51B5";
  return "\u7F51\u7EDC\u65AD\u4E86";
}
async function requestChat(cfg2, messages, withJsonMode, signal, temperature = 0.7, timeoutMs = CHAIN_STEP_MS) {
  const ep = endpointOf("/chat/completions", cfg2);
  const controller = new AbortController();
  let timer;
  const bump = () => {
    if (timer !== void 0) window.clearTimeout(timer);
    timer = window.setTimeout(() => controller.abort(), timeoutMs);
  };
  bump();
  const relay = () => controller.abort();
  signal?.addEventListener("abort", relay);
  const timeoutText = `\u8BF7\u6C42\u8D85\u65F6\uFF08${Math.round(timeoutMs / 1e3)} \u79D2\u6CA1\u56DE\u8BDD\uFF09\u3002`;
  const fail = (e) => {
    if (signal?.aborted) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw new Error(timeoutText);
    const wrapped = new Error(
      "\u8FDE\u4E0D\u4E0A\u6A21\u578B\u63A5\u53E3\uFF1A\u8981\u4E48\u8FD9\u53F0\u673A\u5668\u4E0A\u6CA1\u8DD1 server.mjs\uFF08\u7EAF\u9759\u6001\u6258\u7BA1\u65F6 /api/sf \u6CA1\u4EBA\u63A5\uFF09\uFF0C\u8981\u4E48\u63A5\u53E3\u5730\u5740\u5199\u9519\u4E86\u3002"
    );
    wrapped.cause = e;
    throw wrapped;
  };
  try {
    const body = {
      model: cfg2.model,
      messages,
      temperature,
      stream: true
    };
    if (withJsonMode) body.response_format = { type: "json_object" };
    const res = await fetch(ep.url, {
      method: "POST",
      signal: controller.signal,
      headers: ep.headers,
      body: JSON.stringify(body)
    });
    bump();
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, status: res.status, content: "", detail };
    }
    const ctype = res.headers?.get?.("content-type") ?? "";
    if (!res.body || ctype.includes("json") || !ctype && !res.headers?.get) {
      const data = await res.json();
      return { ok: true, status: res.status, content: String(data?.choices?.[0]?.message?.content ?? ""), detail: "" };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let out = "";
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      bump();
      buf += decoder.decode(value, { stream: true });
      const lines2 = buf.split("\n");
      buf = lines2.pop() ?? "";
      for (const line of lines2) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const one = JSON.parse(payload);
          const ch = one?.choices?.[0];
          out += String(ch?.delta?.content ?? ch?.message?.content ?? "");
        } catch {
        }
      }
    }
    out += decoder.decode();
    return { ok: true, status: res.status, content: out, detail: "" };
  } catch (e) {
    return fail(e);
  } finally {
    if (timer !== void 0) window.clearTimeout(timer);
    signal?.removeEventListener("abort", relay);
  }
}
async function requestJsonOnce(cfg2, messages, signal, temperature, timeoutMs) {
  let one = await requestChat(cfg2, messages, true, signal, temperature, timeoutMs);
  if (!one.ok && one.status === 400 && /response_format|json_object|not.?support/i.test(one.detail)) {
    one = await requestChat(cfg2, messages, false, signal, temperature, timeoutMs);
  }
  if (!one.ok) throw new ApiError(one.status, describeError(one.status, one.detail));
  if (!one.content) throw new Error("\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u5185\u5BB9\u3002");
  const content = one.content;
  try {
    return JSON.parse(extractJson(content));
  } catch {
    throw new Error("\u6A21\u578B\u8FD4\u56DE\u7684\u5185\u5BB9\u4E0D\u662F\u5408\u6CD5 JSON\u3002");
  }
}
async function withTextChain(cfg2, signal, run) {
  const models = textChain(cfg2);
  const started = Date.now();
  let last = null;
  for (let i = 0; i < models.length; i++) {
    if (signal?.aborted) throw new Error("\u8BF7\u6C42\u5DF2\u53D6\u6D88\u3002");
    const left = CHAIN_BUDGET_MS - (Date.now() - started);
    if (left < 3e3) break;
    try {
      return await run({ ...cfg2, model: models[i] }, Math.min(CHAIN_STEP_MS, left));
    } catch (e) {
      if (signal?.aborted) throw e;
      if (e instanceof ApiError && [401, 403, 402].includes(e.status)) throw e;
      last = e;
      if (i < models.length - 1) warnSwitch(models[i], models[i + 1], whyOf(e));
    }
  }
  const why = reasonOf(last);
  throw new FallbackExhausted(
    `\u6A21\u578B\u8FD9\u4F1A\u513F\u6CA1\u56DE\u8BDD\uFF08${why}\uFF09\uFF0C\u5148\u7528\u5185\u7F6E\u7A3F\u9876\u4E0A\uFF1B\u70B9\u300C\u91CD\u51FA\u300D\u4F1A\u518D\u8BD5\u4E00\u6B21\u3002`
  );
}
function planMessages(input2) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(input2) }
  ];
}
function fallbackPrep(preparation, topic) {
  const rep = { courseware: [], physical: [], media: [] };
  const names = preparation.split(/[、；;，,。]/).map((s) => s.trim()).filter((s) => s.length > 0 && s.length < 24).slice(0, 6);
  for (const name of names) {
    if (/音频|视频|短片|朗读|录音|动画/.test(name)) {
      rep.media.push({ name, usage: "\u8BFE\u5802\u64AD\u653E", searchHint: `${topic} ${name}` });
    } else if (/卡片|实物|模型|教具|纸盒|小棒|贴纸/.test(name)) {
      rep.physical.push({ name, usage: "\u5B66\u751F\u52A8\u624B\u65F6\u4F7F\u7528" });
    } else {
      rep.courseware.push({ name, usage: "\u8BFE\u5802\u5C55\u793A\u4E0E\u8BB2\u89E3", searchHint: `${topic} ${name} \u9AD8\u6E05` });
    }
  }
  return rep;
}
function normalizePrep(raw, preparation, topic) {
  const base = fallbackPrep(preparation, topic);
  const data = raw ?? {};
  const pick = (key) => {
    const arr = data[key];
    if (!Array.isArray(arr)) return base[key];
    const items = arr.map((it) => it ?? {}).filter((it) => typeof it.name === "string" && String(it.name).trim()).slice(0, 4).map((it) => ({
      name: String(it.name).trim(),
      usage: typeof it.usage === "string" ? it.usage.trim() : "\u8BFE\u5802\u4F7F\u7528",
      ...typeof it.searchHint === "string" && it.searchHint.trim() ? { searchHint: it.searchHint.trim() } : {}
    }));
    return items.length > 0 ? items : base[key];
  };
  return { courseware: pick("courseware"), physical: pick("physical"), media: pick("media") };
}
function normalize(raw, input2) {
  const data = raw ?? {};
  const str = (v2, fallback = "") => typeof v2 === "string" && v2.trim() ? v2.trim() : fallback;
  const rawSegments = Array.isArray(data.segments) ? data.segments : [];
  if (rawSegments.length === 0) throw new Error("\u8FD4\u56DE\u7ED3\u679C\u91CC\u6CA1\u6709\u6559\u5B66\u73AF\u8282\uFF0C\u8BF7\u91CD\u8BD5\u4E00\u6B21\u3002");
  const ratioSum = rawSegments.reduce((sum, s) => sum + (Number(s?.ratio) || 0), 0);
  const segments = rawSegments.map((s, i) => {
    const ratio = ratioSum > 0 ? (Number(s?.ratio) || 0) / ratioSum : FALLBACK_RATIOS[i] ?? 1 / rawSegments.length;
    return {
      name: str(s?.name, `\u73AF\u8282 ${i + 1}`),
      ratio,
      goal: str(s?.goal),
      teacher: str(s?.teacher),
      student: str(s?.student),
      script: str(s?.script),
      pauses: normalizePauses(s?.pauses)
    };
  });
  const speech = Array.isArray(data.speech) ? data.speech.map((s, i) => ({
    section: str(s?.section, `\u7B2C ${i + 1} \u90E8\u5206`),
    text: str(s?.text)
  })) : [];
  const defense = Array.isArray(data.defense) ? data.defense.map((d) => ({
    question: str(d?.question),
    answer: str(d?.answer)
  })) : [];
  const order = Array.isArray(data.blackboard?.order) ? data.blackboard.order.filter((o) => typeof o === "string") : [];
  return {
    meta: {
      topic: input2.topic,
      subject: input2.subject,
      stage: input2.stage,
      grade: input2.grade,
      period: input2.period,
      textbook: input2.textbook,
      duration: input2.duration,
      // 原文只走本地一份（TASKS/19a）：模型不负责转抄原文，错一个字比不写更糟
      text: input2.text
    },
    objectives: {
      knowledge: str(data.objectives?.knowledge),
      process: str(data.objectives?.process),
      emotion: str(data.objectives?.emotion)
    },
    keyPoint: str(data.keyPoint),
    hardPoint: str(data.hardPoint),
    preparation: str(data.preparation),
    segments,
    homework: {
      must: str(data.homework?.must),
      optional: str(data.homework?.optional)
    },
    blackboard: {
      layout: str(data.blackboard?.layout, "\uFF08\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u677F\u4E66\uFF0C\u8BF7\u91CD\u8BD5\uFF09"),
      order
    },
    prep: normalizePrep(data.prep, str(data.preparation), input2.topic),
    speech,
    defense
  };
}
async function generatePlan(input2, cfg2, signal) {
  const messages = planMessages(input2);
  const parsed = await withTextChain(
    cfg2,
    signal,
    (cfgAt, timeoutMs) => requestJsonOnce(cfgAt, messages, signal, 0.7, timeoutMs)
  );
  return normalize(parsed, input2);
}
async function postChatJson(messages, cfg2, signal, temperature) {
  return withTextChain(
    cfg2,
    signal,
    (cfgAt, timeoutMs) => requestJsonOnce(cfgAt, messages, signal, temperature ?? 0.7, timeoutMs)
  );
}
var DEFAULT_CONFIG, LEGACY_DEFAULT, STORAGE_KEY, TEXT_CHAIN, CHAIN_STEP_MS, CHAIN_BUDGET_MS, FALLBACK_RATIOS, PAUSE_TYPES, PAUSE_MAX_QUESTION, ApiError, FallbackExhausted;
var init_llm = __esm({
  "src/lib/llm.ts"() {
    "use strict";
    init_illustrate();
    init_endpoint();
    init_prompt();
    DEFAULT_CONFIG = {
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "",
      model: "deepseek-ai/DeepSeek-V4.1-Flash",
      imageModel: ILLUST_MODEL
    };
    LEGACY_DEFAULT = { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" };
    STORAGE_KEY = "yike-sangao:llm";
    TEXT_CHAIN = ["deepseek-ai/DeepSeek-V4.1-Flash", "deepseek-v4-pro"];
    CHAIN_STEP_MS = 5e4;
    CHAIN_BUDGET_MS = 15e4;
    FALLBACK_RATIOS = [0.125, 0.2, 0.4, 0.175, 0.1];
    PAUSE_TYPES = ["\u786E\u8BA4\u7406\u89E3", "\u5F15\u53D1\u601D\u8003", "\u8FC7\u6E21"];
    PAUSE_MAX_QUESTION = 20;
    ApiError = class extends Error {
      status;
      constructor(status, message) {
        super(message);
        this.name = "ApiError";
        this.status = status;
      }
    };
    FallbackExhausted = class extends Error {
      constructor(message) {
        super(message);
        this.name = "FallbackExhausted";
      }
    };
  }
});

// src/lib/deckStore.ts
function illustKey(fp, index) {
  return `${fp}:${index}`;
}
function openIllustDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(ILLUST_DB, ILLUST_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(ILLUST_STORE)) db.createObjectStore(ILLUST_STORE, { keyPath: "key" });
        if (!db.objectStoreNames.contains(PLAN_STORE)) db.createObjectStore(PLAN_STORE, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}
var ILLUST_DB, ILLUST_STORE, PLAN_STORE, ILLUST_DB_VERSION, ILLUST_L1, dbPromise, illustCache, PLAN_L1, directorCache;
var init_deckStore = __esm({
  "src/lib/deckStore.ts"() {
    "use strict";
    init_deck();
    ILLUST_DB = "yike-sangao:illust";
    ILLUST_STORE = "pages";
    PLAN_STORE = "plans";
    ILLUST_DB_VERSION = 2;
    ILLUST_L1 = /* @__PURE__ */ new Map();
    dbPromise = null;
    illustCache = {
      /** 取这一份课件已经配过的全部插画（页下标 → dataURL） */
      async load(fp) {
        const out = /* @__PURE__ */ new Map();
        const prefix = `${fp}:`;
        for (const [k, v2] of ILLUST_L1) {
          if (k.startsWith(prefix)) out.set(Number(k.slice(prefix.length)), v2);
        }
        const db = await openIllustDb();
        if (!db) return out;
        await new Promise((resolve) => {
          try {
            const tx = db.transaction(ILLUST_STORE, "readonly");
            const req = tx.objectStore(ILLUST_STORE).openCursor();
            req.onsuccess = () => {
              const cur = req.result;
              if (!cur) {
                resolve();
                return;
              }
              const row = cur.value;
              if (row && row.fp === fp && typeof row.dataUrl === "string") {
                out.set(row.index, row.dataUrl);
                ILLUST_L1.set(illustKey(fp, row.index), row.dataUrl);
              }
              cur.continue();
            };
            req.onerror = () => resolve();
            tx.onabort = () => resolve();
          } catch {
            resolve();
          }
        });
        return out;
      },
      /** 记一张：先落 L1（必定成功），再尽量落 IndexedDB */
      async save(fp, index, dataUrl) {
        ILLUST_L1.set(illustKey(fp, index), dataUrl);
        const db = await openIllustDb();
        if (!db) return;
        try {
          const tx = db.transaction(ILLUST_STORE, "readwrite");
          tx.objectStore(ILLUST_STORE).put({ key: illustKey(fp, index), fp, index, dataUrl });
        } catch {
        }
      }
    };
    PLAN_L1 = /* @__PURE__ */ new Map();
    directorCache = {
      async load(key) {
        const hit = PLAN_L1.get(key);
        if (hit) return { direct: hit.direct, typeset: hit.typeset };
        const db = await openIllustDb();
        if (!db) return null;
        return new Promise((resolve) => {
          try {
            const req = db.transaction(PLAN_STORE, "readonly").objectStore(PLAN_STORE).get(key);
            req.onsuccess = () => {
              const row = req.result;
              if (!row || !Array.isArray(row.direct?.pages) || !Array.isArray(row.typeset?.pages)) {
                resolve(null);
                return;
              }
              PLAN_L1.set(key, row);
              resolve({ direct: row.direct, typeset: row.typeset });
            };
            req.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        });
      },
      async save(key, value) {
        const row = { key, direct: value.direct, typeset: value.typeset };
        PLAN_L1.set(key, row);
        const db = await openIllustDb();
        if (!db) return;
        try {
          db.transaction(PLAN_STORE, "readwrite").objectStore(PLAN_STORE).put(row);
        } catch {
        }
      }
    };
  }
});

// src/lib/inspect.ts
function luma(r, g2, b) {
  return 0.299 * r + 0.587 * g2 + 0.114 * b;
}
function chroma(r, g2, b) {
  const mx = Math.max(r, g2, b);
  const mn = Math.min(r, g2, b);
  return mx === 0 ? 0 : (mx - mn) / mx * 100;
}
function paperRgb2(img) {
  const band = Math.max(2, Math.round(Math.min(img.width, img.height) * EDGE_BAND));
  const rs = [];
  const gs = [];
  const bs = [];
  const push = (x, y) => {
    const i = (y * img.width + x) * 4;
    rs.push(img.pixels[i]);
    gs.push(img.pixels[i + 1]);
    bs.push(img.pixels[i + 2]);
  };
  for (let y = 0; y < img.height; y++) {
    for (let d = 0; d < band; d++) {
      push(d, y);
      push(img.width - 1 - d, y);
    }
  }
  for (let x = 0; x < img.width; x++) {
    for (let d = 0; d < band; d++) {
      push(x, d);
      push(x, img.height - 1 - d);
    }
  }
  const mid = (arr) => {
    const sorted = arr.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 255;
  };
  return [mid(rs), mid(gs), mid(bs)];
}
function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function isPaperAt(img, x, y, paper) {
  const i = (y * img.width + x) * 4;
  const dr = img.pixels[i] - paper[0];
  const dg = img.pixels[i + 1] - paper[1];
  const db = img.pixels[i + 2] - paper[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) <= PAPER_TOL;
}
function measureImage(img, paperHex) {
  const paper = parseHex(paperHex ?? "") ?? paperRgb2(img);
  const paperLuma = luma(paper[0], paper[1], paper[2]);
  let ink = 0;
  let edge = 0;
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  const quad = { tl: 0, tr: 0, bl: 0, br: 0 };
  const quadAll = { tl: 0, tr: 0, bl: 0, br: 0 };
  const lum = new Float32Array(img.width * img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      lum[y * img.width + x] = luma(img.pixels[i], img.pixels[i + 1], img.pixels[i + 2]);
    }
  }
  const inverted = paperLuma < 128;
  const mark = new Uint8Array(img.width * img.height);
  const integral = new Float64Array((img.width + 1) * (img.height + 1));
  for (let y = 0; y < img.height; y++) {
    let rowSum = 0;
    for (let x = 0; x < img.width; x++) {
      const p = y * img.width + x;
      const i = p * 4;
      const r = img.pixels[i];
      const g2 = img.pixels[i + 1];
      const b = img.pixels[i + 2];
      const glyphPx = inverted ? lum[p] > GLYPH_BRIGHT && chroma(r, g2, b) < GLYPH_CHROMA && lum[p] - paperLuma > 90 : lum[p] < GLYPH_DARK && chroma(r, g2, b) < GLYPH_CHROMA && paperLuma - lum[p] > 90;
      if (glyphPx) mark[p] = 1;
      rowSum += mark[p];
      integral[(y + 1) * (img.width + 1) + (x + 1)] = integral[y * (img.width + 1) + (x + 1)] + rowSum;
    }
  }
  const boxSum = (x0, y0, w, h) => {
    const x1 = Math.min(img.width, x0 + w);
    const y1 = Math.min(img.height, y0 + h);
    const a = integral[y0 * (img.width + 1) + x0];
    const b = integral[y0 * (img.width + 1) + x1];
    const c = integral[y1 * (img.width + 1) + x0];
    const d = integral[y1 * (img.width + 1) + x1];
    return d - b - c + a;
  };
  let glyphMax = 0;
  for (let y = 0; y + GLYPH_H <= img.height; y += 8) {
    for (let x = 0; x + GLYPH_W <= img.width; x += 32) {
      const n = boxSum(x, y, GLYPH_W, GLYPH_H);
      if (n > glyphMax) glyphMax = n;
    }
  }
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const q = y < img.height / 2 ? x < img.width / 2 ? "tl" : "tr" : x < img.width / 2 ? "bl" : "br";
      quadAll[q] += 1;
      const paperPx = isPaperAt(img, x, y, paper);
      if (paperPx) {
        quad[q] += 1;
        continue;
      }
      ink += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      const here = lum[y * img.width + x];
      const right = x + 1 < img.width ? lum[y * img.width + x + 1] : here;
      const down = y + 1 < img.height ? lum[(y + 1) * img.width + x] : here;
      if (Math.abs(here - right) >= EDGE_STEP || Math.abs(here - down) >= EDGE_STEP) edge += 1;
    }
  }
  const total = img.width * img.height;
  const bw = maxX >= minX ? maxX - minX + 1 : 0;
  const bh = maxY >= minY ? maxY - minY + 1 : 0;
  const emptyOf = (l, r) => l >= r ? "left" : "right";
  const leftEmpty = (quad.tl / Math.max(1, quadAll.tl) + quad.bl / Math.max(1, quadAll.bl)) / 2;
  const rightEmpty = (quad.tr / Math.max(1, quadAll.tr) + quad.br / Math.max(1, quadAll.br)) / 2;
  return {
    subjectW: bw / img.width,
    subjectH: bh / img.height,
    subjectArea: bw * bh / total,
    quad: {
      tl: quad.tl / Math.max(1, quadAll.tl),
      tr: quad.tr / Math.max(1, quadAll.tr),
      bl: quad.bl / Math.max(1, quadAll.bl),
      br: quad.br / Math.max(1, quadAll.br)
    },
    ink: ink / total,
    edge: edge / total,
    glyph: glyphMax,
    textRisk: glyphMax >= GLYPH_RISK,
    empty: emptyOf(leftEmpty, rightEmpty)
  };
}
async function readImage(dataUrl) {
  const canvas = makeCanvas();
  if (canvas) {
    const img = await loadImage(dataUrl);
    if (!img) return null;
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, pixels: new Uint8Array(data.data.buffer.slice(0)) };
  }
  const bytes = dataUrlToBytes(dataUrl);
  if (!bytes || !isPng(bytes)) return null;
  return decodePng(bytes);
}
async function writeImage(img) {
  const canvas = makeCanvas();
  if (canvas) {
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const data = ctx.createImageData(img.width, img.height);
      data.data.set(img.pixels);
      ctx.putImageData(data, 0, 0);
      return canvas.toDataURL("image/png");
    }
  }
  return bytesToDataUrl(await encodePng(img));
}
function makeCanvas() {
  if (typeof document === "undefined") return null;
  try {
    return document.createElement("canvas");
  } catch {
    return null;
  }
}
async function loadImage(dataUrl) {
  if (typeof Image === "undefined") return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
async function mirrorArt(dataUrl) {
  const img = await readImage(dataUrl);
  if (!img) return dataUrl;
  const row = img.width * 4;
  const line = new Uint8Array(row);
  for (let y = 0; y < img.height; y++) {
    const at = y * row;
    line.set(img.pixels.subarray(at, at + row));
    for (let x = 0; x < img.width; x++) {
      const from = (img.width - 1 - x) * 4;
      const to = at + x * 4;
      img.pixels[to] = line[from];
      img.pixels[to + 1] = line[from + 1];
      img.pixels[to + 2] = line[from + 2];
      img.pixels[to + 3] = line[from + 3];
    }
  }
  return writeImage(img);
}
async function measureArt(dataUrl, paperHex) {
  const img = await readImage(dataUrl);
  return img ? measureImage(img, paperHex) : null;
}
async function normalizeArt(dataUrl, paperHex) {
  const img = await readImage(dataUrl);
  const paper = parseHex(paperHex);
  if (!img || !paper) return dataUrl;
  const bw = Math.max(1, Math.round(img.width * EDGE_BAND));
  const bh = Math.max(1, Math.round(img.height * EDGE_BAND));
  const fw = Math.max(1, Math.round(img.width * EDGE_FEATHER));
  const fh = Math.max(1, Math.round(img.height * EDGE_FEATHER));
  const weight = (d, band, feather) => {
    if (d >= band + feather) return 0;
    if (d < band) return 1;
    return 1 - (d - band) / feather;
  };
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const w = Math.max(
        weight(x, bw, fw),
        weight(img.width - 1 - x, bw, fw),
        weight(y, bh, fh),
        weight(img.height - 1 - y, bh, fh)
      );
      if (w <= 0) continue;
      const i = (y * img.width + x) * 4;
      img.pixels[i] = Math.round(img.pixels[i] * (1 - w) + paper[0] * w);
      img.pixels[i + 1] = Math.round(img.pixels[i + 1] * (1 - w) + paper[1] * w);
      img.pixels[i + 2] = Math.round(img.pixels[i + 2] * (1 - w) + paper[2] * w);
      img.pixels[i + 3] = 255;
    }
  }
  return writeImage(img);
}
var EDGE_BAND, EDGE_FEATHER, PAPER_TOL, EDGE_STEP, GLYPH_DARK, GLYPH_BRIGHT, GLYPH_CHROMA, GLYPH_W, GLYPH_H, GLYPH_RISK;
var init_inspect = __esm({
  "src/lib/inspect.ts"() {
    "use strict";
    init_watermark();
    EDGE_BAND = 0.03;
    EDGE_FEATHER = 0.03;
    PAPER_TOL = 26;
    EDGE_STEP = 26;
    GLYPH_DARK = 70;
    GLYPH_BRIGHT = 200;
    GLYPH_CHROMA = 18;
    GLYPH_W = 320;
    GLYPH_H = 32;
    GLYPH_RISK = 1500;
  }
});

// src/lib/motifs.ts
function motifOf(subject) {
  const s = String(subject ?? "");
  if (/英语|英文|外语/.test(s)) return "english";
  if (/数学|算术|几何|代数/.test(s)) return "math";
  if (/物理|化学|科学|生物|自然|常识/.test(s)) return "science";
  if (/历史|地理|道法|道德|政治|社会|思政/.test(s)) return "humanities";
  if (/语文|汉语|国学|阅读|习作|古诗|文言/.test(s)) return "chinese";
  return "neutral";
}
function motifOfKey(v2) {
  const k = String(v2 ?? "");
  return k in MOTIFS ? MOTIFS[k] : MOTIFS.neutral;
}
var W, v, hbar, MOTIFS;
var init_motifs = __esm({
  "src/lib/motifs.ts"() {
    "use strict";
    W = 18e-4;
    v = (x, y, h) => ({ x, y, w: W, h });
    hbar = (x, y, w) => ({ x, y, w, h: W });
    MOTIFS = {
      /* 语文：地平线 + 雨丝（沿用 20b 那一套，一个数都没改） */
      chinese: {
        key: "chinese",
        note: "\u96E8\u4E1D",
        ground: hbar(0.56, 0.72, 0.34),
        strokes: [v(0.585, 0.59, 0.13), v(0.625, 0.635, 0.085), v(0.665, 0.555, 0.165), v(0.705, 0.62, 0.1), v(0.745, 0.65, 0.07), v(0.785, 0.6, 0.12)]
      },
      /* 数学：一条横轴一条纵轴，一只方格 + 一道刻度 */
      math: {
        key: "math",
        note: "\u65B9\u683C\u4E0E\u5750\u6807",
        ground: hbar(0.56, 0.72, 0.34),
        strokes: [v(0.58, 0.5, 0.22), hbar(0.64, 0.56, 0.18), hbar(0.64, 0.7, 0.18), v(0.64, 0.56, 0.142), v(0.82, 0.56, 0.142), hbar(0.66, 0.635, 0.16)]
      },
      /* 英语：四线三格 + 两道竖边（写得下字母的那一栏） */
      english: {
        key: "english",
        note: "\u56DB\u7EBF\u4E09\u683C",
        ground: hbar(0.56, 0.72, 0.34),
        strokes: [hbar(0.56, 0.585, 0.34), hbar(0.56, 0.63, 0.34), hbar(0.56, 0.675, 0.34), v(0.58, 0.585, 0.135), v(0.88, 0.585, 0.135), v(0.66, 0.585, 0.135)]
      },
      /* 科学：横轴纵轴 + 三根高低不齐的柱（数据图） */
      science: {
        key: "science",
        note: "\u5750\u6807\u4E0E\u67F1",
        ground: hbar(0.56, 0.72, 0.34),
        strokes: [v(0.58, 0.5, 0.22), v(0.645, 0.64, 0.08), v(0.715, 0.59, 0.13), v(0.785, 0.54, 0.18), hbar(0.58, 0.5, 0.28)]
      },
      /* 史地：经纬网 + 三个地点 */
      humanities: {
        key: "humanities",
        note: "\u7ECF\u7EAC\u7F51",
        ground: hbar(0.56, 0.72, 0.34),
        strokes: [hbar(0.56, 0.56, 0.34), v(0.58, 0.56, 0.16), v(0.72, 0.56, 0.16), v(0.86, 0.56, 0.16), hbar(0.6, 0.625, 0.012), hbar(0.74, 0.6, 0.012)]
      },
      /* 认不出学科：一条地平线 + 五根排开的短笔，读成什么课都不出错 */
      neutral: {
        key: "neutral",
        note: "\u7B14\u8FF9",
        ground: hbar(0.56, 0.72, 0.34),
        strokes: [v(0.6, 0.62, 0.1), v(0.665, 0.585, 0.135), v(0.73, 0.64, 0.08), v(0.795, 0.6, 0.12), v(0.86, 0.65, 0.07)]
      }
    };
  }
});

// src/lib/deck2/place.ts
var place_exports = {};
__export(place_exports, {
  FOOT_SLOT: () => FOOT_SLOT,
  SIZES: () => SIZES,
  coverArchOf: () => coverArchOf,
  coverLayoutOf: () => coverLayoutOf,
  place: () => place,
  quotePointSize: () => quotePointSize
});
function archetypeOf(kind) {
  if (kind === "cover") return "cover";
  if (kind === "quote") return "quote";
  if (kind === "words") return "words";
  if (kind === "compare") return "compare";
  if (kind === "end") return "end";
  if (NUMBERED.includes(kind)) return "numbered";
  return "plain";
}
function clean(v2) {
  return String(v2 ?? "").replace(/\s+$/g, "").trim();
}
function lines(list) {
  return list.map(clean).filter(Boolean);
}
function guard(box, what) {
  const okBox = box.w > 0 && box.h > 0 && box.x >= -1e-9 && box.y >= -1e-9 && box.x + box.w <= 1.001 && box.y + box.h <= 1.001;
  if (!okBox) {
    throw new Error(`place(): ${what} \u7684\u6846\u6EA2\u51FA\u4E86\u7EB8\u9762\uFF08x=${box.x} y=${box.y} w=${box.w} h=${box.h}\uFF09`);
  }
}
function cText(ctx, box, value, style) {
  const text = clean(value);
  if (!text) return;
  guard(box, `\u6587\u672C\u300C${text.slice(0, 8)}\u300D`);
  ctx.out.push({
    kind: "text",
    ...box,
    text,
    size: style.size ?? SIZES.body,
    color: style.color,
    font: style.font,
    align: style.align ?? "left",
    valign: style.valign ?? "top",
    lineHeight: style.lineHeight ?? 1.5,
    bold: style.bold
  });
}
function cRect(ctx, box, fill, opacity) {
  guard(box, "\u8272\u5757");
  ctx.out.push({ kind: "rect", ...box, fill, opacity });
}
function cLine(ctx, box, fill, opacity) {
  guard(box, "\u7EC6\u7EBF");
  ctx.out.push({ kind: "line", ...box, fill, opacity });
}
function quotePointSize(chars, id = "suke") {
  const [a, b, c] = QUOTE_PT[id];
  return chars <= 20 ? a : chars <= 34 ? b : c;
}
function scrimOf(...boxes) {
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - SCRIM_PAD);
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - SCRIM_PAD);
  const x1 = Math.min(1, Math.max(...boxes.map((b) => b.x + b.w)) + SCRIM_PAD);
  const y1 = Math.min(1, Math.max(...boxes.map((b) => b.y + b.h)) + SCRIM_PAD);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function coverPlan(arch) {
  if (arch === "bottom") {
    const title2 = { x: 0.09, y: 0.62, w: 0.72, h: 0.16 };
    const bar2 = { x: 0.09, y: 0.795, w: 0.045, h: 8e-3 };
    const sub2 = { x: 0.09, y: 0.81, w: 0.6, h: 0.06 };
    return { title: title2, bar: bar2, sub: sub2, scrim: scrimOf(title2, bar2, sub2) };
  }
  if (arch === "rightTop") {
    const title2 = { x: 0.52, y: 0.12, w: 0.4, h: 0.2 };
    const bar2 = { x: 0.52, y: 0.335, w: 0.045, h: 8e-3 };
    const sub2 = { x: 0.52, y: 0.35, w: 0.38, h: 0.06 };
    return { title: title2, bar: bar2, sub: sub2, scrim: scrimOf(title2, bar2, sub2) };
  }
  const title = { x: 0.07, y: 0.34, w: 0.44, h: 0.2 };
  const bar = { x: 0.07, y: 0.555, w: 0.045, h: 8e-3 };
  const sub = { x: 0.07, y: 0.57, w: 0.42, h: 0.06 };
  return { title, bar, sub, scrim: scrimOf(title, bar, sub) };
}
function coverLayoutOf(quad) {
  if (!quad) return { arch: "left", scrim: 0.78 };
  const left = (num(quad.tl) + num(quad.bl)) / 2;
  const bottom = (num(quad.bl) + num(quad.br)) / 2;
  const corner = num(quad.tr);
  const best = Math.max(left, bottom, corner);
  if (best - Math.min(left, bottom, corner) < 0.08) return { arch: "bottom", scrim: 0.88 };
  if (best === left) return { arch: "left", scrim: 0.78 };
  if (best === corner) return { arch: "rightTop", scrim: 0.78 };
  return { arch: "bottom", scrim: 0.78 };
}
function coverArchOf(quad) {
  return coverLayoutOf(quad).arch;
}
function archOf(slide) {
  const v2 = String(slide.coverArch ?? "");
  return v2 === "bottom" || v2 === "rightTop" ? v2 : "left";
}
function clampOpacity(v2, fallback) {
  const n = Number(v2);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0.5, n));
}
function coverLayout(ctx, id) {
  const arch = archOf(ctx.slide);
  const plan2 = coverPlan(arch);
  const tune = COVER_TUNE[id];
  const title = {
    x: plan2.title.x + tune.dx,
    y: plan2.title.y + tune.dy,
    w: plan2.title.w + tune.dw,
    h: plan2.title.h + tune.dh
  };
  const subW = Math.min(title.w, 1 - title.x - 0.02);
  const meta = { x: title.x, y: title.y + title.h + 0.04, w: subW, h: 0.05 };
  const sub = { ...plan2.sub, x: title.x, y: meta.y + 0.022 + tune.gap, w: subW };
  const byline = { x: 0.6, y: 0.905, w: 0.34, h: 0.05 };
  if (ctx.art) {
    ctx.out.push({ kind: "image", x: 0, y: 0, w: 1, h: 1, data: ctx.art });
    cRect(ctx, scrimOf(title, sub, meta, byline), ctx.theme.paper, clampOpacity(ctx.slide.coverScrim, 0.78));
  } else {
    const motif = motifOfKey(ctx.slide.motif);
    for (const b of motif.strokes) cLine(ctx, b, ctx.theme.muted, 0.28);
    cLine(ctx, motif.ground, ctx.theme.muted, 0.28);
  }
  cText(ctx, title, ctx.title, {
    size: tune.size,
    color: ctx.theme.ink,
    font: tune.font ?? ctx.theme.fontTitle,
    align: tune.align,
    valign: "middle",
    lineHeight: id === "jijian" ? 1.15 : 1.2,
    bold: id !== "xuan"
  });
  if (id !== "jijian") {
    const barW = id === "liti" ? 0.18 : 0.045;
    const barX = tune.align === "center" ? title.x + (title.w - barW) / 2 : title.x;
    cRect(ctx, { ...plan2.bar, x: barX, y: title.y + title.h + 0.012, w: barW, h: id === "liti" ? 0.012 : 8e-3 }, ctx.theme.accent);
  }
  cText(ctx, sub, ctx.note || ctx.line, {
    size: tune.sub,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: tune.align,
    valign: "middle",
    lineHeight: 1.3
  });
  cText(ctx, meta, ctx.slide.meta ?? "", {
    size: 14,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: tune.align,
    valign: "middle",
    lineHeight: 1.3
  });
  cText(ctx, byline, ctx.slide.byline ?? "", {
    size: 11,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: "right",
    valign: "middle",
    lineHeight: 1.3
  });
  if (id === "xuan" && !ctx.art) seal(ctx, { x: 0.82, y: 0.8, w: 0.09, h: 0.09 });
}
function seal(ctx, box) {
  cRect(ctx, box, ctx.theme.accent, 0.9);
  cText(ctx, box, "\u5BA3\u7EB8", {
    size: 10,
    color: ctx.theme.paper,
    font: "kai",
    align: "center",
    valign: "middle",
    lineHeight: 1
  });
}
function halves(items) {
  return [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];
}
function splitEven(items) {
  const cut = Math.ceil(items.length / 2);
  return [items.slice(0, cut), items.slice(cut)];
}
function bodyOf(ctx) {
  return ctx.items.join("\n");
}
function place(slide, theme) {
  const arch = archetypeOf(slide.kind);
  const fam = theme.family;
  const art = typeof slide.illustration === "string" && slide.illustration.startsWith("data:image/") ? slide.illustration : "";
  const ctx = {
    slide,
    theme,
    out: [],
    title: clean(slide.title),
    line: clean(slide.line),
    items: lines(slide.items ?? []),
    note: clean(slide.note),
    quote: clean(slide.text) || clean(slide.title),
    art
  };
  const alpha = SURFACE_ALPHA[fam];
  if (alpha > 0 && (arch === "words" || arch === "numbered" || arch === "compare")) {
    cRect(ctx, { x: 0.085, y: 0.3, w: 0.83, h: 0.54 }, theme.surface, alpha);
  }
  const artBox = ART_BOX[fam];
  if (artBox && art && arch !== "cover" && arch !== "quote") {
    guard(artBox, "\u63D2\u753B");
    ctx.out.push({ kind: "image", ...artBox, data: ctx.art });
  }
  LAYOUTS[fam][arch](ctx);
  if (arch !== "cover" && arch !== "quote" && arch !== "end" && ctx.line) {
    cText(ctx, ASK[fam], ctx.line, {
      size: 16,
      color: theme.accent,
      font: theme.fontBody,
      align: fam === "xuan" ? "center" : "left",
      valign: "middle"
    });
  }
  const marks2 = MARKS[fam];
  if (marks2.label && arch !== "cover") {
    cText(ctx, marks2.label, SLIDE_LABELS[slide.kind], {
      size: SIZES.tiny,
      color: theme.accent,
      font: theme.fontBody,
      align: fam === "xuan" ? "center" : "left",
      valign: "middle"
    });
  }
  if (marks2.line && arch !== "cover") cLine(ctx, marks2.line, theme.line, marks2.line.opacity);
  return ctx.out;
}
var FOOT_SLOT, NUMBERED, SIZES, CN_NUM, ASK, HEAD, MARKS, SURFACE_ALPHA, ART_BOX, QUOTE_PT, SCRIM_PAD, num, COVER_TUNE, suke, xuan, liti, jijian, shuye, tigangBand, tigang, LAYOUTS;
var init_place = __esm({
  "src/lib/deck2/place.ts"() {
    "use strict";
    init_slides();
    init_motifs();
    FOOT_SLOT = {
      line: { x: 0.09, y: 0.935, w: 0.82, h: 15e-4 },
      left: { x: 0.09, y: 0.945, w: 0.5, h: 0.04 },
      right: { x: 0.71, y: 0.945, w: 0.2, h: 0.04 }
    };
    NUMBERED = ["board", "drill", "homework"];
    SIZES = { h1: 46, h1Big: 54, h2: 34, body: 26, small: 18, tiny: 12 };
    CN_NUM = "\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341";
    ASK = {
      suke: { x: 0.085, y: 0.845, w: 0.76, h: 0.05 },
      xuan: { x: 0.18, y: 0.83, w: 0.64, h: 0.05 },
      liti: { x: 0.06, y: 0.8, w: 0.88, h: 0.05 },
      jijian: { x: 0.1, y: 0.78, w: 0.8, h: 0.05 },
      shuye: { x: 0.26, y: 0.85, w: 0.34, h: 0.05 },
      tigang: { x: 0.09, y: 0.855, w: 0.46, h: 0.05 }
    };
    HEAD = {
      suke: { x: 0.085, y: 0.185, w: 0.76, h: 0.09 },
      xuan: { x: 0.18, y: 0.145, w: 0.64, h: 0.1 },
      liti: { x: 0.06, y: 0.105, w: 0.7, h: 0.09 },
      jijian: { x: 0.1, y: 0.225, w: 0.8, h: 0.09 },
      shuye: { x: 0.26, y: 0.155, w: 0.34, h: 0.09 },
      tigang: { x: 0.09, y: 0.07, w: 0.8, h: 0.1 }
    };
    MARKS = {
      suke: {
        label: { x: 0.085, y: 0.905, w: 0.5, h: 0.04 },
        line: { x: 0.04, y: 0.935, w: 0.92, h: 15e-4 }
      },
      xuan: {
        label: { x: 0.18, y: 0.905, w: 0.64, h: 0.04 },
        line: { x: 0.44, y: 0.935, w: 0.12, h: 15e-4 }
      },
      liti: {
        label: { x: 0.06, y: 0.905, w: 0.5, h: 0.04 },
        line: { x: 0.06, y: 0.935, w: 0.88, h: 8e-4 }
      },
      jijian: {
        label: null,
        line: { x: 0.1, y: 0.935, w: 0.8, h: 15e-4, opacity: 0.5 }
      },
      shuye: {
        label: { x: 0.26, y: 0.905, w: 0.34, h: 0.04 },
        line: { x: 0.26, y: 0.935, w: 0.64, h: 15e-4 }
      },
      tigang: {
        label: { x: 0.09, y: 0.905, w: 0.5, h: 0.04 },
        line: { x: 0.06, y: 0.935, w: 0.88, h: 12e-4 }
      }
    };
    SURFACE_ALPHA = { suke: 0.04, xuan: 0.04, liti: 0.08, jijian: 0, shuye: 0, tigang: 0.06 };
    ART_BOX = {
      suke: { x: 0.6, y: 0.26, w: 0.34, h: 0.52 },
      xuan: { x: 0.66, y: 0.56, w: 0.26, h: 0.3 },
      liti: { x: 0.5, y: 0.24, w: 0.44, h: 0.56 },
      jijian: null,
      shuye: { x: 0.66, y: 0.28, w: 0.28, h: 0.44 },
      tigang: { x: 0.6, y: 0.24, w: 0.34, h: 0.48 }
    };
    QUOTE_PT = {
      suke: [40, 32, 26],
      xuan: [36, 30, 24],
      liti: [32, 28, 24],
      jijian: [48, 48, 44],
      shuye: [42, 32, 26],
      tigang: [38, 30, 26]
    };
    SCRIM_PAD = 0.035;
    num = (v2) => Number.isFinite(Number(v2)) ? Number(v2) : 0;
    COVER_TUNE = {
      suke: { dy: 0, dx: 0, dw: 0, dh: 0, size: SIZES.h1, align: "left", sub: 18, gap: 0.03 },
      xuan: { dy: -0.04, dx: 0, dw: -0.04, dh: 0, size: 40, align: "center", font: "kai", sub: 16, gap: 0.03 },
      liti: { dy: 0.04, dx: 0, dw: 0.02, dh: 0, size: 44, align: "left", sub: 16, gap: 0.03 },
      jijian: { dy: -0.08, dx: 0, dw: 0, dh: 0.02, size: SIZES.h1Big, align: "left", sub: 14, gap: 0 },
      /* 书页：标题往右下错一点，左边留出边栏线（与内页同一条） */
      shuye: { dy: 0.02, dx: 0.04, dw: 0.06, dh: 0, size: 48, align: "left", sub: 16, gap: 0.03 },
      /* 提纲：标题略大、贴得最紧，像一张大纲的表头 */
      tigang: { dy: 0.02, dx: -0.03, dw: 0, dh: 0.02, size: 50, align: "left", sub: 16, gap: 0.02 }
    };
    suke = {
      cover: (ctx) => coverLayout(ctx, "suke"),
      quote: (ctx) => {
        const quote = `\u300C${ctx.quote}\u300D`;
        cText(ctx, { x: 0.12, y: 0.22, w: 0.76, h: 0.58 }, quote, {
          size: quotePointSize(Array.from(quote).length, "suke"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.6, y: 0.72, w: 0.28, h: 0.06 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "right",
          valign: "middle"
        });
      },
      words: (ctx) => {
        cText(ctx, HEAD.suke, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.085, y: 0.3, w: 0.5, h: 0.52 }, ctx.items.slice(0, 5).join("\n"), {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.7
        });
      },
      numbered: (ctx) => {
        const list = ctx.items.slice(0, 6);
        cText(ctx, HEAD.suke, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.085, y: 0.3, w: 0.05, h: 0.52 }, list.map((_, i) => CN_NUM[i] ?? "\xB7").join("\n"), {
          size: SIZES.body,
          color: ctx.theme.accent,
          font: ctx.theme.fontTitle,
          lineHeight: 1.75
        });
        cText(ctx, { x: 0.155, y: 0.3, w: 0.72, h: 0.52 }, list.join("\n"), {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.75
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        cText(ctx, HEAD.suke, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.085, y: 0.34, w: 0.4, h: 0.46 }, left.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.5
        });
        cText(ctx, { x: 0.525, y: 0.34, w: 0.4, h: 0.46 }, right.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.5
        });
        cLine(ctx, { x: 0.505, y: 0.32, w: 15e-4, h: 0.5 }, ctx.theme.line);
      },
      end: (ctx) => {
        cText(ctx, { x: 0.2, y: 0.4, w: 0.6, h: 0.14 }, ctx.line || ctx.items[0] || ctx.title, {
          size: SIZES.h2,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 1.35
        });
        cText(ctx, { x: 0.2, y: 0.58, w: 0.6, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "center"
        });
      },
      plain: (ctx) => {
        cText(ctx, { x: 0.085, y: 0.14, w: 0.76, h: 0.1 }, ctx.title, {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle
        });
        cText(ctx, { x: 0.085, y: 0.28, w: 0.76, h: 0.54 }, bodyOf(ctx), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.8
        });
      }
    };
    xuan = {
      cover: (ctx) => coverLayout(ctx, "xuan"),
      quote: (ctx) => {
        const quote = `\u300C${ctx.quote}\u300D`;
        cText(ctx, { x: 0.18, y: 0.2, w: 0.64, h: 0.6 }, quote, {
          size: quotePointSize(Array.from(quote).length, "xuan"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 2
        });
        cText(ctx, { x: 0.18, y: 0.8, w: 0.64, h: 0.05 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "center"
        });
      },
      words: (ctx) => {
        cText(ctx, HEAD.xuan, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle, align: "center" });
        const [left, right] = splitEven(ctx.items);
        cText(ctx, { x: 0.16, y: 0.3, w: 0.32, h: 0.52 }, left.join("\n"), {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.52, y: 0.3, w: 0.32, h: 0.52 }, right.join("\n"), {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 1.9
        });
      },
      numbered: (ctx) => {
        cText(ctx, HEAD.xuan, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle, align: "center" });
        const body = ctx.items.slice(0, 6).map((t, i) => `\u5176${CN_NUM[i] ?? "\u4E00"}\u3000${t}`).join("\n");
        cText(ctx, { x: 0.22, y: 0.3, w: 0.56, h: 0.52 }, body, {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "left",
          lineHeight: 1.9
        });
      },
      compare: (ctx) => {
        const [top, bottom] = halves(ctx.items);
        cText(ctx, HEAD.xuan, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle, align: "center" });
        cText(ctx, { x: 0.18, y: 0.2, w: 0.64, h: 0.26 }, top.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          align: "center",
          lineHeight: 1.6
        });
        cLine(ctx, { x: 0.18, y: 0.48, w: 0.64, h: 15e-4 }, ctx.theme.line);
        cText(ctx, { x: 0.18, y: 0.52, w: 0.64, h: 0.26 }, bottom.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          align: "center",
          lineHeight: 1.6
        });
      },
      end: (ctx) => {
        cText(ctx, { x: 0.3, y: 0.42, w: 0.4, h: 0.12 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 30,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 1.35
        });
        cText(ctx, { x: 0.3, y: 0.6, w: 0.4, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "center"
        });
        seal(ctx, { x: 0.86, y: 0.8, w: 0.07, h: 0.07 });
      },
      plain: (ctx) => {
        cText(ctx, { x: 0.18, y: 0.16, w: 0.64, h: 0.1 }, ctx.title, {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center"
        });
        cText(ctx, { x: 0.18, y: 0.3, w: 0.64, h: 0.52 }, bodyOf(ctx), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 2
        });
      }
    };
    liti = {
      cover: (ctx) => coverLayout(ctx, "liti"),
      quote: (ctx) => {
        const quote = `\u300C${ctx.quote}\u300D`;
        cText(ctx, { x: 0.06, y: 0.22, w: 0.66, h: 0.56 }, quote, {
          size: quotePointSize(Array.from(quote).length, "liti"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.6
        });
        cRect(ctx, { x: 0.02, y: 0.24, w: 8e-3, h: 0.52 }, ctx.theme.accent, 0.25);
        cText(ctx, { x: 0.06, y: 0.8, w: 0.4, h: 0.05 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      words: (ctx) => {
        cText(ctx, HEAD.liti, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        const cells = [
          { x: 0.06, y: 0.32, w: 0.4, h: 0.09 },
          { x: 0.5, y: 0.32, w: 0.44, h: 0.09 },
          { x: 0.06, y: 0.44, w: 0.4, h: 0.09 },
          { x: 0.5, y: 0.44, w: 0.44, h: 0.09 }
        ];
        ctx.items.slice(0, 4).forEach((word, i) => {
          const box = cells[i];
          cRect(ctx, box, ctx.theme.surface, 0.08);
          cText(ctx, { ...box, h: box.h }, word, {
            size: 24,
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            align: "center",
            valign: "middle",
            lineHeight: 1.2
          });
        });
      },
      numbered: (ctx) => {
        cText(ctx, HEAD.liti, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        const list = ctx.items.slice(0, 5);
        const step = Math.min(0.14, 0.5 / Math.max(1, list.length));
        list.forEach((t, n) => {
          const x = 0.06 + n * 0.02;
          const w = 0.88 - n * 0.02;
          const y = 0.3 + n * step;
          cText(ctx, { x, y, w, h: step - 0.02 }, `${n + 1}. ${t}`, {
            size: 24,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.5
          });
          cLine(ctx, { x, y: y + step - 0.02, w, h: 1e-3 }, ctx.theme.line);
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        cText(ctx, HEAD.liti, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cRect(ctx, { x: 0.06, y: 0.22, w: 0.4, h: 0.06 }, ctx.theme.surface, 0.1);
        cRect(ctx, { x: 0.5, y: 0.22, w: 0.44, h: 0.06 }, ctx.theme.surface, 0.1);
        cText(ctx, { x: 0.06, y: 0.27, w: 0.4, h: 0.46 }, left.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.5
        });
        cText(ctx, { x: 0.5, y: 0.27, w: 0.44, h: 0.46 }, right.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.5
        });
        cLine(ctx, { x: 0.475, y: 0.22, w: 12e-4, h: 0.6 }, ctx.theme.line);
      },
      end: (ctx) => {
        cText(ctx, { x: 0.2, y: 0.46, w: 0.6, h: 0.12 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 32,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.35
        });
        cText(ctx, { x: 0.06, y: 0.6, w: 0.6, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      plain: (ctx) => {
        cText(ctx, { x: 0.06, y: 0.14, w: 0.7, h: 0.1 }, ctx.title, {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle
        });
        cText(ctx, { x: 0.06, y: 0.32, w: 0.88, h: 0.54 }, bodyOf(ctx), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.7
        });
      }
    };
    jijian = {
      cover: (ctx) => coverLayout(ctx, "jijian"),
      quote: (ctx) => {
        const quote = `\u300C${ctx.quote}\u300D`;
        cText(ctx, { x: 0.1, y: 0.26, w: 0.8, h: 0.48 }, quote, {
          size: quotePointSize(Array.from(quote).length, "jijian"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 1.5
        });
        cText(ctx, { x: 0.1, y: 0.76, w: 0.8, h: 0.05 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "center"
        });
      },
      words: (ctx) => {
        cText(ctx, HEAD.jijian, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        const cells = [
          { x: 0.1, y: 0.32, w: 0.38, h: 0.1 },
          { x: 0.52, y: 0.32, w: 0.38, h: 0.1 },
          { x: 0.1, y: 0.44, w: 0.38, h: 0.1 },
          { x: 0.52, y: 0.44, w: 0.38, h: 0.1 }
        ];
        ctx.items.slice(0, 4).forEach((word, i) => {
          cText(ctx, cells[i], word, {
            size: 28,
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            lineHeight: 1.2
          });
        });
      },
      numbered: (ctx) => {
        cText(ctx, HEAD.jijian, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        const list = ctx.items.slice(0, 6);
        cText(ctx, { x: 0.1, y: 0.36, w: 0.02, h: 0.4 }, list.map(() => "\xB7").join("\n"), {
          size: 24,
          color: ctx.theme.accent,
          font: ctx.theme.fontBody,
          lineHeight: 2
        });
        cText(ctx, { x: 0.135, y: 0.36, w: 0.765, h: 0.4 }, list.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 2
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        cText(ctx, HEAD.jijian, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.1, y: 0.4, w: 0.38, h: 0.36 }, left.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.7
        });
        cText(ctx, { x: 0.52, y: 0.4, w: 0.38, h: 0.36 }, right.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.7
        });
      },
      end: (ctx) => {
        cText(ctx, { x: 0.25, y: 0.42, w: 0.5, h: 0.12 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 40,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 1.35
        });
        cText(ctx, { x: 0.25, y: 0.6, w: 0.5, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "center"
        });
      },
      plain: (ctx) => {
        cText(ctx, { x: 0.1, y: 0.14, w: 0.8, h: 0.1 }, ctx.title, {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle
        });
        cText(ctx, { x: 0.1, y: 0.34, w: 0.8, h: 0.46 }, bodyOf(ctx), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
      }
    };
    shuye = {
      cover: (ctx) => {
        coverLayout(ctx, "shuye");
        cLine(ctx, { x: 0.235, y: 0.08, w: 18e-4, h: 0.78 }, ctx.theme.line, 0.6);
      },
      quote: (ctx) => {
        const quote = `\u300C${ctx.quote}\u300D`;
        cText(ctx, { x: 0.26, y: 0.22, w: 0.62, h: 0.48 }, quote, {
          size: quotePointSize(Array.from(quote).length, "shuye"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.05, y: 0.22, w: 0.15, h: 0.32 }, ctx.note, {
          size: 13,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "right",
          lineHeight: 1.7
        });
        cLine(ctx, { x: 0.235, y: 0.16, w: 18e-4, h: 0.62 }, ctx.theme.line);
      },
      words: (ctx) => {
        const list = ctx.items.slice(0, 5);
        cText(ctx, HEAD.shuye, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.05, y: 0.32, w: 0.15, h: 0.44 }, list.map((_, i) => String(i + 1)).join("\n"), {
          size: 14,
          color: ctx.theme.accent,
          font: ctx.theme.fontBody,
          align: "right",
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.26, y: 0.32, w: 0.34, h: 0.44 }, list.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.9
        });
        cLine(ctx, { x: 0.235, y: 0.26, w: 18e-4, h: 0.5 }, ctx.theme.line);
      },
      numbered: (ctx) => {
        const list = ctx.items.slice(0, 5);
        cText(ctx, HEAD.shuye, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.05, y: 0.32, w: 0.15, h: 0.46 }, list.map((_, i) => CN_NUM[i] ?? "\xB7").join("\n"), {
          size: 13,
          color: ctx.theme.accent,
          font: ctx.theme.fontBody,
          align: "right",
          lineHeight: 2
        });
        cText(ctx, { x: 0.26, y: 0.32, w: 0.34, h: 0.46 }, list.join("\n"), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 2
        });
        cLine(ctx, { x: 0.235, y: 0.26, w: 18e-4, h: 0.52 }, ctx.theme.line);
      },
      compare: (ctx) => {
        const [top, bottom] = halves(ctx.items);
        cText(ctx, HEAD.shuye, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.26, y: 0.3, w: 0.34, h: 0.2 }, top.join("\n"), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.6
        });
        cLine(ctx, { x: 0.26, y: 0.52, w: 0.34, h: 12e-4 }, ctx.theme.line);
        cText(ctx, { x: 0.26, y: 0.56, w: 0.34, h: 0.2 }, bottom.join("\n"), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.6
        });
        cLine(ctx, { x: 0.235, y: 0.26, w: 18e-4, h: 0.52 }, ctx.theme.line);
      },
      end: (ctx) => {
        cText(ctx, { x: 0.26, y: 0.38, w: 0.34, h: 0.16 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 30,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.4
        });
        cText(ctx, { x: 0.26, y: 0.64, w: 0.34, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
        cLine(ctx, { x: 0.235, y: 0.16, w: 18e-4, h: 0.72 }, ctx.theme.line);
      },
      plain: (ctx) => {
        cText(ctx, { x: 0.26, y: 0.16, w: 0.34, h: 0.09 }, ctx.title, {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle
        });
        cText(ctx, { x: 0.26, y: 0.3, w: 0.34, h: 0.48 }, bodyOf(ctx), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.8
        });
        cLine(ctx, { x: 0.235, y: 0.12, w: 18e-4, h: 0.72 }, ctx.theme.line);
      }
    };
    tigangBand = (ctx) => {
      cRect(ctx, { x: 0.06, y: 0.06, w: 0.88, h: 0.13 }, ctx.theme.surface, 0.12);
      cLine(ctx, { x: 0.06, y: 0.19, w: 0.88, h: 18e-4 }, ctx.theme.accent, 0.5);
    };
    tigang = {
      cover: (ctx) => {
        coverLayout(ctx, "tigang");
        tigangBand(ctx);
      },
      quote: (ctx) => {
        const quote = `\u300C${ctx.quote}\u300D`;
        tigangBand(ctx);
        cText(ctx, { x: 0.09, y: 0.22, w: 0.82, h: 0.48 }, quote, {
          size: quotePointSize(Array.from(quote).length, "tigang"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.09, y: 0.82, w: 0.5, h: 0.05 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      words: (ctx) => {
        tigangBand(ctx);
        cText(ctx, HEAD.tigang, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        const cells = [
          { x: 0.09, y: 0.3, w: 0.2, h: 0.07 },
          { x: 0.33, y: 0.3, w: 0.2, h: 0.07 },
          { x: 0.09, y: 0.41, w: 0.2, h: 0.07 },
          { x: 0.33, y: 0.41, w: 0.2, h: 0.07 }
        ];
        ctx.items.slice(0, 4).forEach((word, i) => {
          const box = cells[i];
          cRect(ctx, { x: box.x - 0.032, y: box.y + 0.026, w: 0.016, h: 0.016 }, ctx.theme.accent, 0.9);
          cText(ctx, box, word, {
            size: 24,
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            valign: "middle"
          });
        });
      },
      numbered: (ctx) => {
        tigangBand(ctx);
        cText(ctx, HEAD.tigang, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        const list = ctx.items.slice(0, 5);
        const step = Math.min(0.115, 0.46 / Math.max(1, list.length));
        list.forEach((t, n) => {
          const y = 0.24 + n * step;
          cText(ctx, { x: 0.09, y, w: 0.08, h: step - 0.015 }, String(n + 1), {
            size: 40,
            color: ctx.theme.accent,
            font: ctx.theme.fontTitle,
            lineHeight: 1.05
          });
          cText(ctx, { x: 0.2, y: y + 0.01, w: 0.34, h: step - 0.015 }, t, {
            size: 22,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.6
          });
          cLine(ctx, { x: 0.09, y: y + step - 0.012, w: 0.45, h: 1e-3 }, ctx.theme.line);
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        tigangBand(ctx);
        cText(ctx, HEAD.tigang, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.09, y: 0.32, w: 0.2, h: 0.44 }, left.join("\n"), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.6
        });
        cText(ctx, { x: 0.34, y: 0.32, w: 0.2, h: 0.44 }, right.join("\n"), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.6
        });
        cLine(ctx, { x: 0.315, y: 0.3, w: 12e-4, h: 0.48 }, ctx.theme.line);
      },
      end: (ctx) => {
        tigangBand(ctx);
        cText(ctx, { x: 0.09, y: 0.42, w: 0.46, h: 0.14 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 32,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.35
        });
        cText(ctx, { x: 0.09, y: 0.6, w: 0.46, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      plain: (ctx) => {
        tigangBand(ctx);
        cText(ctx, HEAD.tigang, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.09, y: 0.34, w: 0.46, h: 0.44 }, bodyOf(ctx), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.7
        });
      }
    };
    LAYOUTS = { suke, xuan, liti, jijian, shuye, tigang };
  }
});

// src/lib/director.ts
function digest(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (h << 5) + h + text.charCodeAt(i) | 0;
  return `${(h >>> 0).toString(36)}.${text.length.toString(36)}`;
}
function directorKey(meta) {
  return digest(
    [meta.topic, meta.grade ?? "", meta.subject ?? "", String(meta.duration ?? 0), String(meta.allow)].join(
      ""
    )
  );
}
function directHash(plan2) {
  const body = plan2.pages.filter((p) => p.draw).map((p) => [p.i, p.empty, p.brief].join("")).join("");
  return digest(`${plan2.look}${body}`);
}
function artFingerprint(planKey, plan2) {
  return `${planKey}~${directHash(plan2)}`;
}
function isAbstractSlide(s) {
  const kind = String(s.kind ?? "");
  if (ABSTRACT_KINDS.has(kind)) return true;
  const title = String(s.title ?? "").trim();
  const line = String(s.line ?? "").trim();
  const items = (s.items ?? []).map(String);
  if (ABSTRACT_TITLE.test(title)) return true;
  if (TASK_TITLE.test(title)) return true;
  if (!line && items.length === 0) return true;
  const body = [line, ...items].join("").replace(/\s+/g, "");
  if (body && /^[\d０-９+×÷=<>%~.,:;、。，；：（）()\-—]+$/.test(body)) return true;
  return false;
}
function clip(text, max) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) : t;
}
function cleanBrief(value) {
  let text = clip(String(value ?? "").replace(/^["'“”「」]+|["'“”「」]+$/g, ""), 600);
  if (!text) return "";
  if (CJK.test(text)) return "";
  if (TEXT_WORDS.test(text)) return "";
  const words = text.split(" ");
  if (words.length > MAX_BRIEF_WORDS) text = words.slice(0, MAX_BRIEF_WORDS).join(" ");
  return text;
}
function sanitizeDirect(raw, opts) {
  const slides2 = opts.slides;
  const allow = Math.max(0, Math.floor(Number(opts.allow) || 0));
  const box = raw ?? {};
  const entries = Array.isArray(box.pages) ? box.pages : [];
  const look = clip(String(box.look ?? ""), 120);
  const picked = /* @__PURE__ */ new Map();
  for (const item of entries) {
    const row = item ?? {};
    if (row.draw !== true) continue;
    const i = Number(row.i);
    if (!Number.isInteger(i) || i < 0 || i >= slides2.length) continue;
    if (picked.has(i)) continue;
    if (isAbstractSlide(slides2[i])) continue;
    const brief = cleanBrief(row.brief);
    if (!brief) continue;
    picked.set(i, {
      brief,
      empty: row.empty === "right" ? "right" : "left",
      why: clip(String(row.why ?? ""), 16)
    });
  }
  const pages = slides2.map((_, i) => ({ i, draw: false, brief: "", empty: "left", why: "" }));
  let used = 0;
  let prev = null;
  for (let i = 0; i < slides2.length; i++) {
    const hit = picked.get(i);
    if (!hit) continue;
    if (used >= allow) break;
    const empty = prev && hit.empty === prev ? prev === "left" ? "right" : "left" : hit.empty;
    pages[i] = { i, draw: true, brief: hit.brief, empty, why: hit.why };
    prev = empty;
    used += 1;
  }
  return { pages, look };
}
function isLayout(value) {
  return typeof value === "string" && DECK_LAYOUTS.includes(value);
}
function defaultLayout(s, count) {
  const kind = String(s.kind ?? "");
  if (kind === "words" || kind === "homework") return "cards";
  if (kind === "compare") return "split";
  if (kind === "drill") return "cloze";
  if (kind === "cover" || kind === "end") return "full";
  return count >= 3 ? "split" : "full";
}
function nextLayout(cur) {
  const at = LAYOUT_CYCLE.indexOf(cur);
  return LAYOUT_CYCLE[(at + 1) % LAYOUT_CYCLE.length];
}
function cutItems(items, want, drop) {
  const asks = Array.isArray(drop) ? drop.map((d) => String(d ?? "").trim()).filter(Boolean) : [];
  const dropped = [];
  const kept = items.map(String).filter((t) => {
    const hit = asks.some((d) => d === t || d.length >= 2 && t.includes(d));
    if (hit) dropped.push(t);
    return !hit;
  });
  const cap = Math.max(0, Math.floor(want));
  while (kept.length > cap) dropped.push(kept.pop());
  return { kept, dropped };
}
function trimItems(items, want, drop) {
  const all = items.map(String);
  if (all.length === 0) return { kept: [], dropped: [] };
  const target = Math.min(Math.max(1, Math.floor(want) || 1), all.length);
  const base = cutItems(all, target, drop);
  const keep = new Set(base.kept);
  const asks = all.filter((t) => ASK2.test(t));
  if (asks.length > 0 && ![...keep].some((t) => ASK2.test(t))) {
    const back = asks.find((t) => !keep.has(t));
    if (back) {
      keep.add(back);
      while (keep.size > target) {
        const victim = [...keep].reverse().find((t) => !ASK2.test(t));
        if (!victim) break;
        keep.delete(victim);
      }
    }
  }
  for (const t of all) {
    if (keep.size >= target) break;
    keep.add(t);
  }
  const kept = all.filter((t) => keep.has(t));
  return { kept, dropped: all.filter((t) => !keep.has(t)) };
}
function sanitizeTypeset(raw, opts) {
  const { slides: slides2, direct, nums } = opts;
  const box = raw ?? {};
  const entries = Array.isArray(box.pages) ? box.pages : [];
  const rows = /* @__PURE__ */ new Map();
  for (const item of entries) {
    const row = item ?? {};
    const i = Number(row.i);
    if (!Number.isInteger(i) || i < 0 || i >= slides2.length || rows.has(i)) continue;
    rows.set(i, row);
  }
  const pages = [];
  let lastLayout = null;
  for (let i = 0; i < slides2.length; i++) {
    const s = slides2[i];
    const row = rows.get(i);
    const items = (s.items ?? []).map(String);
    const plan2 = direct.pages[i];
    if (plan2?.draw === true && nums.has(i)) {
      const empty = nums.get(i)?.empty ?? plan2.empty;
      const big = (nums.get(i)?.subjectArea ?? 0) > 0.55;
      const cap = big ? Math.min(2, Math.max(1, items.length)) : Math.max(items.length, 1);
      const want = Math.min(cap, Math.max(1, Math.round(Number(row?.items) || cap)));
      const cut = trimItems(items, want, row?.drop);
      pages.push({
        i,
        textSide: empty,
        artSide: empty === "left" ? "right" : "left",
        items: cut.kept.length,
        drop: cut.dropped,
        // 有画的页一律「图 + 文」两栏，不参与五档轮换
        layout: "split"
      });
      continue;
    }
    let layout = isLayout(row?.layout) ? row.layout : defaultLayout(s, items.length);
    if (layout === lastLayout) layout = nextLayout(layout);
    pages.push({ i, textSide: "left", artSide: "right", items: items.length, drop: [], layout });
    lastLayout = layout;
  }
  return { pages };
}
function readMinutes(meta) {
  return Math.round((Number(meta.duration) || 0) / 60);
}
function errorText(e) {
  if (e instanceof DOMException && e.name === "AbortError") return "\u5DF2\u53D6\u6D88";
  const msg = e instanceof Error ? e.message : String(e ?? "\u672A\u77E5\u9519\u8BEF");
  const cause = e instanceof Error ? e.cause : void 0;
  const inner = cause instanceof Error ? cause.message : cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "";
  return inner ? `${msg}\uFF08${inner}\uFF09` : msg;
}
async function directDeck(slides2, meta, cfg2, signal) {
  const payload = {
    lesson: {
      topic: meta.topic,
      grade: meta.grade ?? "",
      subject: meta.subject ?? "",
      minutes: readMinutes(meta)
    },
    allow: Math.max(0, Math.floor(Number(meta.allow) || 0)),
    mustDraw: Math.max(0, Math.floor(Number(meta.allow) || 0)),
    pages: slides2.map((s, i) => ({
      i,
      kind: s.kind,
      title: s.title,
      line: s.line ?? "",
      items: s.items ?? [],
      // 抽象页先标出来：净化的时候反正也会被拿掉，不如先告诉它，免得多占一个名额
      abstract: isAbstractSlide(s)
    }))
  };
  counters.direct += 1;
  const raw = await postChatJson(
    [
      { role: "system", content: DIRECT_SYSTEM },
      { role: "user", content: JSON.stringify(payload) }
    ],
    cfg2,
    signal,
    0.4
  );
  const box = raw;
  lastAsked = Array.isArray(box?.pages) ? box.pages.filter((p) => p?.draw === true).length : 0;
  return sanitizeDirect(raw, { slides: slides2, allow: payload.allow });
}
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
async function typesetDeck(slides2, direct, nums, cfg2, signal) {
  const payload = {
    layouts: DECK_LAYOUTS,
    pages: slides2.map((s, i) => {
      const plan2 = direct.pages[i];
      const n = nums.get(i);
      return {
        i,
        kind: s.kind,
        title: s.title,
        line: s.line ?? "",
        items: s.items ?? [],
        art: Boolean(plan2?.draw && n),
        brief: plan2?.draw ? plan2.brief : "",
        measured: n ? {
          subjectW: round2(n.subjectW),
          subjectH: round2(n.subjectH),
          subjectArea: round2(n.subjectArea),
          ink: round2(n.ink),
          edge: round2(n.edge),
          empty: n.empty,
          quad: {
            tl: round2(n.quad.tl),
            tr: round2(n.quad.tr),
            bl: round2(n.quad.bl),
            br: round2(n.quad.br)
          }
        } : null
      };
    })
  };
  counters.typeset += 1;
  const raw = await postChatJson(
    [
      { role: "system", content: TYPESET_SYSTEM },
      { role: "user", content: JSON.stringify(payload) }
    ],
    cfg2,
    signal,
    0.2
  );
  return sanitizeTypeset(raw, { slides: slides2, direct, nums });
}
function emptyReport() {
  return {
    directOk: false,
    typesetOk: false,
    drawn: 0,
    planned: 0,
    asked: 0,
    textFailed: 0,
    sides: { left: 0, right: 0 },
    itemsChanged: 0,
    look: "",
    note: "",
    failures: []
  };
}
function prune(direct, alive) {
  return {
    look: direct.look,
    pages: direct.pages.map((p) => p.draw && !alive.has(p.i) ? { ...p, draw: false, brief: "" } : p)
  };
}
async function paintOne(i, direct, cfg2, opts) {
  const plan2 = direct.pages[i];
  const common = {
    grade: opts.meta.grade,
    subjectName: opts.meta.subject,
    look: direct.look,
    // 底纸跟着这一页的纸走（TASKS/12 §六）：提示词的纸描述、抹水印的补丁色都取它
    paper: opts.paperHex || void 0,
    // 封面（TASKS/20b）：先把「哪一整块一定空着」写死在提示词里，标题才有地方落
    cover: opts.cover,
    signal: opts.signal
  };
  const finish = async (dataUrl) => {
    const out = opts.paperHex ? await normalizeArt(dataUrl, opts.paperHex) : dataUrl;
    const nums = await measureArt(out, opts.paperHex || void 0);
    if (!nums) return { error: "\u8BFB\u4E0D\u56DE\u8FD9\u5F20\u56FE" };
    return { dataUrl: out, nums };
  };
  const first = await generateIllustration(plan2.brief, cfg2, common);
  if (!first.ok || !first.dataUrl) return { error: first.error ?? "\u6CA1\u6709\u56FE" };
  const one = await finish(first.dataUrl);
  if (!one.nums || !one.nums.textRisk) return one;
  const again = await generateIllustration(plan2.brief, cfg2, { ...common, hardNoText: true });
  if (!again.ok || !again.dataUrl) {
    return { error: `\u753B\u9762\u7591\u4F3C\u5E26\u5B57\uFF08glyph\u2248${Math.round(one.nums.glyph)}\uFF09\uFF0C\u91CD\u6295\u4E5F\u5931\u8D25`, text: true };
  }
  const two = await finish(again.dataUrl);
  if (!two.nums) return { error: "\u753B\u9762\u91CC\u5E26\u5B57\uFF0C\u91CD\u6295\u540E\u8BFB\u4E0D\u56DE", text: true };
  if (two.nums.textRisk) {
    return {
      error: `\u753B\u9762\u7591\u4F3C\u5E26\u5B57\uFF08\u91CD\u6295 glyph\u2248${Math.round(one.nums.glyph)}\u2192${Math.round(two.nums.glyph)}\uFF09`,
      text: true
    };
  }
  return two;
}
function retarget(plan2, slides2) {
  return {
    look: plan2.look,
    pages: plan2.pages.map(
      (p) => p.draw && (!slides2[p.i] || isAbstractSlide(slides2[p.i])) ? { ...p, draw: false, brief: "" } : p
    )
  };
}
async function runDeckDirector(opts) {
  const { slides: slides2, cfg: cfg2, meta } = opts;
  const report = emptyReport();
  lastReport = report;
  const untouched = () => slides2.slice();
  if (slides2.length === 0) return { slides: untouched(), report };
  const allow = Math.max(0, Math.min(slides2.length, Math.floor(Number(meta.allow) || 0)));
  if (allow === 0) return { slides: untouched(), report };
  const planKey = directorKey(meta);
  const planRow = await opts.cache.plan.load(planKey).catch(() => null);
  const cached = planRow && planRow.direct.pages.length === slides2.length ? planRow : null;
  let direct;
  let typeset = null;
  if (cached) {
    direct = retarget(cached.direct, slides2);
    typeset = cached.typeset;
    report.directOk = true;
    report.typesetOk = true;
  } else {
    opts.onStage?.("direct", 0, 1);
    try {
      direct = await directDeck(slides2, { ...meta, allow }, cfg2.llm, opts.signal);
      report.directOk = true;
    } catch (e) {
      report.failures.push({ page: 0, error: `\u7B2C\u4E00\u904D\uFF1A${errorText(e)}` });
      return { slides: untouched(), report };
    }
  }
  report.look = direct.look;
  report.asked = lastAsked;
  const planned = direct.pages.filter((p) => p.draw).map((p) => p.i);
  report.planned = planned.length;
  const paperOf = (i) => String(meta.paper?.(String(slides2[i].kind ?? "")) ?? "").trim();
  const artFp = artFingerprint(planKey, direct);
  const stored = await opts.cache.art.load(artFp).catch(() => /* @__PURE__ */ new Map());
  const art = /* @__PURE__ */ new Map();
  const nums = /* @__PURE__ */ new Map();
  const todo = [];
  for (const i of planned) {
    const hit = stored.get(i);
    if (hit) art.set(i, hit);
    else todo.push(i);
  }
  if (todo.length > 0) {
    typeset = null;
    let stopped = false;
    let cursor = 0;
    let done = 0;
    let streak = 0;
    const worker = async () => {
      while (!stopped && cursor < todo.length) {
        if (opts.signal?.aborted) return;
        const i = todo[cursor++];
        const cover = slides2[i]?.kind === "cover" ? "left" : void 0;
        const one = await paintOne(i, direct, cfg2.image, {
          meta,
          paperHex: paperOf(i),
          signal: opts.signal,
          cover
        });
        if (!one.dataUrl || !one.nums) {
          report.failures.push({ page: i + 1, error: one.error ?? "\u6CA1\u6709\u56FE" });
          if (one.text) report.textFailed += 1;
          if (one.error && /\b402\b|insufficient|余额|额度|quota|payment/i.test(one.error)) {
            stopped = true;
            continue;
          }
          streak += 1;
          if (streak >= 2) stopped = true;
          continue;
        }
        streak = 0;
        art.set(i, one.dataUrl);
        nums.set(i, one.nums);
        await opts.cache.art.save(artFp, i, one.dataUrl).catch(() => {
        });
        done += 1;
        opts.onStage?.("illust", done, todo.length);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }
  if (!typeset) {
    for (const [i, dataUrl] of [...art]) {
      if (nums.has(i)) continue;
      const one = await measureArt(dataUrl, paperOf(i) || void 0);
      if (one) nums.set(i, one);
      else {
        art.delete(i);
        report.failures.push({ page: i + 1, error: "\u8BFB\u4E0D\u56DE\u7F13\u5B58\u91CC\u7684\u56FE" });
      }
    }
  }
  let prevEmpty = null;
  for (const i of [...art.keys()].sort((a, b) => a - b)) {
    const n = nums.get(i);
    if (!n) continue;
    if (prevEmpty && n.empty === prevEmpty) {
      const flopped = await mirrorArt(art.get(i));
      const m = flopped ? await measureArt(flopped, paperOf(i) || void 0) : null;
      if (m && m.empty !== prevEmpty) {
        art.set(i, flopped);
        nums.set(i, m);
        await opts.cache.art.save(artFp, i, flopped).catch(() => {
        });
      }
    }
    prevEmpty = nums.get(i)?.empty ?? prevEmpty;
  }
  const alive = new Set(art.keys());
  const alivePlan = prune(direct, alive);
  let booked;
  if (typeset) {
    booked = typeset;
  } else if (art.size === 0) {
    booked = sanitizeTypeset(null, { slides: slides2, direct: alivePlan, nums });
    report.typesetOk = true;
  } else {
    opts.onStage?.("typeset", 0, 1);
    try {
      booked = await typesetDeck(slides2, alivePlan, nums, cfg2.llm, opts.signal);
      report.typesetOk = true;
    } catch (e) {
      report.failures.push({ page: 0, error: `\u7B2C\u4E8C\u904D\uFF1A${errorText(e)}` });
      booked = sanitizeTypeset(null, { slides: slides2, direct: alivePlan, nums });
    }
  }
  const typesetPlan = booked;
  const out = slides2.map((s, i) => {
    const row = typesetPlan.pages[i];
    if (!row) return s;
    const before = (s.items ?? []).map(String);
    const cut = row.drop.length > 0 || row.items !== before.length ? cutItems(before, row.items, row.drop) : { kept: before };
    const items = art.has(i) ? cut.kept : before;
    if (items.join("") !== before.join("")) report.itemsChanged += 1;
    const patch = { layout: row.layout };
    if (art.has(i)) {
      patch.illustration = art.get(i);
      patch.artSide = row.artSide;
      if (slides2[i]?.kind === "cover") {
        const lay = coverLayoutOf(nums.get(i)?.quad);
        patch.coverArch = lay.arch;
        patch.coverScrim = lay.scrim;
      }
    }
    if (items.length > 0 || before.length > 0) patch.items = items;
    return { ...s, ...patch };
  });
  await opts.cache.plan.save(planKey, { direct, typeset: typesetPlan }).catch(() => {
  });
  report.drawn = alive.size;
  for (const i of alive) {
    const side = typesetPlan.pages[i]?.artSide ?? nums.get(i)?.empty ?? "right";
    if (side === "left") report.sides.left += 1;
    else report.sides.right += 1;
  }
  if (report.failures.some((f) => /402|额度|quota|insufficient/i.test(f.error))) {
    report.note = `\u672C\u4EFD\u7528\u4E86 ${report.drawn} \u5F20\u63D2\u753B`;
  }
  lastReport = report;
  return { slides: out, report };
}
function allowFor(durationSeconds) {
  return illustCountFor(durationSeconds);
}
var DECK_LAYOUTS, CJK, TEXT_WORDS, MAX_BRIEF_WORDS, ABSTRACT_KINDS, ABSTRACT_TITLE, TASK_TITLE, LAYOUT_CYCLE, ASK2, DIRECT_SYSTEM, TYPESET_SYSTEM, counters, lastAsked, lastReport;
var init_director = __esm({
  "src/lib/director.ts"() {
    "use strict";
    init_llm();
    init_illustrate();
    init_inspect();
    init_place();
    DECK_LAYOUTS = ["full", "split", "cards", "timeline", "cloze"];
    CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
    TEXT_WORDS = /\b(texts?|letters?|words?|numbers?|numerals?|captions?|labels?|signs?|signage|titles?|typography|calligraphy|characters?|writing|font)\b/i;
    MAX_BRIEF_WORDS = 25;
    ABSTRACT_KINDS = /* @__PURE__ */ new Set(["goals", "homework", "quote"]);
    ABSTRACT_TITLE = /^(学习目标|目标|三件事|作业|课后|练习|小结|下课|再见|复习)/;
    TASK_TITLE = /(读一读|写一写|圈一圈|画一画|背一背|抄一抄|想一想|说一说|练一练|比一比|齐读|自由读)/;
    LAYOUT_CYCLE = ["split", "cards", "timeline", "cloze", "full"];
    ASK2 = /[？?]/;
    DIRECT_SYSTEM = `\u4F60\u662F\u8FD9\u5802\u8BFE\u7248\u9762\u7684\u5BFC\u6F14\u3002\u8BFB\u5B8C\u6574\u53E0\u5B66\u751F\u7248\u9875\u9762\uFF0C\u51B3\u5B9A\u54EA\u51E0\u9875\u914D\u63D2\u753B\u3001\u6BCF\u9875\u753B\u4EC0\u4E48\u3001\u753B\u9762\u7559\u767D\u5728\u54EA\u534A\u8FB9\u3002

\u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8981\u89E3\u91CA\uFF0C\u4E0D\u8981\u4EE3\u7801\u5757\uFF1A
{"pages":[{"i":3,"draw":true,"brief":"a girl standing under a tall osmanthus tree looking up, petals falling, subject occupies the right half, wide empty space on the left","empty":"left","why":"\u6447\u82B1\u4E50"}],"look":"one sentence on this lesson's visual motif"}

\u89C4\u77E9\uFF0C\u8FDD\u53CD\u5373\u5224\u4E0D\u5408\u683C\uFF1A
1. pages \u9010\u9875\u7ED9\uFF08i \u662F 0 \u8D77\u7684\u771F\u5B9E\u9875\u7801\uFF09\u3002\u4E0D\u753B\u7684\u9875\u5199 draw:false\u3001brief \u5199\u7A7A\u5B57\u7B26\u4E32\u3002
2. brief \u7528\u82F1\u6587\uFF0C\u4E0D\u8D85\u8FC7 25 \u4E2A\u8BCD\uFF0C\u53EA\u5199\u753B\u9762\u4E0A\u770B\u5F97\u89C1\u7684\u4E1C\u897F\uFF1A\u8C01\u3001\u5728\u54EA\u3001\u505A\u4EC0\u4E48\u3001\u4E3B\u4F53\u5360\u753B\u9762\u7684\u54EA\u534A\u8FB9\u3001\u54EA\u8FB9\u7559\u7A7A\u3002
   \u2014\u2014 \u4E0D\u5199\u753B\u98CE\uFF08\u753B\u98CE\u7531\u6211\u4EEC\u7EDF\u4E00\u62FC\uFF09\uFF1B\u4E0D\u5199\u8BFE\u6587\u5F15\u53F7\u91CC\u7684\u539F\u53E5\uFF1B\u4E0D\u8981\u6C42\u753B\u9762\u51FA\u73B0\u4EFB\u4F55\u6587\u5B57\u3001\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u6807\u7B7E\u3001\u6807\u724C\u3002
3. \u62BD\u8C61\u9875\u4E00\u5F8B draw:false\uFF1A\u5224\u65AD\u53E5\u9875\u3001\u5B66\u4E60\u76EE\u6807\u9875\u3001\u4F5C\u4E1A\u9875\u3001\u7EAF\u6307\u4EE4\u9875\uFF08\u8BFB\u4E00\u8BFB/\u5199\u4E00\u5199/\u6BD4\u4E00\u6BD4\uFF09\u3001\u7EAF\u6570\u5B57\u9875\uFF1Bpayload \u91CC\u6807\u4E86 abstract:true \u7684\u9875\u4E00\u5B9A\u4E0D\u753B\u3002\u5B81\u7F3A\u4E0D\u51D1\u3002
4. \u76F8\u90BB\u4E24\u4E2A draw:true \u7684\u9875\uFF0Cempty \u5FC5\u987B\u4E00\u5DE6\u4E00\u53F3\u4EA4\u66FF\uFF08\u4E0A\u4E00\u9875 left\uFF0C\u4E0B\u4E00\u9875\u5C31 right\uFF09\uFF0C\u4E0D\u8BB8\u8FDE\u7740\u540C\u4E00\u8FB9\u3002
5. allow \u662F\u8FD9\u4E00\u6B21\u8981\u753B\u7684\u5F20\u6570\uFF1A\u53EF\u753B\u7684\u9875\u591F\u5C31\u753B\u6EE1 allow \u5F20\uFF08\u989D\u5EA6\u4E0D\u662F\u5EFA\u8BAE\uFF0C\u662F\u4EFB\u52A1\uFF09\uFF0C\u4E0D\u591F\u624D\u5C11\u753B\uFF1B\u4F46\u7EDD\u4E0D\u8BB8\u628A\u62BD\u8C61\u9875\u6216\u76F8\u90BB\u4E24\u9875\u91CD\u8FB9\u786C\u585E\u8FDB\u6765\u51D1\u6570\u3002
6. \u4EBA\u7269\u6BCF\u9875\u53EF\u4EE5\u4E0D\u540C\uFF0C\u53EA\u7EA6\u675F\u5E74\u9F84\u6BB5\u4E0E\u753B\u98CE\u7EDF\u4E00\u2014\u2014\u5E74\u9F84\u6309\u5B66\u6BB5\u8D70\uFF0C\u753B\u98CE\u4E0D\u7528\u4F60\u64CD\u5FC3\u3002
7. look \u7528\u82F1\u6587\u4E00\u53E5\uFF08\u226420 \u8BCD\uFF09\u8BF4\u8FD9\u4E00\u8BFE\u7684\u89C6\u89C9\u6BCD\u9898\uFF0C\u4F8B\u5982 one child, one osmanthus branch, one bamboo sieve\u3002`;
    TYPESET_SYSTEM = `\u4F60\u662F\u6392\u7248\u3002\u7B2C\u4E00\u904D\u5DF2\u7ECF\u5B9A\u4E86\u753B\u4EC0\u4E48\uFF0C\u73B0\u5728\u56FE\u5DF2\u7ECF\u753B\u5B8C\u3002\u4F60\u770B\u4E0D\u89C1\u56FE\uFF0C\u53EA\u8BB8\u4F9D\u636E\u4E0B\u9762\u91CF\u51FA\u6765\u7684\u6570\u5B57\u6392\u7248\u3002

\u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8981\u89E3\u91CA\uFF0C\u4E0D\u8981\u4EE3\u7801\u5757\uFF1A
{"pages":[{"i":3,"artSide":"right","textSide":"left","items":3,"drop":["\u2026\u2026"],"layout":"split"}]}

\u89C4\u77E9\uFF0C\u8FDD\u53CD\u5373\u5224\u4E0D\u5408\u683C\uFF1A
1. pages \u9010\u9875\u7ED9\uFF08i \u662F 0 \u8D77\u7684\u771F\u5B9E\u9875\u7801\uFF09\uFF0C\u4E00\u9875\u90FD\u4E0D\u80FD\u6F0F\u3002
2. \u6709\u753B\u7684\u9875\uFF08art:true\uFF09\uFF1AtextSide \u5FC5\u987B\u7B49\u4E8E measured.empty\uFF08\u66F4\u7A7A\u7684\u90A3\u534A\u8FB9\uFF09\uFF1BartSide \u5199\u53E6\u4E00\u8FB9\u3002\u6587\u5B57\u6C38\u8FDC\u653E\u5728\u7A7A\u7684\u90A3\u4E00\u4FA7\u3002
3. \u6709\u753B\u7684\u9875\uFF1Aitems \u662F\u8FD9\u4E00\u9875\u6700\u7EC8\u7559\u51E0\u6761\uFF0C\u53EA\u80FD\u6BD4\u539F\u6765\u5C11\u3001\u4E0D\u80FD\u591A\uFF0C\u6700\u5C11 1 \u6761\uFF1Bdrop \u5199\u88AB\u5220\u6389\u7684\u539F\u53E5\uFF08\u4ECE\u539F\u6587\u7167\u6284\uFF0C\u4E00\u5B57\u4E0D\u6539\uFF09\u3002
4. measured.subjectArea > 0.55\uFF08\u753B\u5360\u4E86\u534A\u7248\u4EE5\u4E0A\uFF09\u65F6\uFF0Citems \u5FC5\u987B\u964D\u5230 1\u20132 \u6761\u3002
5. \u6CA1\u6709\u753B\u7684\u9875\uFF08art:false\uFF09\uFF1Alayout \u5FC5\u987B\u5728 full / split / cards / timeline / cloze \u91CC\u6311\u4E00\u4E2A\uFF0C\u7EDD\u4E0D\u8BB8\u7559\u4E00\u7247\u7A7A\u767D\uFF1B\u8FD9\u7C7B\u9875 items \u4FDD\u6301\u539F\u6837\uFF0Cdrop \u5199\u7A7A\u6570\u7EC4\u3002
6. \u76F8\u90BB\u4E24\u9875\uFF08\u90FD\u6CA1\u6709\u753B\uFF09\u7684 layout \u4E0D\u8BB8\u76F8\u540C\u3002
7. \u6709\u753B\u7684\u9875 layout \u4E00\u5F8B\u5199 "split"\uFF08\u56FE\u4E0E\u6587\u4E24\u680F\uFF09\u3002`;
    counters = { direct: 0, typeset: 0 };
    lastAsked = 0;
    lastReport = emptyReport();
  }
});

// src/lib/subject.ts
function subjectKeyOf(raw) {
  const s = String(raw ?? "");
  if (/语文|国学|阅读|习作|古诗|文言|写字/.test(s)) return "chinese";
  if (/数学|算术/.test(s)) return "math";
  if (/英语|英文|外语/.test(s)) return "english";
  if (/科学|自然|物理|化学|生物|地理|常识/.test(s)) return "science";
  return "other";
}
function packOf(raw) {
  const key = subjectKeyOf(raw);
  const pool = (kind, topic) => {
    const list = ASKS[key][kind] ?? ASKS[key].end ?? [];
    const t = String(topic ?? "").trim();
    return list.map((q) => q.replace(/\{topic\}/g, t || "\u8FD9\u4E00\u8BFE"));
  };
  const ask = (kind, topic) => {
    const t = String(topic ?? "").trim();
    const list = pool(kind, topic);
    return (t ? list[0] : list[1]) ?? list[0];
  };
  const tasks = (text) => {
    const src = String(text ?? "");
    const out = [];
    for (const { re, task } of TASKS[key]) {
      if (re.test(src) && !out.includes(task)) out.push(task);
      if (out.length === 3) break;
    }
    for (const t of TASK_FALLBACK[key]) {
      if (out.length >= 3) break;
      if (!out.includes(t)) out.push(t);
    }
    return out.slice(0, 3);
  };
  return { key, label: LABELS[key], hasWords: key === "chinese" || key === "english", ask, pool, tasks, closing: CLOSING[key] };
}
var ASKS, TASKS, TASK_FALLBACK, LABELS, CLOSING;
var init_subject = __esm({
  "src/lib/subject.ts"() {
    "use strict";
    ASKS = {
      chinese: {
        cover: ["\u300A{topic}\u300B\u8FD9\u4E2A\u9898\u76EE\u91CC\uFF0C\u4F60\u8BA4\u5F97\u54EA\u51E0\u4E2A\u5B57\uFF1F", "\u8FD9\u4E2A\u9898\u76EE\u91CC\uFF0C\u4F60\u8BA4\u5F97\u54EA\u51E0\u4E2A\u5B57\uFF1F"],
        hook: ["\u300A{topic}\u300B\u91CC\u5199\u7684\u8FD9\u4E2A\u573A\u9762\uFF0C\u4F60\u78B0\u4E0A\u8FC7\u5417\uFF1F", "\u8FD9\u4E2A\u573A\u9762\uFF0C\u4F60\u78B0\u4E0A\u8FC7\u5417\uFF1F"],
        goals: ["\u300A{topic}\u300B\u4E09\u4EF6\u4E8B\uFF0C\u80FD\u4E00\u4EF6\u4E00\u4EF6\u505A\u5B8C\u5417\uFF1F", "\u4E09\u4EF6\u4E8B\uFF0C\u80FD\u4E00\u4EF6\u4E00\u4EF6\u505A\u5B8C\u5417\uFF1F"],
        words: ["\u300A{topic}\u300B\u8FD9\u51E0\u4E2A\u8BCD\uFF0C\u4F60\u80FD\u8BFB\u51C6\u51E0\u4E2A\uFF1F", "\u8FD9\u51E0\u4E2A\u8BCD\uFF0C\u4F60\u80FD\u8BFB\u51C6\u51E0\u4E2A\uFF1F"],
        "close-read": ["\u8BFB\u300A{topic}\u300B\u8FD9\u4E00\u53E5\uFF0C\u54EA\u4E2A\u8BCD\u5728\u5199\u58F0\u97F3\uFF1F", "\u8FD9\u4E00\u53E5\u91CC\uFF0C\u54EA\u4E2A\u8BCD\u5728\u5199\u58F0\u97F3\uFF1F"],
        compare: ["\u300A{topic}\u300B\u8FD9\u4E24\u5904\uFF0C\u5DEE\u5728\u54EA\uFF1F", "\u8FD9\u4E24\u5904\uFF0C\u5DEE\u5728\u54EA\uFF1F"],
        board: ["\u300A{topic}\u300B\u8FD9\u4E09\u884C\uFF0C\u80FD\u7167\u987A\u5E8F\u8BF4\u4E00\u904D\u5417\uFF1F", "\u7167\u9ED1\u677F\u8FD9\u4E09\u884C\uFF0C\u80FD\u6309\u987A\u5E8F\u8BF4\u4E00\u904D\u5417\uFF1F"],
        drill: ["\u300A{topic}\u300B\u8FD9\u4E00\u6BB5\uFF0C\u4F60\u5148\u8BD5\u54EA\u4E00\u6B65\uFF1F", "\u8FD9\u4E00\u6BB5\uFF0C\u4F60\u5148\u8BD5\u54EA\u4E00\u6B65\uFF1F"],
        homework: ["\u300A{topic}\u300B\u8FD9\u4E24\u4EF6\u4E8B\uFF0C\u4ECA\u665A\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F", "\u8FD9\u4E24\u4EF6\u4E8B\uFF0C\u4ECA\u665A\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F"],
        end: ["\u300A{topic}\u300B\u8FD9\u4E00\u8BFE\uFF0C\u4F60\u5E26\u8D70\u54EA\u4E00\u53E5\uFF1F", "\u8FD9\u4E00\u8BFE\uFF0C\u4F60\u5E26\u8D70\u54EA\u4E00\u53E5\uFF1F"]
      },
      math: {
        /* 封面不要再把课题加上引号重复一遍（「长方体的认识」，先数什么？—— 数学老师看了会皱眉）：
           也不要写「这个形状」——《比大小》是数的大小，没有形状可看。只问数与量。 */
        cover: ["\u300A{topic}\u300B\u8FD9\u4E00\u8BFE\uFF0C\u5148\u770B\u624B\u8FB9\u54EA\u4E00\u6837\uFF1F", "\u624B\u8FB9\u8FD9\u51E0\u6837\uFF0C\u5148\u770B\u54EA\u4E00\u6837\uFF1F"],
        hook: ["\u300A{topic}\u300B\u684C\u4E0A\u8FD9\u51E0\u6837\uFF0C\u54EA\u513F\u4E0D\u4E00\u6837\uFF1F", "\u684C\u4E0A\u8FD9\u51E0\u6837\uFF0C\u54EA\u513F\u4E0D\u4E00\u6837\uFF1F"],
        goals: ["\u300A{topic}\u300B\u4E09\u4EF6\u4E8B\uFF0C\u80FD\u4E00\u4EF6\u4E00\u4EF6\u505A\u5B8C\u5417\uFF1F", "\u4E09\u4EF6\u4E8B\uFF0C\u80FD\u4E00\u4EF6\u4E00\u4EF6\u505A\u5B8C\u5417\uFF1F"],
        words: ["\u300A{topic}\u300B\u8FD9\u4E00\u6B65\uFF0C\u5148\u7B97\u54EA\u4E2A\uFF1F", "\u8FD9\u4E00\u6B65\uFF0C\u5148\u7B97\u54EA\u4E2A\uFF1F"],
        "close-read": ["\u300A{topic}\u300B\u8FD9\u4E00\u6B65\uFF0C\u4E3A\u4EC0\u4E48\u8FD9\u6837\u505A\uFF1F", "\u8FD9\u4E00\u6B65\uFF0C\u4E3A\u4EC0\u4E48\u8FD9\u6837\u505A\uFF1F"],
        compare: ["\u300A{topic}\u300B\u4E24\u8FB9\uFF0C\u5DEE\u5728\u54EA\uFF1F", "\u4E24\u8FB9\uFF0C\u5DEE\u5728\u54EA\uFF1F"],
        board: ["\u300A{topic}\u300B\u8FD9\u4E09\u884C\uFF0C\u80FD\u4E00\u884C\u4E00\u884C\u7B97\u4E0B\u6765\u5417\uFF1F", "\u7167\u9ED1\u677F\u8FD9\u4E09\u884C\uFF0C\u80FD\u4E00\u884C\u4E00\u884C\u7B97\u4E0B\u6765\u5417\uFF1F"],
        drill: ["\u300A{topic}\u300B\u4F60\u5148\u7B97\u54EA\u4E00\u6B65\uFF1F", "\u4F60\u5148\u7B97\u54EA\u4E00\u6B65\uFF1F"],
        homework: ["\u300A{topic}\u300B\u8FD9\u4E24\u9898\uFF0C\u4F60\u4ECA\u665A\u5148\u7B97\u54EA\u4E00\u9898\uFF1F", "\u8FD9\u4E24\u9898\uFF0C\u4F60\u4ECA\u665A\u5148\u7B97\u54EA\u4E00\u9898\uFF1F"],
        end: ["\u300A{topic}\u300B\u4ECA\u5929\u8FD9\u51E0\u4E2A\u6570\uFF0C\u4F60\u8BB0\u4F4F\u54EA\u4E2A\uFF1F", "\u4ECA\u5929\u8FD9\u51E0\u4E2A\u6570\uFF0C\u4F60\u8BB0\u4F4F\u54EA\u4E2A\uFF1F"]
      },
      english: {
        cover: ["\u300A{topic}\u300B\u8FD9\u4E00\u8BFE\uFF0C\u5148\u542C\u8FD8\u662F\u5148\u8BF4\uFF1F", "\u8FD9\u4E00\u8BFE\uFF0C\u5148\u542C\u8FD8\u662F\u5148\u8BF4\uFF1F"],
        hook: ["\u300A{topic}\u300B\u56FE\u4E0A\u8FD9\u4E9B\uFF0C\u82F1\u8BED\u600E\u4E48\u8BF4\uFF1F", "\u56FE\u4E0A\u8FD9\u4E9B\uFF0C\u82F1\u8BED\u600E\u4E48\u8BF4\uFF1F"],
        goals: ["\u300A{topic}\u300B\u4E09\u4EF6\u4E8B\uFF0C\u80FD\u4E00\u4EF6\u4E00\u4EF6\u505A\u5B8C\u5417\uFF1F", "\u4E09\u4EF6\u4E8B\uFF0C\u80FD\u4E00\u4EF6\u4E00\u4EF6\u505A\u5B8C\u5417\uFF1F"],
        words: ["\u300A{topic}\u300B\u8FD9\u51E0\u4E2A\u8BCD\uFF0C\u4F60\u80FD\u8BFB\u51C6\u51E0\u4E2A\uFF1F", "\u8FD9\u51E0\u4E2A\u8BCD\uFF0C\u4F60\u80FD\u8BFB\u51C6\u51E0\u4E2A\uFF1F"],
        "close-read": ["\u8BFB\u300A{topic}\u300B\u8FD9\u4E00\u53E5\uFF0C\u54EA\u4E2A\u8BCD\u662F\u65B0\u7684\uFF1F", "\u8FD9\u4E00\u53E5\u91CC\uFF0C\u54EA\u4E2A\u8BCD\u662F\u65B0\u7684\uFF1F"],
        compare: ["\u300A{topic}\u300B\u8FD9\u4E24\u53E5\uFF0C\u54EA\u513F\u4E0D\u4E00\u6837\uFF1F", "\u8FD9\u4E24\u53E5\uFF0C\u54EA\u513F\u4E0D\u4E00\u6837\uFF1F"],
        board: ["\u300A{topic}\u300B\u8FD9\u4E09\u53E5\uFF0C\u80FD\u6309\u987A\u5E8F\u8BF4\u4E00\u904D\u5417\uFF1F", "\u7167\u9ED1\u677F\u8FD9\u4E09\u53E5\uFF0C\u80FD\u6309\u987A\u5E8F\u8BF4\u4E00\u904D\u5417\uFF1F"],
        drill: ["\u300A{topic}\u300B\u4F60\u5148\u8BF4\u54EA\u4E00\u53E5\uFF1F", "\u4F60\u5148\u8BF4\u54EA\u4E00\u53E5\uFF1F"],
        homework: ["\u300A{topic}\u300B\u8FD9\u4E24\u4EF6\uFF0C\u5148\u8BF4\u7ED9\u8C01\u542C\uFF1F", "\u8FD9\u4E24\u4EF6\uFF0C\u5148\u8BF4\u7ED9\u8C01\u542C\uFF1F"],
        end: ["\u300A{topic}\u300B\u4ECA\u5929\u8FD9\u53E5\uFF0C\u4F60\u4F1A\u8BF4\u4E86\u5417\uFF1F", "\u4ECA\u5929\u8FD9\u53E5\uFF0C\u4F60\u4F1A\u8BF4\u4E86\u5417\uFF1F"]
      },
      science: {
        cover: ["\u300A{topic}\u300B\u8FD9\u4E00\u8BFE\uFF0C\u5148\u770B\u54EA\u4E00\u6837\uFF1F", "\u8FD9\u4E00\u8BFE\uFF0C\u5148\u770B\u54EA\u4E00\u6837\uFF1F"],
        hook: ["\u300A{topic}\u300B\u5148\u770B\uFF0C\u5B83\u53D8\u4E86\u6CA1\u6709\uFF1F", "\u5148\u770B\uFF0C\u5B83\u53D8\u4E86\u6CA1\u6709\uFF1F"],
        goals: ["\u300A{topic}\u300B\u4E09\u4EF6\u4E8B\uFF0C\u80FD\u4E00\u4EF6\u4E00\u4EF6\u505A\u5B8C\u5417\uFF1F", "\u4E09\u4EF6\u4E8B\uFF0C\u80FD\u4E00\u4EF6\u4E00\u4EF6\u505A\u5B8C\u5417\uFF1F"],
        words: ["\u300A{topic}\u300B\u8FD9\u51E0\u4E2A\u8BCD\uFF0C\u5206\u522B\u6307\u4EC0\u4E48\uFF1F", "\u8FD9\u51E0\u4E2A\u8BCD\uFF0C\u5206\u522B\u6307\u4EC0\u4E48\uFF1F"],
        "close-read": ["\u300A{topic}\u300B\u4E3A\u4EC0\u4E48\u4F1A\u8FD9\u6837\uFF1F", "\u4E3A\u4EC0\u4E48\u4F1A\u8FD9\u6837\uFF1F"],
        compare: ["\u300A{topic}\u300B\u4E24\u8FB9\uFF0C\u5DEE\u5728\u54EA\uFF1F", "\u4E24\u8FB9\uFF0C\u5DEE\u5728\u54EA\uFF1F"],
        board: ["\u300A{topic}\u300B\u8FD9\u51E0\u884C\uFF0C\u80FD\u7167\u987A\u5E8F\u8BF4\u4E00\u904D\u5417\uFF1F", "\u7167\u9ED1\u677F\u8FD9\u51E0\u884C\uFF0C\u80FD\u6309\u987A\u5E8F\u8BF4\u4E00\u904D\u5417\uFF1F"],
        drill: ["\u300A{topic}\u300B\u4F60\u5148\u8BD5\u54EA\u4E00\u6B65\uFF1F", "\u4F60\u5148\u8BD5\u54EA\u4E00\u6B65\uFF1F"],
        homework: ["\u300A{topic}\u300B\u8FD9\u4E24\u4EF6\uFF0C\u4ECA\u665A\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F", "\u8FD9\u4E24\u4EF6\uFF0C\u4ECA\u665A\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F"],
        end: ["\u300A{topic}\u300B\u8FD9\u4E2A\u73B0\u8C61\uFF0C\u4F60\u5728\u54EA\u513F\u89C1\u8FC7\uFF1F", "\u8FD9\u4E2A\u73B0\u8C61\uFF0C\u4F60\u5728\u54EA\u513F\u89C1\u8FC7\uFF1F"]
      },
      other: {
        cover: ["\u300A{topic}\u300B\u8FD9\u4E00\u8BFE\uFF0C\u5148\u5F04\u6E05\u695A\u4EC0\u4E48\uFF1F", "\u8FD9\u4E00\u8BFE\uFF0C\u5148\u5F04\u6E05\u695A\u4EC0\u4E48\uFF1F"],
        hook: ["\u300A{topic}\u300B\u5148\u770B\u8FD9\u4E00\u6837\uFF0C\u5B83\u50CF\u4EC0\u4E48\uFF1F", "\u5148\u770B\u8FD9\u4E00\u6837\uFF0C\u5B83\u50CF\u4EC0\u4E48\uFF1F"],
        goals: ["\u300A{topic}\u300B\u4E09\u4EF6\u4E8B\uFF0C\u80FD\u4E00\u4EF6\u4E00\u4EF6\u505A\u5B8C\u5417\uFF1F", "\u4E09\u4EF6\u4E8B\uFF0C\u80FD\u4E00\u4EF6\u4E00\u4EF6\u505A\u5B8C\u5417\uFF1F"],
        words: ["\u300A{topic}\u300B\u8FD9\u51E0\u4E2A\u8BCD\uFF0C\u5206\u522B\u6307\u4EC0\u4E48\uFF1F", "\u8FD9\u51E0\u4E2A\u8BCD\uFF0C\u5206\u522B\u6307\u4EC0\u4E48\uFF1F"],
        "close-read": ["\u300A{topic}\u300B\u8FD9\u4E00\u6B65\uFF0C\u4E3A\u4EC0\u4E48\u8FD9\u6837\u505A\uFF1F", "\u8FD9\u4E00\u6B65\uFF0C\u4E3A\u4EC0\u4E48\u8FD9\u6837\u505A\uFF1F"],
        compare: ["\u300A{topic}\u300B\u4E24\u8FB9\uFF0C\u5DEE\u5728\u54EA\uFF1F", "\u4E24\u8FB9\uFF0C\u5DEE\u5728\u54EA\uFF1F"],
        board: ["\u300A{topic}\u300B\u8FD9\u51E0\u884C\uFF0C\u80FD\u7167\u987A\u5E8F\u8BF4\u4E00\u904D\u5417\uFF1F", "\u7167\u9ED1\u677F\u8FD9\u51E0\u884C\uFF0C\u80FD\u6309\u987A\u5E8F\u8BF4\u4E00\u904D\u5417\uFF1F"],
        drill: ["\u300A{topic}\u300B\u4F60\u5148\u8BD5\u54EA\u4E00\u6B65\uFF1F", "\u4F60\u5148\u8BD5\u54EA\u4E00\u6B65\uFF1F"],
        homework: ["\u300A{topic}\u300B\u8FD9\u4E24\u4EF6\uFF0C\u4ECA\u665A\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F", "\u8FD9\u4E24\u4EF6\uFF0C\u4ECA\u665A\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F"],
        end: ["\u300A{topic}\u300B\u8FD9\u4E00\u8BFE\uFF0C\u4F60\u5E26\u8D70\u54EA\u4E00\u53E5\uFF1F", "\u8FD9\u4E00\u8BFE\uFF0C\u4F60\u5E26\u8D70\u54EA\u4E00\u53E5\uFF1F"]
      }
    };
    TASKS = {
      chinese: [
        { re: /读|朗读|诵读/, task: "\u8BFB\u901A\u8BFE\u6587" },
        { re: /说|讲|交流|表达/, task: "\u8BF4\u51FA\u60F3\u6CD5" },
        { re: /写|仿写|练笔/, task: "\u5199\u4E00\u6BB5" },
        { re: /演|表演|分角色/, task: "\u6F14\u4E00\u904D" },
        { re: /背|背诵/, task: "\u80CC\u4E0B\u6765" },
        { re: /圈|画出|找出|勾/, task: "\u627E\u51FA\u90A3\u53E5\u8BDD" }
      ],
      math: [
        { re: /量|称|测量/, task: "\u91CF\u4E00\u91CF" },
        { re: /数/, task: "\u6570\u4E00\u6570" },
        { re: /搭|摆|拼|剪|折|画/, task: "\u52A8\u624B\u6446\u4E00\u6446" },
        { re: /算|计算/, task: "\u7B97\u4E00\u7B97" },
        { re: /比较|比一比|多少|大小/, task: "\u6BD4\u4E00\u6BD4" },
        { re: /规律|发现/, task: "\u627E\u51FA\u89C4\u5F8B" },
        { re: /记录|记下|填/, task: "\u8BB0\u4E0B\u6765" },
        { re: /说|讲|解释|表达/, task: "\u8BF4\u6E05\u4E3A\u4EC0\u4E48" }
      ],
      english: [
        { re: /读|朗读/, task: "\u8BFB\u51C6\u8BCD" },
        { re: /听/, task: "\u542C\u61C2\u8FD9\u4E00\u53E5" },
        { re: /说|对话|开口/, task: "\u5F00\u53E3\u8BF4" },
        { re: /写/, task: "\u5199\u4E0B\u6765" },
        { re: /演|表演|角色/, task: "\u6F14\u4E00\u904D" }
      ],
      science: [
        { re: /观察|看/, task: "\u5148\u770B\u4ED4\u7EC6" },
        { re: /实验|做|操作/, task: "\u505A\u4E00\u6B21" },
        { re: /记录|记下|画/, task: "\u8BB0\u4E0B\u53D8\u5316" },
        { re: /比较|对比/, task: "\u6BD4\u4E00\u6BD4" },
        { re: /说|解释|原因/, task: "\u8BF4\u6E05\u4E3A\u4EC0\u4E48" }
      ],
      other: [
        { re: /看|观察/, task: "\u5148\u770B\u4ED4\u7EC6" },
        { re: /做|试|操作/, task: "\u52A8\u624B\u8BD5\u4E00\u6B21" },
        { re: /说|讲|解释/, task: "\u8BF4\u6E05\u4E3A\u4EC0\u4E48" },
        { re: /记|写|填/, task: "\u8BB0\u4E0B\u6765" }
      ]
    };
    TASK_FALLBACK = {
      chinese: ["\u8BFB\u5168\u7BC7\uFF0C\u5708\u51FA\u751F\u5B57\u8BCD", "\u627E\u51FA\u5199\u666F\u7684\u90A3\u4E24\u53E5", "\u7167\u6837\u5B50\u5199\u4E00\u53E5"],
      math: ["\u6570\u4E00\u6570\uFF0C\u8BB0\u4E2A\u6570", "\u52A8\u624B\u6446\u4E00\u6446", "\u8BF4\u6E05\u4E3A\u4EC0\u4E48"],
      english: ["\u8BFB\u51C6\u8FD9\u51E0\u4E2A\u8BCD", "\u5F00\u53E3\u8BF4\u4E00\u53E5", "\u542C\u61C2\u8FD9\u4E00\u53E5"],
      science: ["\u5148\u770B\u4ED4\u7EC6", "\u52A8\u624B\u505A\u4E00\u6B21", "\u8BF4\u6E05\u4E3A\u4EC0\u4E48"],
      other: ["\u5148\u770B\u4ED4\u7EC6", "\u52A8\u624B\u8BD5\u4E00\u6B21", "\u8BF4\u6E05\u4E3A\u4EC0\u4E48"]
    };
    LABELS = {
      chinese: "\u8BED\u6587",
      math: "\u6570\u5B66",
      english: "\u82F1\u8BED",
      science: "\u79D1\u5B66",
      other: "\u7EFC\u5408"
    };
    CLOSING = {
      chinese: () => "\u8FD9\u4E00\u8BFE\u5E26\u8D70\u7684\u90A3\u4E00\u53E5",
      math: () => "\u8FD9\u4E00\u8BFE\u6570\u51FA\u6765\u7684\u51E0\u4E2A\u6570",
      english: () => "\u4ECA\u5929\u8981\u8BF4\u987A\u7684\u8FD9\u51E0\u53E5",
      science: () => "\u8FD9\u4E00\u8BFE\u770B\u6E05\u7684\u90A3\u4EF6\u4E8B",
      other: () => "\u8FD9\u4E00\u8BFE\u5F04\u6E05\u7684\u90A3\u4EF6\u4E8B"
    };
  }
});

// src/data/guihua.ts
var GUIHUA_STUDENT_SLIDES;
var init_guihua = __esm({
  "src/data/guihua.ts"() {
    "use strict";
    GUIHUA_STUDENT_SLIDES = [
      {
        kind: "cover",
        title: "\u6842\u82B1\u96E8",
        line: "\u96E8\uFF0C\u4E5F\u53EF\u4EE5\u662F\u9999\u7684\uFF1F",
        notes: "\u4ECA\u5929\u5B66\u7684\u8FD9\u7BC7\u8BFE\u6587\u53EB\u300A\u6842\u82B1\u96E8\u300B\u3002\u96E8\u6211\u4EEC\u6DCB\u8FC7\u4E0D\u5C11\uFF0C\u900F\u660E\u7684\u3001\u51C9\u7684\uFF0C\u843D\u5730\u5C31\u6CA1\u58F0\u97F3\u4E86\u3002\u53EF\u7426\u541B\u5199\u7684\u8FD9\u4E00\u573A\u96E8\u662F\u9999\u7684\uFF0C\u843D\u5728\u4EBA\u8EAB\u4E0A\u8FD8\u7559\u7740\u3002\u4E3A\u4EC0\u4E48\u4F1A\u662F\u9999\u7684\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u5148\u522B\u7B54\u3002"
      },
      {
        kind: "hook",
        title: "\u5148\u95FB\u4E00\u95FB",
        line: "\u4F60\u95FB\u5230\u8FC7\u6842\u82B1\u9999\u5417\uFF1F",
        imageHint: "\u91D1\u6842 \u6EE1\u6811 \u7279\u5199 \u9AD8\u6E05",
        notes: "\uFF08\u6295\u51FA\u8FD9\u5F20\u56FE\uFF09\u5148\u60F3\u60F3\u81EA\u5DF1\u5728\u54EA\u513F\u95FB\u5230\u8FC7\u6842\u82B1\u9999\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u6709\u4EBA\u662F\u8DEF\u8FB9\uFF0C\u6709\u4EBA\u662F\u5916\u5A46\u5BB6\u7684\u9662\u5B50\u3002\u8BB0\u4F4F\u4F60\u90A3\u4E2A\u5473\u9053\uFF0C\u4E00\u4F1A\u513F\u62FF\u5B83\u6765\u8BFB\u8BFE\u6587\u3002"
      },
      {
        kind: "goals",
        title: "\u4ECA\u5929\u4E09\u4EF6\u4E8B",
        items: ["\u2460 \u8BFB\u901A\u8BFE\u6587", "\u2461 \u8BFB\u61C2\u6447\u82B1\u4E50", "\u2462 \u8BF4\u51FA\u4E3A\u4EC0\u4E48\u5FD8\u4E0D\u6389"],
        line: "\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F",
        notes: "\u4E09\u4EF6\u4E8B\u4E00\u4EF6\u4E00\u4EF6\u6765\u3002\u7B2C\u4E00\u4EF6\u628A\u5B57\u97F3\u8BFB\u51C6\u3001\u53E5\u5B50\u8BFB\u987A\uFF1B\u7B2C\u4E8C\u4EF6\u6700\u8981\u7D27\uFF0C\u6447\u6842\u82B1\u90A3\u6BB5\u8981\u8BFB\u51FA\u52A8\u4F5C\u548C\u58F0\u97F3\uFF1B\u7B2C\u4E09\u4EF6\u96BE\uFF0C\u96BE\u5728\u6BCD\u4EB2\u90A3\u53E5\u8BDD\u2014\u2014\u9999\u7684\u662F\u6842\u82B1\uFF0C\u6BD4\u7684\u5230\u5E95\u662F\u4EC0\u4E48\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09"
      },
      {
        kind: "words",
        title: "\u5B57\u8BCD\u5173",
        items: ["\u7BA9\u7B50", "\u676D\u5DDE", "\u6D78\u6DA6", "\u7F20\u7ED5"],
        line: "\u8C01\u80FD\u8BFB\u51C6\u8FD9\u56DB\u4E2A\uFF1F",
        notes: "\u8DDF\u6211\u8BFB\u4E00\u904D\uFF1A\u7BA9\u7B50\u7684\u7BA9\uFF0C\u7AF9\u5B57\u5934\uFF0C\u7BA9\u7B50\u662F\u7AF9\u5B50\u7F16\u7684\uFF1B\u676D\u5DDE\u7684\u676D\uFF0C\u6728\u5B57\u65C1\u3002\u6D78\u6DA6\u8FD9\u4E2A\u8BCD\u522B\u8DF3\u8FC7\u2014\u2014\u4E3A\u4EC0\u4E48\u4E24\u4E2A\u5B57\u90FD\u5E26\u4E09\u70B9\u6C34\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u9999\u4E0D\u662F\u95FB\u4E00\u4E0B\uFF0C\u662F\u4E00\u70B9\u70B9\u6E17\u6EE1\u6574\u4E2A\u9662\u5B50\u3002\u7F20\u7ED5\uFF0C\u60F3\u60F3\u6811\u679D\u62B1\u7740\u6811\u679D\u3002"
      },
      {
        kind: "close-read",
        title: "\u6447\u5440\u6447",
        line: "\u201C\u6447\u5440\u6447\uFF0C\u6842\u82B1\u7EB7\u7EB7\u843D\u4E0B\u6765\u3002\u201D",
        items: ["\u4E3A\u4EC0\u4E48\u662F\u201C\u6447\u201D\uFF0C\u4E0D\u662F\u201C\u6458\u201D\uFF1F"],
        notes: "\u63D0\u793A\uFF1A\u6447\u662F\u51E0\u4E2A\u4EBA\u62B1\u7740\u6842\u6811\u4F7F\u52B2\u6643\uFF0C\u6709\u58F0\u97F3\u3001\u6709\u52A8\u6001\u3001\u6709\u6EE1\u5934\u6EE1\u8EAB\u7684\u82B1\uFF1B\u6458\u662F\u4E00\u4E2A\u4EBA\u8F7B\u8F7B\u62FF\u4E0B\uFF0C\u5B89\u9759\uFF0C\u4E5F\u6CA1\u6709\u573A\u9762\u3002\u8C01\u6765\u628A\u8FD9\u53E5\u8BFB\u51FA\u6447\u7684\u52B2\u513F\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09"
      },
      {
        kind: "compare",
        title: "\u6BD4\u4E00\u6BD4",
        items: ["\u676D\u5DDE\u7684\u6842\u82B1", "\u5BB6\u4E61\u9662\u5B50\u91CC\u7684\u6842\u82B1"],
        compareDiff: ["\u82B1\u4E00\u6837\u9999\uFF0C\u5DEE\u7684\u662F\u522B\u7684\uFF1F"],
        line: "\u660E\u660E\u4E00\u6837\u7684\u9999\uFF0C\u4E3A\u4EC0\u4E48\u8BF4\u6BD4\u4E0D\u4E0A\uFF1F",
        notes: "\u9999\u5C31\u662F\u9999\uFF0C\u90A3\u6BCD\u4EB2\u6BD4\u7684\u662F\u4EC0\u4E48\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u63D0\u793A\uFF1A\u5BB6\u4E61\u7684\u6842\u82B1\u662F\u6BCD\u4EB2\u4EB2\u624B\u6447\u7684\u3001\u6652\u7684\u3001\u814C\u7684\uFF0C\u662F\u5168\u5BB6\u4E00\u5E74\u7684\u751C\uFF1B\u8FD9\u91CC\u7684\u6842\u82B1\u662F\u4E70\u6765\u770B\u7684\u3002\u5979\u6BD4\u7684\u4E0D\u662F\u82B1\uFF0C\u662F\u90A3\u4E00\u6BB5\u65E5\u5B50\u548C\u90A3\u4E2A\u9662\u5B50\u3002"
      },
      {
        kind: "board",
        title: "\u770B\u8FD9\u513F",
        items: ["\u7231\u6842\u82B1 \u2192 \u6447\u6842\u82B1 \u2192 \u5FF5\u6842\u82B1", "\u9999 \u4E50 \u60C5"],
        line: "\u8FD9\u4E09\u6761\uFF0C\u54EA\u6761\u6700\u91CD\uFF1F",
        notes: "\u4E09\u6761\u7EBF\u4ECE\u4E0A\u5F80\u4E0B\u5199\uFF0C\u5FF5\u90A3\u4E00\u6761\u6700\u91CD\u3002\u6700\u540E\u90A3\u4E2A\u5B57\uFF0C\u4E3A\u4EC0\u4E48\u662F\u201C\u60C5\u201D\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u524D\u9762\u6240\u6709\u7684\u9999\u3001\u6240\u6709\u7684\u7B11\uFF0C\u90FD\u662F\u4E3A\u4E86\u6700\u540E\u8FD9\u4E00\u53E5\u5FD8\u4E0D\u6389\u3002\u5199\u5230\u201C\u60C5\u201D\u7684\u65F6\u5019\u5148\u505C\u4E00\u4E0B\uFF0C\u8BB2\u5230\u62D3\u5C55\u90A3\u4E00\u9875\u518D\u8865\u4E0A\u3002"
      },
      {
        kind: "drill",
        title: "\u4E09\u4E2A\u52A8\u8BCD\u586B\u56DE\u53BB",
        line: "\u4E09\u4E2A\u52A8\u8BCD\uFF0C\u85CF\u5728\u54EA\u513F\uFF1F",
        items: ["\u5979\uFF08\u3000\uFF09\u7740\u6842\u6811\uFF0C\u4F7F\u52B2\u5730\uFF08\u3000\uFF09\uFF0C\u5927\u58F0\uFF08\u3000\uFF09"],
        notes: "\u7B54\u6848\uFF1A\u62B1\u3001\u6447\u3001\u558A\u3002\u586B\u5B8C\u518D\u8FFD\u95EE\u4E00\u53E5\uFF1A\u4E3A\u4EC0\u4E48\u662F\u558A\u4E0D\u662F\u8BF4\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u56E0\u4E3A\u90A3\u5E74\u7684\u5B69\u5B50\u62B1\u7740\u6811\uFF0C\u82B1\u843D\u8FDB\u8116\u5B50\u91CC\uFF0C\u75D2\uFF0C\u53C8\u60F3\u7B11\uFF0C\u58F0\u97F3\u662F\u8E66\u51FA\u6765\u7684\u3002"
      },
      {
        kind: "homework",
        title: "\u8BFE\u540E\u4E24\u4EF6\u4E8B",
        items: ["\u5FC5\u505A\uFF1A\u80CC\u201C\u6447\u82B1\u4E50\u201D\u4E00\u6BB5", "\u9009\u505A\uFF1A\u5199\u4E00\u4EF6\u4F60\u5BB6\u7684\u8001\u7269\u4EF6"],
        line: "\u54EA\u4EF6\u4F60\u5148\u505A\uFF1F",
        notes: "\u5FC5\u505A\u90A3\u6BB5\u53EA\u8981\u4E09\u5206\u949F\uFF0C\u8BFB\u51FA\u558A\u7684\u52B2\u513F\u5C31\u7B97\u8FC7\u5173\u3002\u9009\u505A\u4E0D\u7528\u957F\uFF0C\u5199\u4F60\u5BB6\u7684\u4E00\u4E2A\u4E1C\u897F\uFF1A\u4E00\u628A\u6905\u5B50\u3001\u4E00\u53EA\u7897\u3001\u4E00\u76CF\u706F\uFF0C\u5199\u51FA\u5B83\u8DDF\u8C01\u5728\u4E00\u8D77\u3002\u4F60\u60F3\u5199\u54EA\u4E00\u6837\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u4E0B\u8282\u8BFE\u8BF7\u4E09\u4F4D\u540C\u5B66\u5FF5\u3002"
      },
      {
        kind: "end",
        title: "\u8BB0\u4F4F\u8FD9\u53E5\u8BDD",
        line: "\u4F60\u7684\u6842\u82B1\uFF0C\u662F\u4EC0\u4E48\uFF1F",
        notes: "\u4E00\u573A\u6842\u82B1\u96E8\uFF0C\u843D\u4E86\u6EE1\u8EAB\uFF0C\u4E5F\u843D\u4E86\u6EE1\u5FC3\u3002\u7426\u541B\u5199\u7684\u662F\u6842\u82B1\uFF0C\u5FF5\u7684\u662F\u6545\u4E61\u3002\u90A3\u4E2A\u8FDE\u7740\u7684\u4EBA\uFF0C\u4F60\u60F3\u8BF4\u7ED9\u8C01\u542C\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u4E0B\u8BFE\u4E4B\u524D\u8BB0\u4F4F\u8FD9\u53E5\uFF1A\u8BA9\u6211\u4EEC\u5FD8\u4E0D\u6389\u7684\uFF0C\u4ECE\u6765\u4E0D\u662F\u4E1C\u897F\uFF0C\u662F\u5B83\u8FDE\u7740\u7684\u4EBA\u548C\u65E5\u5B50\u3002"
      }
    ];
  }
});

// src/data/bidaxiao.ts
var BIDAXIAO_STUDENT_SLIDES;
var init_bidaxiao = __esm({
  "src/data/bidaxiao.ts"() {
    "use strict";
    BIDAXIAO_STUDENT_SLIDES = [
      {
        kind: "cover",
        title: "\u6BD4\u5927\u5C0F",
        line: "3 \u53EA\u7334 4 \u4E2A\u6843\uFF0C\u8C01\u591A\uFF1F",
        notes: "\u4ECA\u5929\u8FD9\u8282\u8BFE\u53EB\u6BD4\u5927\u5C0F\u30023 \u53EA\u7334\u5206 4 \u4E2A\u6843\uFF0C\u4E0D\u7528\u6570\u4E5F\u77E5\u9053\u591F\u3002\u53EF\u5149\u7528\u5634\u8BF4\u8C01\u591A\u8C01\u5C11\u592A\u5570\u55E6\uFF0C\u6570\u5B66\u5BB6\u5ACC\u9EBB\u70E6\uFF0C\u9020\u4E86\u4E09\u4E2A\u5C0F\u7B26\u53F7\u3002\u4F60\u60F3\u5148\u8BA4\u54EA\u4E00\u4E2A\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u4E00\u4F1A\u513F\u6211\u4EEC\u4E00\u4E2A\u4E00\u4E2A\u8BA4\u3002"
      },
      {
        kind: "hook",
        title: "\u5C0F\u7334\u5206\u6C34\u679C",
        line: "\u6BCF\u53EA\u7334\u5206\u4E00\u4E2A\uFF0C\u591F\u5206\u5417\uFF1F",
        imageHint: "\u5C0F\u7334\u5206\u6843\u5B50 \u4E00\u4E00\u5BF9\u5E94",
        notes: "\uFF08\u6307\u56FE\uFF093 \u53EA\u7334\u30014 \u4E2A\u6843\u30013 \u6839\u9999\u8549\u30012 \u4E2A\u68A8\u3002\u4E00\u4E2A\u5BF9\u4E00\u4E2A\u6446\u5F00\uFF1A\u6843\u5B50\u591A 1 \u4E2A\uFF0C\u9999\u8549\u6B63\u597D\u5BF9\u5B8C\uFF0C\u68A8\u5C11 1 \u4E2A\u3002\u591A\u51FA\u6765\u7684\u90A3\u4E2A\u5BF9\u4E0A\u4E86\u5417\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u6CA1\u5BF9\u4E0A\uFF0C\u5B83\u5C31\u662F\u591A\u7684\u3002"
      },
      {
        kind: "goals",
        title: "\u4ECA\u5929\u4E09\u4EF6\u4E8B",
        items: ["\u2460 \u6446\u4E00\u6446", "\u2461 \u8BA4\u7B26\u53F7", "\u2462 \u6BD4\u4E00\u6BD4"],
        line: "\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F",
        notes: "\u4E09\u4EF6\u4E8B\u4E00\u4EF6\u4E00\u4EF6\u505A\u3002\u5148\u6446\u4E00\u6446\uFF1A\u4F60\u624B\u91CC\u7684\u5C0F\u68D2\u591F\u6446\u51E0\u6392\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u6446\u5B8C\u518D\u8BA4\u8BC6\u7B49\u53F7\u3001\u5927\u4E8E\u53F7\u3001\u5C0F\u4E8E\u53F7\uFF0C\u6700\u540E\u5168\u73ED\u7528\u624B\u52BF\u5FEB\u901F\u6BD4\u3002\u7B2C\u4E09\u4EF6\u6700\u8FC7\u763E\uFF0C\u624B\u6BD4\u51FA\u6765\u7684\u662F\u7B26\u53F7\u7684\u5634\u5DF4\u671D\u54EA\u8FB9\u5F20\u3002"
      },
      {
        kind: "words",
        title: "\u4E09\u4E2A\u7B26\u53F7",
        items: ["\u7B49\u53F7 \uFF1D", "\u5927\u4E8E\u53F7 \uFF1E", "\u5C0F\u4E8E\u53F7 \uFF1C", "\u4E00\u4E00\u5BF9\u5E94"],
        line: "\u5B83\u4EEC\u7684\u5634\u5DF4\u671D\u8C01\u5F20\uFF1F",
        notes: "\u8DDF\u6211\u8BFB\u4E00\u904D\uFF1A\u7B49\u53F7\u3001\u5927\u4E8E\u53F7\u3001\u5C0F\u4E8E\u53F7\u3002\u770B\u5927\u4E8E\u53F7\u7684\u5634\u5DF4\uFF0C\u5F20\u5F97\u5927\u5927\u7684\uFF0C\u671D\u7740 3\uFF0C\u56E0\u4E3A\u5B83\u5927\u3002\u8BB0\u4F4F\u8FD9\u53E5\u2014\u2014\u5F00\u53E3\u671D\u5927\u6570\uFF0C\u5C16\u5C16\u671D\u5C0F\u6570\u3002\u8C01\u80FD\u7528\u4E24\u53EA\u624B\u81C2\u6BD4\u51FA\u6765\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09"
      },
      {
        kind: "close-read",
        title: "3 \uFF1E 2",
        line: "\u8BFB\u4F5C\uFF1A3 \u5927\u4E8E 2\u3002",
        items: ["\u5F00\u53E3\u4E3A\u4EC0\u4E48\u4E0D\u671D 2\uFF1F"],
        notes: "\u8FD9\u4E2A\u5F0F\u5B50\u8BFB\u4F5C 3 \u5927\u4E8E 2\u3002\u8FFD\u95EE\uFF1A\u5F00\u53E3\u4E3A\u4EC0\u4E48\u4E0D\u671D 2\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u56E0\u4E3A 2 \u5C0F\uFF0C\u5C16\u5C16\u624D\u671D\u5C0F\u6570\u3002\u8BF7\u4E00\u4E2A\u5B69\u5B50\u4E0A\u53F0\u6307\u4E00\u6307\u54EA\u513F\u662F\u5F00\u53E3\u3001\u54EA\u513F\u662F\u5C16\u5C16\uFF0C\u6307\u5BF9\u4E86\u5C31\u8BA9\u4ED6\u5E26\u5927\u5BB6\u7528\u624B\u81C2\u8BFB\u4E00\u904D\u3002"
      },
      {
        kind: "compare",
        title: "\u6BD4\u4E00\u6BD4",
        items: ["5 \u25CB 3", "2 \u25CB 2", "4 \u25CB 5"],
        compareDiff: ["\u6570\u4E00\u6570\uFF0C\u4E24\u8FB9\u5404\u51E0\u4E2A", "\u5C31\u5DEE1\u4E2A\uFF0C\u8C01\u5C11\uFF1F"],
        line: "\u4E09\u4E2A\u25CB\uFF0C\u5404\u586B\u54EA\u4E2A\u7B26\u53F7\uFF1F",
        notes: "\u4E0D\u7528\u7B14\uFF0C\u7528\u624B\u52BF\u6BD4\u7ED9\u6211\u770B\u3002\u7B54\u6848\uFF1A5 \u5927\u4E8E 3\uFF0C2 \u7B49\u4E8E 2\uFF0C4 \u5C0F\u4E8E 5\u3002\u6311\u4E2D\u95F4\u90A3\u4E2A\u8FFD\u95EE\uFF1A2 \u548C 2 \u4E00\u4E2A\u4E5F\u4E0D\u591A\u4E00\u4E2A\u4E5F\u4E0D\u5C11\uFF0C\u624D\u7528\u7B49\u53F7\u3002\u518D\u95EE 4 \u548C 5 \u53EA\u5DEE 1\uFF0C\u4F60\u600E\u4E48\u4E00\u773C\u5C31\u770B\u51FA\u6765\u4E86\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09"
      },
      {
        kind: "board",
        title: "\u770B\u8FD9\u513F",
        items: ["3 \uFF1D 3 \u540C\u6837\u591A", "3 \uFF1E 2 \u591A 1 \u4E2A", "3 \uFF1C 4 \u5C11 1 \u4E2A"],
        line: "\u54EA\u4E00\u884C\u8FDE\u7740\u53E3\u8BC0\uFF1F",
        notes: "\u8FD9\u4E09\u884C\u662F\u4ECE\u4E0A\u5F80\u4E0B\u5199\u4E0B\u6765\u7684\uFF1A\u5148\u540C\u6837\u591A\uFF0C\u518D\u591A\uFF0C\u6700\u540E\u5C11\u3002\u7B2C\u4E09\u884C\u7684\u5C16\u5C16\u671D\u54EA\u8FB9\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u53E3\u8BC0\u5F00\u53E3\u671D\u5927\u6570\u3001\u5C16\u5C16\u671D\u5C0F\u6570\u8D34\u5728\u53F3\u8FB9\u3002\u6307\u4E00\u884C\u8BFB\u4E00\u884C\uFF0C\u8BFB\u5230\u7B2C\u4E09\u884C\u65F6\u5168\u73ED\u9F50\u8BF5\u53E3\u8BC0\uFF0C\u4E00\u8FB9\u8BF5\u4E00\u8FB9\u6BD4\u624B\u52BF\u3002"
      },
      {
        kind: "drill",
        title: "\u6BD4\u5927\u5C0F\uFF0C\u586B\u7B26\u53F7",
        items: ["4 \u25CB 2", "6 \u25CB 6", "3 \u25CB 8"],
        line: "\u8C01\u6765\u586B\u7B2C\u4E00\u4E2A\uFF1F",
        notes: "\u7B54\u6848\uFF1A4 \u5927\u4E8E 2\uFF0C6 \u7B49\u4E8E 6\uFF0C3 \u5C0F\u4E8E 8\u3002\u586B\u9519\u7684\u5148\u522B\u7EA0\u6B63\uFF0C\u53EA\u95EE\u4ED6\uFF1A\u5F00\u53E3\u671D\u8C01\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u56DE\u5230\u8FD9\u53E5\u53E3\u8BC0\u4ED6\u81EA\u5DF1\u5C31\u80FD\u63B0\u56DE\u6765\u3002\u5168\u5BF9\u7684\u8FFD\u52A0\u4E00\u9898\uFF1A8 \u25CB 3\uFF0C\u7B26\u53F7\u8FD8\u4E00\u6837\u5417\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09"
      },
      {
        kind: "homework",
        title: "\u8BFE\u540E\u4E24\u4EF6\u4E8B",
        items: ["\u5FC5\u505A\uFF1A\u7B2C 17 \u9875\u505A\u4E00\u505A", "\u9009\u505A\uFF1A\u627E\u4E09\u6837\u4E1C\u897F\u6BD4\u4E00\u6BD4"],
        line: "\u54EA\u4EF6\u4F60\u5148\u505A\uFF1F",
        notes: "\u5FC5\u505A\u4E09\u5206\u949F\u5C31\u80FD\u505A\u5B8C\uFF0C\u5728\u25CB\u91CC\u586B\u7B26\u53F7\u3002\u9009\u505A\u4E0D\u7528\u5199\u957F\uFF1A\u627E\u51FA\u5BB6\u91CC\u7684\u4E09\u6837\u4E1C\u897F\uFF0C\u6570\u4E00\u6570\u3001\u6BD4\u4E00\u6BD4\u3002\u7B2C\u4E00\u6837\u6253\u7B97\u62FF\u4EC0\u4E48\u6765\u6BD4\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u660E\u5929\u8BF4\u7ED9\u540C\u684C\u542C\uFF0C\u8BF4\u7684\u65F6\u5019\u5E26\u4E00\u53E5\u4E3A\u4EC0\u4E48\u586B\u8FD9\u4E2A\u7B26\u53F7\u3002"
      },
      {
        kind: "end",
        title: "\u4E00\u53E5\u53E3\u8BC0",
        line: "\u56DE\u5BB6\u6BD4\u4EC0\u4E48\uFF0C\u60F3\u597D\u4E86\u5417\uFF1F",
        notes: "\u9F50\u8BFB\u53E3\u8BC0\uFF1A\u5F00\u53E3\u671D\u5927\u6570\uFF0C\u5C16\u5C16\u671D\u5C0F\u6570\u3002\u684C\u4E0A\u7684\u7897\u548C\u52FA\u5B50\uFF0C\u54EA\u4E2A\u591A\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u660E\u5929\u6765\u8003\u4F60\u4EEC\uFF1A\u7897\u51E0\u53EA\u3001\u52FA\u5B50\u51E0\u628A\uFF0C\u8C01\u591A\u8C01\u5C11\uFF0C\u7528\u54EA\u4E2A\u7B26\u53F7\u3002\u6570\u5B66\u5BB6\u4E0D\u5728\u8BFE\u672C\u91CC\uFF0C\u5C31\u5728\u4F60\u5BB6\u7684\u996D\u684C\u4E0A\u3002"
      }
    ];
  }
});

// src/data/changfangti.ts
var CHANGFANGTI_STUDENT_SLIDES;
var init_changfangti = __esm({
  "src/data/changfangti.ts"() {
    "use strict";
    CHANGFANGTI_STUDENT_SLIDES = [
      {
        kind: "cover",
        title: "\u957F\u65B9\u4F53\u7684\u8BA4\u8BC6",
        line: "\u5B83\u548C\u6B63\u65B9\u5F62\uFF0C\u54EA\u91CC\u4E0D\u4E00\u6837\uFF1F",
        notes: "\u9ED1\u677F\u4E0A\u8FD9\u51E0\u4E2A\u5B57\u5927\u5BB6\u90FD\u5FF5\u5F97\u51FA\u6765\u2014\u2014\u957F\u65B9\u4F53\u3002\u7259\u818F\u76D2\u662F\u957F\u65B9\u4F53\uFF0C\u9B54\u65B9\u65B9\u65B9\u6B63\u6B63\u3002\u5B83\u4EEC\u90FD\u65B9\u65B9\u7684\uFF0C\u53EF\u53C8\u4E0D\u592A\u4E00\u6837\u3002\u5148\u770B\u770B\u6559\u5BA4\uFF1A\u54EA\u6837\u4E1C\u897F\u662F\u957F\u65B9\u4F53\u7684\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u5148\u522B\u6025\u7740\u8BF4\u7B54\u6848\uFF0C\u5B66\u5B8C\u8FD9\u8282\u8BFE\u518D\u56DE\u6765\u544A\u8BC9\u5927\u5BB6\u3002"
      },
      {
        kind: "hook",
        title: "\u5148\u6478\u4E00\u6478",
        line: "\u54EA\u4E2A\u76D2\u5B50\u548C\u522B\u7684\u4E0D\u540C\uFF1F",
        imageHint: "\u957F\u65B9\u4F53\u751F\u6D3B\u5B9E\u7269\u56FE",
        notes: "\uFF08\u4E3E\u8D77\u7259\u818F\u76D2\u3001\u7C89\u7B14\u76D2\u3001\u9B54\u65B9\uFF0C\u4F20\u4E0B\u53BB\u6478\uFF09\u90FD\u5E73\u5E73\u7684\u3001\u65B9\u65B9\u7684\u3002\u54EA\u91CC\u4E0D\u4E00\u6837\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u6709\u7684\u957F\u957F\u7684\uFF0C\u6709\u7684\u6BCF\u4E2A\u9762\u4E00\u6837\u5927\u3002\u957F\u957F\u7684\u90A3\u79CD\uFF0C\u5C31\u662F\u4ECA\u5929\u8981\u7814\u7A76\u7684\u957F\u65B9\u4F53\u3002"
      },
      {
        kind: "goals",
        title: "\u4ECA\u5929\u4E09\u4EF6\u4E8B",
        items: ["\u2460 \u6570\u4E00\u6570", "\u2461 \u91CF\u4E00\u91CF", "\u2462 \u642D\u4E00\u642D"],
        line: "\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F",
        notes: "\u4E09\u4EF6\u4E8B\u5BF9\u5E94\u4E09\u4E2A\u52A8\u4F5C\u3002\u6570\u4E00\u6570\uFF0C\u628A\u9762\u3001\u68F1\u3001\u9876\u70B9\u6570\u6E05\u695A\u2014\u2014\u4F60\u624B\u91CC\u90A3\u4E2A\u76D2\u5B50\u6709\u51E0\u4E2A\u9762\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u518D\u91CF\u4E00\u91CF\uFF0C\u770B 12 \u6761\u68F1\u85CF\u7740\u4EC0\u4E48\u89C4\u5F8B\uFF1B\u6700\u540E\u642D\u4E00\u642D\uFF0C\u7528\u5C0F\u68D2\u771F\u505A\u51FA\u4E00\u4E2A\u6846\u67B6\u3002\u624B\u4E0D\u505C\uFF0C\u8111\u5B50\u624D\u4E0D\u4F1A\u505C\u3002"
      },
      {
        kind: "words",
        title: "\u56DB\u4E2A\u540D\u5B57",
        items: ["\u957F\u65B9\u4F53", "\u68F1", "\u9876\u70B9", "\u957F\u5BBD\u9AD8"],
        line: "\u54EA\u4E24\u4E2A\u8BCD\u4F60\u6700\u964C\u751F\uFF1F",
        notes: "\u8DDF\u6211\u8BFB\u4E00\u904D\uFF1A\u957F\u65B9\u4F53\u3001\u68F1\u3001\u9876\u70B9\u3001\u957F\u5BBD\u9AD8\u3002\u68F1\u4E0D\u662F\u8FB9\u2014\u2014\u5B83\u662F\u4E24\u4E2A\u9762\u76F8\u4EA4\u7684\u90A3\u6761\u7EBF\uFF0C\u7528\u624B\u6CBF\u7EB8\u76D2\u63CF\u4E00\u6761\u770B\u770B\u3002\u63CF\u5230\u7684\u90A3\u6761\u7EBF\uFF0C\u7B97\u68F1\u8FD8\u662F\u7B97\u9762\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u9876\u70B9\u662F\u4E09\u6761\u68F1\u805A\u5728\u4E00\u8D77\u7684\u5C16\u5C16\u89D2\uFF0C\u7B14\u5C16\u70B9\u4E00\u70B9\u3002\u6700\u964C\u751F\u7684\u53EF\u80FD\u662F\u957F\u5BBD\u9AD8\uFF0C\u6700\u540E\u4E00\u4EF6\u4E8B\u4E4B\u524D\u4E0D\u63ED\u6653\u3002"
      },
      {
        kind: "close-read",
        title: "12 \u6761\u68F1",
        line: "\u5B83\u4EEC\u80FD\u5206\u6210\u51E0\u7EC4\uFF1F",
        items: ["\u6BCF\u7EC4\u90FD\u4E00\u6837\u957F\u5417\uFF1F"],
        notes: "\u6309\u65B9\u5411\u4E00\u7EC4\u4E00\u7EC4\u91CF\uFF1A\u6A2A\u7740\u7684 4 \u6761\u3001\u7AD6\u7740\u7684 4 \u6761\u3001\u524D\u540E\u65B9\u5411\u7684 4 \u6761\u3002\u4F60\u4EEC\u7EC4\u5148\u91CF\u7684\u662F\u54EA\u4E00\u7EC4\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u91CF\u5B8C\u4F60\u4F1A\u53D1\u73B0\u6BCF\u7EC4 4 \u6761\u4E00\u6837\u957F\uFF0C\u6B63\u597D 3 \u7EC4\u3002\u8FD9 3 \u7EC4\uFF0C\u5C31\u662F\u957F\u3001\u5BBD\u3001\u9AD8\u2014\u2014\u76F8\u4EA4\u4E8E\u540C\u4E00\u4E2A\u9876\u70B9\u7684\u4E09\u6761\u68F1\u3002"
      },
      {
        kind: "compare",
        title: "\u6BD4\u4E00\u6BD4",
        items: ["\u9762\uFF1A\u76F8\u5BF9\u7684\u4E00\u6837\u5927", "\u68F1\uFF1A\u76F8\u5BF9\u7684\u4E00\u6837\u957F"],
        compareDiff: ["\u4E00\u4E2A\u662F\u9762\uFF0C\u4E00\u4E2A\u662F\u68F1"],
        line: "\u53E0\u4E00\u53E0\uFF0C\u91CF\u4E00\u91CF\uFF1F",
        notes: "\u628A\u4E0A\u4E0B\u4E24\u4E2A\u9762\u6495\u4E0B\u6765\u53E0\u5728\u4E00\u8D77\uFF0C\u5B8C\u5168\u91CD\u5408\uFF1B\u91CF\u4E00\u91CF\u76F8\u5BF9\u7684\u68F1\uFF0C\u957F\u5EA6\u76F8\u7B49\u3002\u9664\u4E86\u4E0A\u4E0B\uFF0C\u8FD8\u6709\u54EA\u4E24\u5BF9\u662F\u76F8\u5BF9\u7684\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u6CE8\u610F\u76F8\u5BF9\u662F\u9694\u7740\u76D2\u5B50\u6B63\u5BF9\u7740\u7684\u90A3\u4E00\u4E2A\uFF0C\u4E0D\u662F\u6328\u7740\u5B83\u7684\u3002\u8FD9\u4E24\u53E5\u8BDD\u5C31\u662F\u957F\u65B9\u4F53\u7684\u813E\u6C14\u3002"
      },
      {
        kind: "board",
        title: "\u770B\u8FD9\u513F",
        items: ["\u9762 6 \u4E2A", "\u68F1 12 \u6761", "\u9876\u70B9 8 \u4E2A"],
        line: "\u4E09\u4E2A\u6570\uFF0C\u8C01\u6700\u5927\uFF1F",
        notes: "\u4E09\u4E2A\u6570\u91CC 12 \u6700\u5927\u2014\u2014\u68F1\u6700\u591A\u3002\u4E3A\u4EC0\u4E48\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u9762\u4E0E\u9762\u76F8\u4EA4\u624D\u4EA7\u751F\u68F1\uFF0C\u68F1\u4E0E\u68F1\u76F8\u4EA4\u624D\u4EA7\u751F\u9876\u70B9\uFF0C\u6570\u5F97\u8D8A\u7EC6\uFF0C\u770B\u5F97\u8D8A\u6DF1\u3002\u6307\u7740\u4E00\u4E2A\u9876\u70B9\u544A\u8BC9\u5B66\u751F\uFF1A\u76F8\u4EA4\u5728\u8FD9\u91CC\u7684\u4E09\u6761\u68F1\uFF0C\u5C31\u662F\u957F\u3001\u5BBD\u3001\u9AD8\u3002"
      },
      {
        kind: "drill",
        title: "\u7528 12 \u6839\u5C0F\u68D2\u642D\u957F\u65B9\u4F53",
        items: ["\uFF08\u3000\uFF09\u6839\u5C0F\u68D2", "\uFF08\u3000\uFF09\u79CD\u957F\u5EA6"],
        line: "\u9876\u70B9\u62FF\u4EC0\u4E48\u505A\uFF1F",
        notes: "\u7B54\u6848\uFF1A12 \u6839\u5C0F\u68D2\u30013 \u79CD\u957F\u5EA6\uFF0C\u9876\u70B9\u7528\u6A61\u76AE\u6CE5\u637B\u3002\u5148\u8BAE\u540E\u642D\uFF0C\u8FB9\u642D\u8FB9\u6570\u3002\u642D\u5B8C\u6BD4\u4E00\u6BD4\u8C01\u7684\u6700\u7A33\uFF0C\u7A33\u7684\u90A3\u4E2A\u5C0F\u7EC4\u8BF4\u8BF4\uFF1A\u957F\u7684\u5C0F\u68D2\u3001\u77ED\u7684\u5C0F\u68D2\u3001\u9AD8\u7684\u5C0F\u68D2\u5404\u653E\u5728\u54EA\u513F\u4E86\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09"
      },
      {
        kind: "homework",
        title: "\u8BFE\u540E\u4E24\u4EF6\u4E8B",
        items: ["\u5FC5\u505A\uFF1A\u7B2C 19 \u9875\u505A\u4E00\u505A", "\u9009\u505A\uFF1A\u505A\u7EB8\u76D2\u91CF\u957F\u5BBD\u9AD8"],
        line: "\u54EA\u4EF6\u4F60\u5148\u505A\uFF1F",
        notes: "\u5FC5\u505A\u662F\u586B\u4E00\u5F20\u8868\uFF1A\u9762\u3001\u68F1\u3001\u9876\u70B9\u5404\u51E0\u4E2A\u3002\u9009\u505A\u7528\u786C\u7EB8\u505A\u4E00\u4E2A\u957F\u65B9\u4F53\u7EB8\u76D2\uFF0C\u91CF\u51FA\u957F\u5BBD\u9AD8\u3002\u4F60\u7684\u76D2\u5B50\u6253\u7B97\u88C5\u4EC0\u4E48\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u4E0B\u8282\u8BFE\u5E26\u6765\uFF0C\u6211\u4EEC\u6BD4\u4E00\u6BD4\u8C01\u505A\u7684\u76D2\u5B50\u6700\u80FD\u88C5\u3002"
      },
      {
        kind: "end",
        title: "\u6700\u540E\u4E00\u95EE",
        line: "\u9B54\u65B9\u662F\u957F\u65B9\u4F53\u5417\uFF1F",
        notes: "\u6B63\u65B9\u4F53\u662F\u7279\u6B8A\u7684\u957F\u65B9\u4F53\u2014\u2014\u957F\u5BBD\u9AD8\u957F\u5F97\u4E00\u6837\u7684\u957F\u65B9\u4F53\u3002\u4ECA\u5929\u5148\u57CB\u4E2A\u79CD\u5B50\uFF0C\u4E0D\u6025\u7740\u8BB2\u900F\u3002\u4E0B\u8282\u8BFE\u5E26\u7740\u4F60\u505A\u7684\u7EB8\u76D2\u6765\uFF1A\u957F\u5BBD\u9AD8\u5404\u662F\u591A\u5C11\uFF0C\u91CF\u51C6\u4E86\u5417\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u6211\u4EEC\u63A5\u7740\u8BA4\u3002"
      }
    ];
  }
});

// src/data/changzheng.ts
var CHANGZHENG_STUDENT_SLIDES;
var init_changzheng = __esm({
  "src/data/changzheng.ts"() {
    "use strict";
    CHANGZHENG_STUDENT_SLIDES = [
      {
        kind: "cover",
        title: "\u4E03\u5F8B\xB7\u957F\u5F81",
        line: "\u4E94\u5341\u516D\u4E2A\u5B57\uFF0C\u5199\u5F97\u5B8C\u4E24\u5E74\uFF1F",
        notes: "\u8FD9\u9996\u8BD7\u4E00\u5171\u4E94\u5341\u516D\u4E2A\u5B57\uFF0C\u5199\u7684\u662F\u6574\u6574\u4E24\u5E74\u3001\u4E8C\u4E07\u4E94\u5343\u91CC\u7684\u8DEF\u3002\u5B57\u8FD9\u4E48\u5C11\uFF0C\u8DEF\u8FD9\u4E48\u957F\uFF0C\u5B83\u51ED\u4EC0\u4E48\u88C5\u5F97\u4E0B\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u8BFB\u5B8C\u8FD9\u8282\u8BFE\uFF0C\u4F60\u4F1A\u6709\u81EA\u5DF1\u7684\u7B54\u6848\u3002"
      },
      {
        kind: "hook",
        title: "\u5148\u770B\u8FD9\u5F20\u56FE",
        line: "\u4E24\u4E07\u4E94\u5343\u91CC\uFF0C\u5230\u5E95\u591A\u8FDC\uFF1F",
        imageHint: "\u7EA2\u519B\u957F\u5F81\u8DEF\u7EBF\u56FE",
        notes: "\uFF08\u6295\u56FE\uFF09\u4ECE\u6C5F\u897F\u745E\u91D1\u51FA\u53D1\uFF0C\u8D70\u5230\u9655\u5317\u5434\u8D77\u9547\uFF0C\u8D70\u4E86\u4E24\u5E74\u3002\u64CD\u573A\u4E00\u5708\u56DB\u767E\u7C73\uFF0C\u8FD9\u6761\u8DEF\u7B49\u4E8E\u7ED5\u64CD\u573A\u8D70\u4E09\u4E07\u591A\u5708\u3002\u5982\u679C\u662F\u4F60\uFF0C\u8D70\u5F97\u4E0B\u6765\u5417\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u5148\u4E0D\u8BF4\uFF0C\u770B\u770B\u7EA2\u519B\u662F\u600E\u4E48\u8BF4\u7684\u3002"
      },
      {
        kind: "goals",
        title: "\u4ECA\u5929\u4E09\u4EF6\u4E8B",
        items: ["\u2460 \u8BFB\u51FA\u8282\u594F", "\u2461 \u60F3\u753B\u9762", "\u2462 \u8BFB\u61C2\u4E0D\u6015"],
        line: "\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F",
        notes: "\u4E09\u4EF6\u4E8B\u4E00\u4EF6\u4E00\u4EF6\u6765\u3002\u7B2C\u4E00\u4EF6\uFF0C\u4E03\u5F8B\u6BCF\u53E5\u4E03\u4E2A\u5B57\uFF0C\u4E8C\u4E8C\u4E09\u7684\u505C\u987F\uFF0C\u8033\u6735\u8981\u5148\u8DDF\u4E0A\uFF1B\u7B2C\u4E8C\u4EF6\uFF0C\u8BD7\u91CC\u85CF\u7740\u4E94\u5E45\u753B\u9762\uFF0C\u5C71\u3001\u5C71\u3001\u6C5F\u3001\u6865\u3001\u96EA\u5C71\uFF1B\u7B2C\u4E09\u4EF6\u6700\u96BE\u2014\u2014\u7EA2\u519B\u4E3A\u4EC0\u4E48\u4E0D\u6015\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09"
      },
      {
        kind: "words",
        title: "\u5B57\u8BCD\u5173",
        items: ["\u9036\u8FE4", "\u78C5\u7934", "\u6CE5\u4E38", "\u5CB7\u5C71"],
        line: "\u8C01\u80FD\u8BFB\u51C6\u5934\u4E24\u4E2A\uFF1F",
        notes: "\u8DDF\u6211\u8BFB\uFF1A\u9036\u8FE4\uFF0Cw\u0113i y\xED\uFF0C\u5C71\u8FDE\u7EF5\u4E0D\u65AD\u7684\u6837\u5B50\uFF1B\u78C5\u7934\uFF0Cp\xE1ng b\xF3\uFF0C\u6C14\u52BF\u53C8\u5927\u53C8\u731B\u3002\u78C5\u7934\u8FD9\u4E24\u4E2A\u5B57\uFF0C\u4E3A\u4EC0\u4E48\u8BFB\u8D77\u6765\u8981\u7528\u529B\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u6CE5\u4E38\u5C31\u662F\u6CE5\u505A\u7684\u5C0F\u4E38\u5B50\uFF0C\u5CB7\u5C71\u662F\u7EA2\u519B\u7FFB\u7684\u6700\u540E\u4E00\u5EA7\u96EA\u5C71\u3002\u524D\u4E24\u4E2A\u8BCD\u6700\u62D7\u53E3\uFF0C\u8BFB\u4E09\u904D\u3002"
      },
      {
        kind: "close-read",
        title: "\u5C71\u4E3A\u4EC0\u4E48\u53D8\u5C0F",
        line: "\u201C\u4E94\u5CAD\u9036\u8FE4\u817E\u7EC6\u6D6A\uFF0C\u4E4C\u8499\u78C5\u7934\u8D70\u6CE5\u4E38\u3002\u201D",
        items: ["\u5927\u5C71\u600E\u4E48\u6210\u4E86\u7EC6\u6D6A\uFF1F"],
        notes: "\u63D0\u793A\uFF1A\u4E0D\u662F\u5C71\u53D8\u5C0F\u4E86\uFF0C\u662F\u8D70\u8DEF\u7684\u4EBA\u7AD9\u5F97\u9AD8\u3001\u770B\u5F97\u8F7B\u3002\u8BF7\u4E24\u4E2A\u5B66\u751F\u8BFB\uFF0C\u4E00\u4E2A\u628A\u9036\u8FE4\u3001\u78C5\u7934\u8BFB\u91CD\uFF0C\u4E00\u4E2A\u628A\u7EC6\u6D6A\u3001\u6CE5\u4E38\u8BFB\u8F7B\uFF0C\u5168\u73ED\u6BD4\u8F83\uFF1A\u54EA\u4E00\u79CD\u8BFB\u6CD5\u66F4\u50CF\u7EA2\u519B\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09"
      },
      {
        kind: "compare",
        title: "\u4E00\u6696\u4E00\u5BD2",
        items: ["\u91D1\u6C99\u6C34\u62CD\u4E91\u5D16\u6696", "\u5927\u6E21\u6865\u6A2A\u94C1\u7D22\u5BD2"],
        compareDiff: ["\u6696\u5728\u5FC3\u4E0A\uFF0C\u5BD2\u5728\u94C1\u7D22"],
        line: "\u6696\u7684\u548C\u5BD2\u7684\uFF0C\u5DEE\u5728\u54EA\uFF1F",
        notes: "\u4E24\u573A\u4ED7\uFF1A\u5DE7\u6E21\u91D1\u6C99\u6C5F\uFF0C\u654C\u4EBA\u6251\u4E86\u4E2A\u7A7A\uFF0C\u5FC3\u91CC\u662F\u6696\u7684\uFF1B\u98DE\u593A\u6CF8\u5B9A\u6865\uFF0C\u811A\u4E0B\u662F\u60AC\u7A7A\u7684\u94C1\u7D22\uFF0C\u624B\u4E0A\u662F\u51C9\u7684\u3002\u4E00\u4E2A\u6696\u5B57\u4E00\u4E2A\u5BD2\u5B57\uFF0C\u54EA\u4E2A\u5148\u8BA9\u4F60\u5FC3\u91CC\u4E00\u6C89\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u5199\u7684\u4E0D\u662F\u5929\u6C14\uFF0C\u662F\u5FC3\u60C5\uFF0C\u662F\u751F\u6B7B\u3002"
      },
      {
        kind: "board",
        title: "\u770B\u8FD9\u513F",
        items: ["\u8FDC\u5F81\u96BE \u2192 \u53EA\u7B49\u95F2 \u2192 \u5C3D\u5F00\u989C", "\u96BE \xB7 \u4E0D\u6015 \xB7 \u7B11"],
        line: "\u54EA\u4E00\u6B65\u6700\u6C89\uFF1F",
        notes: "\u8FD9\u6761\u7EBF\u5C31\u662F\u5168\u8BD7\u7684\u60C5\u7EEA\uFF1A\u4ECE\u96BE\u51FA\u53D1\uFF0C\u628A\u4E07\u6C34\u5343\u5C71\u770B\u6210\u53EA\u7B49\u95F2\uFF0C\u6700\u540E\u6536\u5728\u7B11\u4E0A\u3002\u8BB2\u5230\u8FD9\u91CC\u8865\u4E00\u4E2A\u6570\u5B57\uFF1A\u51FA\u53D1\u516B\u4E07\u516D\u5343\u4EBA\uFF0C\u5230\u9655\u5317\u4E0D\u8DB3\u4E00\u4E07\u3002\u4EBA\u5C11\u4E86\uFF0C\u7B11\u8FD8\u5728\u2014\u2014\u8FD9\u4E2A\u7B11\u6709\u591A\u91CD\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u4E0D\u7528\u7B54\uFF0C\u81EA\u5DF1\u5FC3\u91CC\u6382\u91CF\u3002"
      },
      {
        kind: "drill",
        title: "\u4E94\u5CAD\u4E4C\u8499\u5404\u586B\u4E00\u4E2A\u8BCD",
        line: "\u4E24\u4E2A\u7A7A\uFF0C\u586B\u54EA\u4E24\u4E2A\u8BCD\uFF1F",
        items: ["\u4E94\u5CAD\uFF08\u3000\uFF09\u817E\u7EC6\u6D6A", "\u4E4C\u8499\uFF08\u3000\uFF09\u8D70\u6CE5\u4E38"],
        notes: "\u7B54\u6848\uFF1A\u9036\u8FE4\u3001\u78C5\u7934\u3002\u586B\u5B8C\u9F50\u8BFB\u8FD9\u4E24\u53E5\u3002\u518D\u8FFD\u95EE\uFF1A\u4E3A\u4EC0\u4E48\u5927\u8BCD\u653E\u5728\u5C71\u8EAB\u4E0A\uFF0C\u5C0F\u8BCD\u653E\u5728\u6D6A\u82B1\u6CE5\u4E38\u4E0A\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u5927\u7684\u662F\u666F\uFF0C\u5C0F\u7684\u662F\u5FC3\uFF0C\u5FC3\u6BD4\u666F\u8FD8\u5927\uFF0C\u8FD9\u5C31\u662F\u7EA2\u519B\u7684\u53E3\u6C14\u3002"
      },
      {
        kind: "homework",
        title: "\u8BFE\u540E\u4E24\u4EF6\u4E8B",
        items: ["\u5FC5\u505A\uFF1A\u80CC\u9ED8\u5168\u8BD7\u516B\u53E5", "\u9009\u505A\uFF1A\u5730\u56FE\u4E0A\u6807\u4E94\u4E2A\u5730\u65B9"],
        line: "\u54EA\u4EF6\u4F60\u5148\u505A\uFF1F",
        notes: "\u5FC5\u505A\u516B\u53E5\uFF0C\u4E24\u5206\u949F\u80FD\u8FC7\u4E00\u904D\uFF0C\u97F5\u811A\u662F\u96BE\u3001\u95F2\u3001\u4E38\u3001\u5BD2\u3001\u989C\uFF0C\u80CC\u4E0D\u51FA\u5C31\u987A\u7740\u8FD9\u4E94\u4E2A\u5B57\u627E\u3002\u9009\u505A\u5728\u5730\u56FE\u4E0A\u627E\u51FA\u745E\u91D1\u3001\u4E94\u5CAD\u3001\u4E4C\u8499\u3001\u91D1\u6C99\u6C5F\u3001\u5927\u6E21\u6CB3\u3001\u5CB7\u5C71\u3001\u5434\u8D77\u9547\u3002\u8FD9\u4E03\u4E2A\u5730\u65B9\uFF0C\u4F60\u90FD\u80FD\u5708\u51FA\u6765\u5417\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u753B\u5B8C\u770B\u770B\u90A3\u6761\u7EBF\u6709\u591A\u957F\u3002"
      },
      {
        kind: "end",
        title: "\u8BB0\u4F4F\u8FD9\u53E5\u8BDD",
        line: "\u4F60\u7684\u201C\u53EA\u7B49\u95F2\u201D\u662F\u4EC0\u4E48\uFF1F",
        notes: "\u8D70\u4E86\u4E24\u5E74\uFF0C\u7FFB\u8FC7\u6700\u540E\u4E00\u5EA7\u96EA\u5C71\uFF0C\u6240\u6709\u4EBA\u90FD\u7B11\u4E86\u3002\u8BA9\u6211\u4EEC\u8BB0\u4F4F\u8FD9\u4E09\u4E2A\u5B57\uFF1A\u53EA\u7B49\u95F2\u3002\u4E0D\u662F\u4E0D\u82E6\uFF0C\u662F\u82E6\u503C\u5F97\u3002\u4F60\u4EEC\u4EE5\u540E\u4E5F\u4F1A\u9047\u4E0A\u81EA\u5DF1\u7684\u96EA\u5C71\u3002\u7FFB\u8FC7\u53BB\u90A3\u4E00\u523B\uFF0C\u4F60\u6700\u60F3\u8BF4\u7684\u90A3\u53E5\u8BDD\u662F\u4EC0\u4E48\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u613F\u4F60\u60F3\u8D77\u6765\u7684\u65F6\u5019\uFF0C\u4E5F\u80FD\u8BF4\u4E00\u53E5\u53EA\u7B49\u95F2\u3002"
      }
    ];
  }
});

// src/data/hetang.ts
var HETANG_STUDENT_SLIDES;
var init_hetang = __esm({
  "src/data/hetang.ts"() {
    "use strict";
    HETANG_STUDENT_SLIDES = [
      {
        kind: "cover",
        title: "\u8377\u5858\u6708\u8272",
        line: "\u4E00\u4E2A\u4EBA\uFF0C\u4E3A\u4EC0\u4E48\u591C\u91CC\u51FA\u95E8\uFF1F",
        notes: "\u4ECA\u5929\u8BFB\u300A\u8377\u5858\u6708\u8272\u300B\u3002\u5148\u4E0D\u6025\u7740\u770B\u666F\uFF0C\u5148\u770B\u7B2C\u4E00\u53E5\uFF1A\u8FD9\u51E0\u5929\u5FC3\u91CC\u9887\u4E0D\u5B81\u9759\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u4E00\u4E2A\u4EBA\u5FC3\u91CC\u4E0D\u9759\u7684\u65F6\u5019\uFF0C\u4F1A\u505A\u4EC0\u4E48\uFF1F\u4ED6\u9009\u4E86\u51FA\u95E8\u3002"
      },
      {
        kind: "hook",
        title: "\u591C\u91CC\u51FA\u95E8",
        line: "\u4F60\u6709\u8FC7\u8FD9\u6837\u7684\u591C\u665A\u5417\uFF1F",
        imageHint: "\u591C\u665A \u5C0F\u8DEF \u6708\u5149 \u7A7A\u955C",
        notes: "\uFF08\u6295\u51FA\u8FD9\u5F20\u56FE\uFF09\u6709\u6CA1\u6709\u8FC7\u8FD9\u79CD\u65F6\u5019\uFF1A\u5F88\u665A\u4E86\uFF0C\u8EBA\u4E0D\u4F4F\uFF0C\u60F3\u51FA\u53BB\u8D70\u4E00\u8D70\uFF1F\u6709\u4EBA\u53BB\u697C\u4E0B\uFF0C\u6709\u4EBA\u53BB\u6CB3\u8FB9\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u8BB0\u4F4F\u4F60\u90A3\u4E2A\u5730\u65B9\uFF0C\u4E00\u4F1A\u513F\u62FF\u6765\u548C\u8FD9\u7247\u8377\u5858\u6BD4\u4E00\u6BD4\u3002"
      },
      {
        kind: "goals",
        title: "\u4ECA\u5929\u4E09\u4EF6\u4E8B",
        items: ["\u2460 \u8D70\u6E05\u8FD9\u4E00\u5708\u8DEF\u7EBF", "\u2461 \u8BFB\u51FA\u53F6\u4E0E\u82B1\u7684\u8F7B", "\u2462 \u8BF4\u6E05\u4ED6\u4E3A\u4EC0\u4E48\u8981\u53BB"],
        line: "\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F",
        notes: "\u4E09\u4EF6\u4E8B\u4E00\u4EF6\u4E00\u4EF6\u6765\u3002\u7B2C\u4E00\u4EF6\u628A\u5730\u70B9\u7406\u6E05\uFF0C\u7B2C\u4E8C\u4EF6\u76EF\u4F4F\u7B2C\u56DB\u6BB5\uFF0C\u7B2C\u4E09\u4EF6\u6700\u96BE\u2014\u2014\u4ED6\u5230\u5E95\u4E3A\u4EC0\u4E48\u7ED5\u8FD9\u4E00\u5708\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09"
      },
      {
        kind: "words",
        title: "\u5B57\u8BCD\u5173",
        items: ["\u84CA\u84CA\u90C1\u90C1", "\u8E31", "\u5029\u5F71", "\u5A9B\u5973"],
        line: "\u8C01\u80FD\u628A\u8FD9\u56DB\u4E2A\u8BFB\u51C6\uFF1F",
        notes: "\u8DDF\u6211\u8BFB\u4E00\u904D\uFF1A\u84CA\u84CA\u90C1\u90C1\uFF0C\u8349\u6728\u8302\u76DB\u7684\u6837\u5B50\uFF1B\u8E31\uFF0C\u6162\u6162\u5730\u8D70\uFF0C\u6CE8\u610F\u662F\u8D70\u4E0D\u662F\u8DD1\uFF1B\u5029\u5F71\uFF0C\u7F8E\u597D\u7684\u5F71\u5B50\uFF1B\u5A9B\u5973\uFF0C\u91C7\u83B2\u7684\u5973\u5B50\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u8FD9\u56DB\u4E2A\u8BCD\uFF0C\u54EA\u4E00\u4E2A\u6700\u50CF\u8FD9\u4E00\u591C\uFF1F"
      },
      {
        kind: "close-read",
        title: "\u5148\u770B\u53F6",
        line: "\u201C\u50CF\u4EAD\u4EAD\u7684\u821E\u5973\u7684\u88D9\u3002\u201D",
        items: ["\u4E3A\u4EC0\u4E48\u662F\u88D9\uFF0C\u4E0D\u662F\u4F1E\uFF1F"],
        notes: "\u88D9\u662F\u5F20\u5F00\u7684\u3001\u8F7B\u7684\u3001\u4F1A\u52A8\u7684\uFF1B\u4F1E\u662F\u6491\u7740\u7684\u3001\u786C\u7684\u3002\u4F5C\u8005\u8981\u7684\u662F\u90A3\u4E2A\u8F7B\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u8C01\u6765\u628A\u8FD9\u53E5\u8BFB\u51FA\u8F7B\u6765\uFF1F\u8BFB\u7684\u65F6\u5019\u6C14\u522B\u65AD\u3002"
      },
      {
        kind: "close-read",
        title: "\u518D\u770B\u82B1\u4E0E\u6708",
        items: ["\u660E\u73E0", "\u661F\u661F", "\u521A\u51FA\u6D74\u7684\u7F8E\u4EBA"],
        line: "\u540C\u4E00\u6735\u82B1\uFF0C\u4E3A\u4EC0\u4E48\u4E09\u4E2A\u6BD4\u55BB\uFF1F",
        notes: "\u56E0\u4E3A\u5149\u5728\u53D8\u3001\u89D2\u5EA6\u5728\u53D8\u3002\u8FDC\u770B\u662F\u660E\u73E0\uFF0C\u62AC\u5934\u50CF\u661F\u661F\uFF0C\u8FD1\u4E86\u50CF\u521A\u51FA\u6D74\u7684\u4EBA\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u6708\u8272\u90A3\u4E00\u53E5\u53EA\u5199\u4E86\u4E00\u4E2A\u8BCD\uFF1A\u6DE1\u6DE1\u7684\u3002\u4E3A\u4EC0\u4E48\u4E0D\u591A\u5199\uFF1F"
      },
      {
        kind: "compare",
        title: "\u6BD4\u4E00\u6BD4",
        items: ["\u5F00\u5934\uFF1A\u9887\u4E0D\u5B81\u9759", "\u7ED3\u5C3E\uFF1A\u72EC\u5904\u7684\u5999\u5904"],
        compareDiff: ["\u4E2D\u95F4\u9694\u7740\u4E00\u6574\u7247\u8377\u5858"],
        line: "\u8377\u5858\u6CBB\u597D\u4E86\u4ED6\u5417\uFF1F",
        notes: "\u5DE6\u8FB9\u662F\u70E6\uFF0C\u53F3\u8FB9\u662F\u9759\uFF0C\u4E2D\u95F4\u662F\u4E00\u7247\u8377\u5858\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u4ED6\u6CA1\u6709\u53D8\u597D\uFF0C\u53EA\u662F\u627E\u5230\u4E86\u4E00\u4E2A\u53EF\u4EE5\u6682\u65F6\u4E0D\u8BF4\u8BDD\u7684\u5730\u65B9\u3002\u666F\u6CA1\u89E3\u51B3\u95EE\u9898\uFF0C\u666F\u7ED9\u4E86\u4ED6\u4E00\u70B9\u7A7A\u3002"
      },
      {
        kind: "board",
        title: "\u770B\u8FD9\u513F",
        items: ["\u51FA\u95E8 \u2192 \u5C0F\u8DEF \u2192 \u8377\u5858 \u2192 \u56DE\u5BB6", "\u53F6 \xB7 \u82B1 \xB7 \u6708"],
        line: "\u4ED6\u4E3A\u4EC0\u4E48\u7ED5\u8FD9\u4E00\u5708\uFF1F",
        notes: "\u4E0A\u9762\u4E00\u6761\u8DEF\u7EBF\uFF0C\u4E0B\u9762\u4E09\u7EC4\u6BD4\u55BB\u3002\u8DEF\u7EBF\u662F\u8D70\u7ED9\u4EBA\u770B\u7684\uFF0C\u6BD4\u55BB\u662F\u5199\u7ED9\u81EA\u5DF1\u770B\u7684\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u7ED5\u8FD9\u4E00\u5708\uFF0C\u5176\u5B9E\u662F\u5728\u7ED9\u81EA\u5DF1\u627E\u4E00\u4E2A\u5F85\u7684\u5730\u65B9\u3002"
      },
      {
        kind: "drill",
        title: "\u4E09\u4E2A\u6BD4\u55BB\u586B\u56DE\u53BB",
        line: "\u628A\u4E09\u4E2A\u6BD4\u55BB\u586B\u56DE\u53BB",
        items: ["\u53F6\uFF1A\u821E\u5973\u7684\uFF08\u3000\uFF09", "\u82B1\uFF1A\u660E\u73E0 \xB7 \u661F\u661F \xB7 \u521A\u51FA\u6D74\u7684\uFF08\u3000\uFF09"],
        notes: "\u7B54\u6848\uFF1A\u88D9\u3001\u7F8E\u4EBA\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u586B\u5B8C\u518D\u95EE\u4E00\u53E5\uFF1A\u5982\u679C\u53EA\u7559\u4E00\u4E2A\u6BD4\u55BB\uFF0C\u4F60\u7559\u54EA\u4E2A\uFF1F\u8BF4\u6E05\u7406\u7531\u3002"
      },
      {
        kind: "end",
        title: "\u8BB0\u4F4F\u8FD9\u53E5\u8BDD",
        line: "\u5199\u666F\uFF0C\u662F\u4E3A\u4E86\u5B89\u653E\u81EA\u5DF1\u3002",
        notes: "\u8FD9\u4E00\u591C\u4ED6\u7ED5\u4E86\u4E00\u5708\uFF0C\u53C8\u539F\u8DEF\u56DE\u6765\uFF0C\u4EC0\u4E48\u90FD\u6CA1\u6539\u53D8\u3002\u4F46\u4ED6\u5199\u4E0B\u8FD9\u4E00\u7BC7\uFF0C\u5C31\u591A\u4E86\u4E00\u4E2A\u80FD\u5F85\u7684\u5730\u65B9\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u4F60\u5FC3\u91CC\u90A3\u5904\u5730\u65B9\uFF0C\u662F\u54EA\u513F\uFF1F\u4E0B\u8BFE\u4E4B\u524D\u60F3\u4E00\u60F3\u3002"
      }
    ];
  }
});

// src/data/chun.ts
var CHUN_STUDENT_SLIDES;
var init_chun = __esm({
  "src/data/chun.ts"() {
    "use strict";
    CHUN_STUDENT_SLIDES = [
      {
        kind: "cover",
        title: "\u6625",
        line: "\u6625\u5929\uFF0C\u662F\u6709\u58F0\u97F3\u7684\u3002",
        notes: "\u4ECA\u5929\u8BFB\u6731\u81EA\u6E05\u7684\u300A\u6625\u300B\u3002\u5148\u4E0D\u542C\u6211\u8BB2\uFF0C\u5148\u542C\u4E8C\u5341\u79D2\u58F0\u97F3\u3002\uFF08\u653E\u73AF\u5883\u97F3\uFF09\u542C\u89C1\u4EC0\u4E48\u4E86\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u6625\u5929\u662F\u6709\u58F0\u97F3\u7684\u3002"
      },
      {
        kind: "hook",
        title: "\u5148\u95ED\u4E0A\u773C",
        line: "\u4F60\u542C\u89C1\u7684\u6625\u5929\u662F\u4EC0\u4E48\u6837\uFF1F",
        imageHint: "\u6625\u5929 \u8349\u5730 \u91CE\u82B1 \u8FDC\u666F",
        notes: "\uFF08\u6295\u51FA\u8FD9\u5F20\u56FE\uFF09\u521A\u624D\u542C\u89C1\u7684\uFF0C\u548C\u8FD9\u5F20\u56FE\u5BF9\u5F97\u4E0A\u5417\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u6709\u4EBA\u8BF4\u9E1F\u53EB\uFF0C\u6709\u4EBA\u8BF4\u98CE\u3002\u6731\u81EA\u6E05\u5199\u6625\u5929\uFF0C\u4E5F\u662F\u4ECE\u58F0\u97F3\u5F00\u59CB\u7684\u3002"
      },
      {
        kind: "goals",
        title: "\u4ECA\u5929\u4E09\u4EF6\u4E8B",
        items: ["\u2460 \u6570\u6E05\u4E94\u5E45\u753B", "\u2461 \u8BFB\u61C2\u4E00\u4E2A\u52A8\u8BCD", "\u2462 \u81EA\u5DF1\u5199\u4E00\u53E5"],
        line: "\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F",
        notes: "\u4E09\u4EF6\u4E8B\uFF1A\u5148\u628A\u6574\u7BC7\u6570\u6210\u4E94\u5E45\u753B\uFF0C\u518D\u76EF\u4F4F\u4E00\u4E2A\u52A8\u8BCD\uFF0C\u6700\u540E\u81EA\u5DF1\u5199\u4E00\u53E5\u3002\u7B2C\u4E09\u4EF6\u8981\u4EA4\uFF0C\u5199\u5B8C\u540C\u684C\u731C\u3002\uFF08\u505C\u4E09\u79D2\uFF09"
      },
      {
        kind: "words",
        title: "\u5B57\u8BCD\u5173",
        items: ["\u915D\u917F", "\u5356\u5F04", "\u5B9B\u8F6C", "\u70D8\u6258"],
        line: "\u8FD9\u56DB\u4E2A\uFF0C\u8C01\u80FD\u8BFB\u51C6\uFF1F",
        notes: "\u915D\u917F\uFF0C\u8BFB y\xF9n ni\xE0ng\uFF0C\u50CF\u9152\u6162\u6162\u53D1\u51FA\u6765\uFF1B\u5356\u5F04\uFF0C\u8FD9\u91CC\u4E0D\u662F\u574F\u8BCD\uFF0C\u662F\u9E1F\u513F\u663E\u672C\u4E8B\uFF1B\u5B9B\u8F6C\uFF0C\u58F0\u97F3\u62D0\u7740\u5F2F\uFF1B\u70D8\u6258\uFF0C\u7528\u522B\u7684\u4E1C\u897F\u886C\u51FA\u6765\u3002\uFF08\u505C\u4E09\u79D2\uFF09"
      },
      {
        kind: "close-read",
        title: "\u770B\u8349",
        line: "\u201C\u5077\u5077\u5730\u4ECE\u571F\u91CC\u94BB\u51FA\u6765\u3002\u201D",
        items: ["\u4E3A\u4EC0\u4E48\u662F\u201C\u94BB\u201D\uFF0C\u4E0D\u662F\u201C\u957F\u201D\uFF1F"],
        notes: "\u628A\u201C\u94BB\u201D\u6362\u6210\u201C\u957F\u201D\uFF0C\u8BFB\u4E00\u904D\u3002\u6709\u5DEE\u522B\u5417\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u94BB\u662F\u4F7F\u52B2\u7684\u3001\u6084\u6084\u7684\u3001\u8981\u9876\u5F00\u571F\u7684\u3002\u4E00\u4E2A\u52A8\u8BCD\uFF0C\u8349\u5C31\u6709\u4E86\u52B2\u3002"
      },
      {
        kind: "close-read",
        title: "\u770B\u82B1",
        items: ["\u4F60\u4E0D\u8BA9\u6211\uFF0C\u6211\u4E0D\u8BA9\u4F60", "\u90FD\u5F00\u6EE1\u4E86\u82B1\u8D76\u8D9F\u513F"],
        line: "\u82B1\uFF0C\u4F1A\u4E89\u5417\uFF1F",
        notes: "\u82B1\u5F53\u7136\u4E0D\u4F1A\u4E89\u3002\u662F\u4EBA\u770B\u7740\u89C9\u5F97\u5B83\u4EEC\u5728\u4E89\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u8FD9\u4E00\u53E5\u597D\u5728\u54EA\uFF1F\u597D\u5728\u628A\u770B\u82B1\u7684\u4EBA\u5199\u8FDB\u53BB\u4E86\u3002"
      },
      {
        kind: "compare",
        title: "\u98CE\u4E0E\u96E8",
        items: ["\u98CE\uFF1A\u5356\u5F04 \xB7 \u5B9B\u8F6C", "\u96E8\uFF1A\u725B\u6BDB \xB7 \u82B1\u9488 \xB7 \u7EC6\u4E1D"],
        compareDiff: ["\u4E00\u4E2A\u7528\u8033\u6735\uFF0C\u4E00\u4E2A\u7528\u773C\u775B"],
        line: "\u4E3A\u4EC0\u4E48\u96E8\u8981\u4E09\u4E2A\u6BD4\u55BB\uFF1F",
        notes: "\u98CE\u53EA\u80FD\u7528\u8033\u6735\u542C\uFF0C\u96E8\u53EF\u4EE5\u7528\u773C\u775B\u770B\uFF1A\u50CF\u725B\u6BDB\u662F\u5BC6\uFF0C\u50CF\u82B1\u9488\u662F\u4EAE\uFF0C\u50CF\u7EC6\u4E1D\u662F\u957F\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u4E09\u4E2A\u6BD4\u55BB\uFF0C\u4E09\u79CD\u770B\u7684\u89D2\u5EA6\u3002"
      },
      {
        kind: "board",
        title: "\u770B\u8FD9\u513F",
        items: ["\u76FC\u6625 \u2192 \u7ED8\u6625 \u2192 \u8D5E\u6625", "\u8349 \xB7 \u82B1 \xB7 \u98CE \xB7 \u96E8 \xB7 \u4EBA"],
        line: "\u4E94\u5E45\u753B\uFF0C\u54EA\u5E45\u6700\u8F7B\uFF1F",
        notes: "\u4E0A\u9762\u4E09\u6BB5\uFF0C\u4E0B\u9762\u4E94\u5E45\u3002\u8F7B\u7684\u662F\u8349\uFF0C\u95F9\u7684\u662F\u82B1\uFF0C\u8F6F\u7684\u662F\u98CE\uFF0C\u5BC6\u7684\u662F\u96E8\uFF0C\u6700\u540E\u624D\u662F\u4EBA\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u4E3A\u4EC0\u4E48\u628A\u4EBA\u653E\u6700\u540E\uFF1F"
      },
      {
        kind: "drill",
        title: "\u5C0F\u8349\u548C\u871C\u8702\u586B\u52A8\u8BCD",
        line: "\u628A\u52A8\u8BCD\u586B\u56DE\u53BB",
        items: ["\u5C0F\u8349\uFF08\u3000\uFF09\u51FA\u6765", "\u82B1\u4E0B\u6210\u5343\u6210\u767E\u7684\u871C\u8702\u55E1\u55E1\u5730\uFF08\u3000\uFF09"],
        notes: "\u7B54\u6848\uFF1A\u94BB\u3001\u95F9\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u7B2C\u4E8C\u4E2A\u4E3A\u4EC0\u4E48\u662F\u201C\u95F9\u201D\u4E0D\u662F\u201C\u98DE\u201D\uFF1F\u56E0\u4E3A\u58F0\u97F3\uFF0C\u4E5F\u56E0\u4E3A\u90A3\u80A1\u70ED\u95F9\u52B2\u513F\u3002"
      },
      {
        kind: "end",
        title: "\u8BB0\u4F4F\u8FD9\u53E5\u8BDD",
        line: "\u65B0 \xB7 \u7F8E \xB7 \u6709\u52B2\u3002",
        notes: "\u5A03\u5A03\u662F\u65B0\u7684\uFF0C\u5C0F\u59D1\u5A18\u662F\u7F8E\u7684\uFF0C\u9752\u5E74\u662F\u6709\u52B2\u7684\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u8FD9\u662F\u4E00\u5929\u7684\u65E9\uFF0C\u662F\u4E00\u5E74\u7684\u6625\uFF0C\u4E5F\u662F\u4E00\u4E2A\u4EBA\u7684\u4E00\u751F\u3002\u4F5C\u4E1A\uFF1A\u5199\u4E09\u53E5\u7A97\u5916\u7684\u6625\u5929\uFF0C\u6BCF\u53E5\u4E00\u4E2A\u52A8\u8BCD\u3002"
      }
    ];
  }
});

// src/data/beiying.ts
var BEIYING_STUDENT_SLIDES;
var init_beiying = __esm({
  "src/data/beiying.ts"() {
    "use strict";
    BEIYING_STUDENT_SLIDES = [
      {
        kind: "cover",
        title: "\u80CC\u5F71",
        line: "\u5199\u7236\u4EB2\uFF0C\u4E3A\u4EC0\u4E48\u53EA\u5199\u80CC\uFF1F",
        notes: "\u4ECA\u5929\u8BFB\u300A\u80CC\u5F71\u300B\u3002\u5148\u95EE\u4E00\u53E5\uFF1A\u5982\u679C\u8981\u5199\u4F60\u7238\u7238\uFF0C\u4F60\u4F1A\u5199\u4ED6\u7684\u8138\uFF0C\u8FD8\u662F\u4ED6\u7684\u80CC\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u6731\u81EA\u6E05\u9009\u4E86\u80CC\u3002"
      },
      {
        kind: "hook",
        title: "\u4E00\u4E2A\u80CC\u5F71",
        line: "\u4F60\u8BB0\u5F97\u8C01\u7684\u80CC\u5F71\uFF1F",
        imageHint: "\u8001\u5F0F \u706B\u8F66\u7AD9 \u6708\u53F0 \u8001\u7167\u7247",
        notes: "\uFF08\u6295\u51FA\u8FD9\u5F20\u56FE\uFF09\u8FD9\u6837\u7684\u6708\u53F0\uFF0C\u73B0\u5728\u5C11\u89C1\u4E86\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u4F60\u6709\u6CA1\u6709\u8BB0\u5F97\u8C01\u7684\u80CC\u5F71\uFF1F\u7237\u7237\u7684\u3001\u5988\u5988\u7684\u3001\u8001\u5E08\u7684\u3002\u8BB0\u4F4F\u90A3\u4E2A\u80CC\u5F71\uFF0C\u4E00\u4F1A\u513F\u62FF\u6765\u6BD4\u3002"
      },
      {
        kind: "goals",
        title: "\u4ECA\u5929\u4E09\u4EF6\u4E8B",
        items: ["\u2460 \u6570\u6E05\u56DB\u6B21\u80CC\u5F71", "\u2461 \u6392\u597D\u4E03\u4E2A\u52A8\u8BCD", "\u2462 \u8BFB\u61C2\u90A3\u53E5\u81EA\u5632"],
        line: "\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F",
        notes: "\u4E09\u4EF6\u4E8B\uFF1A\u5148\u6570\uFF0C\u518D\u628A\u52A8\u4F5C\u6392\u597D\uFF0C\u6700\u540E\u8BFB\u90A3\u53E5\u201C\u806A\u660E\u8FC7\u5206\u201D\u3002\u7B2C\u4E09\u4EF6\u6700\u96BE\uFF0C\u4E5F\u6700\u8981\u7D27\u3002\uFF08\u505C\u4E09\u79D2\uFF09"
      },
      {
        kind: "words",
        title: "\u5B57\u8BCD\u5173",
        items: ["\u4EA4\u5378", "\u72FC\u85C9", "\u7C0C\u7C0C", "\u8E52\u8DDA"],
        line: "\u8FD9\u56DB\u4E2A\uFF0C\u8C01\u80FD\u8BFB\u51C6\uFF1F",
        notes: "\u4EA4\u5378\uFF0C\u5378\u4E0B\u804C\u52A1\uFF1B\u72FC\u85C9\uFF0C\u4E71\u4E03\u516B\u7CDF\uFF1B\u7C0C\u7C0C\uFF0C\u773C\u6CEA\u6389\u4E0B\u6765\u7684\u58F0\u97F3\uFF1B\u8E52\u8DDA\uFF0C\u817F\u811A\u4E0D\u7075\u4FBF\uFF0C\u8D70\u8DEF\u4E00\u6447\u4E00\u6446\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u54EA\u4E2A\u8BCD\u6700\u50CF\u90A3\u5929\u7684\u7236\u4EB2\uFF1F"
      },
      {
        kind: "close-read",
        title: "\u722C\u6708\u53F0",
        line: "\u201C\u6500\u7740\u4E0A\u9762\uFF0C\u4E24\u811A\u518D\u5411\u4E0A\u7F29\u3002\u201D",
        items: ["\u6500 \xB7 \u7F29 \xB7 \u503E"],
        notes: "\u8BF7\u4E00\u4F4D\u540C\u5B66\u4E0A\u6765\u505A\u201C\u6500\u201D\u548C\u201C\u7F29\u201D\u3002\uFF08\u5B66\u751F\u505A\uFF09\u96BE\u4E0D\u96BE\uFF1F\u4ED6\u7236\u4EB2\u662F\u4E2A\u80D6\u5B50\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u8FD9\u4E9B\u52A8\u8BCD\u4E0D\u662F\u4FEE\u8F9E\uFF0C\u662F\u5B9E\u51B5\u3002"
      },
      {
        kind: "close-read",
        title: "\u5148\u62CD\u571F",
        items: ["\u4E8E\u662F\u6251\u6251\u8863\u4E0A\u7684\u6CE5\u571F", "\u5FC3\u91CC\u5F88\u8F7B\u677E\u4F3C\u7684"],
        line: "\u4E3A\u4EC0\u4E48\u5148\u62CD\u571F\uFF0C\u518D\u56DE\u6765\uFF1F",
        notes: "\u4ED6\u4E0D\u60F3\u8BA9\u513F\u5B50\u770B\u51FA\u81EA\u5DF1\u8D39\u529B\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u201C\u5FC3\u91CC\u5F88\u8F7B\u677E\u4F3C\u7684\u201D\u2014\u2014\u6CE8\u610F\u201C\u4F3C\u7684\u201D\u4E24\u4E2A\u5B57\uFF0C\u4ED6\u5176\u5B9E\u4E0D\u8F7B\u677E\u3002"
      },
      {
        kind: "compare",
        title: "\u6BD4\u4E00\u6BD4",
        items: ["\u90A3\u5E74\uFF1A\u6211\u5ACC\u4ED6\u5570\u55E6", "\u73B0\u5728\uFF1A\u6211\u90A3\u65F6\u806A\u660E\u8FC7\u5206"],
        compareDiff: ["\u540C\u4E00\u4EF6\u4E8B\uFF0C\u4E24\u79CD\u773C\u5149"],
        line: "\u8FD9\u662F\u5938\u81EA\u5DF1\uFF0C\u8FD8\u662F\u9A82\u81EA\u5DF1\uFF1F",
        notes: "\u5F53\u7136\u662F\u9A82\u81EA\u5DF1\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u5F53\u5E74\u5ACC\u7236\u4EB2\u571F\u3001\u5ACC\u4ED6\u5570\u55E6\uFF0C\u73B0\u5728\u77E5\u9053\u4E86\uFF1A\u90A3\u65F6\u5019\u7684\u81EA\u5DF1\uFF0C\u624D\u662F\u771F\u7684\u4E0D\u61C2\u4E8B\u3002"
      },
      {
        kind: "board",
        title: "\u770B\u8FD9\u513F",
        items: ["\u56DB\u6B21\u80CC\u5F71 \xB7 \u56DB\u6B21\u6CEA", "\u8D70 \xB7 \u63A2 \xB7 \u7A7F \xB7 \u722C \xB7 \u6500 \xB7 \u7F29 \xB7 \u503E"],
        line: "\u54EA\u4E2A\u52A8\u4F5C\u6700\u96BE\uFF1F",
        notes: "\u4E03\u4E2A\u52A8\u8BCD\u6392\u6210\u4E00\u6761\uFF0C\u4E0B\u9762\u4E09\u4E2A\u5B57\uFF1A\u80D6\u3001\u6162\u3001\u96BE\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u6700\u96BE\u7684\u662F\u201C\u6500\u201D\uFF0C\u56E0\u4E3A\u6574\u4E2A\u4EBA\u7684\u91CD\u91CF\u90FD\u6302\u5728\u90A3\u4E00\u53EA\u624B\u4E0A\u3002"
      },
      {
        kind: "drill",
        title: "\u4E09\u4E2A\u52A8\u8BCD\u586B\u56DE\u53BB",
        line: "\u628A\u52A8\u8BCD\u586B\u56DE\u53BB",
        items: ["\uFF08\u3000\uFF09\u7740\u4E0A\u9762", "\u4E24\u811A\u518D\u5411\u4E0A\uFF08\u3000\uFF09", "\u663E\u51FA\u52AA\u529B\u7684\u6837\u5B50"],
        notes: "\u7B54\u6848\uFF1A\u6500\u3001\u7F29\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u586B\u5B8C\u518D\u95EE\uFF1A\u5982\u679C\u6362\u6389\u201C\u6500\u201D\uFF0C\u6362\u6210\u201C\u6293\u201D\uFF0C\u5DEE\u5728\u54EA\uFF1F"
      },
      {
        kind: "end",
        title: "\u8BB0\u4F4F\u8FD9\u53E5\u8BDD",
        line: "\u5199\u80CC\uFF0C\u4E0D\u5199\u8138\u3002",
        notes: "\u8138\u6709\u8868\u60C5\uFF0C\u80CC\u6CA1\u6709\u3002\u80CC\u53EA\u80FD\u770B\u89C1\u4ED6\u4E3A\u4F60\u5F2F\u4E0B\u53BB\u7684\u90A3\u4E00\u4E0B\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u8FD9\u5C31\u591F\u4E86\u3002\u4F5C\u4E1A\uFF1A\u5199\u4E00\u6B21\u4F60\u770B\u89C1\u7236\u6BCD\u80CC\u5F71\u7684\u65F6\u5019\u3002"
      }
    ];
  }
});

// src/data/fenshu.ts
var FENSHU_STUDENT_SLIDES;
var init_fenshu = __esm({
  "src/data/fenshu.ts"() {
    "use strict";
    FENSHU_STUDENT_SLIDES = [
      {
        kind: "cover",
        title: "\u5206\u6570\u7684\u521D\u6B65\u8BA4\u8BC6",
        line: "\u534A\u4E2A\uFF0C\u600E\u4E48\u5199\uFF1F",
        notes: "\u4ECA\u5929\u5B66\u5206\u6570\u3002\u5148\u95EE\u4E00\u53E5\uFF1A\u534A\u4E2A\u82F9\u679C\uFF0C\u4F60\u4F1A\u7528\u6570\u5199\u51FA\u6765\u5417\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u5199\u4E0D\u51FA\u6765\u5F88\u6B63\u5E38\uFF0C\u4ECA\u5929\u5B66\u5B8C\u5C31\u4F1A\u4E86\u3002"
      },
      {
        kind: "hook",
        title: "\u5206\u6708\u997C",
        line: "\u8FD9\u6837\u5206\uFF0C\u516C\u5E73\u5417\uFF1F",
        imageHint: "\u6708\u997C \u5E73\u5747\u5206 \u4E24\u4EFD",
        notes: "\uFF08\u6307\u56FE\uFF09\u4E00\u5757\u6708\u997C\uFF0C\u4E24\u4E2A\u4EBA\u5403\u3002\u8BF7\u4E24\u4F4D\u540C\u5B66\u4E0A\u6765\u5206\u3002\uFF08\u5B66\u751F\u5206\u51FA\u4E00\u5927\u4E00\u5C0F\uFF09\u5927\u5BB6\u770B\uFF0C\u516C\u5E73\u5417\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u4E0D\u516C\u5E73\u3002\u90A3\u8981\u600E\u4E48\u5206\uFF1F\u4E24\u4EFD\u4E00\u6837\u5927\u3002"
      },
      {
        kind: "goals",
        title: "\u4ECA\u5929\u4E09\u4EF6\u4E8B",
        items: ["\u2460 \u6298\u4E00\u6298", "\u2461 \u8BA4\u5206\u6BCD\u5206\u5B50", "\u2462 \u6BD4\u4E00\u6BD4"],
        line: "\u5148\u6298\u54EA\u4E00\u4E2A\uFF1F",
        notes: "\u4E09\u4EF6\u4E8B\uFF1A\u5148\u52A8\u624B\u6298\uFF0C\u518D\u8BA4\u8BC6\u5206\u6BCD\u548C\u5206\u5B50\uFF0C\u6700\u540E\u6BD4\u4E00\u6BD4\u8C01\u5927\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u6298\u7684\u65F6\u5019\u6709\u4E00\u6761\u89C4\u5B9A\uFF1A\u4E24\u4EFD\u5FC5\u987B\u4E00\u6837\u5927\u3002"
      },
      {
        kind: "words",
        title: "\u56DB\u4E2A\u65B0\u8BCD",
        items: ["\u4E8C\u5206\u4E4B\u4E00", "\u5206\u6570\u7EBF", "\u5206\u6BCD", "\u5206\u5B50"],
        line: "\u54EA\u4E2A\u5728\u6700\u4E0B\u9762\uFF1F",
        notes: "\u8DDF\u6211\u8BFB\uFF1A\u4E8C\u5206\u4E4B\u4E00\u3001\u5206\u6570\u7EBF\u3001\u5206\u6BCD\u3001\u5206\u5B50\u3002\u6700\u4E0B\u9762\u90A3\u4E2A\u53EB\u5206\u6BCD\uFF0C\u5B83\u8BF4\u7684\u662F\u5206\u6210\u51E0\u4EFD\uFF1B\u6700\u4E0A\u9762\u90A3\u4E2A\u53EB\u5206\u5B50\uFF0C\u8BF4\u7684\u662F\u53D6\u4E86\u51E0\u4EFD\u3002\uFF08\u505C\u4E09\u79D2\uFF09"
      },
      {
        kind: "close-read",
        title: "\u6298\u51FA\u4E00\u534A",
        line: "\u201C\u6BCF\u4EFD\u662F\u5B83\u7684\u4E8C\u5206\u4E4B\u4E00\u3002\u201D",
        items: ["\u4E3A\u4EC0\u4E48\u8981\u8BF4\u201C\u5E73\u5747\u5206\u201D\uFF1F"],
        notes: "\u628A\u7EB8\u6298\u6210\u4E00\u6837\u5927\u7684\u4E24\u4EFD\uFF0C\u8FD9\u4E00\u4EFD\u5C31\u662F\u4E8C\u5206\u4E4B\u4E00\u3002\u770B\u8FD9\u53E5\uFF1A\u6BCF\u4EFD\u662F\u5B83\u7684\u4E8C\u5206\u4E4B\u4E00\u3002\u4E3A\u4EC0\u4E48\u8981\u8BF4\u5E73\u5747\u5206\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u4E0D\u5E73\u5747\uFF0C\u4E00\u5927\u4E00\u5C0F\uFF0C\u5C31\u4E0D\u53EB\u4E8C\u5206\u4E4B\u4E00\u3002"
      },
      {
        kind: "close-read",
        title: "\u5199\u4E0B\u6765",
        line: "\u6A2A\u7EBF\u662F\u5E73\u5747\u5206\uFF0C\u4E0B\u9762\u662F\u4EFD\u6570\u3002",
        items: ["\u4E0A\u9762\u90A3\u4E2A\u6570\u5199\u4EC0\u4E48\uFF1F"],
        notes: "\u5148\u753B\u6A2A\u7EBF\uFF0C\u8FD9\u6761\u7EBF\u5C31\u662F\u5E73\u5747\u5206\u3002\u4E0B\u9762\u5199 2\uFF0C\u5206\u6210\u4E24\u4EFD\u3002\u4E0A\u9762\u5199 1\uFF0C\u53D6\u5176\u4E2D\u4E00\u4EFD\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u4E0A\u9762\u8FD9\u4E2A\u6570\uFF0C\u5199\u7684\u662F\u53D6\u51E0\u4EFD\uFF0C\u4E0D\u662F\u5206\u51E0\u4EFD\u3002"
      },
      {
        kind: "compare",
        title: "\u4E24\u5F20\u7EB8\u53E0\u4E00\u8D77",
        items: ["\u4E8C\u5206\u4E4B\u4E00", "\u56DB\u5206\u4E4B\u4E00"],
        compareDiff: ["\u4EFD\u6570\u591A\uFF0C\u6BCF\u4EFD\u5C31\u5C0F"],
        line: "\u54EA\u4E00\u5F20\u6D82\u5F97\u591A\uFF1F",
        notes: "\u540C\u6837\u5927\u7684\u4E24\u5F20\u7EB8\uFF0C\u4E00\u5F20\u6298\u4E24\u4EFD\u6D82\u4E00\u4EFD\uFF0C\u4E00\u5F20\u6298\u56DB\u4EFD\u6D82\u4E00\u4EFD\u3002\uFF08\u4E3E\u8D77\u4E24\u5F20\uFF09\u54EA\u4E00\u5F20\u6D82\u5F97\u591A\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u4E8C\u5206\u4E4B\u4E00\u7684\u3002\u4EFD\u6570\u8D8A\u591A\uFF0C\u6BCF\u4EFD\u8D8A\u5C0F\u3002"
      },
      {
        kind: "board",
        title: "\u770B\u8FD9\u513F",
        items: ["1/2\uFF1A\u5206 2 \u53D6 1", "1/4\uFF1A\u5206 4 \u53D6 1", "\u4EFD\u6570\u591A\uFF0C\u6BCF\u4EFD\u5C0F"],
        line: "\u4E0B\u9762\u90A3\u4E2A\u6570\u8BF4\u7684\u662F\u4EC0\u4E48\uFF1F",
        notes: "\u4ECE\u4E0A\u5F80\u4E0B\u770B\u8FD9\u4E09\u884C\u3002\u7B2C\u4E00\u884C\u5206\u6210\u4E24\u4EFD\u53D6\u4E00\u4EFD\uFF0C\u7B2C\u4E8C\u884C\u5206\u6210\u56DB\u4EFD\u53D6\u4E00\u4EFD\uFF0C\u7B2C\u4E09\u884C\u662F\u4E00\u53E5\u80FD\u5E26\u8D70\u7684\u8BDD\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u5408\u8D77\u6765\u7528\u4E00\u53E5\u8BDD\u8BF4\uFF1A\u5148\u5E73\u5747\u5206\uFF0C\u518D\u8BF4\u51E0\u5206\u4E4B\u4E00\u3002"
      },
      {
        kind: "drill",
        title: "\u6D82\u51FA 1/2\u30011/4\u30011/3",
        items: ["\u6D82\u51FA 1/2", "\u6D82\u51FA 1/4", "\u6D82\u51FA 1/3"],
        line: "\u4E09\u4E2A\u56FE\uFF0C\u5404\u6D82\u51E0\u683C\uFF1F",
        notes: "\u7B2C\u4E00\u9898\u6D82\u4E00\u534A\uFF0C\u7B2C\u4E8C\u9898\u628A\u56FE\u5206\u6210\u56DB\u4EFD\u6D82\u4E00\u4EFD\uFF0C\u7B2C\u4E09\u9898\u5206\u6210\u4E09\u4EFD\u6D82\u4E00\u4EFD\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u7B2C\u4E09\u9898\u6700\u5BB9\u6613\u9519\uFF1A\u5148\u770B\u5206\u6210\u51E0\u4EFD\uFF0C\u518D\u770B\u53D6\u51E0\u4EFD\u3002"
      },
      {
        kind: "end",
        title: "\u4E00\u53E5\u8BDD\u5E26\u8D70",
        line: "\u5BB6\u91CC\u7684\u82F9\u679C\uFF0C\u4F60\u4F1A\u5206\u4E86\u5417\uFF1F",
        notes: "\uFF08\u505C\u4E09\u79D2\uFF09\u4ECA\u5929\u5E26\u8D70\u4E00\u53E5\uFF1A\u5148\u5E73\u5747\u5206\uFF0C\u518D\u8BF4\u51E0\u5206\u4E4B\u4E00\u3002\u56DE\u5BB6\u628A\u4E00\u6837\u4E1C\u897F\u5E73\u5747\u5206\u7ED9\u5BB6\u91CC\u4EBA\uFF0C\u660E\u5929\u8BF4\u7ED9\u6211\u542C\uFF0C\u5206\u7684\u662F\u51E0\u5206\u4E4B\u4E00\u3002"
      }
    ];
  }
});

// src/data/yuanmianji.ts
var YUANMIANJI_STUDENT_SLIDES;
var init_yuanmianji = __esm({
  "src/data/yuanmianji.ts"() {
    "use strict";
    YUANMIANJI_STUDENT_SLIDES = [
      {
        kind: "cover",
        title: "\u5706\u7684\u9762\u79EF",
        line: "\u4E00\u4E2A\u5706\uFF0C\u80FD\u7B97\u591A\u5927\uFF1F",
        notes: "\u4ECA\u5929\u7B97\u5706\u7684\u9762\u79EF\u3002\u7ED5\u4E00\u5708\u6709\u591A\u957F\uFF0C\u6211\u4EEC\u4F1A\u7B97\uFF1B\u5B83\u5360\u4E86\u591A\u5927\u4E00\u5757\uFF0C\u8FD8\u6CA1\u7B97\u8FC7\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u4ECA\u5929\u628A\u8FD9\u4EF6\u4E8B\u89E3\u51B3\u6389\u3002"
      },
      {
        kind: "hook",
        title: "\u64CD\u573A\u4E0A\u7684\u5706",
        line: "\u8FD9\u5757\u5730\uFF0C\u600E\u4E48\u91CF\uFF1F",
        imageHint: "\u64CD\u573A \u7C89\u7B14 \u753B\u5706",
        notes: "\uFF08\u6307\u56FE\uFF09\u64CD\u573A\u4E0A\u7684\u5706\uFF0C\u7C89\u7B14\u753B\u51FA\u6765\u7684\u3002\u7ED5\u4E00\u5708\u7684\u957F\u5EA6\u6211\u4EEC\u4F1A\u7B97\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u53EF\u5B83\u5360\u4E86\u591A\u5927\u4E00\u5757\u5730\uFF1F\u7528\u5C3A\u5B50\u80FD\u91CF\u51FA\u6765\u5417\uFF1F\u91CF\u4E0D\u51FA\u6765\u3002"
      },
      {
        kind: "goals",
        title: "\u4ECA\u5929\u4E09\u4EF6\u4E8B",
        items: ["\u2460 \u526A\u4E00\u526A", "\u2461 \u62FC\u4E00\u62FC", "\u2462 \u7B97\u4E00\u7B97"],
        line: "\u5148\u52A8\u54EA\u4E00\u6B65\uFF1F",
        notes: "\u4E09\u4EF6\u4E8B\u6309\u987A\u5E8F\u505A\uFF1A\u5148\u628A\u5706\u526A\u5F00\uFF0C\u518D\u62FC\u6210\u4E00\u4E2A\u5B66\u8FC7\u7684\u56FE\u5F62\uFF0C\u6700\u540E\u7B97\u51FA\u9762\u79EF\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u7B2C\u4E8C\u4EF6\u6700\u5173\u952E\uFF0C\u62FC\u5BF9\u4E86\u516C\u5F0F\u81EA\u5DF1\u5C31\u51FA\u6765\u3002"
      },
      {
        kind: "words",
        title: "\u56DB\u4E2A\u8BCD\uFF0C\u522B\u6DF7",
        items: ["\u534A\u5F84 r", "\u76F4\u5F84 d", "\u5468\u957F C", "\u9762\u79EF S"],
        line: "\u9762\u79EF\u6307\u54EA\u4E00\u5757\uFF1F",
        notes: "\u534A\u5F84\u662F\u4ECE\u5706\u5FC3\u5230\u8FB9\u4E0A\uFF0C\u76F4\u5F84\u662F\u7A7F\u8FC7\u5706\u5FC3\u90A3\u4E00\u6761\uFF0C\u5468\u957F\u662F\u7ED5\u4E00\u5708\uFF0C\u9762\u79EF\u662F\u91CC\u9762\u90A3\u4E00\u6574\u5757\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u4ECA\u5929\u7B97\u7684\u662F\u7B2C\u56DB\u6837\uFF0C\u522B\u548C\u5468\u957F\u6DF7\u3002"
      },
      {
        kind: "close-read",
        title: "\u628A\u5706\u526A\u5F00",
        line: "\u526A\u6210\u5C0F\u7247\uFF0C\u80FD\u62FC\u6210\u4EC0\u4E48\uFF1F",
        items: ["\u6CBF\u534A\u5F84\u4E00\u5200\u4E00\u5200\u526A"],
        notes: "\u6CBF\u7740\u753B\u597D\u7684\u7EBF\u526A\uFF0C\u4E00\u7247\u4E00\u7247\u3002\uFF08\u793A\u8303\uFF09\u526A\u5B8C\u50CF\u8FD9\u6837\u4E00\u7247\u6B63\u4E00\u7247\u53CD\u5730\u62FC\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u62FC\u51FA\u6765\u50CF\u4EC0\u4E48\uFF1F\u50CF\u957F\u65B9\u5F62\u3002"
      },
      {
        kind: "close-read",
        title: "\u62FC\u6210\u4E86\u957F\u65B9\u5F62",
        items: ["\u957F\u662F\u534A\u4E2A\u5706\u5468"],
        line: "\u534A\u4E2A\u5706\u5468\u6709\u591A\u957F\uFF1F",
        notes: "\u770B\u8FD9\u6761\u957F\u3002\u4E0A\u4E00\u6392\u5C0F\u7247\u7684\u5F27\u52A0\u8D77\u6765\u662F\u534A\u4E2A\u5706\uFF0C\u4E0B\u4E00\u6392\u4E5F\u662F\u534A\u4E2A\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u534A\u4E2A\u5706\u5468\u591A\u957F\uFF1F\u03C0r\u3002\u5BBD\u5462\uFF1F\u5C31\u662F\u534A\u5F84 r\u3002"
      },
      {
        kind: "compare",
        title: "\u5468\u957F\u548C\u9762\u79EF",
        items: ["\u5468\u957F\uFF1A\u7ED5\u4E00\u5708", "\u9762\u79EF\uFF1A\u91CC\u9762\u90A3\u5757"],
        compareDiff: ["\u4E00\u4E2A\u91CF\u7EBF\uFF0C\u4E00\u4E2A\u91CF\u5757"],
        line: "\u54EA\u91CC\u6700\u5BB9\u6613\u6DF7\uFF1F",
        notes: "\u5468\u957F\u91CF\u7684\u662F\u7EBF\uFF0C\u9762\u79EF\u91CF\u7684\u662F\u5757\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u6700\u5BB9\u6613\u6DF7\u5728\u4E24\u5904\uFF1A\u516C\u5F0F\u91CC\u7684 r \u4E00\u4E2A\u6709\u5E73\u65B9\u4E00\u4E2A\u6CA1\u6709\uFF0C\u5355\u4F4D\u4E00\u4E2A\u5199\u5398\u7C73\u4E00\u4E2A\u5199\u5E73\u65B9\u5398\u7C73\u3002"
      },
      {
        kind: "board",
        title: "\u770B\u8FD9\u513F",
        items: ["S = \u03C0r\xB2", "\u5148\u7B97 r \u7684\u5E73\u65B9", "\u5355\u4F4D\u5199\u5E73\u65B9"],
        line: "\u5148\u7B97\u54EA\u4E00\u6B65\uFF1F",
        notes: "\u4E09\u884C\u4ECE\u4E0A\u5F80\u4E0B\u5FF5\u3002\u7B2C\u4E00\u884C\u662F\u516C\u5F0F\uFF0C\u7B2C\u4E8C\u884C\u662F\u987A\u5E8F\uFF0C\u7B2C\u4E09\u884C\u662F\u5355\u4F4D\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u03C0r\xB2 \u8BFB\u4F5C \u03C0 r \u7684\u5E73\u65B9\uFF0C\u5148\u5E73\u65B9\uFF0C\u518D\u4E58 \u03C0\u3002"
      },
      {
        kind: "drill",
        title: "\u4EE3\u8FDB\u53BB\u7B97",
        items: ["r = 3\uFF0C\u9762\u79EF\u591A\u5C11\uFF1F", "r = 5 \u5462\uFF1F"],
        line: "\u03C0 \u53D6 3.14\uFF0C\u8C01\u6765\u7B97\uFF1F",
        notes: "\u534A\u5F84 3 \u5398\u7C73\uFF1A\u5148 3 \u7684\u5E73\u65B9\uFF0C9\uFF0C\u518D\u4E58 3.14\uFF0C\u5F97 28.26 \u5E73\u65B9\u5398\u7C73\u3002\uFF08\u505C\u4E09\u79D2\uFF09\u534A\u5F84 5 \u7684\u81EA\u5DF1\u7B97\uFF0C\u5199\u5B8C\u540C\u684C\u67E5\u4E24\u4EF6\u4E8B\uFF1A\u5E73\u65B9\u7B97\u4E86\u6CA1\u6709\uFF0C\u5355\u4F4D\u5199\u4E86\u5E73\u65B9\u6CA1\u6709\u3002"
      },
      {
        kind: "end",
        title: "\u4E00\u53E5\u8BDD\u5E26\u8D70",
        line: "\u5706\uFF0C\u53D8\u6210\u4E86\u4EC0\u4E48\uFF1F",
        notes: "\uFF08\u505C\u4E09\u79D2\uFF09\u4ECA\u5929\u5E26\u8D70\u4E00\u53E5\uFF1A\u628A\u4E0D\u4F1A\u7B97\u7684\u5706\uFF0C\u526A\u62FC\u6210\u4F1A\u7B97\u7684\u957F\u65B9\u5F62\u3002\u56DE\u5BB6\u91CF\u4E00\u4E2A\u5706\u7897\u7684\u534A\u5F84\u6216\u76F4\u5F84\uFF0C\u7B97\u7B97\u5B83\u6709\u591A\u5927\uFF0C\u660E\u5929\u8BF4\u7ED9\u6211\u542C\u3002"
      }
    ];
  }
});

// src/lib/slides.ts
var slides_exports = {};
__export(slides_exports, {
  BARE_ACTION_TITLE: () => BARE_ACTION_TITLE,
  EMPTY_TASK: () => EMPTY_TASK,
  FLOAT_TEXT_MAX: () => FLOAT_TEXT_MAX,
  QUOTE_BODY_MAX: () => QUOTE_BODY_MAX,
  QUOTE_MIN_SHARE: () => QUOTE_MIN_SHARE,
  QUOTE_NOTE_MAX: () => QUOTE_NOTE_MAX,
  QUOTE_PAGE_MAX: () => QUOTE_PAGE_MAX,
  SLIDE_FORBIDDEN: () => SLIDE_FORBIDDEN,
  SLIDE_KINDS: () => SLIDE_KINDS,
  SLIDE_LABELS: () => SLIDE_LABELS,
  SLIDE_LIMITS: () => SLIDE_LIMITS,
  SLIDE_PAGE_ORDER: () => SLIDE_PAGE_ORDER,
  SLIDE_POINTS: () => SLIDE_POINTS,
  TEACHER_WORDS: () => TEACHER_WORDS,
  TITLE_GUESS: () => TITLE_GUESS,
  TITLE_VERB: () => TITLE_VERB,
  applySlideScenes: () => applySlideScenes,
  auditProblems: () => auditProblems,
  bodyCharCount: () => bodyCharCount,
  bodyParts: () => bodyParts,
  buildStudentSlides: () => buildStudentSlides,
  compareDiffProblems: () => compareDiffProblems,
  compareRows: () => compareRows,
  countVisibleChars: () => countVisibleChars,
  deckMaterial: () => deckMaterial,
  findForbidden: () => findForbidden,
  findNoteWarnings: () => findNoteWarnings,
  findTaste: () => findTaste,
  findTeacherWords: () => findTeacherWords,
  floatTextProblems: () => floatTextProblems,
  genericSlides: () => genericSlides,
  getBuiltinStudentSlides: () => getBuiltinStudentSlides,
  hasAskable: () => hasAskable,
  hasQuestion: () => hasQuestion,
  hasSlideScenes: () => hasSlideScenes,
  lessonSlides: () => lessonSlides,
  materialProblems: () => materialProblems,
  normalizeSlides: () => normalizeSlides,
  pageSentences: () => pageSentences,
  pageVisibleText: () => pageVisibleText,
  repairPages: () => repairPages,
  sentenceKey: () => sentenceKey,
  slidesFromDeck: () => slidesFromDeck,
  slidesFromDeckProblems: () => slidesFromDeckProblems,
  validateSlides: () => validateSlides,
  volumeOf: () => volumeOf,
  withCoverMeta: () => withCoverMeta,
  withMotif: () => withMotif,
  withQuotes: () => withQuotes
});
function compareRows(itemCount) {
  return Math.ceil(Math.max(0, itemCount) / 2);
}
function floatTextProblems(text) {
  const t = String(text ?? "").trim();
  if (!t) return ["\u662F\u7A7A\u4E32"];
  const problems = [];
  const n = [...t].length;
  if (n > FLOAT_TEXT_MAX) problems.push(`\u300C${t}\u300D${n} \u5B57\uFF0C\u8D85 ${FLOAT_TEXT_MAX} \u5B57\u4E0A\u9650`);
  const hits = scanVoice(t).hits;
  if (hits.length) problems.push(`\u300C${t}\u300D\u8E29\u4E86\u8BED\u6C14\u5224\u5B9A\uFF1A${hits.map((h) => h.label).join("\u3001")}`);
  return problems;
}
function compareDiffProblems(diff, itemCount) {
  if (!Array.isArray(diff)) return ["\u6CA1\u5E26 compareDiff \u6216\u5B83\u4E0D\u662F\u6570\u7EC4"];
  const rows = compareRows(itemCount);
  if (rows < 1) return ["\u5BF9\u6BD4\u9875\u6CA1\u6709 items\uFF0C\u4E0D\u6210\u5BF9"];
  if (diff.length !== rows) return [`compareDiff \u7ED9\u4E86 ${diff.length} \u6761\uFF0C\u5E94\u6709 ${rows} \u6761\uFF08items \u4E24\u4E24\u4E00\u5BF9\uFF09`];
  const problems = [];
  diff.forEach((d, i) => {
    for (const p of floatTextProblems(d)) problems.push(`\u7B2C ${i + 1} \u5BF9\uFF1A${p}`);
  });
  return problems;
}
function countVisibleChars(text) {
  let n = 0;
  for (const ch of String(text ?? "")) {
    if (CJK2.test(ch) || ALNUM.test(ch)) n++;
  }
  return n;
}
function bodyParts(slide) {
  return [slide.text ?? "", slide.line ?? "", ...slide.items ?? []].filter((s) => s.trim().length > 0);
}
function bodyCharCount(slide) {
  return bodyParts(slide).reduce((sum, t) => sum + countVisibleChars(t), 0);
}
function pageVisibleText(slide) {
  return [slide.title ?? "", ...bodyParts(slide), slide.imageHint ?? ""];
}
function hasQuestion(slide) {
  return /[？?]/.test([slide.title ?? "", ...bodyParts(slide)].join(" "));
}
function hasAskable(slide) {
  if (hasQuestion(slide)) return true;
  const text = [slide.title ?? "", slide.line ?? "", ...slide.items ?? []].join(" ");
  return /读|圈|写|画|标|填|数|比|做|演|背|找|听|看|说|试|闻|闭|换|讨论|交流|打开|翻|举|跟|摸|摆|搭|指|量|拼|剪|折|贴|排|唱|算|练|观察/.test(
    text
  );
}
function sentenceKey(text) {
  return String(text ?? "").replace(/[“”"‘’'（）()【】「」《》〈〉　 ]/g, "").replace(/[，,。.；;：:、！!？?—－\-…·~～]/g, "").trim();
}
function pageSentences(slide) {
  return [slide.title ?? "", slide.text ?? "", slide.line ?? "", ...slide.items ?? []].map((t) => String(t ?? "").trim()).filter((t) => countVisibleChars(t) >= 4);
}
function blankWordingProblems(slide) {
  const body = [slide.line ?? "", ...slide.items ?? []];
  const wording = body.filter((t) => BLANK_WORDING.test(String(t ?? "")));
  if (wording.length === 0) return [];
  const hasBlank = body.some((t) => BLANK_MARK.test(String(t ?? ""))) || BLANK_MARK.test(slide.title ?? "");
  if (hasBlank) return [];
  return wording.map((t) => String(t));
}
function findForbidden(slide) {
  return hitWords(pageVisibleText(slide).join(" "));
}
function findNoteWarnings(slide) {
  return hitWords(slide.notes ?? "");
}
function findTeacherWords(text) {
  const t = String(text ?? "");
  return TEACHER_WORDS.filter((w) => t.includes(w));
}
function findTaste(slide) {
  const lines2 = [slide.title ?? "", slide.line ?? "", ...slide.items ?? []].filter(
    (s) => String(s).trim().length > 0
  );
  const out = [];
  for (const line of lines2) out.push(...tasteProblems(line));
  return out;
}
function hitWords(text) {
  const t = String(text ?? "");
  return SLIDE_FORBIDDEN.filter((w) => t.includes(w));
}
function validateSlides(slides2, limits = ENVELOPE) {
  const problems = [];
  const warnings = [];
  if (!Array.isArray(slides2) || slides2.length === 0) {
    return { ok: false, problems: ["\u4E00\u4EFD\u9875\u9762\u90FD\u6CA1\u6709\u62FF\u5230\u3002"], warnings };
  }
  if (slides2.length < limits.pagesMin) {
    problems.push(`\u53EA\u6709 ${slides2.length} \u9875\uFF0C\u5C11\u4E8E ${limits.pagesMin} \u9875\u3002`);
  }
  if (slides2.length > limits.pagesMax) {
    problems.push(`\u6709 ${slides2.length} \u9875\uFF0C\u8D85\u8FC7 ${limits.pagesMax} \u9875\u3002`);
  }
  const seen = /* @__PURE__ */ new Map();
  slides2.forEach((s, i) => {
    const at = `\u7B2C ${i + 1} \u9875`;
    if (!s || typeof s !== "object") {
      problems.push(`${at}\u4E0D\u662F\u5408\u6CD5\u9875\u9762\u3002`);
      return;
    }
    if (!SLIDE_KINDS.includes(s.kind)) problems.push(`${at}\u7684\u9875\u578B\u300C${s.kind}\u300D\u4E0D\u8BA4\u8BC6\u3002`);
    if (!String(s.title ?? "").trim()) problems.push(`${at}\u6CA1\u6709\u5927\u6807\u9898\u3002`);
    const isQuote = s.kind === "quote";
    if (isQuote) {
      const text = String(s.text ?? "").trim();
      if (!text) problems.push(`${at}\u662F\u539F\u6587\u9875\uFF0C\u5374\u6CA1\u6709\u9010\u5B57\u6284\u4E0B\u8BFE\u6587\u90A3\u4E00\u53E5\uFF08text \u4E3A\u7A7A\uFF09\u3002`);
      else {
        if (String(s.title ?? "").trim() !== text)
          problems.push(`${at}\u539F\u6587\u9875\u7684\u6807\u9898\u4E0E\u539F\u6587\u4E0D\u4E00\u81F4\uFF1A\u539F\u6587\u9875\u7684\u6807\u9898\u5C31\u662F\u90A3\u4E00\u53E5\u3002`);
        const n = countVisibleChars(text);
        if (n > QUOTE_BODY_MAX) problems.push(`${at}\u539F\u6587\u9875 ${n} \u5B57\uFF0C\u8D85\u4E86 ${QUOTE_BODY_MAX} \u5B57\u4E0A\u9650\u3002`);
      }
      if ((s.items ?? []).length) problems.push(`${at}\u539F\u6587\u9875\u5E26\u4E86\u6761\u76EE\uFF0C\u539F\u6587\u9875\u53EA\u653E\u539F\u6587\u4E0E\u51FA\u5904\u3002`);
    }
    if (!isQuote && STAGE_TITLE.test(String(s.title ?? "").trim()))
      problems.push(`${at}\u6807\u9898\u300C${String(s.title).slice(0, 12)}\u300D\u5E26\u7740\u6559\u6848\u73AF\u8282\u540D\uFF0C\u73AF\u8282\u540D\u7559\u5728\u8BFE\u4EF6\u3002`);
    if (!isQuote && TITLE_GUESS.test(String(s.title ?? "").trim()))
      problems.push(`${at}\u6807\u9898\u300C${String(s.title).slice(0, 12)}\u300D\u662F\u8BA9\u5B66\u751F\u731C\u8001\u5E08\u7684\u5FC3\u601D\uFF1A\u6807\u9898\u8981\u4E48\u4E00\u53E5\u6307\u4EE4\uFF0C\u8981\u4E48\u4E00\u4E2A\u7ED3\u8BBA\u3002`);
    const dash = pageSentences(s).filter((t) => t.includes("\u2014\u2014"));
    if (dash.length) problems.push(`${at}\u6709\u534A\u622A\u8BDD\u5E26\u7834\u6298\u53F7\uFF1A\u300C${dash[0].slice(0, 16)}\u300D\u3002`);
    const chars = bodyCharCount(s);
    if (!isQuote && chars > limits.bodyChars) problems.push(`${at}\u6B63\u6587 ${chars} \u5B57\uFF0C\u8D85\u4E86 ${limits.bodyChars} \u5B57\u4E0A\u9650\u3002`);
    const itemCount = (s.items ?? []).length;
    if (s.kind === "words" && itemCount > WORDS_ITEMS_MAX)
      problems.push(`${at}\u5B57\u8BCD\u9875\u6709 ${itemCount} \u4E2A\u8BCD\uFF0C\u8D85 ${WORDS_ITEMS_MAX} \u4E2A\u4E0A\u9650\uFF08\u4EFB\u4F55\u6863\u4F4D\u90FD\u9501 \u2264${WORDS_ITEMS_MAX}\uFF09\u3002`);
    if (s.kind !== "words" && itemCount > limits.itemsMax)
      problems.push(`${at}\u6709 ${itemCount} \u6761 items\uFF0C\u8D85 ${limits.itemsMax} \u6761\u4E0A\u9650\u3002`);
    if (s.kind === "goals") {
      const empty = (s.items ?? []).filter(
        (t) => EMPTY_TASK.test(String(t ?? "").replace(/^[①②③]\s*/, "").trim())
      );
      if (empty.length)
        problems.push(`${at}\u76EE\u6807\u9875\u6709 ${empty.length} \u6761\u4E09\u5B57\u7A7A\u8BDD\uFF08\u300C${empty[0]}\u300D\uFF09\uFF1A\u8981\u5199\u5B66\u751F\u5F53\u573A\u80FD\u505A\u7684\u4E8B\u3002`);
    }
    if (!isQuote && s.kind !== "cover" && !hasAskable(s))
      problems.push(`${at}\u65E2\u6CA1\u6709\u4E00\u53E5\u80FD\u95EE\u51FA\u53E3\u7684\u8BDD\uFF0C\u4E5F\u6CA1\u6709\u5B66\u751F\u8981\u505A\u7684\u52A8\u4F5C\u3002`);
    const hits = isQuote ? [] : findForbidden(s);
    if (hits.length) problems.push(`${at}\u9875\u9762\u4E0A\u51FA\u73B0\u7981\u8BCD\uFF1A${hits.join("\u3001")}\u3002`);
    const taste = isQuote ? [] : findTaste(s);
    if (taste.length) problems.push(`${at}\u7684\u6587\u6848\u4E0D\u50CF\u8001\u5E08\u5199\u7684\uFF1A${taste.join("\uFF1B")}\u3002`);
    if (!String(s.notes ?? "").trim()) problems.push(`${at}\u5907\u6CE8\u662F\u7A7A\u7684\uFF0C\u8001\u5E08\u4E0D\u77E5\u9053\u8BE5\u8BF4\u4EC0\u4E48\u3002`);
    const actHits = findTeacherWords(s.notes ?? "");
    if (actHits.length) problems.push(`${at}\u5907\u6CE8\u91CC\u51FA\u73B0\u6559\u5B66\u52A8\u4F5C\u8BCD\uFF1A${actHits.join("\u3001")}\uFF08\u5907\u6CE8\u662F\u5FF5\u7ED9\u5B66\u751F\u542C\u7684\uFF0C\u4E0D\u662F\u6559\u6848\uFF09\u3002`);
    const noteHits = findNoteWarnings(s);
    if (noteHits.length) warnings.push(`${at}\u5907\u6CE8\u91CC\u6709\u6559\u7814\u8154\u7528\u8BCD\uFF1A${noteHits.join("\u3001")}\u3002`);
    const mine = /* @__PURE__ */ new Set();
    for (const sent of pageSentences(s)) {
      const key = sentenceKey(sent);
      if (!key) continue;
      const prev = seen.get(key);
      if (prev !== void 0 && prev !== i + 1) {
        problems.push(`${at}\u4E0E\u7B2C ${prev} \u9875\u662F\u540C\u4E00\u53E5\u300C${sent.slice(0, 16)}\u300D\uFF0C\u4E00\u53E5\u53EA\u80FD\u7528\u4E00\u6B21\u3002`);
        continue;
      }
      if (!mine.has(key)) {
        mine.add(key);
        if (prev === void 0) seen.set(key, i + 1);
      }
    }
    const blanks = isQuote ? [] : blankWordingProblems(s);
    if (blanks.length) problems.push(`${at}\u9875\u9762\u4E0A\u6CA1\u6709\u7A7A\uFF0C\u5374\u5728\u8BF4\u586B\u7A7A\uFF1A\u300C${blanks[0].slice(0, 16)}\u300D\u3002`);
  });
  return { ok: problems.length === 0, problems, warnings };
}
function materialProblems(slides2) {
  const out = [];
  slides2.forEach((s, i) => {
    const kind = s?.kind;
    if (!s || kind === "cover" || kind === "quote" || kind === "end") return;
    const at = `\u7B2C ${i + 1} \u9875`;
    const body = [s.line ?? "", ...s.items ?? []].join(" ").trim();
    const title = String(s.title ?? "").trim();
    if (BARE_ACTION_TITLE.test(title))
      out.push(`${at}\u6807\u9898\u300C${title.slice(0, 12)}\u300D\u53EA\u6709\u52A8\u4F5C\uFF0C\u6CA1\u8BF4\u8BFB\u4EC0\u4E48/\u770B\u54EA\u4E2A`);
    if (countVisibleChars(body) < 4)
      out.push(`${at}\u6CA1\u6709\u6750\u6599\uFF1A\u65E2\u6CA1\u6709\u4E00\u53E5\u539F\u6587\uFF0C\u4E5F\u6CA1\u6709\u8BCD\u3001\u7A7A\u3001\u6570\u5B57\u6216\u6B65\u9AA4`);
  });
  return out;
}
function scrubForbidden(text) {
  let out = String(text ?? "");
  const keys = Object.keys(FORBIDDEN_REPL).sort((a, b) => b.length - a.length);
  for (const k of keys) out = out.split(k).join(FORBIDDEN_REPL[k]);
  for (const w of hitWords(out)) out = out.split(w).join("");
  let half = false;
  out = out.replace(/"/g, () => (half = !half) ? "\u201C" : "\u201D");
  return squeezeHan(out.replace(/[*_`#>|]/g, " ").replace(/\s{2,}/g, " ").trim());
}
function squeezeHan(text) {
  return String(text ?? "").replace(EXOTIC_SPACE, " ").replace(LONE_FULL_SPACE, "").replace(/[ \t]+/g, " ").replace(/(?<=[\u3400-\u4DBF\u4E00-\u9FFF，。！？；：、（）“”‘’]) /g, "").replace(/ (?=[\u3400-\u4DBF\u4E00-\u9FFF，。！？；：、（）“”‘’])/g, "");
}
function clipChars(text, max) {
  const chars = [...String(text ?? "").trim()];
  return chars.length > max ? chars.slice(0, max).join("") : chars.join("");
}
function isTeacherNoise(text) {
  return TEACHER_NOISE.test(String(text ?? ""));
}
function unquote(text) {
  return text.replace(/[“”"‘’]/g, "").trim();
}
function dropDangling(text) {
  let out = String(text ?? "");
  for (const [open, close] of [
    ["\u300A", "\u300B"],
    ["\u201C", "\u201D"],
    ["\uFF08", "\uFF09"],
    ["\u3010", "\u3011"],
    ["\u300C", "\u300D"]
  ]) {
    const o = out.split(open).length - 1;
    const c = out.split(close).length - 1;
    if (o > c) out = out.slice(0, out.lastIndexOf(open));
  }
  return out.replace(/[，、：:；;\s]+$/, "").trim();
}
function trimDanglingTitle(text) {
  let out = dropDangling(String(text ?? "").trim());
  for (let i = 0; i < 6; i++) {
    const next = out.replace(CUT_TAIL, "").replace(/[，、：:；;\s]+$/, "").trim();
    if (next === out) break;
    out = next;
  }
  return out;
}
function shortenPhrase(text, max) {
  const clean2 = scrubForbidden(text);
  if (countVisibleChars(clean2) <= max) return clean2;
  const hasHan = /[\u3400-\u4DBF\u4E00-\u9FFF]/;
  const clauses = clean2.split(/[，,；;、：:\s。！？!?]+/).map((c) => c.trim()).filter((c) => countVisibleChars(c) >= 3 && hasHan.test(c) && !isTeacherNoise(c)).sort((a, b) => countVisibleChars(b) - countVisibleChars(a));
  const fit = clauses.find((c) => countVisibleChars(c) <= max);
  if (fit) return fit;
  const cutIn = /《[^》]*$/.test([...clean2].slice(0, max).join(""));
  const raw = cutIn ? clean2.replace(/《[^》]*》?/g, "") : clean2;
  return trimDanglingTitle(clipChars(raw, max));
}
function tightenLine(text, kind, bits) {
  const oneLine = (s) => {
    const ask = /[^。！？；;\n]*[？?]\s*$/.exec(s);
    return ask && countVisibleChars(ask[0]) >= 4 ? ask[0].trim() : s;
  };
  const clean2 = oneLine(scrubForbidden(text));
  if (kind === "cover" && (!clean2 || isTeacherNoise(clean2))) return "";
  if (!clean2 || isTeacherNoise(clean2)) return pickQuestion(kind, bits);
  if (countVisibleChars(clean2) <= LINE_MAX) return clean2;
  const question = (clean2.match(/[^。！？；;\n]*[？?]/) ?? [""])[0].trim();
  if (question && countVisibleChars(question) <= LINE_MAX) return question;
  return pickQuestion(kind, bits);
}
function pickQuestion(kind, bits) {
  return bits.pack.ask(kind, bits.topic);
}
function quoteNotes(text) {
  const t = String(text ?? "").trim();
  return t ? `\u8FD9\u4E00\u9875\u628A\u8FD9\u53E5\u8BDD\u539F\u6837\u653E\u5728\u5C4F\u5E55\u4E0A\uFF1A\u300C${t}\u300D\u5148\u81EA\u5DF1\u8BFB\u4E00\u904D\uFF0C\u518D\u8BF4\u54EA\u4E2A\u8BCD\u8BA9\u4F60\u505C\u4E86\u4E00\u4E0B\u3002` : "\u8FD9\u4E00\u9875\u628A\u8BFE\u6587\u91CC\u7684\u539F\u53E5\u539F\u6837\u653E\u5728\u5C4F\u5E55\u4E0A\uFF0C\u4E00\u4E2A\u5B57\u90FD\u4E0D\u6539\u3002";
}
function quoteSlideOf(text, topic, note2) {
  const one = String(text ?? "").trim();
  const source = String(note2 ?? `\u300A${String(topic ?? "").replace(/[《》\s]/g, "")}\u300B`).trim();
  return {
    kind: "quote",
    title: one,
    text: one,
    ...source && [...source].length <= QUOTE_NOTE_MAX ? { note: source } : {},
    notes: quoteNotes(one)
  };
}
function hardenQuote(slide) {
  const text = String(slide.text ?? slide.title ?? "").trim();
  const note2 = String(slide.note ?? "").trim();
  return {
    kind: "quote",
    title: text || String(slide.title ?? "").trim(),
    ...text ? { text } : {},
    ...note2 && [...note2].length <= QUOTE_NOTE_MAX ? { note: note2 } : {},
    notes: String(slide.notes ?? "").replace(/\s+/g, " ").trim() || quoteNotes(text)
  };
}
function harden(slide, bits) {
  if (slide.kind === "quote") return hardenQuote(slide);
  const kind = SLIDE_KINDS.includes(slide.kind) ? slide.kind : "close-read";
  const rawNotes = String(slide.notes ?? "").replace(/\s+/g, " ").trim();
  const out = {
    kind,
    title: cleanTitle(slide.title, kind, bits),
    notes: rawNotes.length >= 8 ? rawNotes : deriveNotes(kind, bits)
  };
  const line = dropDangling(tightenLine(slide.line ?? "", kind, bits));
  if (line) out.line = line;
  const cap = kind === "words" ? WORDS_ITEM_MAX : ITEM_MAX;
  const items = (kind === "cover" ? [] : slide.items ?? []).map((t) => dropDangling(shortenPhrase(t, cap))).filter((t) => t.length > 0 && !isTeacherNoise(t)).slice(0, kind === "words" ? WORDS_ITEMS_MAX : bits.limits.itemsMax);
  if (items.length) out.items = items;
  const hint = scrubForbidden(slide.imageHint ?? "");
  if (hint) out.imageHint = dropDangling(clipChars(hint, HINT_MAX));
  if (typeof slide.illustration === "string" && slide.illustration.startsWith("data:image/")) {
    out.illustration = slide.illustration;
  }
  ensureQuestion(out, kind, bits);
  fitBudget(out, kind, bits);
  if (kind === "compare" && Array.isArray(slide.compareDiff) && slide.compareDiff.length > 0) {
    const diffs = slide.compareDiff.map((d) => String(d ?? "").trim());
    if (compareDiffProblems(diffs, (out.items ?? []).length).length === 0) out.compareDiff = diffs;
  }
  return out;
}
function cleanTitle(title, kind, bits) {
  const clean2 = dropDangling(scrubForbidden(title));
  if (!clean2) return kind === "cover" ? clipChars(bits.topic || "\u4ECA\u5929\u8FD9\u8282\u8BFE", TITLE_MAX) : asTask(SLIDE_LABELS[kind], kind);
  return countVisibleChars(clean2) > TITLE_MAX ? shortenPhrase(clean2, TITLE_MAX) : clean2;
}
function ensureQuestion(slide, kind, bits) {
  if (kind === "cover") return;
  if (hasQuestion(slide)) return;
  const q = pickQuestion(kind, bits);
  if (kind === "words") {
    slide.line = slide.line ? `${slide.line}${q}` : q;
    return;
  }
  if (!slide.line) {
    slide.line = q;
    return;
  }
  const items = slide.items ?? [];
  items.push(q);
  slide.items = items.slice(-bits.limits.itemsMax);
}
function fitBudget(slide, kind, bits) {
  let guard2 = 0;
  while (bodyCharCount(slide) > bits.limits.bodyChars && guard2++ < 24) {
    const items = slide.items ?? [];
    if (items.length > 0) {
      let worst = 0;
      items.forEach((it, i) => {
        if (countVisibleChars(it) > countVisibleChars(items[worst])) worst = i;
      });
      if (countVisibleChars(items[worst]) > 8) items[worst] = shortenPhrase(items[worst], 8);
      else items.splice(worst, 1);
      slide.items = items.length ? items : void 0;
      continue;
    }
    if (slide.line && countVisibleChars(slide.line) > LINE_MAX) {
      slide.line = pickQuestion(kind, bits);
      continue;
    }
    slide.line = pickQuestion(kind, bits);
    if (!hasQuestion(slide)) break;
  }
  if (bodyCharCount(slide) > bits.limits.bodyChars) {
    slide.items = void 0;
    if (slide.line && countVisibleChars(slide.line) > bits.limits.bodyChars) {
      slide.line = void 0;
    }
  }
  ensureQuestion(slide, kind, bits);
}
function readPlan(plan2, limits = DEFAULT_LIMITS) {
  const safe = plan2 ?? {};
  const segments = safe.segments ?? [];
  const pack = packOf(safe.meta?.subject);
  const texts = [
    safe.objectives?.knowledge ?? "",
    safe.objectives?.process ?? "",
    safe.objectives?.emotion ?? "",
    safe.keyPoint ?? "",
    safe.hardPoint ?? "",
    ...segments.map((s) => s.script ?? ""),
    ...segments.map((s) => s.goal ?? ""),
    ...(safe.speech ?? []).map((s) => s.text ?? "")
  ].join("\n");
  return {
    // 课题统一裁短：后面无论拼进 cover/end 问句还是当标题，都不会把整行顶破当前档的正文上限
    topic: clipChars(String(safe.meta?.topic ?? "").replace(/[《》\s]/g, ""), TOPIC_MAX),
    grade: safe.meta?.grade ?? "",
    subject: safe.meta?.subject ?? "",
    pack,
    /* 数字事实只从数学 / 科学里挖：语文课「四个字落到课文」也会被量词规则命中，
       挖出来当条目就是「四个字落到课」这种半截话（第二十一轮第 3 条）。 */
    facts: pack.key === "math" || pack.key === "science" ? collectFacts(texts) : [],
    questions: segments.flatMap((s) => s.pauses ?? []).map((p) => scrubForbidden(String(p.question ?? "")).trim()).filter((q) => q.length > 1 && countVisibleChars(q) <= LINE_MAX),
    quotes: collectQuotes(texts),
    words: collectWords(texts, safe),
    board: collectBoard(safe),
    goals: [
      safe.objectives?.knowledge ?? "",
      safe.objectives?.process ?? "",
      safe.objectives?.emotion ?? "",
      safe.keyPoint ?? "",
      safe.hardPoint ?? ""
    ],
    hints: (safe.prep?.courseware ?? []).map((c) => String(c.searchHint ?? c.name ?? "").trim()).filter(Boolean),
    hardPoint: safe.hardPoint ?? "",
    must: safe.homework?.must ?? "",
    optional: safe.homework?.optional ?? "",
    scripts: segments.map((s) => String(s.script ?? "").trim()).filter(Boolean),
    limits,
    scale: scaleOf(safe.meta?.duration)
  };
}
function collectQuotes(text) {
  const found = [
    ...[...text.matchAll(/“([^“”\n]{4,22})”/g)].map((m) => m[1]),
    ...[...text.matchAll(/"([^"\n，。；：、]{4,20})"/g)].map((m) => m[1])
  ].map((s) => scrubForbidden(s).replace(/[？?]$/, "").trim()).filter(
    (s) => countVisibleChars(s) >= 4 && countVisibleChars(s) <= 16 && !NOT_QUOTE.test(s) && !isTeacherNoise(s)
  ).sort((a, b) => (/[，。]/.test(b) ? 1 : 0) - (/[，。]/.test(a) ? 1 : 0));
  return [...new Set(found)].slice(0, 6);
}
function collectWords(text, plan2) {
  const groups = [...text.matchAll(/[“"]([^“”\n"]{1,20})[”"]/g)].flatMap(
    (m) => m[1].split(/[、，,\/\s]+/)
  );
  const cards = (plan2?.prep?.physical ?? []).flatMap(
    (p) => String(p.name ?? "").split(/[、，,]/)
  );
  const words = [...groups, ...cards].map((w) => w.trim().replace(/等生字|等字|词语/g, "")).filter((w) => /^[\u3400-\u4DBF\u4E00-\u9FFF]{2,4}$/.test(w) && hitWords(w).length === 0);
  return [...new Set(words)].slice(0, 5);
}
function collectBoard(plan2) {
  const order = (plan2?.blackboard?.order ?? []).map((o) => String(o ?? ""));
  for (const line of order) {
    const tail = line.split(/[：:]/).pop() ?? "";
    if (/→|—|>/.test(tail)) {
      const chain = tail.split(/[→—>、，,]+/).map((c) => unquote(scrubForbidden(c))).filter(
        (c) => countVisibleChars(c) >= 2 && countVisibleChars(c) <= 6 && !isTeacherNoise(c)
      );
      if (chain.length >= 2) return chain.slice(0, 3);
    }
  }
  return order.map((o) => unquote(shortenPhrase(o, ITEM_MAX))).filter(
    (o) => o && !isTeacherNoise(o) && !/左侧|右侧|左边|右边|上方|下方|居中|写|字号|粉笔|位置|各用|各写|各说|一句话|说明/.test(o)
  ).slice(0, 3);
}
function collectFacts(text) {
  const out = [];
  const CONNECT = /[并和与能可就是要会理的把让对从向在为以及这那都也还又再不没而于的了着地得]/;
  const SHAPE = /^(?:[0-9０-９]{1,4}|[一二三四五六七八九十百千万两]+)(?:个|条|种|根|块|组|件|片|道|句|首|面|边|角)[\u4e00-\u9fff]{1,3}$/;
  for (const line of String(text ?? "").split(/[。；;\n]/)) {
    for (const m of line.matchAll(FACT_RE)) {
      let s = m[0].replace(/\s+/g, "").trim();
      while (s.length > 3 && CONNECT.test(s[s.length - 1])) s = s.slice(0, -1);
      const n = countVisibleChars(s);
      if (n < 2 || n > 8) continue;
      if (!SHAPE.test(s)) continue;
      if (isTeacherNoise(s)) continue;
      if (/^(?:[一1两2][节个]?课|[0-9一两二三四五六七八九十]+分钟|[0-9]+页)/.test(s)) continue;
      if (/[的了着地得是在和与或就而把被让从向对为以及于叫个底]$/.test(s)) continue;
      if (!out.includes(s)) out.push(s);
    }
  }
  return out.slice(0, 12);
}
function goalTasks(bits) {
  const topic = bits.topic || "\u8FD9\u4E00\u8BFE";
  const out = [];
  const add = (raw) => {
    const t = dropDangling(shortenPhrase(raw, ITEM_MAX));
    if (!t || countVisibleChars(t) < 4) return;
    if (out.some((x) => sentenceKey(x) === sentenceKey(t))) return;
    out.push(t);
  };
  const quote = bits.quotes[0] ?? "";
  const word = bits.words[0] ?? "";
  const chain = bits.board.filter((b) => b.trim().length > 0);
  const fact = bits.facts[0] ?? "";
  const must = clauseOf(bits.must, 6);
  const hard = clauseOf(bits.hardPoint, 8);
  if (quote) add(`\u8BFB\u300C${clipChars(quote, 6)}\u300D\uFF0C\u5708\u51FA\u5173\u952E\u8BCD`);
  else if (word) add(`\u8BFB\u51C6\u300C${clipChars(word, 4)}\u300D\u8FD9\u51E0\u4E2A\u8BCD`);
  else if (fact) add(`\u8BFB\u4E00\u8BFB ${clipChars(fact, 6)}`);
  if (chain.length >= 2) add(`\u7528\u300C${clipChars(chain[0], 4)}\u300D\u5230\u300C${clipChars(chain[1], 4)}\u300D\u8BF4\u987A\u5E8F`);
  else if (quote) add(`\u7528\u300C${clipChars(quote, 6)}\u300D\u8BF4\u4E00\u53E5\u8BDD`);
  if (must) add(`\u628A\u300C${must}\u300D\u505A\u5B8C`);
  else if (hard) add(`\u8BF4\u6E05${hard}`);
  if (out.length < 3 && quote) add(`\u6311\u300C${clipChars(quote, 6)}\u300D\u8BF4\u4E00\u53E5\u4E3A\u4EC0\u4E48`);
  if (out.length < 3 && word) add(`\u7528\u300C${clipChars(word, 4)}\u300D\u5199\u4E00\u53E5`);
  if (out.length < 3 && fact) add(`\u6570\u4E00\u6570 ${clipChars(fact, 6)}`);
  if (out.length < 3) add(`\u5728\u300A${clipChars(topic, 6)}\u300B\u91CC\u627E\u4E24\u5904\u8BC1\u636E`);
  if (out.length < 3) add(`\u8BF4\u6E05\u300A${clipChars(topic, 6)}\u300B\u8BB2\u7684\u90A3\u4EF6\u4E8B`);
  return out.slice(0, 3);
}
function asTask(title, kind) {
  const lead = TASK_LEAD[kind];
  const t = String(title ?? "").trim();
  if (!lead || !t || TITLE_VERB.test(t)) return t;
  if (/^(把|被|让|给|从|在|就|先|再|等|然后|同时|最后|如果|当)/.test(t)) return t;
  if (/[。！？；]/.test(t)) return t;
  return `${lead}${t}`;
}
function askPause(ask) {
  const bare = String(ask ?? "").replace(/\s+/g, "").replace(/[。；，、]+$/, "");
  const one = /[？?]$/.test(bare) ? bare : `${bare}\uFF1F`;
  return `${one}${PAUSE}`;
}
function joinWithin(list, max, sep = "\u3001") {
  let out = "";
  for (const raw of list) {
    const t = String(raw ?? "").replace(/^[①②③]\s*/, "").trim();
    if (!t) continue;
    const next = out ? `${out}${sep}${t}` : t;
    if (countVisibleChars(next) > max) continue;
    out = next;
  }
  return out;
}
function clauseOf(text, max) {
  const fit = titleFromText(text).find((c) => countVisibleChars(c) <= max);
  return fit ?? "";
}
function genericPage(kind, bits, variant = 0) {
  const topic = bits.topic || "\u8FD9\u4E00\u8BFE";
  const ask = pickQuestion(kind, bits);
  const q = (i) => bits.questions[i] ?? bits.questions[0] ?? ask;
  const spoken = (tail) => `\u4ECA\u5929\u6211\u4EEC\u5B66\u300A${topic}\u300B\u3002${tail}`;
  const tasks = goalTasks(bits);
  const keyClause = titleFromText(bits.goals[3] ?? "")[0];
  const hardClause = titleFromText(bits.hardPoint)[0];
  const boardLine = joinWithin(bits.board, TITLE_MAX, " \u2192 ");
  const boardTitle = boardLine || keyClause || topic;
  switch (kind) {
    case "cover":
      return {
        kind,
        title: topic,
        notes: spoken(`\u5148\u770B\u5C4F\u5E55\u4E0A\u8FD9\u51E0\u4E2A\u5B57\u3002${askPause(q(0))}\u5148\u731C\u4E00\u731C\uFF0C\u5B66\u5B8C \u8FD9\u4E00\u9875\u518D\u56DE\u6765\u8BF4\u3002`)
      };
    case "hook":
      return {
        kind,
        title: asTask(
          bits.hints[0] ? dropDangling(clipChars(bits.hints[0], TITLE_MAX)) || boardLine || topic : boardLine || topic,
          kind
        ),
        line: q(variant),
        ...bits.hints[0] ? { imageHint: bits.hints[0] } : {},
        notes: spoken(`\uFF08\u6295\u56FE\uFF09${askPause("\u4F60\u5728\u54EA\u513F\u89C1\u8FC7\u8FD9\u6837\u7684\u573A\u9762\uFF1F")}\u8BF4\u7ED9\u65C1\u8FB9\u7684\u4EBA\u542C\u3002`)
      };
    case "goals":
      return {
        kind,
        title: GOALS_TITLE,
        items: tasks.map((t, i) => `${"\u2460\u2461\u2462"[i]} ${t}`),
        /* 行尾必须是一句真问句：每页一个问句是硬判据，写成「一件做完，再动下一件」
           会让 ensureQuestion 往三条任务后面再塞两句，目标页变成五行字。 */
        line: q(0),
        notes: spoken(`\u8FD9\u8282\u8BFE\u505A\u4E09\u4EF6\u4E8B\uFF1A${tasks.join("\uFF1B")}\u3002\u4E00\u4EF6\u505A\u5B8C\uFF0C\u518D\u52A8\u4E0B\u4E00\u4EF6\u3002${askPause(q(0))}`)
      };
    case "words": {
      const words = bits.words.length >= 3 ? bits.words.slice(0, 4) : [.../* @__PURE__ */ new Set([topic, ...bits.board])].filter(Boolean).slice(0, 4);
      return {
        kind,
        title: asTask(`${CN_NUM2[words.length] ?? words.length}\u4E2A\u8BCD`, kind),
        items: words,
        line: ask,
        notes: `\u8DDF\u6211\u8BFB\u4E00\u904D\uFF1A${words.join("\u3001")}\u3002${askPause(ask)}\u8BFB\u4E0D\u51C6\u7684\u90A3\u4E2A\uFF0C\u5148\u8BB0\u4F4F\u5B83\u957F\u4EC0\u4E48\u6837\u3002`
      };
    }
    case "close-read": {
      const quote = bits.quotes[variant] ?? bits.quotes[0];
      const one = q(variant);
      const two = q(variant + 1);
      return {
        kind,
        title: asTask(quote ? shortenPhrase(quote, TITLE_MAX) : keyClause || topic, kind),
        ...quote ? { line: `\u201C${quote}\u201D` } : { line: one },
        ...two && two !== one && two !== quote ? { items: [two] } : {},
        notes: spoken(`\u8FD9\u4E00\u9875\u6162\u4E00\u70B9\u770B\u3002${askPause(quote ? one : two || one)}\u770B\u4E0D\u660E\u767D\u5C31\u5148\u8BFB\u4E00\u904D\uFF0C\u518D\u56DE\u6765\u8BF4\u3002`)
      };
    }
    case "compare": {
      const pair = bits.hardPoint.split(/[，,；;。]/).map((c) => unquote(shortenPhrase(c, ITEM_MAX))).filter((c) => countVisibleChars(c) >= 3 && !isTeacherNoise(c)).slice(0, 2);
      const items = pair.length === 2 ? pair : bits.facts.slice(0, 2);
      return {
        kind,
        title: asTask(joinWithin(items, TITLE_MAX, " / ") || hardClause || topic, kind),
        ...items.length ? { items } : {},
        line: ask,
        notes: `\u4E24\u8FB9\u5206\u5F00\u770B\uFF0C\u5148\u770B\u5DE6\u8FB9\uFF0C\u518D\u770B\u53F3\u8FB9\u3002${askPause(ask)}\u5148\u628A\u4E0D\u4E00\u6837\u7684\u90A3\u4E00\u70B9\u627E\u51FA\u6765\uFF0C\u4E0D\u7528\u6025\u7740\u8BF4\u5BF9\u9519\u3002`
      };
    }
    case "board": {
      const items = bits.board.map((w) => bits.facts.find((f) => f.includes(w))).filter((f) => Boolean(f));
      const chain = bits.board.map((w) => unquote(shortenPhrase(w, ITEM_MAX)).replace(/\s+/g, "")).filter(Boolean);
      const body = items.length >= 2 ? items : bits.facts.length ? bits.facts.slice(0, 3) : chain.slice(0, 3);
      return {
        kind,
        title: asTask(boardTitle, kind),
        ...body.length ? { items: body } : {},
        line: ask,
        notes: `\u8FD9\u51E0\u884C\u662F\u4E00\u8DEF\u8D70\u4E0B\u6765\u7684\u987A\u5E8F\u3002${askPause(ask)}\u524D\u9762\u5199\u7684\u90FD\u662F\u4E3A\u6700\u540E\u8FD9\u4E00\u884C\u94FA\u8DEF\uFF0C\u773C\u775B\u8DDF\u7740\u8D70\u4E00\u904D\u3002`
      };
    }
    case "drill":
      return {
        kind,
        title: asTask(hardClause || keyClause || topic, kind),
        // 页面上没有空，就不写「填」：写的是学生当下要做的两件事（任务 #3）
        // 两件都必须是学生一个人能立刻做的动作（TASKS/19a §2.4 第三条：不出现同桌 / 全班）
        items: ["\u2460 \u81EA\u5DF1\u5148\u8BD5\u4E00\u904D", "\u2461 \u505A\u5B8C\u4ECE\u5934\u518D\u67E5\u4E00\u904D"],
        ...bits.questions[variant] ? { line: bits.questions[variant] } : {},
        notes: `\u5148\u81EA\u5DF1\u8BD5\uFF0C\u8BD5\u5230\u54EA\u4E00\u6B65\u7B97\u54EA\u4E00\u6B65\u3002${askPause(ask)}\u5361\u4F4F\u5C31\u56DE\u4E0A\u4E00\u9875\u518D\u770B\u4E00\u904D\uFF0C\u522B\u6025\u7740\u4E3E\u624B\u95EE\u3002`
      };
    case "homework": {
      const mustLine = clauseOf(bits.must, TITLE_MAX);
      const optLine = clauseOf(bits.optional, TITLE_MAX);
      const mustItem = clauseOf(bits.must, 9);
      const optItem = clauseOf(bits.optional, 9);
      const items = [
        mustItem ? `\u5FC5\u505A\uFF5C${mustItem}` : "",
        optItem && optItem !== mustItem ? `\u9009\u505A\uFF5C${optItem}` : ""
      ].filter(Boolean);
      return {
        kind,
        title: asTask(mustLine || optLine || topic, kind),
        ...items.length ? { items } : {},
        line: ask,
        notes: `\u5FC5\u505A\u90A3\u6761\u4E09\u5206\u949F\u80FD\u505A\u5B8C\uFF1A${bits.must || "\u8BFE\u672C\u4E0A\u8FD9\u4E00\u8282"}\u3002\u9009\u505A\u4E0D\u7528\u957F\uFF0C${bits.optional || "\u81EA\u5DF1\u518D\u8BD5\u4E00\u6B21"}\u3002${askPause(ask)}\u4E0B\u8282\u8BFE\u6211\u4EEC\u5148\u770B\u8FD9\u4E00\u4EF6\u3002`
      };
    }
    case "quote": {
      const one = bits.quotes[variant] ?? bits.quotes[0];
      return one ? quoteSlideOf(one, topic) : { kind, title: topic, notes: quoteNotes("") };
    }
    case "end": {
      const taken = /* @__PURE__ */ new Set([boardTitle, topic]);
      const closing = [hardClause, keyClause].find((t) => t && !taken.has(t)) || bits.pack.closing(topic);
      return {
        kind,
        title: asTask(closing, kind),
        line: ask,
        notes: spoken(`\u4E0B\u8BFE\u4E4B\u524D\u628A\u8FD9\u4E00\u9875\u8BB0\u4F4F\uFF0C\u660E\u5929\u6765\u7684\u65F6\u5019\u544A\u8BC9\u6211\u4F60\u7684\u7B54\u6848\u3002${askPause(ask)}`)
      };
    }
  }
}
function pageOrderOf(bits) {
  if (bits.pack.hasWords) return SLIDE_PAGE_ORDER;
  return SLIDE_PAGE_ORDER.map((k) => k === "words" ? "close-read" : k);
}
function genericSlides(plan2, limits = DEFAULT_LIMITS) {
  const bits = readPlan(plan2, limits);
  const order = pageOrderOf(bits);
  return dedupePages(
    order.map((kind, i) => harden(genericPage(kind, bits, order.slice(0, i).filter((k) => k === kind).length), bits)),
    bits
  );
}
function isSentence(text) {
  return countVisibleChars(String(text ?? "")) >= 4;
}
function sentenceBook() {
  const used = /* @__PURE__ */ new Set();
  return {
    has: (text) => {
      const key = sentenceKey(text);
      return key.length > 0 && used.has(key);
    },
    take: (text) => {
      const key = sentenceKey(text);
      if (!key) return false;
      if (used.has(key)) return false;
      used.add(key);
      return true;
    }
  };
}
function absorb(book, slide) {
  for (const t of [slide.title, slide.line, ...slide.items ?? []]) book.take(t);
}
function dedupePages(slides2, bits) {
  if (slides2.length === 0) return slides2;
  const book = sentenceBook();
  const pool = [];
  const push = (q) => {
    const s = squeezeHan(String(q ?? "").trim());
    if (countVisibleChars(s) < 4) return;
    if (pool.some((p) => sentenceKey(p) === sentenceKey(s))) return;
    pool.push(s);
  };
  bits.questions.forEach(push);
  SLIDE_PAGE_ORDER.forEach((k) => push(pickQuestion(k, bits)));
  const pageTag = (kind, at) => {
    const base = asTask(SLIDE_LABELS[kind], kind);
    for (const out of [base, `${base}\uFF08\u7B2C ${at + 1} \u9875\uFF09`]) {
      if (!book.has(out)) {
        book.take(out);
        return out;
      }
    }
    return base;
  };
  const freshAsk = (kind, at) => {
    for (const q of bits.pack.pool(kind, bits.topic)) if (!book.has(q) && book.take(q)) return squeezeHan(q);
    for (const q of pool) if (!book.has(q) && book.take(q)) return q;
    return pageTag(kind, at);
  };
  const keep = (text) => !isSentence(text) || book.take(text);
  return slides2.map((s, i) => {
    if (s.kind === "quote") {
      book.take(s.title);
      book.take(s.text);
      return s;
    }
    const out = { ...s };
    if (!keep(out.title)) out.title = pageTag(out.kind, i);
    if (out.line && !keep(out.line)) out.line = freshAsk(out.kind, i);
    if (out.items?.length) {
      out.items = out.items.map((it) => keep(it) ? it : freshAsk(out.kind, i));
    }
    if (!hasAskable(out) && countVisibleChars([out.title, out.line, ...out.items ?? []].join("")) < 4) {
      const q = freshAsk(out.kind, i);
      const ask = /[？?]$/.test(q) ? q : `${q}\uFF1F`;
      out.items = [...out.items ?? [], ask].slice(0, 2);
    }
    return out;
  });
}
function isFragment(s) {
  return countVisibleChars(s) < 3 || /^[的了着地得]/.test(s) || /的$/.test(s) || /[了着]$/.test(s);
}
function quoteTitles(quote) {
  return String(quote ?? "").split(/[，,：:；;、！!？?]/).map((s) => s.trim()).filter((s) => {
    const n = countVisibleChars(s);
    return n >= 4 && n <= TITLE_MAX && !isFragment(s) && !isTeacherNoise(s) && !INSTRUCTION_LEAD.test(s) && /* 引文切出来的那一截也不许是半句：「还多一个」「也比不上家乡院子里的桂花。」 */
    !CLAUSE_LEAD.test(s) && !LEFTOVER_LEAD.test(s) && !HANG_TAIL.test(s) && !ORG_TALK.test(s) && !PAGE_LABEL_TITLE.test(s);
  }).sort((a, b) => countVisibleChars(b) - countVisibleChars(a));
}
function topicChars(text) {
  const out = /* @__PURE__ */ new Set();
  for (const ch of String(text ?? "")) {
    if (/[\u4e00-\u9fff]/.test(ch) && !TOPIC_STOP.has(ch)) out.add(ch);
  }
  return out;
}
function topicShare(a, b) {
  const A = topicChars(a);
  const B = topicChars(b);
  let n = 0;
  for (const ch of A) if (B.has(ch)) n++;
  return n;
}
function strongShare(a, b) {
  const A = topicChars(a);
  const B = topicChars(b);
  let n = 0;
  for (const ch of A) if (!WEAK_CHARS.has(ch) && B.has(ch)) n++;
  return n;
}
function segmentBeats(seg) {
  const beats = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (kind, raw, at) => {
    let s = scrubForbidden(String(raw ?? "").replace(/\s+/g, "")).trim();
    if (kind === "ask") {
      const cut = s.search(/[？?]/);
      if (cut < 0) return;
      s = s.slice(0, cut + 1);
      const open = Math.max(s.lastIndexOf("\u201C"), s.lastIndexOf('"'));
      if (open > 0 && /[：:]/.test(s[open - 1])) s = s.slice(open + 1);
    }
    s = s.replace(/^[：:，,、—－\-\s"“]+/, "").replace(/[。；;，,"”]+$/, "").trim();
    const oc = (s.match(/“/g) ?? []).length;
    const cc = (s.match(/”/g) ?? []).length;
    if (oc !== cc) s = s.replace(/[“”]/g, "");
    if ((s.match(/"/g) ?? []).length % 2 === 1) s = s.replace(/"/g, "");
    const n = countVisibleChars(s);
    if (n < 4 || n > (kind === "ask" ? LINE_MAX : LINE_MAX + 15)) return;
    if (isTeacherNoise(s)) return;
    if (kind === "def" && INSTRUCTION_LEAD.test(s)) return;
    if (kind === "def" && /[把将的了是着和与]$/.test(s)) return;
    if (/读准|范读|标出|圈出|画出|写出|默写|背诵|抄写|组词|造句|填空|回答/.test(s)) return;
    const key = sentenceKey(s);
    if (!key || seen.has(key)) return;
    seen.add(key);
    beats.push({ kind, text: s, at });
  };
  (seg.pauses ?? []).forEach((p, i) => push("ask", String(p.question ?? ""), 1e6 + i));
  for (const m of String(seg.script ?? "").matchAll(/[^。！？!?\n]+[。！？!?]?/g)) {
    const raw = m[0];
    const at = m.index ?? 0;
    const parts = raw.split(/——+/);
    parts.forEach((part, k) => {
      const piece = String(part ?? "").trim();
      if (!piece) return;
      push(/[？?]/.test(piece) ? "ask" : "def", piece, at + k * 1e-3);
    });
  }
  return beats;
}
function defTitle(text) {
  const s = tidyTitle(text).replace(/^(?:记住|注意|想一想|看)[：:，,]?/, "");
  const n = countVisibleChars(s);
  if (n < 3) return void 0;
  const ok = (t) => {
    if (/——|—|[？?！!]/.test(t)) return false;
    if (isFragment(t) || isTeacherNoise(t)) return false;
    if (ORG_TALK.test(t)) return false;
    if (DANGLING_TAIL.test(t) || HANG_TAIL.test(t)) return false;
    if (LEFTOVER_LEAD.test(t)) return false;
    if (META_TALK.test(t)) return false;
    if (/[：:]/.test(t)) return false;
    if (/你|我|咱/.test(t)) return false;
    const open = (t.match(/“/g) ?? []).length;
    const close = (t.match(/”/g) ?? []).length;
    if (open !== close) return false;
    return (t.match(/[\u4e00-\u9fff]/g) ?? []).length >= 3;
  };
  if (n <= TITLE_MAX && ok(s)) return s;
  return titleFromText(s)[0];
}
function digitMatch(a, b) {
  const da = a.match(/[0-9]+/g) ?? [];
  if (!da.length) return false;
  const db = b.match(/[0-9]+/g) ?? [];
  return da.every((n) => db.includes(n));
}
function askFromDef(text) {
  const s = String(text ?? "").replace(/[。；;，,]+$/, "").trim();
  if (countVisibleChars(s) < 4) return void 0;
  if (/^(?:可以|能|要|会|就|都|也|这|那)/.test(s)) return void 0;
  let m = s.match(/^(.{2,16}?)[，,]?\s*(?:由|靠|凭)([^，,。]{2,10}?)(?:决定|来定)$/);
  if (m) return `${m[1]}\u7531\u4EC0\u4E48\u51B3\u5B9A\uFF1F`;
  m = s.match(/^(.{2,14}?)(?:能|可以|要)?(?:分成|分为|有|剩下?)([0-9一二三四五六七八九十]+)([个条组种块面段只根扇句])$/);
  if (m) return `${m[1]}\u51E0${m[3]}\uFF1F`;
  m = s.match(/^([\u4e00-\u9fff、，,]{2,12}?)(?:，|,)?(?:就是|是)([\u4e00-\u9fff]{2,8})$/);
  if (m) return `${m[1]}\u662F\u4EC0\u4E48\uFF1F`;
  m = s.match(/^(.{2,12}?)([一二三四五六七八九十百千万0-9]+)([个条种块面组根段句座年岁层遍次天只位步])/);
  if (m) return `${m[1]}\u51E0${m[3]}\uFF1F`;
  return void 0;
}
function segmentQuotes(seg) {
  const text = [seg.script, seg.teacher, seg.student].join(" ");
  const out = [];
  for (const m of String(text ?? "").matchAll(/[“"]([^“”"\n]{4,24})[”"]/g)) {
    const s = scrubForbidden(m[1]).replace(/[”"]+$/, "").trim();
    const n = countVisibleChars(s);
    if (n < 4 || n > LINE_MAX) continue;
    if (isTeacherNoise(s) || /[？?]/.test(s)) continue;
    if (/——|—/.test(s)) continue;
    if (INSTRUCTION_LEAD.test(s) || /[把将的了是着和与]$/.test(s)) continue;
    if (/读准|范读|标出|圈出|画出|写出|默写|背诵|抄写|组词|造句|填空|回答/.test(s)) continue;
    if (!/[\u4e00-\u9fff]{4,}/.test(s.replace(/[（(][^）)]*[）)]/g, ""))) continue;
    if (out.some((q) => sentenceKey(q) === sentenceKey(s))) continue;
    out.push(s);
  }
  return out;
}
function segmentActions(seg) {
  const out = [];
  const push = (raw) => {
    const s = scrubForbidden(raw).replace(/^(?:再|先|然后|接着|一边|跟|一起|自己|小组|各自|两个人|两人|全班|同桌)+/, "").replace(/[。；;，,、：:\s]+$/, "").trim();
    const n = countVisibleChars(s);
    if (n < 3 || n > ITEM_MAX) return;
    if (!ACTION_HINT.test(s)) return;
    if (!ACT_LEAD.test(s)) return;
    if (TEACHER_GESTURE.test(s) || isTeacherNoise(s)) return;
    const open = (s.match(/“/g) ?? []).length;
    const close = (s.match(/”/g) ?? []).length;
    if (/[？?！!]/.test(s) || open !== close) return;
    if (out.some((a) => sentenceKey(a) === sentenceKey(s))) return;
    out.push(s);
  };
  for (const raw of String(seg.student ?? "").split(/[。；;\n，,：:]/)) push(raw);
  for (const m of String(seg.teacher ?? "").matchAll(
    /请(?:学生|同学们|大家|全班|同桌|两个|一位)?([^。；;”"？?：:]{2,24})/g
  )) {
    for (const part of String(m[1] ?? "").split(/[，,、]/)) push(part);
  }
  return out;
}
function segmentChunks(seg) {
  const out = [];
  for (const raw of String(seg.script ?? "").split(/[。；;！？!?\n]|——|—/)) {
    const s = scrubForbidden(raw).replace(/^(同学们|大家|孩子们|好)[，,、\s]*/, "").replace(/^[—－\-\s]+|[—－\-\s]+$/g, "").trim();
    const n = countVisibleChars(s);
    if (n < 4 || n > LINE_MAX) continue;
    if (isTeacherNoise(s)) continue;
    if (INSTRUCTION_LEAD.test(s) || /[把将的了是着和与]$/.test(s)) continue;
    out.push(s);
  }
  return out;
}
function segCtx(seg, index, bits) {
  const beats = segmentBeats(seg);
  const anchors = /* @__PURE__ */ new Map();
  for (const p of seg.pauses ?? []) {
    const q = sentenceKey(String(p.question ?? ""));
    const a = String(p.afterText ?? "").trim();
    if (q && countVisibleChars(a) >= 4) anchors.set(q, a);
  }
  return {
    seg,
    index,
    hint: bits.hints[index] ? dropDangling(clipChars(scrubForbidden(bits.hints[index]), HINT_MAX)) : "",
    beats,
    questions: beats.filter((b) => b.kind === "ask").map((b) => b.text),
    quotes: segmentQuotes(seg),
    chunks: segmentChunks(seg),
    actions: segmentActions(seg),
    anchors,
    sentences: String(seg.script ?? "").split(/[。！？!?\n]/).map((s) => s.trim()).filter((s) => countVisibleChars(s) >= 4),
    qi: 0
  };
}
function tidyTitle(raw) {
  return String(raw ?? "").replace(/\s+/g, "").replace(/^[—－\-、，,。；;：:]+|[—－\-、，,。；;：:]+$/g, "").trim();
}
function usableTitle(raw) {
  const s = tidyTitle(raw);
  const n = countVisibleChars(s);
  if (n < 3 || n > TITLE_MAX) return false;
  if ((s.match(/[\u4e00-\u9fff]/g) ?? []).length < 2) return false;
  if (isFragment(s) || isTeacherNoise(s)) return false;
  if (PAGE_LABEL_TITLE.test(s)) return false;
  if (ORG_TALK.test(s)) return false;
  if (ASK_LEAD.test(s)) return false;
  if (INSTRUCTION_LEAD.test(s) || VERB_LEAD.test(s)) return false;
  if (CLAUSE_LEAD.test(s) || GOAL_TALK.test(s)) return false;
  if (/[？?！!]/.test(s) || /——/.test(s)) return false;
  if (/[，,：:；;（）()]/.test(s)) return false;
  if (!listLike(s)) return false;
  if (DANGLING_TAIL.test(s) || HANG_TAIL.test(s)) return false;
  if (LEFTOVER_LEAD.test(s)) return false;
  const open = (s.match(/“/g) ?? []).length;
  const close = (s.match(/”/g) ?? []).length;
  if (open !== close) return false;
  if (META_TALK.test(s) || /你|我|咱/.test(s)) return false;
  if (/["“”]/.test(s)) return false;
  return true;
}
function listLike(s) {
  if (!s.includes("\u3001")) return true;
  const parts = s.split("\u3001");
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every((p) => /^[\u4e00-\u9fff0-9]{1,4}$/.test(p));
}
function titleFromText(text) {
  return String(text ?? "").split(/[，,。；;：:、！!？?\n（）()“”"｜—]+/).map((s) => tidyTitle(s)).filter(usableTitle).sort((a, b) => countVisibleChars(b) - countVisibleChars(a));
}
function titleFromAsk(ask) {
  const raw = tidyTitle(ask).replace(/^(?:那么|那|好|现在|接下来)?(?:你|我|咱|您|你们|我们|大家|同学们)/, "");
  const out = [];
  const def = raw.match(/^([^，,。；;]{2,14})[，,]?\s*(?:叫|叫做|就是|称为)/);
  if (def) out.push(def[1]);
  out.push(raw.split(/[，,]/)[0]);
  const cut = raw.search(ASK_CUT);
  if (cut >= 2) out.push(raw.slice(0, cut).replace(/(?:叫|叫做|就是|称为|是|有|要|该|个|这|那)$/, ""));
  const pred = raw.search(/(?:能|可以|会|要|分成|分为|叫做|叫|称为)/);
  if (pred >= 2) out.push(raw.slice(0, pred).replace(/(?:的|这个|那个)$/, ""));
  const obj = raw.match(/(?:什么|哪种|哪个|哪些|哪几)([\u4e00-\u9fff]{2,6})/);
  if (obj && !/^[个条件组种块面根段只位扇次遍句些]/.test(obj[1])) out.push(obj[1].replace(/[呢吗的吧啊呀]$/, ""));
  const num2 = raw.match(/(?:几|多少)(?:个|条|组|种|块|面|根|段|只|位|扇|次|遍|句)([\u4e00-\u9fff]{2,6})/);
  if (num2 && !/^[个条件组种块面根段只位扇次遍句些]/.test(num2[1])) out.push(num2[1].replace(/[呢吗的吧啊呀]$/, ""));
  const exact = raw.match(/(?:正好|刚好|一共|只有)([0-9一二三四五六七八九十]+[个条组种块面根只遍句])/);
  if (exact) out.push(exact[1]);
  const sense = raw.match(/^(?:闻到过|闻过|见过|看过|听过|尝过|摸过|读过|去过|玩过)([\u4e00-\u9fff]{2,8})$/);
  if (sense) out.push(sense[1].replace(/[呢吗的吧啊呀]$/, ""));
  const then = raw.match(/^(.{2,14}?)呢[？?]?$/);
  if (then) out.push(then[1].replace(/^(?:那|那么|要是|如果|再看|接着)+/, ""));
  const fin = [...new Set(out.map((t) => tidyTitle(t).replace(TRIM_VERB, "")))].filter(
    (s) => (usableTitle(s) || nounTitle(s)) && !TITLE_ASK.test(s)
  );
  return fin;
}
function nounTitle(s) {
  if (!/^[\u4e00-\u9fff]{2}$/.test(s)) return false;
  return ![...s].some((ch) => TOPIC_STOP.has(ch));
}
function sentenceBefore(ctx, ask) {
  const anchor = ctx.anchors.get(sentenceKey(ask));
  if (anchor) {
    const hit = ctx.sentences.find(
      (s) => sentenceKey(s).includes(sentenceKey(anchor).slice(0, 6)) || sentenceKey(anchor).includes(sentenceKey(s).slice(0, 6))
    );
    return hit ?? anchor;
  }
  const key = sentenceKey(ask).replace(/[的了吗呢]/g, "");
  const probe = key.slice(0, 8);
  if (!probe) return void 0;
  for (let i = 0; i < ctx.sentences.length; i++) {
    if (sentenceKey(ctx.sentences[i]).includes(probe)) {
      return i > 0 ? ctx.sentences[i - 1] : ctx.sentences[i];
    }
  }
  return void 0;
}
function sentenceAfter(ctx, ask) {
  const anchor = ctx.anchors.get(sentenceKey(ask));
  const pick = (i) => i >= 0 && i + 1 < ctx.sentences.length ? ctx.sentences[i + 1] : void 0;
  if (anchor) {
    const i = ctx.sentences.findIndex(
      (s) => sentenceKey(s).includes(sentenceKey(anchor).slice(0, 6)) || sentenceKey(anchor).includes(sentenceKey(s).slice(0, 6))
    );
    const hit = pick(i);
    if (hit) return hit;
  }
  const probe = sentenceKey(ask).slice(0, 8);
  if (!probe) return void 0;
  return pick(ctx.sentences.findIndex((s) => sentenceKey(s).includes(probe)));
}
function sharesWord(a, b) {
  const A = String(a ?? "").replace(/[^\u4e00-\u9fff]/g, "");
  const B = String(b ?? "").replace(/[^\u4e00-\u9fff]/g, "");
  if (A.length < 2 || B.length < 2) return false;
  for (let i = 0; i + 2 <= A.length; i++) if (B.includes(A.slice(i, i + 2))) return true;
  return false;
}
function bareAsk(text) {
  return sentenceKey(String(text ?? "")).replace(/[呢吗的吧啊呀么？?。，,、！!]/g, "");
}
function factsForAsk(ask, bits) {
  const digits = ask.match(/[0-9]+/g) ?? [];
  if (!digits.length) return [];
  return bits.facts.filter((f) => {
    const fd = f.match(/[0-9]+/g) ?? [];
    if (!digits.some((n) => fd.includes(n))) return false;
    return topicShare(f, ask) > 0;
  }).slice(0, 3);
}
function cleanAction(raw) {
  return scrubForbidden(raw).replace(/^(?:再|先|然后|接着|一边|跟|一起|自己|小组)+/, "").replace(/[。；;，,\s]+$/, "").trim();
}
function actionTitle(s) {
  const n = countVisibleChars(s);
  const open = (s.match(/“/g) ?? []).length;
  const close = (s.match(/”/g) ?? []).length;
  return n >= 3 && n <= TITLE_MAX && !/[？?！!]/.test(s) && // 引号只许成对：单边的「发现“比的不是花香」是从半句里切下来的
  open === close && /* 带人称的不是一律不要：「说说哪个字最让你觉得乐」是学生真要做的事；
     老师在对谁说话才不行——句首的请 / 让 / 叫，或「同学们」「大家」开头。 */
  !/^(?:请|让|叫|给)|^(?:同学们|大家|全班|同桌)/.test(s) && !/的$|[了着]$/.test(s) && !isTeacherNoise(s) && !ORG_TALK.test(s) && !LEFTOVER_LEAD.test(s) && !HANG_TAIL.test(s) && !PAGE_LABEL_TITLE.test(s);
}
function defPoints(text) {
  const out = [];
  const push = (raw) => {
    const s = tidyTitle(raw);
    const n = countVisibleChars(s);
    if (n < 2 || n > TITLE_MAX) return;
    if (!(usableTitle(s) || nounTitle(s))) return;
    if (TITLE_ASK.test(s)) return;
    if (out.some((o) => sentenceKey(o) === sentenceKey(s))) return;
    out.push(s);
  };
  push(defTitle(text));
  for (const clause of String(text ?? "").split(/[，,；;]/)) {
    const s = tidyTitle(clause);
    push(s);
    const named = s.match(/^(?:这|那)(?:就|正|便)?(?:是|叫|叫做|称为)(.{2,10})$/);
    if (named) push(named[1]);
    const noGroup = s.replace(/^(?:每组|每个|每家|每只|每样|每件|每人|每一)/, "");
    if (noGroup !== s) push(noGroup);
    const cut = s.replace(/^[^，,]{0,6}?(?:的时候|时)(?:是|要|就|都)/, "");
    if (cut !== s) push(cut);
    const said = s.match(/^(?:就|也|正|便)?(?:是|叫|叫做|称为)(?:我们|大家)?(?:说的|叫的)?(.{2,14})$/);
    if (said) push(said[1]);
  }
  return out;
}
function planSegment(ctx, bits) {
  const out = [];
  const used = /* @__PURE__ */ new Set();
  const claimed = /* @__PURE__ */ new Set();
  const bins = {
    quote: [],
    def: [],
    ask: [],
    act: []
  };
  const free = (t) => {
    const k = sentenceKey(String(t ?? ""));
    return !!k && !used.has(k);
  };
  const put = (slide, bin = "def") => {
    const texts = [slide.title, slide.line, ...slide.items ?? []].map((t) => String(t ?? "")).filter((t) => t.trim());
    if (new Set(texts.map(sentenceKey)).size !== texts.length) return false;
    if (!texts.every((t) => !used.has(sentenceKey(t)))) return false;
    texts.forEach((t) => used.add(sentenceKey(t)));
    out.push(slide);
    bins[bin].push(slide);
    return true;
  };
  const asks = ctx.beats.filter((b) => b.kind === "ask");
  const defs = ctx.beats.filter((b) => b.kind === "def");
  const freshAsk = () => asks.find((b) => free(b.text))?.text;
  const anchorOf = (ask) => ctx.anchors.get(sentenceKey(ask));
  const askNear = (def) => {
    const own = asks.find(
      (b) => free(b.text) && (() => {
        const a = anchorOf(b.text);
        if (a && (sharesWord(a, def) || sentenceKey(def).includes(sentenceKey(a).slice(0, 6)))) return true;
        return digitMatch(b.text, def) || strongShare(b.text, def) >= 2;
      })()
    );
    return own?.text;
  };
  const noteAsk = (own) => own ?? freshAsk() ?? asks[0]?.text ?? pickQuestion("drill", bits);
  if (bits.pack.key === "chinese") {
    for (const quote of ctx.quotes.slice(0, 2)) {
      const title = [...quoteTitles(quote), ...titleFromText(quote)].find((t) => t && free(t));
      if (!title) continue;
      const ask = asks.find((b) => free(b.text) && strongShare(b.text, quote) > 0)?.text ?? freshAsk();
      if (!ask) continue;
      put(
        {
          kind: "close-read",
          title,
          line: `\u201C${quote}\u201D`,
          items: [ask],
          notes: `\u628A\u8FD9\u4E00\u53E5\u8BFB\u51FA\u58F0\uFF0C\u6162\u4E00\u70B9\u3002${askPause(ask)}\u8BFB\u7684\u65F6\u5019\u76EF\u4F4F\u6700\u8981\u7D27\u7684\u90A3\u4E2A\u8BCD\uFF0C\u7B49\u4F1A\u513F\u8981\u95EE\u4E3A\u4EC0\u4E48\u504F\u504F\u662F\u5B83\u3002`
        },
        "quote"
      );
    }
  }
  const madeFrom = /* @__PURE__ */ new Map();
  for (const [i, def] of ctx.beats.entries()) {
    if (def.kind !== "def") continue;
    for (const title of defPoints(def.text)) {
      if ((madeFrom.get(i) ?? 0) >= 2) break;
      if (!free(title)) continue;
      const ask = askNear(def.text) ?? askFromDef(def.text) ?? askFromDef(title);
      if (!ask || !free(ask)) continue;
      if (bareAsk(title) === bareAsk(ask)) continue;
      const items = factsForAsk(ask, bits).filter(free).slice(0, 2);
      if (put(
        {
          kind: out.length === 0 ? "close-read" : "hook",
          title,
          line: ask,
          ...items.length ? { items } : {},
          notes: `\u5148\u770B\u8FD9\u53E5\u8BDD\uFF0C\u518D\u56DE\u7B54\u4E0B\u9762\u8FD9\u4E00\u95EE\u3002${askPause(ask)}\u7B54\u4E0D\u4E0A\u6765\u5C31\u56DE\u5230\u8FD9\u53E5\u8BDD\u91CC\u627E\u4E00\u4E2A\u8BCD\u3002`
        },
        "def"
      )) {
        madeFrom.set(i, (madeFrom.get(i) ?? 0) + 1);
        claimed.add(i);
      }
    }
  }
  for (const ask of asks) {
    if (!free(ask.text)) continue;
    const before = sentenceBefore(ctx, ask.text);
    const after = sentenceAfter(ctx, ask.text);
    const cands = [
      ...titleFromAsk(ask.text),
      ...before ? defPoints(before) : [],
      ...after ? defPoints(after) : []
    ];
    const title = cands.find((t) => t && free(t) && bareAsk(t) !== bareAsk(ask.text));
    if (!title) continue;
    const items = factsForAsk(ask.text, bits).filter(free).slice(0, 2);
    put(
      {
        kind: "hook",
        title,
        line: ask.text,
        ...items.length ? { items } : {},
        notes: `\u8FD9\u4E00\u9875\u5C31\u770B\u5C4F\u5E55\u4E0A\u7684\u5B57\u3002${askPause(ask.text)}\u60F3\u597D\u4E86\u5148\u8DDF\u540C\u684C\u8BF4\uFF0C\u518D\u70B9\u4E24\u4F4D\u5168\u73ED\u8BF4\u3002`
      },
      "ask"
    );
  }
  for (const [i, def] of ctx.beats.entries()) {
    if (def.kind !== "def" || claimed.has(i)) continue;
    for (const title of defPoints(def.text)) {
      if (!free(title)) continue;
      const ask = askFromDef(def.text) ?? askFromDef(title);
      if (!ask || !free(ask)) continue;
      if (bareAsk(title) === bareAsk(ask)) continue;
      if (put(
        {
          kind: "close-read",
          title,
          line: ask,
          notes: `\u8FD9\u53E5\u8BDD\u91CC\u6709\u4E00\u6837\u4E1C\u897F\u88AB\u6536\u8D77\u6765\u4E86\u3002${askPause(ask)}\u5148\u81EA\u5DF1\u60F3\uFF0C\u518D\u7FFB\u5F00\u770B\u5BF9\u4E0D\u5BF9\u3002`
        },
        "def"
      )) {
        claimed.add(i);
      }
      break;
    }
  }
  for (const act of [...new Set(ctx.actions.map(cleanAction))].filter(actionTitle)) {
    if (!free(act)) continue;
    const under = ctx.beats.find(
      (b) => b.kind === "def" && free(defTitle(b.text) ?? "") && strongShare(b.text, act) > 0
    );
    const underLine = under ? defTitle(under.text) : void 0;
    const quote = ctx.quotes.find((q) => free(q) && strongShare(q, act) > 0);
    const material = underLine && underLine !== act ? underLine : quote ? `\u201C${quote}\u201D` : void 0;
    if (!material) continue;
    const named = [...under ? defPoints(under.text) : [], ...quote ? quoteTitles(quote) : []].find(
      (t) => t && t !== act && free(t) && !BARE_ACTION_TITLE.test(t)
    );
    const ask = freshAsk();
    const page = (title) => ({
      kind: "drill",
      title,
      line: title !== act && quote ? `\u201C${quote}\u201D` : material,
      ...title !== act ? { items: [act] } : {},
      notes: `\u5148\u81EA\u5DF1\u52A8\u624B\uFF0C\u505A\u4E00\u904D\u518D\u62AC\u5934\u3002${askPause(noteAsk(ask))}\u505A\u5B8C\u548C\u540C\u684C\u6362\u7740\u770B\uFF0C\u8C01\u5148\u505A\u5B8C\u8C01\u7B49\u4E00\u7B49\u3002`
    });
    if (named && put(page(named), "act")) continue;
    put(page(act), "act");
  }
  const seq = [];
  const shift = (bin, n = 1) => {
    for (let k = 0; k < n; k++) {
      const s = bin.shift();
      if (s) seq.push(s);
    }
  };
  shift(bins.quote);
  shift(bins.def);
  shift(bins.act);
  shift(bins.ask);
  while (bins.def.length || bins.ask.length || bins.act.length || bins.quote.length) {
    shift(bins.def);
    shift(bins.quote);
    shift(bins.act);
    shift(bins.ask);
  }
  return seq;
}
function takePage(book, slide) {
  if (book.has(slide.title) || slide.line && book.has(slide.line)) return void 0;
  const items = (slide.items ?? []).filter((t) => !book.has(t));
  const page = items.length === (slide.items ?? []).length ? slide : { ...slide, items };
  [page.title, page.line, ...page.items ?? []].map((t) => String(t ?? "")).filter((t) => t.trim()).forEach((t) => book.take(t));
  return page;
}
function lessonSlides(plan2, limits = DEFAULT_LIMITS) {
  const bits = readPlan(plan2, limits);
  const segs = plan2?.segments ?? [];
  const head = [
    /* 封面是一堂课的「印影」（TASKS/25）：只有课题三个字、一张图、一行教材册次、一行班级。
       以前这里放一句提问（「题目里你认得哪几个字？」），投影一出来学生先看问题、
       不看课；问题留在口播稿里，上台再说。 */
    harden(
      {
        kind: "cover",
        title: bits.topic || "\u4ECA\u5929\u8FD9\u8282\u8BFE",
        notes: `\u4ECA\u5929\u8FD9\u4E00\u8282\u6211\u4EEC\u4ECE\u5934\u5230\u5C3E\u5B66\u5B8C\u300A${bits.topic || "\u8FD9\u4E00\u8BFE"}\u300B\u3002\u4E0A\u4E00\u8BFE\u7559\u4E0B\u7684\u95EE\u9898\uFF0C\u4ECA\u5929\u627E\u7B54\u6848\u3002${askPause(
          pickQuestion("cover", bits)
        )}\u5148\u522B\u7FFB\u4E66\uFF0C\u60F3\u4E00\u60F3\uFF0C\u7B49\u4F1A\u513F\u56DE\u6765\u8BF4\u3002`
      },
      bits
    ),
    harden(genericPage("goals", bits), bits)
  ];
  if (bits.pack.hasWords && bits.words.length >= 3) head.push(harden(genericPage("words", bits), bits));
  const tail = [
    harden(genericPage("board", bits), bits),
    harden(genericPage("homework", bits), bits),
    harden(genericPage("end", bits), bits)
  ];
  const book = sentenceBook();
  [...head, ...tail].forEach((s) => absorb(book, s));
  const ctxs = segs.map((seg, i) => segCtx(seg, i, bits));
  const drafts = ctxs.map((ctx) => planSegment(ctx, bits));
  const groups = ctxs.map(() => []);
  const assemble = () => settleClosing(collapseRepeats([...head, ...groups.flat(), ...tail]), bits);
  const fixed = head.length + tail.length;
  const segCount = Math.max(1, segs.length);
  const want = Math.max(
    3,
    Math.min(
      4,
      Math.ceil((limits.pagesMin - fixed) / segCount),
      Math.max(3, Math.floor((limits.pagesMax - fixed) / segCount))
    )
  );
  const fill = (i, target) => {
    for (const d of drafts[i]) {
      if (groups[i].length >= target) break;
      const page = takePage(book, d);
      if (page) groups[i].push(page);
    }
  };
  groups.forEach((_, i) => fill(i, want));
  const byMaterial = () => drafts.map((d, i) => ({ i, left: d.length - groups[i].length })).filter((x) => x.left > 0).sort((a, b) => b.left - a.left || a.i - b.i);
  for (let round = 0; round < 4 && assemble().length < limits.pagesMin; round++) {
    let added = false;
    for (const { i } of byMaterial()) {
      if (assemble().length >= limits.pagesMin) break;
      if (groups[i].length >= 4) continue;
      const before = groups[i].length;
      fill(i, before + 1);
      if (groups[i].length > before) added = true;
    }
    if (!added) break;
  }
  while (assemble().length > limits.pagesMax) {
    const pick = groups.map((g2, i) => ({ i, n: g2.length })).filter((x) => x.n > 3).sort((a, b) => b.n - a.n || b.i - a.i)[0];
    if (!pick) break;
    groups[pick.i].pop();
  }
  while (assemble().length > limits.pagesMax && groups.length > 0) {
    const last = groups[groups.length - 1];
    if (last.length > 1) {
      last.pop();
      continue;
    }
    if (groups.length === 1) break;
    groups.pop();
  }
  let pages = assemble();
  for (let guard2 = 0; guard2 < 8 && pages.length < limits.pagesMin; guard2++) {
    const order = byMaterial();
    if (!order.length) break;
    const { i } = order[0];
    const before = groups[i].length;
    fill(i, before + 1);
    if (groups[i].length === before) break;
    pages = assemble();
    if (pages.length > limits.pagesMax) {
      groups[i].pop();
      pages = assemble();
      break;
    }
  }
  return pages;
}
function collapseRepeats(pages) {
  const kept = [];
  const cores = [];
  const skipKinds = /* @__PURE__ */ new Set(["cover", "goals", "words", "board", "homework", "end"]);
  for (const p of pages) {
    const ask = String(p.line ?? "");
    const core = /[？?]/.test(ask) && !skipKinds.has(p.kind) ? topicChars(ask) : /* @__PURE__ */ new Set();
    if (core.size >= 4) {
      const dup = cores.some((prev) => {
        const shared = [...core].filter((c) => prev.has(c)).length;
        return shared >= 4 && shared >= 0.55 * Math.min(core.size, prev.size);
      });
      if (dup) continue;
    }
    if (core.size) cores.push(core);
    kept.push(p);
  }
  return kept;
}
function settleClosing(pages, bits) {
  const seen = /* @__PURE__ */ new Set();
  const key = (t) => sentenceKey(String(t ?? ""));
  return pages.map((p) => {
    const own = key(p.title);
    const clash = seen.has(own);
    [p.title, p.line, ...p.items ?? []].forEach((t) => seen.add(key(t)));
    if (!clash || p.kind !== "end" && p.kind !== "board") return p;
    const alt = bits.pack.closing(bits.topic);
    seen.add(key(alt));
    return { ...p, title: alt };
  });
}
function deriveNotes(kind, bits) {
  const ask = bits.questions[0] ?? pickQuestion(kind, bits);
  const script = bits.scripts[0] ? shortenPhrase(bits.scripts[0], 60) : "";
  return `${script ? script + " " : ""}\u8FD9\u4E00\u9875\u5C31\u770B\u7740\u5C4F\u5E55\u4E0A\u7684\u5B57\uFF0C${ask} \u60F3\u4E0D\u6E05\u7684\u8BDD\uFF0C\u56DE\u5230\u8BFE\u6587\u91CC\u627E\u90A3\u53E5\u8BDD\u3002`;
}
function getBuiltinStudentSlides(plan2, limits = DEFAULT_LIMITS) {
  return dropBarePages(rawStudentSlides(plan2, limits));
}
function dropBarePages(pages) {
  const bare = (s) => {
    const kind = s?.kind;
    if (!s || kind === "cover" || kind === "quote" || kind === "end") return false;
    const body = [s.line ?? "", ...s.items ?? []].join(" ").trim();
    return countVisibleChars(body) < 4;
  };
  const kept = pages.filter((s) => !bare(s));
  return kept.length >= 8 ? kept : pages;
}
function rawStudentSlides(plan2, limits) {
  const bits = readPlan(plan2, limits);
  if (bits.scale === "lesson")
    return withCoverMeta(withMotif(withQuotes(lessonSlides(plan2, limits), plan2, limits), plan2?.meta?.subject), plan2);
  const topic = String(plan2?.meta?.topic ?? "");
  const hit = BUILTIN_MATCHERS.find((e) => e.pattern.test(topic));
  const data = hit?.load() ?? null;
  if (data && data.length > 0) {
    return withCoverMeta(
      withMotif(withQuotes(fitPageCount(data.map((s) => harden(s, bits)), bits), plan2, limits), plan2?.meta?.subject),
      plan2
    );
  }
  return withCoverMeta(withMotif(withQuotes(genericSlides(plan2, limits), plan2, limits), plan2?.meta?.subject), plan2);
}
function withMotif(slides2, subject) {
  const key = motifOf(subject);
  return slides2.map((s) => s.kind === "cover" && s.motif !== key ? { ...s, motif: key } : s);
}
function withCoverMeta(slides2, plan2) {
  const m = plan2?.meta ?? {};
  const txt = (v2) => String(v2 ?? "").trim();
  const grade = txt(m.grade);
  const stage = txt(m.stage);
  const subject = txt(m.subject);
  const text = [stage + subject || subject, grade ? grade + volumeOf(plan2) : ""].filter(Boolean).join(" \xB7 ");
  return slides2.map((s) => {
    if (s.kind !== "cover") return s;
    const meta = s.meta?.trim() || text;
    const byline = s.byline?.trim() || (grade ? `${grade}\u3000\u3000\u73ED` : "");
    if (meta === s.meta && byline === s.byline) return s;
    return {
      ...s,
      ...meta ? { meta } : {},
      ...byline ? { byline } : {}
    };
  });
}
function volumeOf(plan2, now = /* @__PURE__ */ new Date()) {
  const m = plan2?.meta ?? {};
  const said = `${String(m.textbook ?? "")} ${String(m.period ?? "")} ${String(m.grade ?? "")}`;
  const hit = said.match(/([上下])\s*册/);
  if (hit) return `${hit[1]}\u518C`;
  const month = now.getMonth() + 1;
  return month >= 9 || month <= 1 ? "\u4E0A\u518C" : "\u4E0B\u518C";
}
function trimOneContentPage(pages) {
  for (const kind of QUOTE_TRIM_ORDER) {
    for (let i = pages.length - 1; i >= 0; i--) {
      if (pages[i].kind === kind) {
        pages.splice(i, 1);
        return true;
      }
    }
  }
  return false;
}
function flatText(text) {
  return String(text ?? "").replace(/\s+/g, "");
}
function dropUnverifiedQuotes(slides2, plan2) {
  if (!slides2.some((s) => s.kind === "quote")) return slides2;
  const source = flatText(plan2?.meta?.text);
  return slides2.filter((s) => {
    if (s.kind !== "quote") return true;
    if (!source) return false;
    const one = flatText(s.text ?? s.title);
    return one.length > 0 && source.includes(one);
  });
}
function joinQuote(a, b) {
  return JOIN_TAIL.test(a) || JOIN_HEAD.test(b) ? a + b : `${a}\uFF0C${b}`;
}
function mergeHalfQuotes(slides2) {
  if (slides2.length < 2) return slides2;
  const out = [];
  const sealed = /* @__PURE__ */ new Set();
  let merged = false;
  for (const s of slides2) {
    const at = out.length - 1;
    const prev = out[at];
    const a = String(prev?.text ?? prev?.title ?? "").trim();
    const b = String(s?.text ?? s?.title ?? "").trim();
    const ka = sentenceKey(a);
    const kb = sentenceKey(b);
    const bothQuote = prev?.kind === "quote" && s?.kind === "quote" && Boolean(a) && Boolean(b);
    if (bothQuote && kb.length >= CONTAIN_MIN && ka.includes(kb)) {
      merged = true;
      continue;
    }
    if (bothQuote && ka.length >= CONTAIN_MIN && kb.includes(ka)) {
      out[at] = { ...s, title: b, text: b };
      merged = true;
      continue;
    }
    if (bothQuote && !sealed.has(at) && !QUOTE_ENDED.test(a) && countVisibleChars(joinQuote(a, b)) <= QUOTE_BODY_MAX) {
      const one = joinQuote(a, b);
      out[at] = { ...prev, title: one, text: one };
      sealed.add(at);
      merged = true;
      continue;
    }
    out.push(s);
  }
  return merged ? out : slides2;
}
function withQuotes(slides2, plan2, limits = DEFAULT_LIMITS) {
  const merged = mergeHalfQuotes(dropUnverifiedQuotes(slides2, plan2));
  const list = merged;
  const quotes = splitQuotes(String(plan2?.meta?.text ?? ""));
  if (quotes.length === 0 || list.length === 0) return list;
  const taken = [];
  for (const s of list) for (const t of pageSentences(s)) {
    const k = sentenceKey(t);
    if (k) taken.push(k);
  }
  const covered = (q) => {
    const k = sentenceKey(q);
    if (k.length < 6) return taken.includes(k);
    return taken.some((t) => t === k || t.includes(k));
  };
  const quota = Math.min(QUOTE_PAGE_MAX, Math.max(1, Math.ceil(limits.pagesMax * 0.3)));
  const picked = quotes.filter((q) => countVisibleChars(q) <= QUOTE_BODY_MAX && !covered(q)).slice(0, quota);
  if (picked.length === 0) return list;
  const topic = String(plan2?.meta?.topic ?? "");
  const anchors = list.map((_, i) => i).filter((i) => !QUOTE_NO_ANCHOR.has(list[i].kind));
  const slots = anchors.length > 0 ? anchors : [0];
  const count = Math.min(picked.length, slots.length);
  const buckets = /* @__PURE__ */ new Map();
  for (let k = 0; k < count; k++) {
    const pos = Math.floor((k + 0.5) * slots.length / count);
    const at = slots[Math.min(slots.length - 1, Math.max(0, pos))];
    buckets.set(at, [...buckets.get(at) ?? [], picked[k]]);
    const key = sentenceKey(picked[k]);
    if (key) taken.push(key);
  }
  const out = [];
  list.forEach((s, i) => {
    out.push(s);
    for (const one of buckets.get(i) ?? []) out.push(quoteSlideOf(one, topic));
  });
  while (out.length > limits.pagesMax && trimOneContentPage(out)) {
  }
  const quoteCount = out.filter((s) => s.kind === "quote").length;
  if (quoteCount / limits.pagesMin >= QUOTE_MIN_SHARE) {
    while (out.length > limits.pagesMin && quoteCount / out.length < QUOTE_MIN_SHARE) {
      if (!trimOneContentPage(out)) break;
    }
  }
  return out;
}
function bulletBody(raw) {
  const clean2 = dropDangling(scrubForbidden(String(raw ?? ""))).replace(/\s+/g, "");
  const bar = Math.max(clean2.indexOf("\uFF5C"), clean2.indexOf("|"));
  return (bar >= 0 ? clean2.slice(bar + 1) : clean2).trim();
}
function fitClause(text, max) {
  const clean2 = String(text ?? "").trim();
  if (!clean2) return "";
  if (countVisibleChars(clean2) <= max) return clean2;
  const ok = (p) => {
    const n = countVisibleChars(p);
    if (n < 3 || n > max) return false;
    if (isTeacherNoise(p) || TEACHER_ADDRESS.test(p) || HALF_LEAD.test(p) || DECK_META.test(p)) return false;
    if ((p.match(/“/g) ?? []).length !== (p.match(/”/g) ?? []).length) return false;
    if (findTeacherWords(p).length || tasteProblems(p).length) return false;
    return true;
  };
  const parts = clean2.split(/[，,；;。！？：]+/).map((p) => dropDangling(p.trim())).filter(ok);
  const action = parts.find((p) => TITLE_VERB.test(p) && countVisibleChars(p) >= 6);
  if (action) return action;
  return parts.sort((a, b) => countVisibleChars(b) - countVisibleChars(a))[0] ?? "";
}
function studentLine(raw) {
  const clean2 = dropDangling(scrubForbidden(String(raw ?? ""))).replace(/\s+/g, "").replace(/^(必做|选做|必|选)[｜|]?/, "").trim();
  if (!clean2 || /…|——/.test(clean2)) return "";
  if (countVisibleChars(clean2) < 4) return "";
  if (/[？?]/.test(clean2)) return "";
  if (TEACHER_ADDRESS.test(clean2) || HALF_LEAD.test(clean2) || DECK_META.test(clean2)) return "";
  if ((clean2.match(/“/g) ?? []).length !== (clean2.match(/”/g) ?? []).length) return "";
  if (isTeacherNoise(clean2)) return "";
  if (STAGE_TITLE.test(clean2) || TITLE_GUESS.test(clean2)) return "";
  if (findTeacherWords(clean2).length) return "";
  if (tasteProblems(clean2).length) return "";
  return fitClause(clean2, ITEM_MAX);
}
function studentTitle(raw) {
  const clean2 = dropDangling(scrubForbidden(String(raw ?? ""))).replace(/\s+/g, "").replace(/^(必做|选做|必|选)[｜|]?/, "").trim();
  if (!clean2 || /…|——|[？?]/.test(clean2)) return "";
  if (countVisibleChars(clean2) < 4) return "";
  if (TEACHER_ADDRESS.test(clean2)) return "";
  if (STAGE_TITLE.test(clean2) || TITLE_GUESS.test(clean2)) return "";
  if (isTeacherNoise(clean2) || findTeacherWords(clean2).length) return "";
  if (tasteProblems(clean2).length) return "";
  const title = fitClause(clean2, TITLE_MAX);
  if (!title || !TITLE_VERB.test(title)) return "";
  return title;
}
function boardLinesOf(bodies) {
  const out = [];
  for (const body of bodies) {
    const tail = body.split(/[：:]/).pop() ?? "";
    const chain = tail.split(/[→—>]+/).map((s) => s.split(/[，,。；;]/)[0].trim());
    if (chain.length < 2) continue;
    for (const piece of chain) {
      const t = unquote(piece).replace(/\s+/g, "");
      const n = countVisibleChars(t);
      if (n < 2 || n > WORDS_ITEM_MAX) continue;
      if (/写|居中|上方|下方|括号|标|行|字/.test(t)) continue;
      if (out.includes(t)) continue;
      out.push(t);
    }
  }
  return out.slice(0, 5);
}
function homeworkLinesOf(bullets) {
  const out = [];
  for (const raw of bullets) {
    const text = String(raw ?? "").trim();
    const compulsory = /^(必做|必)/.test(text);
    const optional = /^(选做|选)/.test(text);
    const body = dropDangling(scrubForbidden(text.replace(/^(必做|选做|必|选)\s*[｜|]\s*/, "")));
    const line = fitClause(body, ITEM_MAX);
    if (!line) continue;
    out.push(`${compulsory ? "\u5FC5\u505A\uFF5C" : optional ? "\u9009\u505A\uFF5C" : ""}${line}`);
  }
  return out.slice(0, 2);
}
function deckMaterial(deck) {
  const mat = { cover: "", words: [], lines: [], tasks: [], board: null, homework: null };
  const seen = /* @__PURE__ */ new Set();
  const putWord = (w) => {
    const t = unquote(String(w ?? "")).replace(/\s+/g, "");
    const n = countVisibleChars(t);
    if (n < 2 || n > WORDS_ITEM_MAX) return;
    if (!/^[\u4e00-\u9fa5]+$/.test(t)) return;
    if (mat.words.includes(t)) return;
    mat.words.push(t);
  };
  (deck ?? []).forEach((page, at) => {
    if (!page || !String(page.title ?? "").trim() || isTeacherPage(page)) return;
    const title = dropDangling(scrubForbidden(page.title)).replace(/\s+/g, "");
    if (page.kind === "cover") mat.cover = title;
    const bodies = page.kind === "cover" ? [] : [...(page.bullets ?? []).map(bulletBody), bulletBody(page.question ?? "")].filter(Boolean);
    if (page.kind === "board") {
      mat.board = { at, title, items: boardLinesOf(bodies) };
      return;
    }
    if (page.kind === "homework") {
      mat.homework = { at, title, items: homeworkLinesOf(page.bullets ?? []) };
      return;
    }
    const task = studentTitle(title);
    if (task) mat.tasks.push({ at, text: task });
    for (const body of bodies) {
      for (const m of body.matchAll(/[“"]([^”"]{2,6})[”"]/g))
        for (const w of String(m[1]).split(/[、，,\s]+/)) putWord(w);
      const line = studentLine(body);
      if (!line) continue;
      const key = sentenceKey(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      mat.lines.push({ at, text: line, from: page.kind });
    }
  });
  return mat;
}
function deckNotes(kind, topic, title) {
  switch (kind) {
    case "cover":
      return `\u4ECA\u5929\u8FD9\u4E00\u8282\u5B66\u300A${topic}\u300B\u3002\u5148\u770B\u5C4F\u5E55\u4E0A\u8FD9\u51E0\u4E2A\u5B57\uFF0C\u8BFB\u4E00\u904D\u9898\u76EE\uFF0C\u628A\u4E0D\u8BA4\u8BC6\u7684\u5B57\u5708\u51FA\u6765\uFF0C\u5708\u5B8C\u4E3E\u624B\u3002`;
    case "goals":
      return "\u8FD9\u4E00\u8282\u505A\u4E09\u4EF6\u4E8B\u3002\u4E00\u4EF6\u505A\u5B8C\u518D\u505A\u4E0B\u4E00\u4EF6\uFF0C\u505A\u5B8C\u7684\u5728\u65C1\u8FB9\u753B\u4E2A\u52FE\uFF0C\u4E09\u4EF6\u90FD\u6253\u5B8C\u518D\u5F80\u4E0B\u8D70\u3002";
    case "words":
      return "\u5C4F\u5E55\u4E0A\u8FD9\u4E9B\u8BCD\uFF0C\u4E00\u4E2A\u4E00\u4E2A\u8BFB\u8FC7\u53BB\u3002\u8BFB\u9519\u7684\u90A3\u4E2A\u5148\u505A\u4E2A\u8BB0\u53F7\uFF0C\u7B49\u4E00\u4F1A\u513F\u518D\u8BFB\u4E00\u904D\u3002";
    case "board":
      return "\u9ED1\u677F\u8FD9\u51E0\u884C\u662F\u4E00\u8DEF\u8D70\u4E0B\u6765\u7684\u987A\u5E8F\u3002\u773C\u775B\u8DDF\u7740\u8D70\u4E00\u904D\uFF0C\u518D\u628A\u5B83\u4EEC\u8FDE\u8D77\u6765\u8BF4\u4E00\u53E5\u3002";
    case "homework":
      return "\u4ECA\u5929\u56DE\u53BB\u4E24\u4EF6\u4E8B\u3002\u5FC5\u505A\u7684\u90A3\u4E00\u4EF6\u5148\u505A\u5B8C\uFF0C\u9009\u505A\u7684\u5199\u4E24\u4E09\u53E5\u5C31\u591F\u3002";
    case "end":
      return "\u4E0B\u8BFE\u4E4B\u524D\u628A\u8FD9\u4E00\u9875\u8BB0\u4F4F\u3002\u660E\u5929\u6765\u65F6\uFF0C\u7528\u4E00\u53E5\u8BDD\u8BF4\u6E05\u8FD9\u4E00\u8282\u7559\u4E0B\u4E86\u4EC0\u4E48\u3002";
    case "drill":
      return "\u5148\u81EA\u5DF1\u8BD5\uFF0C\u8BD5\u5230\u54EA\u4E00\u6B65\u7B97\u54EA\u4E00\u6B65\u3002\u5361\u4F4F\u5C31\u56DE\u4E0A\u4E00\u9875\u518D\u770B\u4E00\u904D\uFF0C\u522B\u6025\u7740\u4E3E\u624B\u3002";
    default:
      return `\u8FD9\u4E00\u9875\u6162\u4E00\u70B9\u8BFB\u3002${title}\u3002\u8BFB\u5B8C\u62AC\u5934\uFF0C\u7B49\u4E00\u7B49\uFF0C\u518D\u8BF4\u4F60\u7684\u7B54\u6848\u3002`;
  }
}
function rebuildFromDeck(mat, bits, limits) {
  const topic = bits.topic || "\u8FD9\u4E00\u8BFE";
  const used = /* @__PURE__ */ new Set();
  const free = (text) => {
    const key = sentenceKey(text);
    if (!key) return true;
    if (used.has(key)) return false;
    used.add(key);
    return true;
  };
  const pages = [];
  const units = [];
  const coverTitle = clipChars(dropDangling(scrubForbidden(mat.cover)) || `\u300A${topic}\u300B`, TITLE_MAX);
  pages.push({
    kind: "cover",
    title: coverTitle,
    line: "\u5148\u770B\u9898\u76EE\uFF0C\u628A\u4E0D\u8BA4\u8BC6\u7684\u5B57\u5708\u51FA\u6765",
    notes: deckNotes("cover", topic, coverTitle)
  });
  const goals = mat.lines.filter((l) => l.from === "objectives").map((l) => l.text).filter(free);
  if (goals.length >= 2) {
    const items = goals.slice(0, 3);
    pages.push({
      kind: "goals",
      title: GOALS_TITLE,
      items: items.map((t, i) => `${"\u2460\u2461\u2462"[i]} ${t}`),
      notes: `\u8FD9\u4E00\u8282\u505A\u4E09\u4EF6\u4E8B\uFF1A${items.join("\uFF1B")}\u3002\u4E00\u4EF6\u505A\u5B8C\u518D\u505A\u4E0B\u4E00\u4EF6\uFF0C\u505A\u5B8C\u7684\u5728\u65C1\u8FB9\u753B\u4E2A\u52FE\u3002`
    });
  }
  if (mat.words.length >= 3) {
    const words = mat.words.slice(0, WORDS_ITEMS_MAX);
    pages.push({
      kind: "words",
      title: "\u8FD9\u51E0\u4E2A\u8BCD\uFF0C\u5148\u8BFB\u51C6",
      line: "\u6328\u4E2A\u8BFB\u4E00\u904D\uFF0C\u8BFB\u9519\u7684\u505A\u4E2A\u8BB0\u53F7",
      items: words,
      notes: `\u5C4F\u5E55\u4E0A\u8FD9 ${words.length} \u4E2A\u8BCD\uFF0C\u4E00\u4E2A\u4E00\u4E2A\u8BFB\u8FC7\u53BB\u3002\u8BFB\u9519\u7684\u90A3\u4E2A\u5148\u505A\u4E2A\u8BB0\u53F7\uFF0C\u7B49\u4E00\u4F1A\u513F\u518D\u8BFB\u4E00\u904D\u3002`
    });
  }
  const titleAt = /* @__PURE__ */ new Map();
  for (const t of mat.tasks) titleAt.set(t.at, t.text);
  const rows = [];
  const ats = [...new Set(mat.lines.filter((l) => l.from !== "objectives").map((l) => l.at))].sort(
    (a, b) => a - b
  );
  let closeReads = 0;
  const kindOf = (from) => {
    if (from === "activity" || from === "assessment") return "drill";
    if (closeReads >= limits.closeReadMax) return "drill";
    closeReads += 1;
    return "close-read";
  };
  const put = (at, kind, title, items) => {
    rows.push({
      at,
      slide: {
        kind,
        title,
        ...items.length ? { items } : {},
        /* 不补「先自己试一遍」这类口令：五页 drill 会撞成同一句，一句只能上一次台 */
        notes: deckNotes(kind, topic, title)
      }
    });
  };
  for (const at of ats) {
    const lines2 = mat.lines.filter((l) => l.at === at && l.from !== "objectives");
    const pageTitle = titleAt.get(at) ?? "";
    if (pageTitle && free(pageTitle)) {
      const kind = kindOf(lines2[0]?.from ?? "segmentPoint");
      const items = lines2.map((l) => l.text).filter(free).slice(0, 2);
      put(at, kind, pageTitle, items);
      continue;
    }
    for (const line of lines2) {
      if (!STUDENT_ACTION.test(line.text)) continue;
      const guess = studentTitle(asTask(line.text, "close-read"));
      if (!guess || !free(guess)) continue;
      put(at, kindOf(line.from), guess, []);
    }
  }
  const budget = Math.max(3, limits.pagesMax - 6);
  const body = [];
  for (const row of rows) {
    const prev = body[body.length - 1];
    if (body.length >= budget && prev && (prev.items ?? []).length < limits.itemsMax) {
      body[body.length - 1] = { ...prev, items: [...prev.items ?? [], row.slide.title].slice(0, limits.itemsMax) };
      continue;
    }
    body.push(row.slide);
  }
  pages.push(...body);
  if (mat.board) {
    const title = studentTitle(asTask(mat.board.title, "board")) || "\u770B\u8FD9\u4E00\u8BFE\uFF0C\u843D\u5728\u8FD9\u51E0\u884C\u5B57\u4E0A";
    units.push({
      at: mat.board.at,
      slide: {
        kind: "board",
        title,
        ...mat.board.items.length ? { items: mat.board.items } : {},
        notes: deckNotes("board", topic, title)
      }
    });
  }
  if (mat.homework) {
    const title = studentTitle(mat.homework.title) || "\u8BFE\u540E\u505A\u4E24\u4EF6\u4E8B";
    units.push({
      at: mat.homework.at,
      slide: {
        kind: "homework",
        title,
        ...mat.homework.items.length ? { items: mat.homework.items } : {},
        notes: deckNotes("homework", topic, title)
      }
    });
  }
  pages.push(...units.sort((a, b) => a.at - b.at).map((u) => u.slide));
  const end = "\u8BF4\u4E00\u53E5\u8FD9\u4E00\u8BFE\u8BB0\u4F4F\u4E86\u4EC0\u4E48";
  if (free(end)) {
    pages.push({ kind: "end", title: end, notes: deckNotes("end", topic, end) });
  }
  return pages;
}
function splitToFill(pages, limits, topic) {
  const out = pages.slice();
  let guard2 = 0;
  while (out.length < limits.pagesMin && guard2++ < 40) {
    let at = -1;
    out.forEach((s, i) => {
      const n = (s.items ?? []).length;
      if (n < 2) return;
      if (s.kind === "cover" || s.kind === "goals" || s.kind === "words") return;
      if (at < 0 || n > (out[at].items ?? []).length) at = i;
    });
    if (at < 0) break;
    const src = out[at];
    const items = src.items ?? [];
    const tail = items[items.length - 1];
    const head = items.slice(0, -1);
    const kind = src.kind === "board" || src.kind === "homework" ? "drill" : src.kind;
    out.splice(
      at,
      1,
      { ...src, items: head.length ? head : void 0 },
      {
        kind,
        title: studentTitle(asTask(tail, kind)) || SLIDE_LABELS[kind],
        notes: deckNotes(kind, topic, tail)
      }
    );
  }
  return out;
}
function quietSlides(slides2) {
  return slides2.map((s) => {
    if (s.kind === "quote") return s;
    const line = String(s.line ?? "");
    if (!/[？?]/.test(line)) return s;
    const next = { ...s, line: void 0 };
    return hasAskable(next) ? next : s;
  });
}
function slidesFromDeckProblems() {
  return lastDeckProblems;
}
function slidesFromDeck(deck, plan2, limits = DEFAULT_LIMITS) {
  const mat = deckMaterial(deck);
  const bits = readPlan(plan2, limits);
  const topic = bits.topic || "\u8FD9\u4E00\u8BFE";
  const rebuilt = splitToFill(rebuildFromDeck(mat, bits, limits), limits, topic);
  const deduped = withQuotes(rebuilt, plan2, limits);
  if (deduped.length < limits.pagesMin) {
    lastDeckProblems = [
      `\u8FD9\u53E0\u8BFE\u4EF6\u53EA\u635E\u5F97\u51FA ${deduped.length} \u9875\u5B66\u751F\u80FD\u7528\u7684\u7D20\u6750\uFF08\u4E0B\u9650 ${limits.pagesMin} \u9875\uFF09\uFF0C\u4EA4\u672C\u8BFE\u5185\u7F6E\u90A3\u4E00\u53E0\u3002`
    ];
    return quietSlides(getBuiltinStudentSlides(plan2, limits));
  }
  const check = validateSlides(deduped, limits);
  lastDeckProblems = check.ok ? [] : check.problems;
  return check.ok ? deduped : quietSlides(getBuiltinStudentSlides(plan2, limits));
}
function mapKind(raw, index, total) {
  const text = String(raw ?? "").trim().toLowerCase();
  if (SLIDE_KINDS.includes(text)) return text;
  for (const [re, kind] of KIND_ALIASES) if (re.test(text)) return kind;
  if (total <= SLIDE_PAGE_ORDER.length) return SLIDE_PAGE_ORDER[index] ?? "close-read";
  const ratio = index / Math.max(1, total - 1);
  return SLIDE_PAGE_ORDER[Math.min(SLIDE_PAGE_ORDER.length - 1, Math.round(ratio * (SLIDE_PAGE_ORDER.length - 1)))];
}
function pickSlidesArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw;
    for (const key of ["slides", "pages", "list", "items"]) {
      if (Array.isArray(obj[key])) return obj[key];
    }
  }
  return [];
}
function stringArray(raw) {
  if (typeof raw === "string") return raw.split(/[\n；;]+/).map((s) => s.trim()).filter(Boolean);
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s ?? "").trim()).filter(Boolean);
}
function firstString(...vals) {
  for (const v2 of vals) {
    const s = String(v2 ?? "").trim();
    if (s) return s;
  }
  return "";
}
function orderByPageOrder(slides2) {
  let prev = 0;
  const slots = slides2.map((s) => {
    if (s.kind === "quote") return prev;
    prev = SLIDE_PAGE_ORDER.indexOf(s.kind);
    return prev;
  });
  return slides2.map((s, i) => ({ s, i, k: slots[i] })).sort((a, b) => {
    if (a.s.kind === "end" && b.s.kind !== "end") return 1;
    if (b.s.kind === "end" && a.s.kind !== "end") return -1;
    if (a.k !== b.k) return a.k - b.k;
    return a.i - b.i;
  }).map((x) => x.s);
}
function fitPageCount(slides2, bits) {
  if (bits.scale === "lesson") {
    const tailKinds = ["board", "homework", "end"];
    const tail = slides2.filter((s) => tailKinds.includes(s.kind)).slice(-3);
    const body = slides2.filter((s) => !tail.includes(s));
    const room = Math.max(0, bits.limits.pagesMax - tail.length);
    return dedupePages([...body.slice(0, room), ...tail], bits);
  }
  const out = [];
  const seen = {};
  for (const s of slides2) {
    const n = seen[s.kind] = (seen[s.kind] ?? 0) + 1;
    const allow = s.kind === "close-read" ? bits.limits.closeReadMax : s.kind === "quote" ? QUOTE_PAGE_MAX : 1;
    if (n > allow) continue;
    out.push(s);
  }
  const trimmed = out.slice(0, bits.limits.pagesMax);
  for (const kind of pageOrderOf(bits)) {
    if (!trimmed.some((s) => s.kind === kind)) {
      trimmed.push(harden(genericPage(kind, bits), bits));
    }
  }
  return dedupePages(orderByPageOrder(trimmed), bits);
}
function cleanItems(items) {
  return items.filter((t) => !ITEM_ASK.test(String(t ?? "").trim()));
}
function normalizeSlides(raw, plan2, limits = DEFAULT_LIMITS) {
  const bits = readPlan(plan2, limits);
  const list = pickSlidesArray(raw);
  if (list.length === 0) return [];
  const out = [];
  let prevTitle = "";
  for (let i = 0; i < list.length && out.length < bits.limits.pagesMax; i++) {
    const data = list[i] ?? {};
    const kind = mapKind(data.kind ?? data.type, i, list.length);
    if (kind === "quote") {
      const text = firstString(data.text, data.line, data.title, data.sentence);
      if (text) out.push(quoteSlideOf(text, bits.topic, firstString(data.note) || void 0));
      continue;
    }
    const title = firstString(data.title);
    const useTitle = title || prevTitle || (kind === "cover" ? bits.topic : SLIDE_LABELS[kind]);
    prevTitle = title || prevTitle;
    const slide = {
      kind,
      title: useTitle,
      line: firstString(data.line, data.question, data.text, data.sentence),
      items: cleanItems(stringArray(data.items ?? data.points ?? data.words ?? data.bullets ?? data.lines)),
      imageHint: firstString(data.imageHint, data.figureHint, data.searchHint, data.image),
      notes: firstString(data.notes, data.note, data.script, data.speaker)
    };
    if (kind === "cover") {
      const meta = firstString(data.meta, data.textbook, data.caption);
      const byline = firstString(data.byline, data.className, data.teacher);
      if (meta) slide.meta = meta;
      if (byline) slide.byline = byline;
    }
    if (kind === "compare" && Array.isArray(data.compareDiff)) {
      slide.compareDiff = stringArray(data.compareDiff);
    }
    out.push(harden(slide, bits));
  }
  return withCoverMeta(withQuotes(fitPageCount(out, bits), plan2, limits), plan2);
}
function requestFailureReason(e) {
  if (e instanceof DOMException && e.name === "AbortError") return "\u751F\u6210\u88AB\u53D6\u6D88\u4E86\uFF0C\u5148\u7528\u5185\u7F6E\u7684\u5B66\u751F\u7248\u9876\u4E0A\u3002";
  const msg = (e instanceof Error ? e.message : String(e ?? "")).replace(/\s+/g, " ").trim();
  if (msg && msg.length <= 60 && !/[A-Za-z]{4,}/.test(msg)) {
    return `${msg.replace(/。+$/, "")}\uFF0C\u5DF2\u7ECF\u6539\u7528\u5185\u7F6E\u7684\u5B66\u751F\u7248\u3002`;
  }
  return "\u63A5\u53E3\u6CA1\u6709\u56DE\u8BDD\uFF0C\u5DF2\u7ECF\u6539\u7528\u5185\u7F6E\u7684\u5B66\u751F\u7248\uFF1B\u7B49\u7F51\u7EDC\u6216 API Key \u59A5\u5F53\u540E\u518D\u91CD\u65B0\u751F\u6210\u4E00\u6B21\u3002";
}
function invalidReason(slides2, check) {
  if (slides2.length === 0) return "\u6A21\u578B\u6CA1\u6709\u4EA4\u51FA\u53EF\u7528\u7684\u5B66\u751F\u7248\u9875\u9762\uFF0C\u5DF2\u7ECF\u6539\u7528\u5185\u7F6E\u7684\u5B66\u751F\u7248\u3002";
  const first = check.problems[0] ?? "\u683C\u5F0F\u4E0D\u5BF9";
  return `\u6A21\u578B\u91CD\u5199\u7684\u5B66\u751F\u7248\u6709 ${check.problems.length} \u5904\u4E0D\u5408\u683C\uFF08${first.slice(0, 40)}\uFF09\uFF0C\u5DF2\u7ECF\u6539\u7528\u5185\u7F6E\u7684\u5B66\u751F\u7248\u3002`;
}
function pageIndexOf(problem) {
  const m = /^第\s*(\d+)\s*页/.exec(String(problem ?? "").trim());
  return m ? Number(m[1]) - 1 : -1;
}
function auditProblems(slides2, limits) {
  return [
    ...validateSlides(slides2, limits).problems,
    ...materialProblems(slides2),
    ...voiceProblems(slides2)
  ];
}
function swapPages(slides2, base, bad) {
  const kept = /* @__PURE__ */ new Set();
  slides2.forEach((s, i) => {
    if (bad.has(i)) return;
    for (const t of pageSentences(s)) {
      const k = sentenceKey(t);
      if (k) kept.add(k);
    }
  });
  const spent = /* @__PURE__ */ new Set();
  const out = slides2.slice();
  for (const i of [...bad].sort((a, b) => a - b)) {
    const ideal = Math.round(i * (base.length - 1) / Math.max(1, slides2.length - 1));
    const near = base.map((_, j) => j).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
    const free = (j) => !spent.has(j);
    const fits = (j) => pageSentences(base[j]).every((t) => {
      const k = sentenceKey(t);
      return !k || !kept.has(k);
    });
    const pick = near.find((j) => free(j) && base[j]?.kind === slides2[i]?.kind && fits(j)) ?? near.find((j) => free(j) && fits(j)) ?? near.find((j) => free(j) && base[j]?.kind === slides2[i]?.kind) ?? near.find(free) ?? ideal;
    spent.add(pick);
    if (base[pick]) out[i] = { ...base[pick] };
    for (const t of pageSentences(out[i])) {
      const k = sentenceKey(t);
      if (k) kept.add(k);
    }
  }
  return out;
}
function repairPages(slides2, base, limits, first) {
  if (slides2.length === 0 || base.length === 0) return null;
  let work = slides2;
  let problems = [...first];
  const swapped = /* @__PURE__ */ new Set();
  for (let round = 0; round < 3 && problems.length > 0; round++) {
    const bad = /* @__PURE__ */ new Set();
    for (const p of problems) {
      const at = pageIndexOf(p);
      if (at >= 0 && at < work.length) bad.add(at);
    }
    if (bad.size === 0 || bad.size >= work.length) return null;
    work = swapPages(work, base, bad);
    bad.forEach((i) => swapped.add(i));
    problems = auditProblems(work, limits);
  }
  if (problems.length > 0) return null;
  return { slides: work, swapped: swapped.size, left: problems };
}
function voiceProblems(slides2) {
  const entries = slides2.flatMap((s, i) => [
    {
      doc: "llm",
      field: `\u7B2C ${i + 1} \u9875.\u9875\u9762\u6587\u5B57`,
      text: pageVisibleText(s).join(" "),
      slot: "classroom"
    },
    { doc: "llm", field: `\u7B2C ${i + 1} \u9875.notes`, text: String(s.notes ?? ""), slot: "classroom" }
  ]);
  const report = scanVoiceDocs(entries, { questionFields: /notes$/ });
  return report.problems.map(
    (p) => `${p.entry.field}\u51FA\u73B0\u300C${p.label}\u300D\uFF08${p.matched}\uFF09`
  );
}
async function withDirector(plan2, cfg2, slides2, hooks) {
  if (slides2.length === 0) return slides2;
  try {
    const { slides: next, report } = await runDeckDirector({
      slides: slides2,
      cfg: {
        /*
         * 文本与生图用同一把 key、同一个 baseUrl：有 key = 自带额度直连，没 key = 同源代理。
         * 这里不许再看「浏览器里有没有 key」——落点只由 endpointOf 裁决（TASKS/15 块 A）。
         */
        llm: { baseUrl: cfg2.baseUrl, apiKey: String(cfg2.apiKey ?? "").trim(), model: cfg2.model },
        image: {
          baseUrl: cfg2.baseUrl,
          apiKey: String(cfg2.apiKey ?? "").trim(),
          model: String(cfg2.imageModel ?? "").trim() || ILLUST_MODEL
        }
      },
      meta: {
        topic: String(plan2?.meta?.topic ?? ""),
        grade: plan2?.meta?.grade,
        subject: plan2?.meta?.subject,
        duration: plan2?.meta?.duration,
        allow: allowFor(plan2?.meta?.duration ?? 0),
        paper: hooks?.paper
      },
      cache: { plan: directorCache, art: illustCache },
      signal: hooks?.signal,
      onStage: (stage, page, total) => hooks?.onProgress?.({ stage: stage === "illust" ? "illust" : stage, page, total })
    });
    if (report.note) hooks?.onIllustrated?.(report.note, report.drawn);
    return next;
  } catch {
    return slides2;
  }
}
async function buildStudentSlides(plan2, cfg2, hooks, edited) {
  const signal = hooks?.signal;
  const cancelled = () => Boolean(signal?.aborted);
  const scale = scaleOf(plan2?.meta?.duration);
  const limits = limitsFor(cfg2?.density, scale, plan2?.meta?.duration);
  const deckStack = Array.isArray(edited) && edited.length > 0 ? edited : null;
  const builtinPages = () => deckStack ? slidesFromDeck(deckStack, plan2, limits) : getBuiltinStudentSlides(plan2, limits);
  const useBuiltin = () => {
    const slides2 = builtinPages();
    hooks?.onProgress?.({ stage: "builtin", page: slides2.length, total: slides2.length });
    hooks?.onDraft?.(slides2);
    return slides2;
  };
  hooks?.onProgress?.({ stage: "llm", page: 1, total: 1 });
  try {
    const { system, user } = buildStudentSlidesPrompt(plan2, cfg2.density ?? "auto", scale, deckStack ?? void 0);
    const raw = await postChatJson(
      [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      cfg2,
      signal
    );
    if (cancelled()) return [];
    const slides2 = withMotif(normalizeSlides(raw, plan2, limits), plan2?.meta?.subject);
    const problems = auditProblems(slides2, limits);
    const repaired = problems.length ? repairPages(slides2, builtinPages(), limits, problems) : null;
    if (problems.length && !repaired) {
      hooks?.onFallback?.(invalidReason(slides2, validateSlides(slides2, limits)));
      return withDirector(plan2, cfg2, useBuiltin(), hooks);
    }
    const done = repaired?.slides ?? slides2;
    if (repaired && repaired.swapped > 0) {
      hooks?.onFallback?.(
        `\u6A21\u578B\u4EA4\u51FA\u7684\u5B66\u751F\u7248\u6709 ${repaired.swapped} \u9875\u4E0D\u5408\u683C\uFF08${problems[0].slice(0, 40)}\uFF09\uFF0C\u5DF2\u628A\u8FD9\u51E0\u9875\u6362\u6210\u515C\u5E95\u9875\uFF0C\u5176\u4F59\u7167\u7528\u3002`
      );
    }
    hooks?.onDraft?.(done);
    return withDirector(plan2, cfg2, done, hooks);
  } catch (e) {
    if (cancelled()) return [];
    hooks?.onFallback?.(requestFailureReason(e));
    return withDirector(plan2, cfg2, useBuiltin(), hooks);
  }
}
function applySlideScenes(slides2, deck) {
  const list = Array.isArray(slides2) ? slides2 : [];
  const pages = deck ?? [];
  if (list.length === 0) return [];
  if (pages.length === 0) return list.map((s) => s.scene ? { ...s, scene: "" } : s);
  const spent = /* @__PURE__ */ new Set();
  return list.map((s, i) => {
    const at = Math.round(i * (pages.length - 1) / Math.max(1, list.length - 1));
    const want = spent.has(at) ? "" : pages[at]?.scene;
    if (!isSceneKind(want)) return s.scene ? { ...s, scene: "" } : s;
    spent.add(at);
    return s.scene === want ? s : { ...s, scene: want };
  });
}
function hasSlideScenes(slides2) {
  return (slides2 ?? []).some((s) => isSceneKind(s?.scene));
}
var SLIDE_KINDS, SLIDE_PAGE_ORDER, SLIDE_LABELS, GOALS_TITLE, SLIDE_LIMITS, SLIDE_FORBIDDEN, TEACHER_WORDS, SLIDE_POINTS, TITLE_MAX, LINE_MAX, ITEM_MAX, WORDS_ITEM_MAX, HINT_MAX, TOPIC_MAX, QUOTE_BODY_MAX, QUOTE_NOTE_MAX, QUOTE_PAGE_MAX, QUOTE_MIN_SHARE, FLOAT_TEXT_MAX, CJK2, ALNUM, STAGE_TITLE, TITLE_GUESS, EMPTY_TASK, TITLE_VERB, BLANK_WORDING, BLANK_MARK, BARE_ACTION_TITLE, FORBIDDEN_REPL, EXOTIC_SPACE, LONE_FULL_SPACE, TEACHER_NOISE, NOT_QUOTE, CUT_TAIL, FACT_RE, TASK_LEAD, PAUSE, CN_NUM2, INSTRUCTION_LEAD, META_TALK, TOPIC_STOP, WEAK_CHARS, ACTION_HINT, ACT_LEAD, TEACHER_GESTURE, ORG_TALK, PAGE_LABEL_TITLE, VERB_LEAD, CLAUSE_LEAD, GOAL_TALK, TITLE_ASK, ASK_CUT, DANGLING_TAIL, HANG_TAIL, LEFTOVER_LEAD, ASK_LEAD, TRIM_VERB, BUILTIN_MATCHERS, QUOTE_NO_ANCHOR, QUOTE_TRIM_ORDER, QUOTE_ENDED, JOIN_TAIL, JOIN_HEAD, CONTAIN_MIN, TEACHER_ADDRESS, HALF_LEAD, DECK_META, STUDENT_ACTION, lastDeckProblems, KIND_ALIASES, ITEM_ASK;
var init_slides = __esm({
  "src/lib/slides.ts"() {
    "use strict";
    init_llm();
    init_prompt();
    init_voice();
    init_density();
    init_scale();
    init_scene();
    init_deck();
    init_texts();
    init_deckStore();
    init_illustrate();
    init_director();
    init_subject();
    init_motifs();
    init_guihua();
    init_bidaxiao();
    init_changfangti();
    init_changzheng();
    init_hetang();
    init_chun();
    init_beiying();
    init_fenshu();
    init_yuanmianji();
    SLIDE_KINDS = [
      "cover",
      "hook",
      "goals",
      "words",
      "close-read",
      "compare",
      "board",
      "drill",
      "homework",
      "end",
      /* TASKS/19a：原文页。只进合法页型，不进下面的页序骨架——没有原文时一页都不出 */
      "quote"
    ];
    SLIDE_PAGE_ORDER = [
      "cover",
      "hook",
      "goals",
      "words",
      "close-read",
      "compare",
      "board",
      "drill",
      "homework",
      "end"
    ];
    SLIDE_LABELS = {
      cover: "\u8BFE\u9898",
      hook: "\u5148\u770B\u4E00\u773C",
      goals: "\u4E09\u4EF6\u4E8B",
      words: "\u5B57\u8BCD\u5173",
      "close-read": "\u8BFB\u8FD9\u4E00\u53E5",
      quote: "\u539F\u6587",
      compare: "\u6BD4\u4E00\u6BD4",
      board: "\u770B\u9ED1\u677F",
      drill: "\u7EC3\u4E00\u7EC3",
      homework: "\u8BFE\u540E",
      end: "\u4E00\u53E5\u8BDD"
    };
    GOALS_TITLE = "\u8FD9\u8282\u8BFE\u505A\u4E09\u4EF6\u4E8B";
    SLIDE_LIMITS = {
      bodyChars: DEFAULT_LIMITS.bodyChars,
      pagesMin: PAGE_RANGE.min,
      pagesMax: PAGE_RANGE.max
    };
    SLIDE_FORBIDDEN = [
      "\u6559\u5B66\u76EE\u6807",
      "\u6559\u5B66\u91CD\u96BE\u70B9",
      "\u6559\u5B66\u8FC7\u7A0B",
      "\u672C\u73AF\u8282\u65E8\u5728",
      "\u6838\u5FC3\u7D20\u517B",
      "\u73AF\u8282",
      "\u65F6\u957F",
      /* TASKS 10 §十三 第 12 件：教案与课堂上的教学动作，一个都不许上台 */
      "\u5F15\u5BFC",
      "\u9884\u8BBE",
      "\u5E03\u7F6E",
      "\u677F\u4E66",
      "\u8BF4\u8BFE",
      "\u672C\u8BFE"
    ];
    TEACHER_WORDS = ["\u73AF\u8282", "\u5F15\u5BFC", "\u9884\u8BBE", "\u5E03\u7F6E", "\u677F\u4E66", "\u8BF4\u8BFE", "\u672C\u8BFE"];
    SLIDE_POINTS = { titleMin: 40, bodyMin: 24, wordsMin: 54, coverTitle: 48 };
    TITLE_MAX = 14;
    LINE_MAX = 20;
    ITEM_MAX = 12;
    WORDS_ITEM_MAX = 6;
    HINT_MAX = 12;
    TOPIC_MAX = 12;
    QUOTE_BODY_MAX = 60;
    QUOTE_NOTE_MAX = 12;
    QUOTE_PAGE_MAX = 8;
    QUOTE_MIN_SHARE = 0.25;
    FLOAT_TEXT_MAX = 12;
    CJK2 = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
    ALNUM = /[0-9A-Za-z]/;
    STAGE_TITLE = /^(导入|初读|精读|拓展|小结|总结|字词|练习|检测|新授|复习|布置作业)\s*[·•・\-—]/;
    TITLE_GUESS = /哪一件|哪一行|哪一句|哪个字最重要|先做哪|谁最重要|你觉得呢|你想到什么/;
    EMPTY_TASK = /^(读懂|说出想法|写一段|学习课文|理解内容)$/;
    TITLE_VERB = /读|圈|写|说|找|画|量|比|填|连|标|数|算|做|看|听|练|试|挑|选|排|组|背|搭|摆|摸|剪|折|贴|抄|记|带|讲|问|演|认|改|换|分/;
    BLANK_WORDING = /这一空|第一空|这个空|填空|空格/;
    BLANK_MARK = /（\s*　?\s*）|\(\s*\)|＿|___|____/;
    BARE_ACTION_TITLE = /^(?:放回句子(?:里)?(?:读|念)|读一遍|再读一遍|读一读|齐读|默读|自由朗读|朗读|读出声|再读|圈(?:出)?|画出?|说说|想一想|做动作|闭眼|写一写|抄一抄|背一背|练一练|看(?:一看)?|试一试)$/;
    FORBIDDEN_REPL = {
      \u672C\u73AF\u8282\u65E8\u5728: "\u8FD9\u8282\u8BFE",
      \u6559\u5B66\u91CD\u96BE\u70B9: "\u8981\u8BFB\u61C2\u7684\u5730\u65B9",
      \u6559\u5B66\u76EE\u6807: "\u8981\u62FF\u8D70\u7684\u672C\u9886",
      \u6559\u5B66\u8FC7\u7A0B: "\u4E00\u6B65\u4E00\u6B65",
      \u6838\u5FC3\u7D20\u517B: "\u672C\u9886",
      \u73AF\u8282: "\u8FD9\u4E00\u6BB5",
      \u65F6\u957F: "",
      \u5F15\u5BFC: "\u5E26",
      \u9884\u8BBE: "",
      \u5E03\u7F6E: "",
      \u677F\u4E66: "\u9ED1\u677F",
      \u8BF4\u8BFE: "",
      \u672C\u8BFE: "\u8FD9\u4E00\u8BFE"
    };
    EXOTIC_SPACE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\uFEFF]/g;
    LONE_FULL_SPACE = /(?<![\s（(【「『＿_　])　(?![\s）)】」』＿_　])/g;
    TEACHER_NOISE = /分钟|教案|评委|说课|试讲|学法|教法|落点|意图|旨在|目标|重难点|课件|评分|时间|设计/;
    NOT_QUOTE = /生字|词语|会写|认识|理解|掌握|朗读|背诵|目标|环节|时长|小结|作业/;
    CUT_TAIL = /(?:找|读|看|数|画|圈|写|说|比|试|做|问|听|想|指|标|填|量|算|背|抄|练|里|上|下|中|后|前|的|地|得|和|与|在|把|被|从|向|对|就|先|再|又|个|条|组|遍|来|去|出|两|三|四|五|六|几|一)$/;
    FACT_RE = /(?:[0-9０-９]{1,4}|[一二三四五六七八九十百千万两])\s*(?:个|条|种|根|块|组|件|片|道|句|首|面|边|角)\s*[\u4e00-\u9fff]{1,4}/g;
    TASK_LEAD = {
      hook: "\u770B",
      words: "\u8BFB",
      "close-read": "\u8BFB",
      compare: "\u6BD4",
      board: "\u770B",
      drill: "\u8BD5",
      homework: "\u505A",
      end: "\u8BF4"
    };
    PAUSE = "\uFF08\u505C\u4E09\u79D2\uFF09";
    CN_NUM2 = ["\u96F6", "\u4E00", "\u4E24", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
    INSTRUCTION_LEAD = /^(请|停|看|听|读|说|写|圈|画|填|标|数|做|问|答|想|闭|打开|拿出|翻|举|跟|带|给|让|把|用|从|向|一起|再|先|然后|接着|下面|现在|今天|我们|你们|大家|同学们|好|对|出示|投影|巡视|上课)/;
    META_TALK = /这一段|这句话|这一句|这个词|这几个|刚才|接下来|请看|我们看|告诉我/;
    TOPIC_STOP = new Set(
      "\u7684\u4E86\u7740\u5730\u5F97\u662F\u5728\u548C\u4E0E\u6216\u5C31\u800C\u628A\u88AB\u8BA9\u4ECE\u5411\u5BF9\u4E3A\u4EE5\u53CA\u4E8E\u4E2A\u8FD9\u90A3\u4F60\u6211\u4ED6\u5979\u5B83\u5B83\u4EEC\u8C01\u4EC0\u4E48\u51E0\u591A\u5C11\u4E0D\u4E00\u6CA1\u5F88\u90FD\u4E5F\u8FD8\u53C8\u624D\u53EA\u8BF7\u6211\u4EEC\u5927\u5BB6\u60A8\u5417\u5462\u5427\u554A\u5440\u54E6\u55EF\u7ED9\u5411\u5F80\u628A\u597D\u518D\u5148".split(
        ""
      )
    );
    WEAK_CHARS = new Set("\u6837\u540C\u5F02\u5DEE\u591A\u5C11\u597D\u5927\u5C0F\u592A\u66F4\u6700\u5BF9\u771F\u5047".split(""));
    ACTION_HINT = /读|圈|写|画|标|填|数|比|做|演|背|找|听|看|说|试|闻|闭|讨论|交流|摸|摆|搭|指|量|观察|拼|剪|折|贴|排|唱|算|练/;
    ACT_LEAD = /^(在|将|把|用|拿|按|边|齐|读|朗读|齐读|自由|默读|圈|划|画|写|抄|填|标|数|量|比|摆|搭|拼|剪|折|做|演|背|找|听|看|观察|说|讲|试|摸|闻|闭|换|讨论|交流|打开|翻|举|跟|指出|记录|整理|完成|上台|书空)/;
    TEACHER_GESTURE = /出示|引导|追问|板书|讲解|提问|巡视|评价|范读|课件|投影/;
    ORG_TALK = /^(小组|同桌|全班|开火车|举手|同学们|大家|老师|每组|每一位)/;
    PAGE_LABEL_TITLE = /^(读进去|想一想|说一说|做一做|练一练|看这儿|比一比|先看这张图|最后一句|记住这句话|最后一问|今天三件事|课后两件事|字词关|发现规律|总结规律|归纳总结|探究新知|巩固练习|课堂小结|导入新课|拓展延伸)$/;
    VERB_LEAD = /^(跟|指|请|让|把|给|用|从|向|对|再|先|然后|接着|下面|现在|今天|一起|大家|我们|你们|同学们|好|边|尝试|观察|数一数|量一量|搭一搭|摆一摆|摸一摸|看一看|读一读|说一说|想一想|比一比|圈一圈|画一画|写一写|找一找)/;
    CLAUSE_LEAD = /^(可|也|就|还|又|但|却|而|并|是|不|没|别|这|那|所以|因此|因为|如果|于是|假如|其实|原来|只是|不过|总之|这样|那样|这么|那么)/;
    GOAL_TALK = /建立|概念|体会|理解|掌握|感受|培养|引导|初步|进一步|学会|能够|借助|利用|通过|抓住|引出|检验|当堂|指认|辨识|感知|探究|归纳|概括|迁移|落实|达成/;
    TITLE_ASK = /什么|怎么|怎样|哪|多少|几|吗|呢|为什么|如何|谁/;
    ASK_CUT = /什么|怎么|怎样|为什么|如何|哪|多少|几|谁|吗|呢/;
    DANGLING_TAIL = /[的了着地得是在和与或就而把被让从向对为以及于叫个底]$/;
    HANG_TAIL = /[还也就才又而但与及或再把被对给朝向往到填做用成留起去来]$/;
    LEFTOVER_LEAD = /^(还|也|就|才|又|再|然后|接着|最后|其余|剩下|其他|别的|另外|此外|同时|以及|至于|于是|所以|因为|不过|可是)/;
    ASK_LEAD = /^(?:为什么|怎么|怎样|哪里|哪儿|哪些|哪个|哪|什么|谁|多少|几)[\u4e00-\u9fff]*/;
    TRIM_VERB = /(?:拿|用|做|放|数|量|比|看|说|想|写|画|搭|摆|摸|读|念)$/;
    BUILTIN_MATCHERS = [
      { exampleId: "guihua", pattern: /桂花/, load: () => GUIHUA_STUDENT_SLIDES },
      { exampleId: "bidaxiao", pattern: /比大小|多几种|少几种/, load: () => BIDAXIAO_STUDENT_SLIDES },
      { exampleId: "changfangti", pattern: /长方体|正方体|立方体/, load: () => CHANGFANGTI_STUDENT_SLIDES },
      { exampleId: "changzheng", pattern: /长征|七律/, load: () => CHANGZHENG_STUDENT_SLIDES },
      { exampleId: "hetang", pattern: /荷塘月色|荷塘/, load: () => HETANG_STUDENT_SLIDES },
      { exampleId: "chun", pattern: /^《?春》?$|朱自清.*春/, load: () => CHUN_STUDENT_SLIDES },
      { exampleId: "beiying", pattern: /背影/, load: () => BEIYING_STUDENT_SLIDES },
      { exampleId: "fenshu", pattern: /分数/, load: () => FENSHU_STUDENT_SLIDES },
      { exampleId: "yuanmianji", pattern: /圆的面积|圆面积/, load: () => YUANMIANJI_STUDENT_SLIDES }
    ];
    QUOTE_NO_ANCHOR = /* @__PURE__ */ new Set(["cover", "quote", "board", "homework", "end"]);
    QUOTE_TRIM_ORDER = ["hook", "compare", "drill", "words", "close-read"];
    QUOTE_ENDED = /[。！？；…”』」]$/;
    JOIN_TAIL = /[，、：；。！？…”』」]$/;
    JOIN_HEAD = /^[，、：；。！？…]/;
    CONTAIN_MIN = 6;
    TEACHER_ADDRESS = /我|咱|谁|学生|老师|孩子|全班|小组|同桌|投|屏幕|巡视/;
    HALF_LEAD = /^(也|就|还|但|而|所以|因为|如果|落到|等于|比如|例如|其中|另外|同时|接着)/;
    DECK_META = /课时|年级|分钟|小学|初中|高中|第[一二三四五六七八九十\d]+单元/;
    STUDENT_ACTION = /读|圈|写|画|标|填|数|比|做|演|背|找|听|看|说|试|闻|闭|换|讨论|交流|打开|翻|举|跟|摸|摆|搭|指|量|拼|剪|折|贴|排|唱|算|练|观察/;
    lastDeckProblems = [];
    KIND_ALIASES = [
      [/原文|原句|引文|^quote/, "quote"],
      [/封面|课题|开头|^cover|^title/, "cover"],
      [/导入|情境|看图|热身|^hook|^intro/, "hook"],
      [/三件事|目标|任务|^goals?/, "goals"],
      [/字词|生字|词语|词汇|^words?/, "words"],
      [/精读|品读|研读课文|重点段|细读|close|^read/, "close-read"],
      [/对比|比较|迁移|异同|两边|compare/, "compare"],
      [/板书|结构图|主线|board/, "board"],
      [/练一练|练习|填空|检测|问答|drill|quiz|exercise/, "drill"],
      [/作业|课后|回家|^homework/, "homework"],
      [/收尾|结束|一句话|小结|end|closing/, "end"]
    ];
    ITEM_ASK = /[？?]\s*$/;
  }
});

// src/lib/theme.ts
var SANS, SERIF, DEFAULT_THEME;
var init_theme = __esm({
  "src/lib/theme.ts"() {
    "use strict";
    SANS = '"PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif';
    SERIF = '"Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", serif';
    DEFAULT_THEME = {
      id: "builtin-ink",
      name: "\u7EB8\u4E0E\u58A8",
      paper: "#faf8f3",
      coverPaper: "#e2dcd0",
      paperDeep: "#f3efe6",
      paperLine: "#e2dccd",
      ink: "#1e1c19",
      inkSoft: "#56514a",
      accent: "#b23a2e",
      accentSoft: "#f0e0dc",
      serif: SERIF,
      sans: SANS,
      motif: "plain",
      ruleWidth: 1,
      source: "builtin",
      note: "\u7EB8\u4E0E\u58A8\uFF1A\u6CA1\u586B Key \u6216\u6A21\u578B\u6CA1\u4EA4\u51FA\u5408\u683C\u65B9\u6848\u65F6\u7684\u9ED8\u8BA4\u7EB8\u9762\u3002"
    };
  }
});

// src/lib/builtinScheme.ts
function toTheme(p) {
  return {
    id: p.id,
    name: p.name,
    paper: p.paper,
    coverPaper: p.coverPaper,
    paperDeep: p.paperDeep,
    paperLine: p.paperLine,
    ink: p.ink,
    inkSoft: p.inkSoft,
    accent: p.accent,
    accentSoft: p.accentSoft,
    serif: DEFAULT_THEME.serif,
    sans: DEFAULT_THEME.sans,
    motif: p.motif,
    ruleWidth: 1,
    source: "builtin",
    note: p.note
  };
}
var PAPERS, BUILTIN_THEMES;
var init_builtinScheme = __esm({
  "src/lib/builtinScheme.ts"() {
    "use strict";
    init_theme();
    PAPERS = [
      {
        id: "builtin-qiujiang",
        name: "\u79CB\u6C5F",
        note: "\u79CB\u5929\u3001\u82B1\u9999\u3001\u843D\u4E0B\u6765\u4E00\u7C7B\u8BFE\u6587\u7528\u8FD9\u5F20\uFF1A\u6696\u767D\u7EB8\uFF0C\u6842\u9EC4\u505A\u70B9\u7F00\u3002",
        paper: "#fbf7ec",
        coverPaper: "#e5dcd1",
        paperDeep: "#f3eddf",
        paperLine: "#e5ddc9",
        ink: "#231f18",
        inkSoft: "#5a5346",
        accent: "#9c5a1e",
        accentSoft: "#f1e4d2",
        motif: "plain",
        // 与场景词表同一条纪律：不收单字「香 / 落 / 园 / 摇 / 秋」——
        // 「香蕉」「落到」「公园」会把数学课也拉到这张花香纸上。
        fits: /桂|花|叶子|树叶|落叶|落花|飘落|花香|清香|秋天|秋日|秋风|深秋|花园|校园|果园|院子|雨/g
      },
      {
        id: "builtin-xueyuan",
        name: "\u96EA\u539F",
        note: "\u96EA\u3001\u5C71\u8DEF\u3001\u8FDC\u884C\u4E00\u7C7B\u8BFE\u6587\u7528\u8FD9\u5F20\uFF1A\u51B7\u767D\u7EB8\uFF0C\u975B\u84DD\u53EA\u7528\u4E8E\u4E00\u5904\u5F3A\u8C03\u3002",
        paper: "#f5f7f9",
        coverPaper: "#dde3ea",
        paperDeep: "#eef2f6",
        paperLine: "#dee4ea",
        ink: "#1d2228",
        inkSoft: "#525c66",
        accent: "#2f5b86",
        accentSoft: "#e2ecf5",
        motif: "plain",
        fits: /雪|山|长征|寒|远|军|路/g
      },
      {
        id: "builtin-qingye",
        name: "\u9752\u91CE",
        note: "\u8349\u5730\u3001\u6625\u5929\u3001\u751F\u957F\u4E00\u7C7B\u8BFE\u6587\u7528\u8FD9\u5F20\uFF1A\u6DE1\u9752\u7EB8\uFF0C\u8349\u7EFF\u6536\u5728\u5F3A\u8C03\u8272\u4E0A\u3002",
        paper: "#f7f9f2",
        coverPaper: "#dfe4d0",
        paperDeep: "#eef1e5",
        paperLine: "#dfe4d2",
        ink: "#1e2119",
        inkSoft: "#535a48",
        accent: "#4a6a30",
        accentSoft: "#e4eedb",
        motif: "lines",
        fits: /草|树|苗|春|生长|田|绿|虫|鸟/g
      },
      {
        id: "builtin-taihen",
        name: "\u82D4\u75D5",
        note: "\u65E7\u4E8B\u3001\u8001\u5C4B\u3001\u56DE\u5FC6\u4E00\u7C7B\u8BFE\u6587\u7528\u8FD9\u5F20\uFF1A\u65E7\u7EB8\u9EC4\uFF0C\u8D6D\u77F3\u505A\u5F3A\u8C03\u3002",
        paper: "#f8f4e8",
        coverPaper: "#ded5ca",
        paperDeep: "#efe9da",
        paperLine: "#ded5bf",
        ink: "#221f18",
        inkSoft: "#57503e",
        accent: "#7a5a2a",
        accentSoft: "#eee3cd",
        motif: "silk",
        fits: /旧|老|母|父|故|忆|年|家|乡|念/g
      },
      {
        id: "builtin-mushan",
        name: "\u66AE\u5C71",
        note: "\u79BB\u522B\u3001\u5B89\u9759\u3001\u66AE\u8272\u4E00\u7C7B\u8BFE\u6587\u7528\u8FD9\u5F20\uFF1A\u85D5\u767D\u7EB8\uFF0C\u6697\u7EA2\u505A\u5F3A\u8C03\u3002",
        paper: "#f9f4f5",
        coverPaper: "#e2d7da",
        paperDeep: "#f1eaea",
        paperLine: "#e2d7da",
        ink: "#221e20",
        inkSoft: "#575052",
        accent: "#8a3a4e",
        accentSoft: "#f0e0e5",
        motif: "plain",
        fits: /别|送|离|暮|夜|静|月|思/g
      },
      {
        id: "builtin-mochi",
        name: "\u58A8\u6C60",
        note: "\u53E4\u8BD7\u3001\u6587\u8A00\u3001\u5386\u53F2\u540D\u7BC7\u7528\u8FD9\u5F20\uFF1A\u58A8\u7EFF\u6DF1\u5E95\uFF0C\u7C73\u8272\u5B57\uFF0C\u91D1\u8272\u53EA\u70B9\u4E00\u5904\u3002",
        paper: "#1c2a27",
        // 深纸的封面只能往亮走：再往暗就掉出「纸」的明度底线（11%），变成纯黑。
        coverPaper: "#2e3b33",
        paperDeep: "#16211f",
        paperLine: "#34453f",
        ink: "#ece2c8",
        inkSoft: "#b6ad96",
        accent: "#d9a441",
        accentSoft: "#3b4335",
        motif: "silk",
        fits: /古诗|诗词|文言|古文|名篇|杜甫|李白|苏轼|辛弃疾|陆游|王维|白居易|赤壁|三国|水浒|西游|红楼|史记|论语|唐|宋词/g
      },
      {
        id: "builtin-heiban",
        name: "\u9ED1\u677F",
        note: "\u6570\u5B66\u3001\u79D1\u5B66\u7528\u8FD9\u5F20\uFF1A\u9ED1\u677F\u7EFF\u6DF1\u5E95\uFF0C\u7C89\u7B14\u767D\u5B57\uFF0C\u9EC4\u8272\u53EA\u7528\u4E8E\u4E00\u4E2A\u5173\u952E\u6570\u3002",
        paper: "#243029",
        coverPaper: "#18211c",
        paperDeep: "#1c2621",
        paperLine: "#3d4a41",
        ink: "#f2efe6",
        inkSoft: "#bcc2b6",
        accent: "#e8c46a",
        accentSoft: "#3b4136",
        motif: "lines",
        fits: /数学|算式|加法|减法|乘法|除法|分数|小数|面积|体积|周长|图形|长方形|正方形|三角|统计|方程|规律|单位/g
      }
    ];
    BUILTIN_THEMES = PAPERS.map(toTheme);
  }
});

// src/lib/scheme.ts
function rgbOf(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function relLuminance(hex) {
  const lin = rgbOf(hex).map((v2) => {
    const s = v2 / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrastRatio(a, b) {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
var LAYOUT_HINT;
var init_scheme = __esm({
  "src/lib/scheme.ts"() {
    "use strict";
    init_llm();
    init_deck();
    init_theme();
    init_scene();
    init_builtinScheme();
    LAYOUT_HINT = PAGE_LAYOUTS.map((l) => `${l}=${LAYOUT_NAME[l]}`).join("\u3001");
  }
});

// src/lib/deck2/theme.ts
var theme_exports = {};
__export(theme_exports, {
  FAMILIES: () => FAMILIES,
  FAMILY_IDS: () => FAMILY_IDS,
  FAMILY_REPS: () => FAMILY_REPS,
  FONT_FACE: () => FONT_FACE,
  FONT_STACK: () => FONT_STACK,
  HUE_CLASH: () => HUE_CLASH,
  TEMPLATES: () => TEMPLATES,
  TEMPLATE_IDS: () => TEMPLATE_IDS,
  TEMPLATE_LIMITS: () => TEMPLATE_LIMITS,
  TEMPLATE_ORDER: () => TEMPLATE_ORDER,
  defaultTemplate: () => defaultTemplate,
  defaultTemplateId: () => defaultTemplateId,
  familyTemplates: () => familyTemplates,
  hueGap: () => hueGap,
  hueOf: () => hueOf,
  isTemplateId: () => isTemplateId,
  labelOf: () => labelOf,
  templateOf: () => templateOf,
  themeProblems: () => themeProblems
});
function familyTemplates(f) {
  return TEMPLATE_ORDER.filter((t) => t.family === f);
}
function labelOf(t) {
  return `${t.name}\xB7${t.tone}`;
}
function isTemplateId(v2) {
  return typeof v2 === "string" && TEMPLATE_IDS.includes(v2);
}
function templateOf(id) {
  return isTemplateId(id) ? TEMPLATES[id] : TEMPLATES.jijian;
}
function defaultTemplateId(subject, topic = "", period = "") {
  const s = String(subject ?? "");
  const word = `${String(topic ?? "")}${String(period ?? "")}`;
  if (CHINESE.test(s)) return CLASSIC.test(word) ? "xuan" : "suke";
  if (MATH.test(s) || SCIENCE.test(s)) return "liti";
  if (ENGLISH.test(s)) return "shuye";
  if (HUMAN.test(s)) return "tigang";
  if (CLASSIC.test(word) && !MATH.test(s) && !SCIENCE.test(s)) return "xuan";
  return "jijian";
}
function defaultTemplate(subject, topic = "", period = "") {
  return TEMPLATES[defaultTemplateId(subject, topic, period)];
}
function hueOf(hex) {
  const [r, g2, b] = rgbOf(hex);
  const max = Math.max(r, g2, b);
  const min = Math.min(r, g2, b);
  if (max === min) return null;
  const d = max - min;
  const h = max === r ? ((g2 - b) / d + (g2 < b ? 6 : 0)) * 60 : max === g2 ? ((b - r) / d + 2) * 60 : ((r - g2) / d + 4) * 60;
  return (h + 360) % 360;
}
function hueGap(a, b) {
  const ha = hueOf(a);
  const hb = hueOf(b);
  if (ha === null || hb === null) return 0;
  const d = Math.abs(ha - hb) % 360;
  return d > 180 ? 360 - d : d;
}
function themeProblems(t) {
  const bad = [];
  const ink = contrastRatio(t.ink, t.paper);
  if (!(ink >= TEMPLATE_LIMITS.inkContrastMin)) {
    bad.push(`${t.id} \u6B63\u6587 ${t.ink} \u5BF9\u7EB8 ${t.paper} \u7684\u5BF9\u6BD4\u5EA6 ${ink.toFixed(2)}:1\uFF0C\u8981\u6C42 \u2265 ${TEMPLATE_LIMITS.inkContrastMin}:1`);
  }
  const accent = contrastRatio(t.accent, t.paper);
  if (!(accent >= TEMPLATE_LIMITS.accentContrastMin)) {
    bad.push(
      `${t.id} \u5F3A\u8C03\u8272 ${t.accent} \u5BF9\u7EB8 ${t.paper} \u7684\u5BF9\u6BD4\u5EA6 ${accent.toFixed(2)}:1\uFF0C\u8981\u6C42 \u2265 ${TEMPLATE_LIMITS.accentContrastMin}:1`
    );
  }
  const gap = hueGap(t.accent, t.paper);
  if (gap >= HUE_CLASH[0] && gap <= HUE_CLASH[1]) {
    bad.push(`${t.id} \u5F3A\u8C03\u8272\u4E0E\u7EB8\u7684\u8272\u76F8\u5DEE ${gap.toFixed(0)}\xB0\uFF0C\u843D\u5728 ${HUE_CLASH[0]}\u2013${HUE_CLASH[1]}\xB0 \u7684\u7EA2\u7EFF\u649E\u533A\u95F4`);
  }
  if (t.accent === t.paper) bad.push(`${t.id} \u5F3A\u8C03\u8272\u4E0E\u7EB8\u540C\u8272`);
  return bad;
}
var TEMPLATE_IDS, TEMPLATES, FAMILIES, FAMILY_IDS, FAMILY_REPS, TEMPLATE_ORDER, FONT_FACE, FONT_STACK, CLASSIC, CHINESE, MATH, SCIENCE, ENGLISH, HUMAN, HUE_CLASH, TEMPLATE_LIMITS;
var init_theme2 = __esm({
  "src/lib/deck2/theme.ts"() {
    "use strict";
    init_scheme();
    TEMPLATE_IDS = [
      "suke",
      "suke-mo",
      "suke-zhe",
      "xuan",
      "xuan-qing",
      "xuan-zi",
      "liti",
      "liti-qing",
      "liti-zi",
      "liti-zhe",
      "jijian",
      "jijian-mo",
      "jijian-zhu",
      "shuye",
      "shuye-lan",
      "shuye-hong",
      "shuye-hui",
      "tigang",
      "tigang-zhu",
      "tigang-lan"
    ];
    TEMPLATES = {
      suke: {
        id: "suke",
        family: "suke",
        name: "\u7D20\u8BFE",
        tone: "\u6731\u7EA2",
        fits: ["\u8BED\u6587", "\u8BB0\u53D9", "\u5199\u666F", "\u6563\u6587"],
        paper: "#FBF8F1",
        surface: "#F3EEE2",
        ink: "#2B2823",
        muted: "#7A7368",
        accent: "#9C3A2F",
        line: "#DED5C4",
        fontTitle: "song",
        fontBody: "song"
      },
      "suke-mo": {
        id: "suke-mo",
        family: "suke",
        name: "\u7D20\u8BFE",
        tone: "\u58A8\u7EFF",
        fits: ["\u8BED\u6587", "\u5199\u666F", "\u8BF4\u660E"],
        paper: "#F9F7F0",
        surface: "#F0EDE2",
        ink: "#232A25",
        muted: "#6E746C",
        accent: "#33513F",
        line: "#DCD6C6",
        fontTitle: "song",
        fontBody: "song"
      },
      "suke-zhe": {
        id: "suke-zhe",
        family: "suke",
        name: "\u7D20\u8BFE",
        tone: "\u8D6D\u77F3",
        fits: ["\u8BED\u6587", "\u4E60\u4F5C", "\u53D9\u4E8B"],
        paper: "#FCF8EF",
        surface: "#F4EDDF",
        ink: "#2C271F",
        muted: "#7A7060",
        accent: "#8A5B22",
        line: "#E0D7C3",
        fontTitle: "song",
        fontBody: "song"
      },
      xuan: {
        id: "xuan",
        family: "xuan",
        name: "\u5BA3\u7EB8",
        tone: "\u8D6D",
        fits: ["\u8BED\u6587", "\u53E4\u8BD7\u6587", "\u6587\u8A00\u6587", "\u8BD7\u8BCD"],
        paper: "#F7F2E4",
        surface: "#EFE7D4",
        ink: "#221F19",
        muted: "#6B6355",
        accent: "#8C4A2F",
        line: "#D8CCB2",
        fontTitle: "kai",
        fontBody: "kai"
      },
      "xuan-qing": {
        id: "xuan-qing",
        family: "xuan",
        name: "\u5BA3\u7EB8",
        tone: "\u9752\u7070",
        fits: ["\u8BED\u6587", "\u6587\u8A00\u6587", "\u53E4\u8BD7\u8BCD"],
        paper: "#F6F3E8",
        surface: "#ECE7D7",
        ink: "#1F2723",
        muted: "#62685F",
        accent: "#35564C",
        line: "#D7D1BF",
        fontTitle: "kai",
        fontBody: "kai"
      },
      "xuan-zi": {
        id: "xuan-zi",
        family: "xuan",
        name: "\u5BA3\u7EB8",
        tone: "\u85D5\u7D2B",
        fits: ["\u8BED\u6587", "\u53E4\u8BD7\u6587", "\u8BD7\u8BCD"],
        paper: "#F9F3F1",
        surface: "#F0E8E5",
        ink: "#241F24",
        muted: "#6F636A",
        accent: "#5B3A5E",
        line: "#DED2D2",
        fontTitle: "kai",
        fontBody: "kai"
      },
      liti: {
        id: "liti",
        family: "liti",
        name: "\u4F8B\u9898",
        tone: "\u975B\u84DD",
        fits: ["\u6570\u5B66", "\u7269\u7406", "\u5316\u5B66", "\u79D1\u5B66"],
        paper: "#F7F9FB",
        surface: "#EDF2F6",
        ink: "#1C2830",
        muted: "#5C6873",
        accent: "#1F6FB2",
        line: "#D2DDE5",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "liti-qing": {
        id: "liti-qing",
        family: "liti",
        name: "\u4F8B\u9898",
        tone: "\u9752\u78A7",
        fits: ["\u6570\u5B66", "\u79D1\u5B66", "\u4FE1\u606F"],
        paper: "#F5FAF8",
        surface: "#EAF2EF",
        ink: "#1B2B28",
        muted: "#5A6B66",
        accent: "#146E62",
        line: "#CFE0DA",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "liti-zi": {
        id: "liti-zi",
        family: "liti",
        name: "\u4F8B\u9898",
        tone: "\u85E4\u7D2B",
        fits: ["\u6570\u5B66", "\u7269\u7406"],
        paper: "#F8F7FC",
        surface: "#EEEDF6",
        ink: "#221E2B",
        muted: "#625C72",
        accent: "#57407E",
        line: "#DBD7E8",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "liti-zhe": {
        id: "liti-zhe",
        family: "liti",
        name: "\u4F8B\u9898",
        tone: "\u8D6D\u9EC4",
        fits: ["\u6570\u5B66", "\u5316\u5B66"],
        paper: "#FBF8F2",
        surface: "#F3EEE3",
        ink: "#262220",
        muted: "#6D655C",
        accent: "#8A5A18",
        line: "#E1D9C8",
        fontTitle: "hei",
        fontBody: "hei"
      },
      jijian: {
        id: "jijian",
        family: "jijian",
        name: "\u6781\u7B80",
        tone: "\u58A8\u9ED1",
        fits: ["\u901A\u7528"],
        paper: "#FCFCFA",
        surface: "#F2F2EF",
        ink: "#1A1A18",
        muted: "#6A6A66",
        accent: "#1A1A18",
        line: "#E2E2DD",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "jijian-mo": {
        id: "jijian-mo",
        family: "jijian",
        name: "\u6781\u7B80",
        tone: "\u677E\u7EFF",
        fits: ["\u901A\u7528"],
        paper: "#FAFAF6",
        surface: "#F1F1EB",
        ink: "#15211D",
        muted: "#646A64",
        accent: "#24463A",
        line: "#E0E1DA",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "jijian-zhu": {
        id: "jijian-zhu",
        family: "jijian",
        name: "\u6781\u7B80",
        tone: "\u6731",
        fits: ["\u901A\u7528"],
        paper: "#FCFAF7",
        surface: "#F4F1EC",
        ink: "#241F1C",
        muted: "#6E6762",
        accent: "#8A3428",
        line: "#E4DFD8",
        fontTitle: "hei",
        fontBody: "hei"
      },
      shuye: {
        id: "shuye",
        family: "shuye",
        name: "\u4E66\u9875",
        tone: "\u677E\u7EFF",
        fits: ["\u82F1\u8BED", "\u8BED\u6587", "\u9605\u8BFB"],
        paper: "#FBF9F3",
        surface: "#F2EFE5",
        ink: "#232927",
        muted: "#6F746C",
        accent: "#3A5748",
        line: "#DDD8C9",
        fontTitle: "song",
        fontBody: "song"
      },
      "shuye-lan": {
        id: "shuye-lan",
        family: "shuye",
        name: "\u4E66\u9875",
        tone: "\u85CF\u84DD",
        fits: ["\u82F1\u8BED", "\u9605\u8BFB"],
        paper: "#F7F9FB",
        surface: "#EDF1F5",
        ink: "#1B2630",
        muted: "#5D6872",
        accent: "#234E6E",
        line: "#D3DDE6",
        fontTitle: "song",
        fontBody: "song"
      },
      "shuye-hong": {
        id: "shuye-hong",
        family: "shuye",
        name: "\u4E66\u9875",
        tone: "\u80ED\u8102",
        fits: ["\u82F1\u8BED", "\u8BED\u6587"],
        paper: "#FBF7F4",
        surface: "#F2EBE6",
        ink: "#2A2220",
        muted: "#766864",
        accent: "#8B3B33",
        line: "#E0D4CF",
        fontTitle: "song",
        fontBody: "song"
      },
      "shuye-hui": {
        id: "shuye-hui",
        family: "shuye",
        name: "\u4E66\u9875",
        tone: "\u77F3\u58A8",
        fits: ["\u82F1\u8BED", "\u901A\u7528"],
        paper: "#F6F8F9",
        surface: "#ECF1F3",
        ink: "#202426",
        muted: "#666B6D",
        accent: "#3E4448",
        line: "#D9DFE1",
        fontTitle: "song",
        fontBody: "song"
      },
      tigang: {
        id: "tigang",
        family: "tigang",
        name: "\u63D0\u7EB2",
        tone: "\u677E\u9752",
        fits: ["\u5386\u53F2", "\u5730\u7406", "\u9053\u6CD5", "\u79D1\u5B66"],
        paper: "#FAFAF6",
        surface: "#F0F0E9",
        ink: "#1D2A28",
        muted: "#646C69",
        accent: "#1F4B48",
        line: "#DFE0D8",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "tigang-zhu": {
        id: "tigang-zhu",
        family: "tigang",
        name: "\u63D0\u7EB2",
        tone: "\u6731",
        fits: ["\u5386\u53F2", "\u9053\u6CD5"],
        paper: "#FCF8F2",
        surface: "#F3EEE4",
        ink: "#262120",
        muted: "#6F665E",
        accent: "#7E3126",
        line: "#E2D9C9",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "tigang-lan": {
        id: "tigang-lan",
        family: "tigang",
        name: "\u63D0\u7EB2",
        tone: "\u975B\u84DD",
        fits: ["\u5730\u7406", "\u79D1\u5B66"],
        paper: "#F6F8FA",
        surface: "#ECF0F4",
        ink: "#1A242C",
        muted: "#5C6670",
        accent: "#1F4A6B",
        line: "#D2DCE4",
        fontTitle: "hei",
        fontBody: "hei"
      }
    };
    FAMILIES = {
      suke: { name: "\u7D20\u8BFE", note: "\u5355\u680F\u9760\u5DE6\uFF0C\u53F3\u4FA7\u7559\u753B", fits: ["\u8BED\u6587", "\u5199\u666F", "\u53D9\u4E8B"] },
      xuan: { name: "\u5BA3\u7EB8", note: "\u5C45\u4E2D\uFF0C\u843D\u4E00\u679A\u6731\u5370", fits: ["\u53E4\u8BD7\u6587", "\u6587\u8A00\u6587"] },
      liti: { name: "\u4F8B\u9898", note: "\u53CC\u680F\u7F51\u683C\uFF0C\u6B65\u9AA4\u5206\u660E", fits: ["\u6570\u5B66", "\u7269\u7406", "\u5316\u5B66"] },
      jijian: { name: "\u6781\u7B80", note: "\u5927\u7559\u767D\uFF0C\u53EA\u6709\u5B57", fits: ["\u901A\u7528"] },
      shuye: { name: "\u4E66\u9875", note: "\u5DE6\u8FB9\u680F\uFF0C\u6B63\u6587\u538B\u5728\u53F3\u680F", fits: ["\u82F1\u8BED", "\u9605\u8BFB"] },
      tigang: { name: "\u63D0\u7EB2", note: "\u9876\u90E8\u6807\u9898\u6761\uFF0C\u5927\u5E8F\u53F7", fits: ["\u5386\u53F2", "\u5730\u7406", "\u9053\u6CD5"] }
    };
    FAMILY_IDS = ["suke", "xuan", "liti", "jijian", "shuye", "tigang"];
    FAMILY_REPS = {
      suke: "suke",
      xuan: "xuan",
      liti: "liti",
      jijian: "jijian",
      shuye: "shuye",
      tigang: "tigang"
    };
    TEMPLATE_ORDER = TEMPLATE_IDS.map((id) => TEMPLATES[id]);
    FONT_FACE = {
      song: "\u5B8B\u4F53",
      kai: "\u6977\u4F53",
      hei: "\u82F9\u65B9-\u7B80"
    };
    FONT_STACK = {
      song: '"Songti SC", "SimSun", "Noto Serif SC", serif',
      kai: '"Kaiti SC", "KaiTi", "STKaiti", serif',
      hei: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    };
    CLASSIC = /古诗|文言|古文|诗词|宋词|唐诗|诗经|论语|孟子|庄子|楚辞|乐府|绝句|律诗|小古文|文赋/;
    CHINESE = /语文|汉语|国学|阅读|习作/;
    MATH = /数学|算术/;
    SCIENCE = /物理|化学|科学|生物/;
    ENGLISH = /英语|英文|外语/;
    HUMAN = /历史|地理|道法|道德|政治|社会/;
    HUE_CLASH = [150, 210];
    TEMPLATE_LIMITS = {
      inkContrastMin: 7,
      accentContrastMin: 4.5
    };
  }
});

// scripts/.diag.ts
import { writeFileSync } from "node:fs";
var g = globalThis;
g.window = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
var real = globalThis.fetch;
globalThis.fetch = (u, init) => real(String(u).startsWith("/") ? `http://localhost:8080${u}` : String(u), init);
var { buildStudentSlides: buildStudentSlides2 } = await Promise.resolve().then(() => (init_slides(), slides_exports));
var { generatePlan: generatePlan2, DEFAULT_CONFIG: DEFAULT_CONFIG2 } = await Promise.resolve().then(() => (init_llm(), llm_exports));
var { findText: findText2 } = await Promise.resolve().then(() => (init_texts(), texts_exports));
var { defaultTemplateId: defaultTemplateId2, templateOf: templateOf2 } = await Promise.resolve().then(() => (init_theme2(), theme_exports));
var { place: place2 } = await Promise.resolve().then(() => (init_place(), place_exports));
var which = process.argv[2] ?? "\u5C06\u76F8\u548C";
var input = {
  topic: which,
  subject: "\u8BED\u6587",
  stage: "\u5C0F\u5B66",
  grade: "\u4E94\u5E74\u7EA7",
  period: "\u7B2C\u4E00\u8BFE\u65F6",
  textbook: "\u90E8\u7F16\u7248",
  duration: 40,
  text: findText2(which)?.quotes.join("\n") ?? ""
};
var cfg = { ...DEFAULT_CONFIG2, apiKey: "" };
var t0 = Date.now();
var plan = await generatePlan2(input, cfg);
var marks = [`\u6559\u6848 ${((Date.now() - t0) / 1e3).toFixed(1)}s`];
var note = "";
var slides = await buildStudentSlides2(plan, cfg, {
  onFallback: (r) => {
    note = r;
  },
  onProgress: (p) => marks.push(`${p.stage}@${((Date.now() - t0) / 1e3).toFixed(0)}s`),
  onIllustrated: (n, used) => marks.push(`\u56FE${used}${n ? `/${n.slice(0, 14)}` : ""}`)
});
var tid = defaultTemplateId2(plan.meta.subject, plan.meta.topic, plan.meta.period);
var tpl = templateOf2(tid);
console.log(`
========== ${which}\uFF0840 \u5206\u949F \xB7 \u6A21\u677F ${tid} / ${tpl.family}\uFF09`);
console.log(`  ${marks.join(" | ")} | \u603B ${((Date.now() - t0) / 1e3).toFixed(1)}s`);
console.log(`  \u539F\u6587\uFF1A${findText2(which) ? "\u5185\u7F6E\u6709" : "\u5185\u7F6E\u6CA1\u6709"}\uFF1B\u73AF\u8282 ${plan.segments.length} \u4E2A`);
if (note) console.log(`  \u4EA4\u63A5\uFF1A${note}`);
console.log(`  \u5B66\u751F\u7248 ${slides.length} \u9875\uFF1B\u6709\u56FE ${slides.filter((s) => s.illustration).length} \u9875`);
var placedBlocks = 0;
var placedChars = 0;
slides.forEach((s, i) => {
  const blocks = place2(s, tpl);
  placedBlocks += blocks.length;
  for (const b of blocks) if (b.text) placedChars += [...b.text].length;
  console.log(
    `--- ${i + 1} [${s.kind}] title=${JSON.stringify(s.title)} line=${JSON.stringify(s.line ?? "")} items=${JSON.stringify(s.items ?? [])} ${s.illustration ? "[\u56FE]" : "[\u65E0\u56FE]"} \u7248\u5F0F\u5757=${blocks.length} \u5B57=${blocks.reduce((n, b) => n + [...b.text ?? ""].length, 0)}`
  );
});
console.log(`  \u5408\u8BA1\uFF1A\u7248\u5F0F\u5757 ${placedBlocks}\uFF0C\u4E0A\u5C4F\u5B57 ${placedChars}\uFF0C\u5E73\u5747\u6BCF\u9875 ${(placedChars / slides.length).toFixed(0)} \u5B57`);
writeFileSync("/tmp/diag-plan.json", JSON.stringify(plan, null, 1), "utf8");
writeFileSync("/tmp/diag-slides.json", JSON.stringify(slides, null, 1), "utf8");
