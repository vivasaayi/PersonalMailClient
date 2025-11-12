import React from "react";
import { Alert } from "react-bootstrap";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error?: Error; resetError: () => void }>;
}

class MessageModalErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("MessageModal Error Boundary caught an error:", error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error} resetError={this.resetError} />;
      }

      return (
        <Alert variant="danger" className="m-3">
          <Alert.Heading>Something went wrong</Alert.Heading>
          <p>An unexpected error occurred while displaying messages. Please try refreshing the page.</p>
          <hr />
          <div className="d-flex justify-content-end">
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={this.resetError}
            >
              Try Again
            </button>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <details className="mt-2">
              <summary>Error Details (Development)</summary>
              <pre className="mt-2" style={{ fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </Alert>
      );
    }

    return this.props.children;
  }
}

export default MessageModalErrorBoundary;