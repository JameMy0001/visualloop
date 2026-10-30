export interface SandboxOptions {
  allowInlineScripts?: boolean;
  allowInlineStyles?: boolean;
  cspConnectSrc?: string;
}

/**
 * Sanitizes untrusted SVG content by removing executable scripts, event handlers,
 * external object embeds, and javascript: pseudo-protocols.
 */
export function sanitizeSvg(rawSvg: string): string {
  let clean = rawSvg;

  // 1. Remove <script> tags and contents
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // 2. Remove dangerous foreign/executable tags
  clean = clean.replace(/<\/?(?:foreignObject|embed|object|iframe|applet|meta|link)\b[^>]*>/gi, "");

  // 3. Remove inline event handlers (on*, e.g., onload, onclick, onerror)
  clean = clean.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // 4. Remove javascript: links in href or xlink:href
  clean = clean.replace(/\s+(?:href|xlink:href)\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, "");

  return clean;
}

/**
 * Wraps or injects a strict Content Security Policy (CSP) into HTML content
 * to ensure previewed pages cannot execute unauthorized network requests,
 * access parent frames, or reach local/remote servers.
 */
export function generateSandboxedHtml(rawHtml: string, options: SandboxOptions = {}): string {
  const defaultCsp = [
    "default-src 'none'",
    options.allowInlineStyles !== false ? "style-src 'unsafe-inline' 'self'" : "style-src 'self'",
    "img-src 'self' data: blob:",
    options.allowInlineScripts ? "script-src 'unsafe-inline'" : "script-src 'none'",
    "media-src 'self' data:",
    `connect-src ${options.cspConnectSrc || "'none'"}`,
    "font-src 'self' data:",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");

  const cspMetaTag = `<meta http-equiv="Content-Security-Policy" content="${defaultCsp}">`;
  const securityMetaTags = [
    cspMetaTag,
    '<meta name="referrer" content="no-referrer">',
    '<base target="_blank">',
  ].join("\n    ");

  if (/<head>/i.test(rawHtml)) {
    return rawHtml.replace(/<head>/i, `<head>\n    ${securityMetaTags}`);
  }

  if (/<html>/i.test(rawHtml)) {
    return rawHtml.replace(/<html>/i, `<html>\n<head>\n    ${securityMetaTags}\n</head>`);
  }

  return `<!DOCTYPE html>\n<html>\n<head>\n    ${securityMetaTags}\n</head>\n<body>\n${rawHtml}\n</body>\n</html>`;
}
