import { Component, type ReactNode } from 'react';
export class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.log('[3D] Showing accessible fallback:', error.message);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
