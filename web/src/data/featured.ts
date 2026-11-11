// The names floating at the top of the homepage: HEX KOLs, with their X profile pictures.
//
// After adding someone with an X handle, run `npm run avatars` to save their picture in
// src/assets/avatars. For someone without one, save their picture there yourself, 400 by 400, and
// name it in `picture`. Every person here must also be in script/reserved-names.csv, so the
// homepage never advertises someone's name that a stranger could buy first. featured.test.ts checks
// both.

export interface FeaturedName {
  label: string; // the name without .hex
  person?: string; // who it belongs to, for people
  x?: string; // their X handle, without @
  picture?: string; // a picture saved as src/assets/avatars/<picture>.jpg, for someone without an X picture
  /** The colour of the .hex after their name, picked from their profile picture: a shade for the
   *  light theme and one for the dark, each easy to read on its background. */
  tone?: { light: string; dark: string };
}

export const featuredNames: FeaturedName[] = [
  { label: "richardheart", person: "Richard Heart", x: "RichardHeartWin", tone: { light: "#c83a33", dark: "#e15248" } },
  { label: "yourfriendsommi", person: "Your Friend Sommi", x: "yourfriendSOMMI", tone: { light: "#1ca901", dark: "#31f70c" } },
  { label: "cryptocoffee", person: "Crypto Coffee", x: "CryptoCoffee369", tone: { light: "#ea2286", dark: "#f12d8c" } },
  { label: "broots", person: "BRoots", x: "iambroots", tone: { light: "#a19600", dark: "#feee0c" } },
  { label: "hexologist", person: "Hexologist", x: "Hexologist31", tone: { light: "#0da4b2", dark: "#00eaff" } },
  { label: "dollarcostcrypto", person: "Dollar Cost Crypto", x: "dollarcostcrypt", tone: { light: "#b67e43", dark: "#b67e43" } },
  { label: "5996", person: "5996", picture: "5996", tone: { light: "#2f97c6", dark: "#62c4ee" } },
  { label: "matiallin", person: "Mati Allin", x: "MatiAllin", tone: { light: "#be1384", dark: "#e241a3" } },
  { label: "nineironcapital", person: "NineIronCapital", x: "NineIronCapital", tone: { light: "#a16907", dark: "#b17822" } },
];
