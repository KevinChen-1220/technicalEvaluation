import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'dist');
const expected = {
  assetPrefix: '/technicalEvaluation/',
  canonicalUrl: 'https://kevinchen-1220.github.io/technicalEvaluation/',
  description:
    'Generate 50- or 100-question skill assessments with your own OpenAI-compatible model, then score and review them locally.',
  faviconUrl: '/technicalEvaluation/favicon.svg',
  manifestUrl: '/technicalEvaluation/manifest.json',
  socialImageUrl: 'https://kevinchen-1220.github.io/technicalEvaluation/social-preview.png',
  themeColor: '#1F7A68',
  title: 'SkillScope - AI-Powered Skill Assessments',
};

const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

async function readRequiredFile(filename) {
  try {
    return await readFile(join(distDir, filename), 'utf8');
  } catch {
    failures.push(`Missing dist/${filename}; run "npm run build:web" before verification.`);
    return '';
  }
}

const [html, manifestText, robots, sitemap, favicon] = await Promise.all([
  readRequiredFile('index.html'),
  readRequiredFile('manifest.json'),
  readRequiredFile('robots.txt'),
  readRequiredFile('sitemap.xml'),
  readRequiredFile('favicon.svg'),
]);

check(
  html.includes(`<title>${expected.title}</title>`),
  `dist/index.html must include the exact title "${expected.title}".`,
);
check(
  html.includes(`<meta name="description" content="${expected.description}"`),
  'dist/index.html must include the required meta description.',
);
check(
  html.includes(`<link rel="canonical" href="${expected.canonicalUrl}"`),
  `dist/index.html must include canonical URL ${expected.canonicalUrl}.`,
);
check(
  html.includes(`<meta property="og:image" content="${expected.socialImageUrl}"`),
  `dist/index.html must include Open Graph image ${expected.socialImageUrl}.`,
);
check(
  html.includes('<meta name="twitter:card" content="summary_large_image"'),
  'dist/index.html must set twitter:card to summary_large_image.',
);
check(
  html.includes(`<link rel="manifest" href="${expected.manifestUrl}"`),
  `dist/index.html must link manifest ${expected.manifestUrl}.`,
);
check(
  html.includes(`<link rel="icon" href="${expected.faviconUrl}" type="image/svg+xml"`),
  `dist/index.html must link favicon ${expected.faviconUrl}.`,
);
check(
  html.includes(`<meta name="theme-color" content="${expected.themeColor}"`),
  `dist/index.html must set theme-color to ${expected.themeColor}.`,
);
check(html.includes('<div id="root"></div>'), 'dist/index.html must include <div id="root"></div>.');
check(favicon.includes('<svg'), 'dist/favicon.svg must contain an SVG icon.');

const sourceReferences = [...html.matchAll(/<([a-z][\w-]*)\b[^>]*?\ssrc\s*=(["'])([^"']+)\2[^>]*>/gi)].map(
  ([, tagName, , source]) => ({ source, tagName: tagName.toLowerCase() }),
);
const runtimeScriptReferences = sourceReferences.filter(
  ({ source, tagName }) => tagName === 'script' && source.includes('/_expo/'),
);

check(
  runtimeScriptReferences.length > 0,
  'dist/index.html must include a generated Expo runtime script src.',
);

for (const { source } of runtimeScriptReferences) {
  check(
    source.startsWith(expected.assetPrefix),
    `dist/index.html generated runtime script src "${source}" must use the ${expected.assetPrefix} prefix.`,
  );
}

for (const { source, tagName } of sourceReferences) {
  const isRuntimeScript = tagName === 'script' && source.includes('/_expo/');
  const isRootRelative = source.startsWith('/') && !source.startsWith('//');
  if (!isRuntimeScript && isRootRelative) {
    check(
      source.startsWith(expected.assetPrefix),
      `dist/index.html root-relative ${tagName} src "${source}" must use the ${expected.assetPrefix} prefix.`,
    );
  }
}

if (manifestText) {
  try {
    const manifest = JSON.parse(manifestText);
    check(manifest.name === 'SkillScope', 'dist/manifest.json name must be "SkillScope".');
    check(manifest.start_url === '/technicalEvaluation/', 'dist/manifest.json start_url must be /technicalEvaluation/.');
    check(manifest.scope === '/technicalEvaluation/', 'dist/manifest.json scope must be /technicalEvaluation/.');
    check(manifest.display === 'standalone', 'dist/manifest.json display must be standalone.');
    check(manifest.theme_color === '#1F7A68', 'dist/manifest.json theme_color must be #1F7A68.');
    check(manifest.background_color === '#F4F7F2', 'dist/manifest.json background_color must be #F4F7F2.');

    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    check(
      icons.some(
        (icon) =>
          icon?.src === '/technicalEvaluation/icon-192.png' &&
          icon?.sizes === '192x192' &&
          icon?.type === 'image/png',
      ),
      'dist/manifest.json must include the 192x192 PNG icon at /technicalEvaluation/icon-192.png.',
    );
    check(
      icons.some(
        (icon) =>
          icon?.src === '/technicalEvaluation/icon-512.png' &&
          icon?.sizes === '512x512' &&
          icon?.type === 'image/png',
      ),
      'dist/manifest.json must include the 512x512 PNG icon at /technicalEvaluation/icon-512.png.',
    );
  } catch {
    failures.push('dist/manifest.json must contain valid JSON.');
  }
}

check(/User-agent:\s*\*/i.test(robots), 'dist/robots.txt must define rules for User-agent: *.');
check(/Allow:\s*\/(?:\s|$)/im.test(robots), 'dist/robots.txt must allow indexing from /.');
check(
  robots.includes(`Sitemap: ${expected.canonicalUrl}sitemap.xml`),
  `dist/robots.txt must reference ${expected.canonicalUrl}sitemap.xml.`,
);
check(
  sitemap.includes(`<loc>${expected.canonicalUrl}</loc>`),
  `dist/sitemap.xml must include canonical URL ${expected.canonicalUrl}.`,
);

if (failures.length > 0) {
  console.error(`Web metadata verification failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Web metadata verification passed.');
