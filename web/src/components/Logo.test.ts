// The mark is drawn in several places: the site, the on-chain name cards, the brand files and the
// favicon. They must all be the same shape.
import { describe, expect, it } from "vitest";

import appIcon from "../../../brand/pdains-app-icon.svg?raw";
import markSquare from "../../../brand/pdains-mark-square.svg?raw";
import mark from "../../../brand/pdains-mark.svg?raw";
import nameCard from "../../../src/PdaiNameCard.sol?raw";
import appPage from "../../app/index.html?raw";
import page from "../../index.html?raw";
import favicon from "../../public/favicon.svg?raw";
import { MARK_PATH } from "./Logo";

describe("the mark", () => {
  it("is the same shape on the name cards wallets show", () => {
    expect(nameCard).toContain(`"${MARK_PATH}"`);
  });

  it("is the same shape in the brand files and the favicon", () => {
    for (const svg of [mark, markSquare, appIcon, favicon]) expect(svg).toContain(`d="${MARK_PATH}"`);
  });

  it("is the same shape in the favicon each page carries inside it", () => {
    for (const html of [page, appPage]) expect(decodeURIComponent(html.replace(/%22/g, '"'))).toContain(MARK_PATH);
  });
});
