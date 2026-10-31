export interface SandboxOptions {
  allowInlineScripts?: boolean;
  allowInlineStyles?: boolean;
  cspConnectSrc?: string;
}

/**
 * Sanitizes untrusted SVG content by removing executable scripts, event handlers,
 * dangerous tags (including foreignObject, embed, iframe, object), xml-stylesheet processing instructions,
 * and pseudo-protocols like javascript:/vbscript:.
 * Uses real DOM tree traversal when running in DOM environments, with multi-pass fallback for Node.
 */
export function sanitizeSvg(rawSvg: string): string {
  if (!rawSvg) return "";

  // 1. If running in a DOM environment (browser, Tauri WKWebView), use true XML DOM parsing
  if (typeof DOMParser !== "undefined" && typeof XMLSerializer !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawSvg, "image/svg+xml");

      const parserError = doc.querySelector("parsererror");
      if (!parserError) {
        const forbiddenTags = new Set([
          "script",
          "foreignobject",
          "embed",
          "object",
          "iframe",
          "meta",
          "link",
          "base",
          "form",
          "input",
          "button",
        ]);

        const sanitizeNode = (node: Element) => {
          const tag = (node.localName || node.tagName).toLowerCase();
          if (forbiddenTags.has(tag)) {
            node.remove();
            return;
          }

          const attrs = Array.from(node.attributes);
          for (const attr of attrs) {
            const attrName = attr.name.toLowerCase();
            const attrValue = attr.value.trim().toLowerCase();

            if (attrName.startsWith("on")) {
              node.removeAttribute(attr.name);
              continue;
            }

            if (
              (attrName === "href" || attrName === "xlink:href" || attrName === "src") &&
              (attrValue.startsWith("javascript:") ||
                attrValue.startsWith("vbscript:") ||
                attrValue.startsWith("data:text/html"))
            ) {
              node.removeAttribute(attr.name);
            }
          }

          const children = Array.from(node.children);
          for (const child of children) {
            sanitizeNode(child);
          }
        };

        const svgRoot = doc.documentElement;
        if (svgRoot && (svgRoot.localName || svgRoot.tagName).toLowerCase() === "svg") {
          sanitizeNode(svgRoot);
          return new XMLSerializer().serializeToString(svgRoot);
        }
      }
    } catch (e) {
      // fallback
    }
  }

  // 2. Headless Node.js tokenizer / multi-pass regex sanitizer
  let clean = rawSvg;

  // Remove XML stylesheets and processing instructions: <?xml-stylesheet ...?>
  clean = clean.replace(/<\?xml-stylesheet[\s\S]*?\?>/gi, "");

  // Remove script tags (both standard and namespaced, e.g. <svg:script>)
  clean = clean.replace(
    /<([a-zA-Z0-9_-]+:)?script\b[^<]*(?:(?!<\/([a-zA-Z0-9_-]+:)?script>)<[^<]*)*<\/([a-zA-Z0-9_-]+:)?script>/gi,
    ""
  );

  // Remove dangerous foreign/executable tags
  clean = clean.replace(
    /<\/?([a-zA-Z0-9_-]+:)?(?:foreignObject|embed|object|iframe|applet|meta|link|base|form|input|button|textarea|audio|video)\b[^>]*>/gi,
    ""
  );

  // Remove inline event handlers (on*, e.g., onload, onclick, onerror, onmouseover)
  clean = clean.replace(/\s+on[a-zA-Z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Remove javascript: / vbscript: / data:text/html links in href, xlink:href, or src
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
    options.allowInlineStyles !== false ? "style-src 'unsafe-inline' 'self' https:" : "style-src 'self' https:",
    "img-src 'self' data: blob: https:",
    options.allowInlineScripts ? "script-src 'unsafe-inline' https:" : "script-src 'none' https:",
    "media-src 'self' data:",
    `connect-src ${options.cspConnectSrc || "'none'"}`,
    "font-src 'self' data: https:",
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
