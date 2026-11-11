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
  { label: "richardheart", person: "Richard Heart", x: "RichardHeartWin" },
  { label: "yourfriendsommi", person: "Your Friend Sommi", x: "yourfriendSOMMI" },
  { label: "cryptocoffee", person: "Crypto Coffee", x: "CryptoCoffee369" },
  { label: "broots", person: "BRoots", x: "iambroots" },
  { label: "hexologist", person: "Hexologist", x: "Hexologist31" },
  { label: "dollarcostcrypto", person: "Dollar Cost Crypto", x: "dollarcostcrypt" },
  { label: "5996", person: "5996", picture: "5996" },
  { label: "matiallin", person: "Mati Allin", x: "MatiAllin" },
  { label: "nineironcapital", person: "NineIronCapital", x: "NineIronCapital" },
];
