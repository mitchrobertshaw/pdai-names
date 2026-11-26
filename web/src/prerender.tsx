// The homepage rendered to HTML when the site is built (scripts/prerender.mjs), so search engines and
// link previews find its words without running any JavaScript. In the browser, main.tsx renders the
// same page over it.
import { renderToString } from "react-dom/server";

import { App } from "./App";

export function render(): string {
  return renderToString(<App />);
}
