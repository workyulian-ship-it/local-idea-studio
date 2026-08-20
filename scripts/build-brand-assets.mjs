import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const buildDir = path.join(root, "build");
const sourceIcon = path.join(root, "public", "favicon.svg");

await fs.mkdir(buildDir, { recursive: true });
const iconSvg = await fs.readFile(sourceIcon);

async function pngAt(size) {
  return sharp(iconSvg, { density: 768 }).resize(size, size).png().toBuffer();
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map(pngAt));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
pngs.forEach((png, index) => {
  const size = sizes[index];
  const entry = 6 + index * 16;
  header.writeUInt8(size === 256 ? 0 : size, entry);
  header.writeUInt8(size === 256 ? 0 : size, entry + 1);
  header.writeUInt8(0, entry + 2);
  header.writeUInt8(0, entry + 3);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
const ico = Buffer.concat([header, ...pngs]);
await fs.writeFile(path.join(buildDir, "icon.ico"), ico);
await fs.writeFile(path.join(buildDir, "installerIcon.ico"), ico);
await fs.writeFile(path.join(buildDir, "uninstallerIcon.ico"), ico);
await sharp(iconSvg, { density: 768 }).resize(512, 512).png().toFile(path.join(buildDir, "icon.png"));
await sharp(iconSvg, { density: 768 }).resize(256, 256).png().toFile(path.join(root, "public", "icon.png"));

function artSvg(width, height, sidebar) {
  const scale = sidebar ? 1.55 : 0.72;
  const cx = sidebar ? 82 : 29;
  const cy = sidebar ? 102 : 28;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b0912"/><stop offset="1" stop-color="#25175a"/></linearGradient><linearGradient id="mark" x1="8" y1="6" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#9b78ff"/><stop offset=".52" stop-color="#6845e8"/><stop offset="1" stop-color="#302070"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <g opacity=".13" stroke="#b7a6ff" stroke-width="1">${Array.from({length: sidebar ? 12 : 7},(_,i)=>`<path d="M0 ${i*28+.5}H${width}"/>`).join("")}${Array.from({length: sidebar ? 7 : 10},(_,i)=>`<path d="M${i*28+.5} 0V${height}"/>`).join("")}</g>
    <g transform="translate(${cx-32*scale} ${cy-32*scale}) scale(${scale})">
      <rect x="4" y="4" width="56" height="56" rx="13" fill="url(#mark)"/>
      <path d="M12.5 38.5C13.4 23.4 24.4 13.1 39.3 13.9C45.9 14.3 51.3 17.3 54.2 22.1" fill="none" stroke="white" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M51.2 30.2C53.3 41.8 44.8 51.8 32.5 52.5C24.4 53 17.1 49.7 12.8 44.4" fill="none" stroke="#c9ff67" stroke-width="3.4" stroke-linecap="round"/>
      <circle cx="12.8" cy="38.5" r="2.7" fill="#c9ff67"/>
      <circle cx="54.1" cy="22.1" r="2.25" fill="white"/>
      <path d="M28.5 22.5V39.5H41" fill="none" stroke="white" stroke-width="5.8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="41" cy="39.5" r="2.9" fill="#c9ff67"/>
    </g>
    ${sidebar ? `<text x="82" y="184" text-anchor="middle" fill="white" font-family="Segoe UI,Arial" font-size="17" font-weight="700">LOCAL IDEA</text><text x="82" y="207" text-anchor="middle" fill="#b8a7ef" font-family="Segoe UI,Arial" font-size="9" letter-spacing="2">STUDIO</text><rect x="34" y="238" width="96" height="1" fill="#7c5cff"/><text x="82" y="264" text-anchor="middle" fill="#c7bddf" font-family="Segoe UI,Arial" font-size="9">PRIVATE AI</text><text x="82" y="279" text-anchor="middle" fill="#c7bddf" font-family="Segoe UI,Arial" font-size="9">YOUR MACHINE</text>` : `<text x="57" y="25" fill="white" font-family="Segoe UI,Arial" font-size="14" font-weight="700">Local Idea Studio</text><text x="57" y="41" fill="#b8a7ef" font-family="Segoe UI,Arial" font-size="9">Private local AI</text>`}
  </svg>`);
}

async function writeBmp(file, width, height, svg) {
  const { data } = await sharp(svg).resize(width, height).flatten({ background: "#0b0912" }).raw().toBuffer({ resolveWithObject: true });
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixels = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = ((height - 1 - y) * width + x) * 3;
    const dst = y * rowSize + x * 3;
    pixels[dst] = data[src + 2]; pixels[dst + 1] = data[src + 1]; pixels[dst + 2] = data[src];
  }
  const bmp = Buffer.alloc(54 + pixels.length);
  bmp.write("BM", 0); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(width, 18); bmp.writeInt32LE(height, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(pixels.length, 34);
  pixels.copy(bmp, 54); await fs.writeFile(path.join(buildDir, file), bmp);
}

await writeBmp("installerSidebar.bmp", 164, 314, artSvg(164, 314, true));
await writeBmp("uninstallerSidebar.bmp", 164, 314, artSvg(164, 314, true));
await writeBmp("installerHeader.bmp", 150, 57, artSvg(150, 57, false));
console.log("Local Idea Studio brand assets generated.");
