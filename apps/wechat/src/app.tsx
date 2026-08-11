import type { PropsWithChildren } from 'react';
import { cloudRuntime } from './services/cloudRuntime';
import './app.css';

void cloudRuntime.initialize().catch(() => undefined);

export default function App({ children }: PropsWithChildren) {
  return children;
}
