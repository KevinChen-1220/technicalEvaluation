import { defineConfig } from '@tarojs/cli';
import path from 'node:path';
import { loadSelectedReleaseDisclosure } from './releaseDisclosure';

const releaseDisclosure = loadSelectedReleaseDisclosure();
const releaseProfile = process.env.TARO_APP_RELEASE_PROFILE?.trim() || 'development';
const releaseFixtureMode = process.env.TARO_APP_RELEASE_FIXTURE_MODE === 'enabled'
  ? 'enabled'
  : 'disabled';
const publicEdgeOneApiBaseUrl = process.env.TARO_APP_EDGEONE_API_BASE_URL?.trim() ?? '';

if (releaseProfile === 'formal' && releaseFixtureMode === 'enabled') {
  throw new Error('Release fixture mode is forbidden in the formal profile.');
}

if (releaseProfile === 'formal' && !isHttpsUrl(publicEdgeOneApiBaseUrl)) {
  throw new Error('An HTTPS EdgeOne API base URL is required for the formal profile.');
}

export default defineConfig({
  projectName: 'dynamic-assessment-wechat',
  date: '2026-08-03',
  env: {
    TARO_APP_EDGEONE_API_BASE_URL: JSON.stringify(publicEdgeOneApiBaseUrl),
    TARO_APP_RELEASE_DISCLOSURE_JSON: JSON.stringify(JSON.stringify(releaseDisclosure)),
    TARO_APP_RELEASE_FIXTURE_MODE: JSON.stringify(releaseFixtureMode),
    TARO_APP_RELEASE_PROFILE: JSON.stringify(releaseProfile),
  },
  designWidth: 375,
  deviceRatio: {
    375: 1,
    640: 2.34,
    750: 1,
    828: 1.81,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  plugins: ['@tarojs/plugin-framework-react'],
  mini: {
    compile: {
      include: [path.resolve(__dirname, '../../../packages/assessment-core')],
    },
  },
});

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
  } catch {
    return false;
  }
}
