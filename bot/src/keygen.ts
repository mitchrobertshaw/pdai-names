// Optional: makes a separate encryption key pair for the bot. npm run keygen
//
// Buyers on Ethereum seal their order details to the bot's public key, so that only the bot can
// read which name they are buying. You don't need this: without BOT_ENCRYPTION_SECRET_KEY the bot
// makes its key from its wallet key, and prints the public key when it starts. Use this only if
// you want the two keys separate. Then put the secret key in BOT_ENCRYPTION_SECRET_KEY, and the
// public key in web/src/deployment.ts.

import nacl from "tweetnacl";
import { bytesToHex } from "viem";

const keyPair = nacl.box.keyPair();
console.log(`BOT_ENCRYPTION_SECRET_KEY=${bytesToHex(keyPair.secretKey)}`);
console.log(`Public key, for websites:  ${bytesToHex(keyPair.publicKey)}`);
