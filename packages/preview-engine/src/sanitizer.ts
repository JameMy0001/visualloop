export interface SandboxOptions {
  allowInlineScripts?: boolean;
  allowInlineStyles?: boolean;
  cspConnectSrc?: string;
}

/**
 * Sanitizes untrusted SVG content by removing executable scripts, event handlers,
 * dangerous tags (including foreignObject, embed, iframe, object), xml-stylesheet processing instructions,
 * and pseudo-protocols like javascript:/vbscript:.
 */
export function sanitizeSvg(rawSvg: string): string {
  if (!rawSvg) return "";
  let clean = rawSvg;

  // 1. Remove XML stylesheets and processing instructions: <?xml-stylesheet ...?>
  clean = clean.replace(/<\?xml-stylesheet[\s\S]*?\?>/gi, "");

  // 2. Remove script tags (both standard and namespaced, e.g. <svg:script>)
  clean = clean.replace(
    /<([a-zA-Z0-9_-]+:)?script\b[^<]*(?:(?!<\/([a-zA-Z0-9_-]+:)?script>)<[^<]*)*<\/([a-zA-Z0-9_-]+:)?script>/gi,
    ""
  );

  // 3. Remove dangerous foreign/executable tags
  clean = clean.replace(
    /<\/?([a-zA-Z0-9_-]+:)?(?:foreignObject|embed|object|iframe|applet|meta|link|base|form|input|button|textarea|audio|video)\b[^>]*>/gi,
    ""
  );

  // 4. Remove inline event handlers (on*, e.g., onload, onclick, onerror, onmouseover)
  clean = clean.replace(/\s+on[a-zA-Z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // 5. Remove javascript: / vbscript: / data:text/html links in href, xlink:href, or src
  clean = clean.replace(
    /\s+(?:[a-zA-Z0-9_-]+:)?(?:href|src)\s*=\s*["']?\s*(?:javascript|vbscript|data:text\/html):[^"'>\s]*/gi,
    ""
  );

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
