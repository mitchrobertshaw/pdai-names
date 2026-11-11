import { useState } from "react";

const GRADIENTS = [
  "linear-gradient(135deg, #ffc400, #ff6a1f)",
  "linear-gradient(135deg, #ff6a1f, #e5007a)",
  "linear-gradient(135deg, #ff3d5a, #9b2bff)",
  "linear-gradient(135deg, #ffb800, #e5007a)",
  "linear-gradient(135deg, #ff8a00, #ff3d5a)",
  "linear-gradient(135deg, #e5007a, #6d3bff)",
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
 * that aren't people or if the picture is missing, the name's first letter on a warm gradient.
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
