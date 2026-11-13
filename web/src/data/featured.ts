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
  /** The colour of the .pdai after their name: the main colour in their profile picture, lightened
   *  only as far as it takes to read on the navy (featured.test.ts checks). */
  tone?: string;
}

export const featuredNames: FeaturedName[] = [
  { label: "pdaiconference", person: "pDAI Conference", x: "pDAI_Conference", tone: "#b94bfb" },
  { label: "libertyswap", person: "LibertySwap", x: "LibertySwapFi", tone: "#e77529" },
  { label: "nineironcapital", person: "NineIronCapital", x: "NineIronCapital", tone: "#af750a" },
  { label: "yourfriendsommi", person: "Your Friend Sommi", x: "yourfriendSOMMI", tone: "#33f70f" },
  { label: "coexisteven", person: "Coexisteven", x: "Coexisteven", tone: "#e64b2f" },
  { label: "zkxwallet", person: "ZKX Wallet", x: "zkxwallet", tone: "#437de9" },
  { label: "bluntfullstop", person: "bluntfullstop", x: "bluntfullstop", tone: "#f84a0b" },
  { label: "cryptogirl", person: "Cryptogirl", x: "cryptogirrrl", tone: "#d743ad" },
];
