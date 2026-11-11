// The reserved names list the contracts are deployed with (script/reserved-names.csv), so the
// site says "reserved" for exactly the names the deploy sets aside.
import csv from "../../../script/reserved-names.csv?raw";

export interface Reservation {
  label: string;
  /** The note in the list, e.g. "Your Friend Sommi (@yourfriendSOMMI). …". */
  note: string;
  /** True if the name goes straight to a wallet; false if it is held until claimed. */
  given: boolean;
}

/** Parses the list the same way the deploy script does: header row optional, names lower-cased. */
export function parseReservedNames(text: string): Map<string, Reservation> {
  const names = new Map<string, Reservation>();
  let firstRow = true;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(",");
    const label = cells[0].trim().toLowerCase();
    const wallet = (cells[1] ?? "").trim();
    if (firstRow) {
      firstRow = false;
      if (label === "name" && wallet.toLowerCase() === "wallet") continue;
    }
    names.set(label, { label, note: cells.slice(2).join(",").trim(), given: wallet !== "" });
  }
  return names;
}

/** Who a reservation is for, from its note: the text before the first bracket or full stop. */
export function reservedFor(note: string): string {
  return note.split(/ \(|\. |\.$/)[0].trim();
}

export const reservedNames = parseReservedNames(csv);
