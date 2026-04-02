import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    // Clear all game state from localStorage
    localStorage.removeItem('jargon-solo');
    localStorage.removeItem('duo-storage');
    localStorage.removeItem('connection-storage');
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen bg-black text-white flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-6">
            <div className="text-4xl">😵</div>
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="text-gray-400 text-sm">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={this.handleReset}
              className="px-6 py-3 bg-j-accent hover:bg-j-accent-hover text-j-bg rounded-xl transition-colors font-semibold"
            >
              Reset & Reload
            </button>
            <p className="text-gray-500 text-xs">
              This will clear your game state and reload the app.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
