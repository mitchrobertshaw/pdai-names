import { useState } from "react";

// Deep enough for the white letter on them.
const GRADIENTS = [
  "linear-gradient(135deg, #c98a00, #9a5200)",
  "linear-gradient(135deg, #0f9d8a, #0b6b5f)",
  "linear-gradient(135deg, #b8730f, #0b7a6c)",
  "linear-gradient(135deg, #d47a16, #8a3f00)",
  "linear-gradient(135deg, #0b7a6c, #134e4a)",
  "linear-gradient(135deg, #a35a00, #0f5f55)",
];

function gradientFor(label: string): string {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

// The saved X profile pictures, bundled with the site (and packed into the one-file copy).
const PICTURES = import.meta.glob<string>("../assets/avatars/*.jpg", { eager: true, query: "?url", import: "default" });

function pictureOf(handle: string): string | undefined {
  return PICTURES[`../assets/avatars/${handle.toLowerCase()}.jpg`];
}

/**
 * A person's X profile picture, saved in src/assets/avatars by `npm run avatars`, or, for names
 * that aren't people or if the picture is missing, the name's first letter on gold or teal.
 */
export function Avatar({ label, x, size = 42 }: { label: string; x?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const picture = x ? pictureOf(x) : undefined;
  if (picture && !failed) {
    return (
      <img
        className="avatar"
        src={picture}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="avatar avatar--letter" style={{ background: gradientFor(label) }}>
      {[...label][0]?.toUpperCase()}
    </span>
  );
}
