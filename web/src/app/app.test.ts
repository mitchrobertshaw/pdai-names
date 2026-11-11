import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  type Hex,
  keccak256,
  toBytes,
  zeroAddress,
} from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureReferral,
  LAUNCH_OFFER_DAYS,
  launchOffer,
  REMEMBER_DAYS,
  referralLink,
  referralOfferText,
  referrerFrom,
} from "../lib/referral";
import { commitmentOf, labelId, NO_REFERRER, type Purchase, referralTag } from "./purchase";
import { usdcText } from "../lib/payouts";
import { PAY_CHAIN, type PayToken } from "../lib/tokens";
import { checkoutAbi } from "./abis";
import { amountToSend } from "./BuyPanel";
import { amountText, changeText, errorText, shortText, testnetFees } from "./flows";
import { anyPower, OWNER_ROLES, parseNames, powersOf } from "./admin";
import { baseRatio, LIST_LEVEL, levelOf, priceDecimalsFrom, ratioFor } from "./live";
import { localInfo } from "./lookup";
import { renewableYears } from "./ManagePanel";
import { chainName } from "./network";
import { hrefOf, modeOf, parse, type Place } from "./router";
import { isUnknownChain } from "./wallet";

const purchase: Purchase = {
  label: "alice",
  owner: "0x328809Bc894f92807417D2dAD6b7C998c1aFdac6",
  secret: `0x${"11".repeat(32)}`,
  subregistry: zeroAddress,
  resolver: zeroAddress,
  duration: 31_536_000n,
  referrer: NO_REFERRER,
};

describe("buying", () => {
  it("commits exactly as the deployed registrar's makeCommitment does", () => {
    // From ETHRegistrar.makeCommitment on a deployment.
    expect(commitmentOf(purchase)).toBe("0xd9a764372bda56ec1d542c80b3d205148b386b601cf67981e3cbe759e463f941");
  });

  it("knows a name by keccak256 of its label, as ENSv2 does", () => {
    expect(labelId("alice")).toBe(BigInt(keccak256(toBytes("alice"))));
  });
});

describe("referrals", () => {
  it("take a .pdai name from the link, in any case, with or without .pdai", () => {
    expect(referrerFrom("Mick")).toBe("mick");
    expect(referrerFrom("mick.pdai")).toBe("mick");
    expect(referrerFrom("mi")).toBeNull(); // too short to be a name
    expect(referrerFrom("not a name")).toBeNull();
    expect(referrerFrom(null)).toBeNull();
    expect(referralLink("mick")).toBe("https://pdai.domains/?ref=mick");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("are remembered for 58 days after the visitor clicks the link", () => {
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
    });
    const visit = (search: string) => vi.stubGlobal("window", { location: { search } });
    const day = 24 * 60 * 60 * 1000;
    const clicked = Date.UTC(2026, 10, 7);

    visit("?ref=mick");
    expect(captureReferral(clicked)).toBe("mick");
    visit(""); // later visits, without the link
    expect(REMEMBER_DAYS).toBe(58);
    expect(captureReferral(clicked + 58 * day)).toBe("mick");
    expect(captureReferral(clicked + 58 * day + 1)).toBeNull();
  });

  it("earn 10% for the first 58 days after launch", () => {
    expect(LAUNCH_OFFER_DAYS).toBe(58);
    expect(REMEMBER_DAYS).toBe(LAUNCH_OFFER_DAYS); // a link clicked at launch lasts the whole offer
    const offer = launchOffer("2026-12-01", Date.UTC(2026, 11, 1));
    // 1 December 2026 to 27 January 2027 is 58 days.
    expect(offer?.lastDay.toISOString()).toBe("2027-01-27T00:00:00.000Z");
    expect(offer?.open).toBe(true);
    expect(launchOffer("2026-12-01", Date.UTC(2027, 0, 27, 23, 59))?.open).toBe(true);
    expect(launchOffer("2026-12-01", Date.UTC(2027, 0, 28))?.open).toBe(false);
    expect(launchOffer(undefined)).toBeNull();
    expect(launchOffer("1 December")).toBeNull();

    expect(referralOfferText(offer)).toBe(
      "Share it. Until 27 January 2027, when someone buys or renews a name through it, you earn 10% of what they pay.",
    );
    expect(referralOfferText(launchOffer("2026-12-01", Date.UTC(2027, 1, 1)))).toBe(
      "The launch offer, 10% of what buyers paid through referral links, ended on 27 January 2027.",
    );
    expect(referralOfferText(null)).toBe(
      "Share it. For the first 58 days after launch, when someone buys or renews a name through it, you earn 10% of what they pay.",
    );
  });

  it("tag a purchase with the referrer's name, never their own", () => {
    expect(referralTag("mick", "alice")).toBe(keccak256(toBytes("mick")));
    expect(referralTag("alice", "alice")).toBe(NO_REFERRER);
    expect(referralTag(null, "alice")).toBe(NO_REFERRER);
  });
});

