import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

const root = resolve(import.meta.dirname, '..');
const appConfig = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8'));
const expo = appConfig.expo ?? {};
const issues = [];

const expectedPaths = [
  ['expo.icon', expo.icon, './assets/icon.png', 'opaque'],
  ['expo.ios.icon', expo.ios?.icon, './assets/icon.png', 'opaque'],
  ['expo.android.icon', expo.android?.icon, './assets/icon.png', 'opaque'],
  ['expo.android.adaptiveIcon.foregroundImage', expo.android?.adaptiveIcon?.foregroundImage, './assets/adaptive-icon.png', 'transparent'],
  ['expo.android.adaptiveIcon.monochromeImage', expo.android?.adaptiveIcon?.monochromeImage, './assets/monochrome-icon.png', 'transparent'],
  ['expo.splash.image', expo.splash?.image, './assets/splash-icon.png', 'transparent'],
];

for (const [label, actualPath, expectedPath, transparency] of expectedPaths) {
  if (actualPath !== expectedPath) {
    issues.push(`${label} must be ${expectedPath}.`);
    continue;
  }

  validatePng(actualPath, 1024, 1024, transparency, label);
}

validatePng('./public/icon-192.png', 192, 192, 'opaque', 'PWA 192 icon');
validatePng('./public/icon-512.png', 512, 512, 'opaque', 'PWA 512 icon');

if (expo.android?.adaptiveIcon?.backgroundColor !== '#1F7A68') {
  issues.push('expo.android.adaptiveIcon.backgroundColor must be #1F7A68.');
}

if (expo.splash?.backgroundColor !== '#F4F7F2') {
  issues.push('expo.splash.backgroundColor must be #F4F7F2.');
}

if (expo.splash?.resizeMode !== 'contain') {
  issues.push('expo.splash.resizeMode must be contain.');
}

if (issues.length > 0) {
  console.error(`Native asset verification failed (${issues.length} issues):`);
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('Native asset verification passed.');

function validatePng(relativePath, expectedWidth, expectedHeight, transparency, label) {
  const absolutePath = resolve(root, relativePath);

  if (!existsSync(absolutePath)) {
    issues.push(`${label} file is missing: ${relativePath}.`);
    return;
  }

  let png;
  try {
    png = PNG.sync.read(readFileSync(absolutePath), { checkCRC: true });
  } catch {
    issues.push(`${label} must be a complete, decodable PNG with valid chunk checksums.`);
    return;
  }

  if (png.width !== expectedWidth || png.height !== expectedHeight) {
    issues.push(`${label} must be ${expectedWidth}x${expectedHeight}, received ${png.width}x${png.height}.`);
  }

  let transparentPixels = 0;
  let visiblePixels = 0;
  for (let index = 3; index < png.data.length; index += 4) {
    const alpha = png.data[index];
    if (alpha < 255) transparentPixels += 1;
    if (alpha > 0) visiblePixels += 1;
  }

  if (transparency === 'transparent') {
    if (transparentPixels === 0 || visiblePixels === 0) {
      issues.push(`${label} must contain both transparent and visible pixels.`);
    }

    const cornerAlpha = [
      png.data[3],
      png.data[(png.width - 1) * 4 + 3],
      png.data[(png.height - 1) * png.width * 4 + 3],
      png.data[(png.height * png.width - 1) * 4 + 3],
    ];
    if (cornerAlpha.some((alpha) => alpha !== 0)) {
      issues.push(`${label} must have fully transparent corners.`);
    }
  }

  if (transparency === 'opaque' && transparentPixels > 0) {
    issues.push(`${label} must be fully opaque.`);
  }
}
