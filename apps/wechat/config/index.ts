import { defineConfig } from '@tarojs/cli';
import path from 'node:path';

export default defineConfig({
  projectName: 'dynamic-assessment-wechat',
  date: '2026-08-03',
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