describe("the app's pages", () => {
  const at = (url: string): Place => {
    const u = new URL(url);
    return { pathname: u.pathname, hash: u.hash, hostname: u.hostname, protocol: u.protocol };
  };

  it("sit at the root of app.pdai.domains", () => {
    expect(modeOf(at("https://app.pdai.domains/alice.pdai"))).toEqual({ base: "", hash: false });
    expect(parse(at("https://app.pdai.domains/alice.pdai"))).toEqual({ page: "name", label: "alice" });
    expect(parse(at("https://app.pdai.domains/names"))).toEqual({ page: "names" });
    expect(parse(at("https://app.pdai.domains/"))).toEqual({ page: "search" });
    expect(hrefOf({ page: "name", label: "alice" }, at("https://app.pdai.domains/"))).toBe("/alice.pdai");
  });

  it("sit under /app on a preview link", () => {
    const place = at("https://deploy-preview-5--pdai-domains.netlify.app/app/Alice.pdai");
    expect(modeOf(place)).toEqual({ base: "/app", hash: false });
    expect(parse(place)).toEqual({ page: "name", label: "alice" });
    expect(hrefOf({ page: "names" }, place)).toBe("/app/names");
  });

  it("include the referral payout report at /referrals, which isn't a name", () => {
    expect(parse(at("https://app.pdai.domains/referrals"))).toEqual({ page: "referrals" });
    expect(parse(at("https://app.pdai.domains/referrals.pdai"))).toEqual({ page: "name", label: "referrals" });
    expect(parse(at("https://pdai-domains-testnet.netlify.app/app/referrals"))).toEqual({ page: "referrals" });
    expect(hrefOf({ page: "referrals" }, at("https://pdai-domains-testnet.netlify.app/app/"))).toBe("/app/referrals");
  });

  it("go after a # anywhere else, such as a copy opened from a file", () => {
    const place = at("file:///Users/me/pdains-app.html#/b%C3%BCcher.pdai");
    expect(modeOf(place)).toEqual({ base: "", hash: true });
    expect(parse(place)).toEqual({ page: "name", label: "bücher" });
    expect(hrefOf({ page: "search" }, place)).toBe("#/");
  });
});

describe("a name's page", () => {
  it("says a name over 63 bytes is too long, and doesn't offer it", () => {
    expect(localInfo(`${"a".repeat(63)}.pdai`)).toMatchObject({ kind: "available", length: 63 });
    expect(localInfo("a".repeat(64))).toEqual({ kind: "too-long", label: "a".repeat(64), length: 64, bytes: 64 });
    expect(localInfo("🔥".repeat(16))).toMatchObject({ kind: "invalid" }); // only letters, numbers and hyphens
  });
});

