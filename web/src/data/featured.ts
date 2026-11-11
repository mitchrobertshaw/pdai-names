// The names floating at the top of the homepage: people from the PulseChain community, with their X
// profile pictures.
//
// After adding someone with an X handle, run `npm run avatars` to save their picture in
// src/assets/avatars. For someone without one, save their picture there yourself, 400 by 400, and
// name it in `picture`. Every person here must also be in script/reserved-names.csv, so the
// homepage never advertises someone's name that a stranger could buy first. featured.test.ts checks
// both.

export interface FeaturedName {
  label: string; // the name without .pdai
  person?: string; // who it belongs to, for people
  x?: string; // their X handle, without @
  picture?: string; // a picture saved as src/assets/avatars/<picture>.jpg, for someone without an X picture
}

export const featuredNames: FeaturedName[] = [
  { label: "pdaiconference", person: "pDAI Conference", x: "pDAI_Conference" },
  { label: "libertyswap", person: "LibertySwap", x: "LibertySwapFi" },
  { label: "nineironcapital", person: "NineIronCapital", x: "NineIronCapital" },
  { label: "yourfriendsommi", person: "Your Friend Sommi", x: "yourfriendSOMMI" },
  { label: "coexisteven", person: "Coexisteven", x: "Coexisteven" },
  { label: "zkxwallet", person: "ZKX Wallet", x: "zkxwallet" },
  { label: "bluntfullstop", person: "bluntfullstop", x: "bluntfullstop" },
  { label: "cryptogirl", person: "Cryptogirl", x: "cryptogirrrl" },
];
