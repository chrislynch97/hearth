// Rasterises the Hearth mark into the PWA icon PNGs in public/icons/.
// Run with `node scripts/gen-icons.mjs` after changing the mark; the outputs are
// committed, so a normal build never needs this.
//
// The mark is a handful of round-capped strokes on a rounded square, so it's
// cheaper to evaluate the geometry directly (signed distance + supersampling)
// than to pull in a rasteriser dependency. Keep the geometry below in step with
// brand/logo/hearth-favicon.svg.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MOSS = [0x47, 0x61, 0x3f];
const CREAM = [0xef, 0xed, 0xe3];
const APRICOT = [0xd9, 0x8c, 0x5f];

// Geometry on the 48x48 grid the brand SVGs use.
const STROKE = 3 / 2;
const SEGMENTS = [
    [12, 27, 24, 15], // roof, left rake
    [24, 15, 36, 27], // roof, right rake
    [17, 27, 17, 37], // left wall
    [17, 37, 31, 37], // floor
    [31, 37, 31, 27], // right wall
];
const DOT = { x: 24, y: 32, r: 3 };

// The inked area of the mark spans y 13.5..38.5, so its centre sits 2 units
// below the 48-unit box centre. Icons are cropped and masked by the launcher,
// so centre on the ink rather than on the box the SVG happens to use.
const INK_OFFSET_Y = 2;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Distance from a point to a line segment — a round-capped stroke is just this
 *  distance thresholded at half the stroke width. */
const distToSegment = (px, py, [x1, y1, x2, y2]) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    const t =
        len2 === 0 ? 0 : clamp01(((px - x1) * dx + (py - y1) * dy) / len2);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};

/** Inside-ness of a rounded square spanning 0..size. radius 0 gives a plain square. */
const inRoundedSquare = (px, py, size, radius) => {
    const qx = Math.abs(px - size / 2) - (size / 2 - radius);
    const qy = Math.abs(py - size / 2) - (size / 2 - radius);
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
    return outside + Math.min(Math.max(qx, qy), 0) <= radius;
};

const SUBSAMPLES = 4; // 4x4 per pixel — enough to hide the stair-stepping at 180px.

/**
 * @param size    output edge length in pixels
 * @param radius  corner radius in pixels (0 = square, for maskable/iOS)
 * @param scale   fraction of the canvas the 48-unit mark box occupies
 */
const renderIcon = ({ size, radius, scale }) => {
    const box = size * scale;
    const offset = (size - box) / 2;
    const toGrid = (v) => ((v - offset) / box) * 48;
    const pixels = Buffer.alloc(size * size * 3);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let bg = 0;
            let cream = 0;
            let apricot = 0;

            for (let sy = 0; sy < SUBSAMPLES; sy++) {
                for (let sx = 0; sx < SUBSAMPLES; sx++) {
                    const px = x + (sx + 0.5) / SUBSAMPLES;
                    const py = y + (sy + 0.5) / SUBSAMPLES;
                    if (inRoundedSquare(px, py, size, radius)) bg++;

                    const gx = toGrid(px);
                    const gy = toGrid(py) + INK_OFFSET_Y;
                    const onStroke = SEGMENTS.some(
                        (s) => distToSegment(gx, gy, s) <= STROKE
                    );

                    // The dot sits over the walls, so it wins where they overlap.
                    if (Math.hypot(gx - DOT.x, gy - DOT.y) <= DOT.r) apricot++;
                    else if (onStroke) cream++;
                }
            }

            const total = SUBSAMPLES * SUBSAMPLES;
            // Paper shows through outside the rounded corners so the icon composites
            // cleanly on a light launcher background.
            let rgb = mix([0xfb, 0xfa, 0xf4], MOSS, bg / total);
            rgb = mix(rgb, CREAM, cream / total);
            rgb = mix(rgb, APRICOT, apricot / total);

            const i = (y * size + x) * 3;
            pixels[i] = rgb[0];
            pixels[i + 1] = rgb[1];
            pixels[i + 2] = rgb[2];
        }
    }

    return { size, pixels };
};

const mix = (under, over, alpha) =>
    under.map((c, i) => Math.round(c + (over[i] - c) * alpha));

const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
};

/** Minimal 8-bit truecolour PNG: every scanline uses filter type 0. */
const encodePng = ({ size, pixels }) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // colour type: truecolour
    const stride = size * 3;
    const raw = Buffer.alloc((stride + 1) * size);
    for (let y = 0; y < size; y++) {
        pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
};

const ICONS = [
    // "any" icons keep the favicon's rounded-square silhouette and framing (rx 11
    // on the 48-unit grid).
    { file: "icon-192.png", size: 192, radius: 44, scale: 1 },
    { file: "icon-512.png", size: 512, radius: 117, scale: 1 },
    // Maskable: full bleed, mark held to ~70% so it survives the circle/squircle
    // crop Android may apply (the safe zone is the centre 80%).
    { file: "icon-maskable-512.png", size: 512, radius: 0, scale: 1.24 },
    // iOS rounds a square source itself.
    { file: "apple-touch-icon.png", size: 180, radius: 0, scale: 1.1 },
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public/icons");
mkdirSync(outDir, { recursive: true });
for (const icon of ICONS) {
    writeFileSync(join(outDir, icon.file), encodePng(renderIcon(icon)));
    console.log(`[icons] wrote ${icon.file}`);
}

// brand/ isn't served, so the SVG favicon has to live in public/ too — keeping
// the copy here means everything under public/icons/ derives from brand/.
copyFileSync(
    join(root, "brand/logo/hearth-favicon.svg"),
    join(outDir, "favicon.svg")
);
console.log("[icons] wrote favicon.svg");