describe("the wallet's network", () => {
  it("is named in plain words", () => {
    expect(chainName(1)).toBe("Ethereum");
    expect(chainName(369)).toBe("PulseChain");
    expect(chainName(943)).toBe("PulseChain Testnet v4");
    expect(chainName(8453)).toBe("Base");
    expect(chainName(999_999)).toBe("network 999999");
  });

  it("knows when a wallet doesn't have PulseChain, however the wallet says so", () => {
    expect(isUnknownChain({ code: 4902 })).toBe(true);
    expect(isUnknownChain({ code: -32603, data: { originalError: { code: 4902 } } })).toBe(true);
    expect(
      isUnknownChain({
        code: -32603,
        message: 'Unrecognized chain ID "0x171". Try adding the chain using wallet_addEthereumChain first.',
      }),
    ).toBe(true);
    expect(isUnknownChain({ code: 4001, message: "User rejected the request." })).toBe(false);
    expect(isUnknownChain(new Error("network error"))).toBe(false);
  });
});

describe("paying", () => {
  const usdc = PAY_CHAIN.tokens.find((t) => !t.path) as PayToken;
  const pls = PAY_CHAIN.tokens.find((t) => t.native) as PayToken;
  const pdai = PAY_CHAIN.tokens.find((t) => t.symbol === "pDAI") as PayToken;
  const refused = (data: Hex) =>
    new ContractFunctionExecutionError(
      new ContractFunctionRevertedError({ abi: checkoutAbi, data, functionName: "registerWithToken" }),
      { abi: checkoutAbi, functionName: "registerWithToken", args: [] },
    );

  it("shows USDC to the last unit, as prices are exact", () => {
    expect(amountText(usdc, 10_000_000n)).toBe("10.00 USDC from Ethereum");
    expect(amountText(usdc, 17_500_000n)).toBe("17.50 USDC from Ethereum");
    expect(amountText(usdc, 10_000_003n)).toBe("10.000003 USDC from Ethereum");
    expect(amountText(pls, 512_345_678n * 10n ** 15n)).toBe("512,300 PLS");
    expect(amountText(pdai, 9_251_234n * 10n ** 15n)).toBe("9,251 pDAI"); // $10 in November 2026
  });

  it("tells a wallet short of the price what it holds and what it costs, before anything is sent", () => {
    expect(shortText(usdc, 10_000_000n, 10_000_003n)).toBe(
      "This wallet holds 10.00 USDC from Ethereum, and this costs 10.000003 USDC from Ethereum. " +
        "Add a little more, then try again. Nothing was paid.",
    );
    expect(shortText(pls, 1n, 2n)).toBe(
      "This wallet doesn't hold enough PLS to pay. Add a little more, then try again. Nothing was paid.",
    );
  });

  it("says a swap sends 2% extra and the change comes back in USDC, so the wallet's amount isn't a surprise", () => {
    const usdt = PAY_CHAIN.tokens.find((t) => t.symbol === "USDT") as PayToken;
    // The launch rehearsal: a $10 name quoted at 10.06 USDT, and the wallet sent 10.26.
    expect(changeText(usdt, 10_058_700n)).toBe(
      "Your wallet sends about 10.26 USDT: 2% extra in case the price moves. " +
        "What isn’t needed comes straight back to you, in USDC.",
    );
    // Where there's no quote to hand (renewing).
    expect(changeText(pls)).toBe(
      "Your wallet sends 2% more PLS than this costs, in case the price moves. " +
        "What isn’t needed comes straight back to you, in USDC.",
    );
    // USDC isn't swapped: exactly the price is sent, and nothing comes back.
    expect(changeText(usdc, 10_000_000n)).toBeNull();
    expect(changeText(usdc)).toBeNull();
  });

  it("says plainly why a payment would fail, which isn't sent", () => {
    const short = encodeErrorResult({
      abi: checkoutAbi,
      errorName: "InsufficientPayment",
      args: [10_000_000n, 10_000_003n],
    });
    expect(errorText(refused(short))).toBe(
      "It would fail, so it wasn't sent, and nothing was paid. The price changed while paying. Try again.",
    );
    const taken = encodeErrorResult({ abi: checkoutAbi, errorName: "NameNotAvailable", args: ["alice"] });
    expect(errorText(refused(taken))).toBe(
      "It would fail, so it wasn't sent, and nothing was paid. Someone else registered it first.",
    );
    const moved = encodeErrorResult({
      abi: [{ type: "error", name: "Error", inputs: [{ type: "string", name: "message" }] }],
      errorName: "Error",
      args: ["PulseXRouter: INSUFFICIENT_OUTPUT_AMOUNT"],
    });
    expect(errorText(refused(moved))).toBe(
      "It would fail, so it wasn't sent, and nothing was paid. The price moved while paying. Try again.",
    );
    expect(errorText(refused("0x12345678"))).toBe("It would fail, so it wasn't sent, and nothing was paid.");
    expect(errorText({ code: 4001, message: "User rejected the request." })).toBe(
      "You cancelled it in your wallet. Nothing was paid.",
    );
  });

  it("offers PulseChain's testnet a 1 gwei tip, not the thousands of gwei it suggests", () => {
    expect(testnetFees(7n)).toEqual({ maxPriorityFeePerGas: 1_000_000_000n, maxFeePerGas: 1_000_000_014n });
    expect(testnetFees(undefined)).toEqual({ maxPriorityFeePerGas: 1_000_000_000n, maxFeePerGas: 1_000_000_000n });
  });
});

