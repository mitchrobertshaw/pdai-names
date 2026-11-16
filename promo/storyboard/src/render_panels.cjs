// Screenshot every <section class="panel"> in panels.html at 1920x1080 -> OUTDIR/<id>.png
const { chromium } = require("playwright");
(async () => {
  const [html, outdir, only] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto("file://" + html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const ids = await page.$$eval("section.panel", (els) => els.map((e) => e.id));
  for (const id of ids) {
    if (only && !only.split(",").includes(id)) continue;
    await page.locator("#" + id).screenshot({ path: `${outdir}/${id}.png` });
    process.stdout.write(id + " ");
  }
  console.log();
  await browser.close();
})();
