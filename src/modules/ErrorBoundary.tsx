import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { T } from "./constants.js";
import { AlertTriangle } from "lucide-react";
import { reportError } from "./errorReporter.js";

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary — catches render errors in financial calculation components
 * Prevents a single NaN/undefined from cascading to a blank dashboard.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: Readonly<ErrorBoundaryProps>;
  declare state: Readonly<ErrorBoundaryState>;
  declare setState: Component<ErrorBoundaryProps, ErrorBoundaryState>["setState"];

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.name || "unknown"}]`, error, errorInfo);
    reportError(error, { component: this.props.name || "unknown", action: "render" });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const { fallback, name } = this.props;
      if (fallback) return fallback;

      return (
        <div
          role="alert"
          style={{
            padding: "16px",
            borderRadius: T.radius.md,
            background: T.status.redDim,
            border: `1px solid ${T.status.red}25`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            margin: "4px 0",
          }}
        >
          <AlertTriangle size={16} color={T.status.red} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.status.red }}>{name || "Component"} Error</div>
            <div style={{ fontSize: 10, color: T.text.secondary, marginTop: 2 }}>
              Something went wrong rendering this section. Your data is safe.
            </div>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginLeft: "auto",
              padding: "6px 12px",
              borderRadius: T.radius.sm,
              border: `1px solid ${T.status.red}40`,
              background: "transparent",
              color: T.status.red,
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