describe("the admin page", () => {
  const YEAR = 365n * 86_400n;
  // The oracle's math (ENSv2 StandardRentPriceOracle): rate x duration, the multi-year discount
  // rounded down, then the amount in a token rounded up.
  const DEN = 10n ** 38n;
  const points: [bigint, bigint][] = [
    [2n * YEAR, (DEN / 4n) * 3n],
    [3n * YEAR, (DEN / 12n) * 7n],
    [4n * YEAR, (DEN / 32n) * 15n],
    [5n * YEAR, (DEN / 5n) * 2n],
  ];
  const discount = (value: bigint, duration: bigint) => {
    let numer = 0n;
    for (const [at, n] of points) if (duration >= at) numer = n;
    return numer === 0n ? value : (value * numer) / DEN;
  };
  const amount = (value: bigint, r: { numer: bigint; denom: bigint }) =>
    r.numer === r.denom ? value : (value * r.numer + r.denom - 1n) / r.denom;
  const rate = (dollars: bigint, decimals: number) => (10n ** BigInt(decimals) * dollars) / YEAR; // rounded down

  it("reads the oracle's units from its rate for 5+ letter names", () => {
    expect(priceDecimalsFrom(317_098n)).toBe(12); // the first testnet: 10^12 to the dollar, rounded up
    expect(priceDecimalsFrom(rate(10n, 27))).toBe(27); // since: 10^27, rounded down
  });

  it("knows the list prices from the exchange rates the deploy sets", () => {
    expect(levelOf({ numer: 1n, denom: 10n ** 6n }, 6, 12)).toBe(LIST_LEVEL); // USDC on the first testnet
    expect(levelOf({ numer: 1n, denom: 10n ** 21n }, 6, 27)).toBe(LIST_LEVEL); // USDC since
    expect(levelOf({ numer: 1n, denom: 10n ** 9n }, 18, 27)).toBe(LIST_LEVEL); // DAI since
    expect(levelOf({ numer: 10n ** 6n, denom: 1n }, 18, 12)).toBe(LIST_LEVEL); // DAI on the first testnet
    expect(baseRatio(6, 27)).toEqual({ numer: 1n, denom: 10n ** 21n });
  });

  it("sets every price exactly to the level, in USDC and DAI, for every length and term", () => {
    const eighths = [8n, 12n, 14n, 15n, 16n]; // each term's share of a year's price
    for (const level of [12_000n, 8_000n, 12_345n, 50_000n]) {
      for (const [token, decimals] of [
        ["USDC", 6],
        ["DAI", 18],
      ] as const) {
        const ratio = ratioFor(level, decimals, 27);
        expect(levelOf(ratio, decimals, 27), `${token} at ${level}`).toBe(level);
        for (const dollars of [10n, 160n, 320n]) {
          for (let y = 1n; y <= 5n; y++) {
            const value = discount(rate(dollars, 27) * y * YEAR, y * YEAR);
            const listed = (dollars * 10n ** BigInt(decimals) * eighths[Number(y) - 1]) / 8n;
            expect(amount(value, ratio), `$${dollars} for ${y} years in ${token} at ${level}`).toBe(
              (listed * level) / LIST_LEVEL,
            );
          }
        }
      }
    }
  });

  it("opens for a wallet with admin powers, and shows only those it has", () => {
    const adminOf = (role: bigint) => role << 128n;
    // What the deploy gives the admin on the .pdai registry (PdaiDeployer).
    const deployed =
      adminOf(1n) | adminOf(1n << 16n) | (1n << 4n) | adminOf(1n << 4n) | (1n << 36n) | adminOf(1n << 36n);
    const all = { pause: true, prices: true, hold: true, handOut: true, extend: true, leftover: 0n };
    expect(powersOf(deployed, true)).toEqual(all);
    const none = { pause: false, prices: false, hold: false, handOut: false, extend: false, leftover: 0n };
    expect(powersOf(0n, false)).toEqual(none);
    expect(anyPower(powersOf(0n, false))).toBe(false);
    expect(anyPower(powersOf(0n, true))).toBe(true); // prices only, say, with the rest given up
    // Left holding the power to register names, by an action that didn't finish: it's offered back.
    expect(powersOf(deployed | 1n, true).leftover).toBe(1n);
    // The roles a buyer gets with a name (ETHRegistrar's REGISTRATION_ROLE_BITMAP).
    expect(OWNER_ROLES).toBe((1n << 20n) | (1n << 148n) | (1n << 24n) | (1n << 152n) | (1n << 156n));
  });

  it("takes names to hold as they're typed, checked as a search checks them", () => {
    expect(parseNames("Alice, bob\ncarol.pdai  alice")).toEqual({ labels: ["alice", "bob", "carol"], problems: [] });
    const { labels, problems } = parseNames("ab x a.b ab--cd good");
    expect(labels).toEqual(["good"]);
    expect(problems).toHaveLength(4);
    expect(problems[0]).toMatch(/^ab: names of 1 or 2 characters/);
  });

  it("sits at /admin, out of the menu", () => {
    const place = { pathname: "/app/admin", hash: "", hostname: "pdai-domains-testnet.netlify.app", protocol: "https:" };
    expect(parse(place)).toEqual({ page: "admin" });
    expect(hrefOf({ page: "admin" }, place)).toBe("/app/admin");
  });
});

