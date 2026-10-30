import { describe, it, expect } from "vitest";
import { sanitizeSvg, generateSandboxedHtml } from "./sanitizer.js";

describe("Preview Sanitizer & CSP Sandbox", () => {
  it("removes malicious <script> tags from SVG", () => {
    const malicious = `<svg><circle r="10"/><script>fetch('http://attacker.com')</script></svg>`;
    const sanitized = sanitizeSvg(malicious);
    expect(sanitized).not.toContain("<script>");
    expect(sanitized).not.toContain("attacker.com");
    expect(sanitized).toContain("<circle");
  });

  it("removes inline event handlers like onload, onerror, onclick", () => {
    const malicious = `<svg><rect onload="alert('pwned')" onclick="steal()" width="100"/></svg>`;
    const sanitized = sanitizeSvg(malicious);
    expect(sanitized).not.toContain("onload");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("alert");
    expect(sanitized).toContain("<rect");
  });

  it("removes javascript: URIs in xlink:href and href", () => {
    const malicious = `<svg><a href="javascript:alert(1)"><text>Click</text></a></svg>`;
    const sanitized = sanitizeSvg(malicious);
    expect(sanitized).not.toContain("javascript:alert(1)");
  });

  it("injects strict Content Security Policy into HTML documents", () => {
    const rawHtml = "<html><head><title>Test</title></head><body><h1>Hello</h1></body></html>";
    const sandboxed = generateSandboxedHtml(rawHtml);
    expect(sandboxed).toContain("Content-Security-Policy");
    expect(sandboxed).toContain("connect-src 'none'");
    expect(sandboxed).toContain("default-src 'none'");
    expect(sandboxed).toContain('referrer" content="no-referrer"');
  });

  it("wraps raw body HTML in safe HTML shell with CSP if head is missing", () => {
    const snippet = "<div class='card'>Component</div>";
    const sandboxed = generateSandboxedHtml(snippet);
    expect(sandboxed).toContain("<!DOCTYPE html>");
    expect(sandboxed).toContain("Content-Security-Policy");
    expect(sandboxed).toContain("<div class='card'>Component</div>");
  });
});
