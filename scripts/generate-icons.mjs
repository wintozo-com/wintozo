import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public", "logo.jpg");

const appIcons = [
  ["build/icon.png", 512],
  ["Icon.png", 512],
];

const splashScreens = [
  ["android/app/src/main/res/drawable/splash.png", 480, 320],
  ["android/app/src/main/res/drawable-land-mdpi/splash.png", 480, 320],
  ["android/app/src/main/res/drawable-land-hdpi/splash.png", 800, 480],
  ["android/app/src/main/res/drawable-land-xhdpi/splash.png", 1280, 720],
  ["android/app/src/main/res/drawable-land-xxhdpi/splash.png", 1600, 960],
  ["android/app/src/main/res/drawable-land-xxxhdpi/splash.png", 1920, 1280],
  ["android/app/src/main/res/drawable-port-mdpi/splash.png", 320, 480],
  ["android/app/src/main/res/drawable-port-hdpi/splash.png", 480, 800],
  ["android/app/src/main/res/drawable-port-xhdpi/splash.png", 720, 1280],
  ["android/app/src/main/res/drawable-port-xxhdpi/splash.png", 960, 1600],
  ["android/app/src/main/res/drawable-port-xxxhdpi/splash.png", 1280, 1920],
];

async function write(rel, size, format = "png") {
  const dest = path.join(root, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let image = sharp(source).rotate().resize(size, size, { fit: "cover", position: "centre" });
  const buffer = format === "jpeg"
    ? await image.jpeg({ quality: 92, mozjpeg: true }).toBuffer()
    : await image.png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(dest, buffer);
}

async function writeSplash(rel, width, height) {
  const dest = path.join(root, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const logoSize = Math.round(Math.min(width, height) * 0.34);
  const radius = Math.round(logoSize * 0.22);
  const logo = await sharp(source)
    .rotate()
    .resize(logoSize, logoSize, { fit: "cover", position: "centre" })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${logoSize}" height="${logoSize}"><rect width="${logoSize}" height="${logoSize}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
        ),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
  const buffer = await sharp({
    create: { width, height, channels: 3, background: "#f6f9ff" },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(dest, buffer);
}

async function main() {
  if (!fs.existsSync(source)) {
    throw new Error(`Не найден логотип: ${source}`);
  }

  for (const [rel, size] of appIcons) {
    await write(rel, size);
  }

  fs.writeFileSync(
    path.join(root, "build", "icon.ico"),
    await pngToIco(path.join(root, "Icon.png"))
  );

  for (const [rel, width, height] of splashScreens) {
    await writeSplash(rel, width, height);
  }

  console.log(`Иконки собраны из ${path.relative(root, source)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