describe("coming from another chain", () => {
  it("asks LibertySwap for the price, a margin for prices moving, and at least its $10 minimum", () => {
    expect(amountToSend(10)).toBe(12);
    expect(amountToSend(20)).toBe(22);
    expect(amountToSend(640)).toBe(667);
    expect(amountToSend(0)).toBe(10); // just PLS for the network fee
  });
});

describe("renewing", () => {
  it("goes up to 5 years ahead, the most a name can be paid for", () => {
    const now = 1_800_000_000;
    const year = 365 * 86_400;
    expect(renewableYears(now + year, now)).toBe(4);
    expect(renewableYears(now + 4 * year, now)).toBe(1);
    expect(renewableYears(now + 4.5 * year, now)).toBe(0); // half a year more to wait
    expect(renewableYears(now + 5 * year, now)).toBe(0);
    expect(renewableYears(now - 10 * 86_400, now)).toBe(5); // expired, in its grace period
  });
});

describe("the payout report page", () => {
  it("shows USDC to send without needless zeros", () => {
    expect(usdcText(3_250_000n)).toBe("3.25");
    expect(usdcText(1_000_000n)).toBe("1.00");
    expect(usdcText(7n)).toBe("0.000007");
    expect(usdcText(1_234_567_891_230n)).toBe("1,234,567.89123");
  });
});
