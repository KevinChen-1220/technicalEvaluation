import type { PropsWithChildren } from 'react';
import { cloudRuntime } from './services/cloudRuntime';
import './app.css';

cloudRuntime.initialize();

export default function App({ children }: PropsWithChildren) {
  return children;
}
