// After `vite build`: makes the built site easy for search engines to read.
//
// - Writes the homepage's words into dist/index.html, rendered from the same components by the
//   server build in .prerender/ (src/prerender.tsx). Search engines and link previews read them
//   without running any JavaScript; in the browser, main.tsx renders the page over them.
// - Writes robots.txt and sitemap.xml. A testnet copy of the site (VITE_NETWORK=testnet) asks search
//   engines to stay away instead, so only the real site is ever found.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("..", import.meta.url));
const dist = `${web}dist`;
const testnet = process.env.VITE_NETWORK === "testnet";
const SITE = testnet ? "https://pdai-domains-testnet.netlify.app" : "https://pdai.domains";

// The little of a browser the homepage's components read while rendering: where the page is (so its
// links to the app point at the real app), media queries (none match) and storage (empty).
globalThis.window = globalThis;
globalThis.location = new URL(`${SITE}/`);
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
const stored = new Map();
globalThis.localStorage = { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, String(v)), removeItem: (k) => stored.delete(k) };

const { render } = await import(`${web}.prerender/prerender.js`);
const body = render();
if (!body.includes("<h1") || body.length < 5000) throw new Error("The homepage didn't render as expected; see src/prerender.tsx.");

const page = `${dist}/index.html`;
const html = readFileSync(page, "utf8");
const root = '<div id="root"></div>';
if (html.split(root).length !== 2) throw new Error(`dist/index.html should have one empty ${root}`);
writeFileSync(page, html.replace(root, `<div id="root">${body}</div>`));

if (testnet) {
  // The testnet copy: not for search results.
  writeFileSync(`${dist}/robots.txt`, "# A testnet copy of pdai.domains: not for search engines.\nUser-agent: *\nDisallow: /\n");
  for (const file of [page, `${dist}/app/index.html`]) {
    const text = readFileSync(file, "utf8").replace(/ *<link rel="canonical"[^>]*>\n/, "");
    writeFileSync(file, text.replace("<head>", '<head>\n    <meta name="robots" content="noindex, nofollow" />'));
  }
} else {
  writeFileSync(
    `${dist}/robots.txt`,
    "# pdai.domains and app.pdai.domains: everything may be crawled, apart from the site's functions.\nUser-agent: *\nDisallow: /api/\n\nSitemap: https://pdai.domains/sitemap.xml\n",
  );
  const day = new Date().toISOString().slice(0, 10);
  const urls = ["https://pdai.domains/", "https://app.pdai.domains/"];
  writeFileSync(
    `${dist}/sitemap.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${day}</lastmod></url>`).join("\n")}\n</urlset>\n`,
  );
}

rmSync(`${web}.prerender`, { recursive: true, force: true });
console.log(`prerendered the homepage (${body.length} characters)${testnet ? ", testnet: noindex" : ", robots.txt and sitemap.xml"}`);
