// Render film frames from scenes.html: each frame f is window.render(f / 30), screenshot at 1080 x 1080.
// usage: node render_frames.cjs SCENES.html OUTDIR F0 F1 [STEP]   or   ... OUTDIR list f1,f2,...
const { chromium } = require("playwright");
(async () => {
  const [html, outdir, a, b, step] = process.argv.slice(2);
  const frames = a === "list" ? b.split(",").map(Number) : (() => { const o = []; for (let f = +a; f <= +b; f += +(step || 1)) o.push(f); return o; })();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto("file://" + html, { waitUntil: "load" });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); window.ready(); });
  for (const f of frames) {
    await page.evaluate((t) => window.render(t), f / 30);
    await page.screenshot({ path: `${outdir}/f_${String(f).padStart(5, "0")}.png`, clip: { x: 0, y: 0, width: 1080, height: 1080 } });
  }
  if (errs.length) console.log("ERRORS", JSON.stringify(errs.slice(0, 5)));
  console.log("rendered", frames.length);
  await browser.close();
})();
