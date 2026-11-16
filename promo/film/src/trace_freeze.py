# Trace the film's freeze frame (the PulseChain Train GIF, frame 33, mirrored): the train as its convex hull (roof -> nose -> floor), the tunnel as the mouth contour scaled out to the
# middle of its stone ring. Output in the 800x600 frame's pixels, plus a check image.
import json, sys, cv2, numpy as np
src, out_json, out_png = sys.argv[1:4]
bgr = cv2.imread(src); rgb = bgr[:, :, ::-1].astype(int); R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
def biggest(mask):
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask); k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    return np.where(lab == k, 255, 0).astype(np.uint8)
train = ((R > 150) & (B > 140) & (R - G > 20)).astype(np.uint8) * 255; train[:150] = 0
train = biggest(cv2.morphologyEx(train, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)))
pts = cv2.findNonZero(train); hull = cv2.convexHull(pts)[:, 0, :]
hull = hull[np.argsort(np.arctan2(hull[:, 1] - hull[:, 1].mean(), hull[:, 0] - hull[:, 0].mean()))]   # walk it in order
# dense resample along the hull, then keep x > 3 (drop the frame's left edge), starting at the roof's left end
def resample(poly, step, closed):
    p = np.array(poly, float); 
    if closed: p = np.vstack([p, p[:1]])
    seg = np.hypot(*np.diff(p, axis=0).T); L = np.concatenate([[0], np.cumsum(seg)]); s = np.arange(0, L[-1], step)
    return np.stack([np.interp(s, L, p[:, 0]), np.interp(s, L, p[:, 1])], 1)
d = resample(hull, 4, True); ok = d[:, 0] > 3
i = int(np.argmin(ok)); d = np.roll(d, -i, 0); ok = np.roll(ok, -i); j = int(np.argmax(ok)); d = d[j:]; ok = ok[j:]
d = d[: len(ok) - int(np.argmax(ok[::-1]))]
if d[0, 1] > d[-1, 1]: d = d[::-1]                                  # start on the roof
train_path = d
dark = ((R < 75) & (G < 65) & (B < 70)).astype(np.uint8) * 255; roi = np.zeros_like(dark); roi[200:418, 500:650] = 1
mouth = biggest(cv2.morphologyEx(dark * roi, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)))
c = max(cv2.findContours(mouth, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], key=cv2.contourArea)[:, 0, :].astype(float)
x, y, w, h = cv2.boundingRect(mouth); cx, base = x + w / 2, y + h
ring = np.stack([cx + (c[:, 0] - cx) * 1.30, base + (c[:, 1] - base) * 1.10], 1)    # out to the stone ring's middle
m = resample(ring, 4, True); ok = m[:, 1] < base - 8
i = int(np.argmin(ok)); m = np.roll(m, -i, 0); ok = np.roll(ok, -i); j = int(np.argmax(ok)); m = m[j:]; ok = ok[j:]
m = m[: len(ok) - int(np.argmax(ok[::-1]))]
if m[0, 0] > m[-1, 0]: m = m[::-1]                                  # left foot first
arch_path = m
tb = cv2.boundingRect(train)
json.dump({"size": [800, 600], "train": np.round(train_path, 1).tolist(), "arch": np.round(arch_path, 1).tolist(),
           "train_box": list(tb), "mouth_box": [x, y, w, h]}, open(out_json, "w"))
vis = bgr.copy()
cv2.polylines(vis, [train_path.astype(np.int32)], False, (255, 0, 255), 3, cv2.LINE_AA)
cv2.polylines(vis, [arch_path.astype(np.int32)], False, (255, 255, 255), 3, cv2.LINE_AA)
cv2.imwrite(out_png, vis); print("train", len(train_path), "arch", len(arch_path), "train box", tb, "mouth", (x, y, w, h))
