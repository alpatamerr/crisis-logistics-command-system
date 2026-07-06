import { Component, type ReactNode } from "react";
import { Callout, Intent, Button } from "@blueprintjs/core";

interface Props {
  title: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Callout intent={Intent.DANGER} icon="error" style={{ marginBottom: 12 }}>
          <strong>{this.props.title}</strong> failed to load.
          <Button
            small
            minimal
            text="Retry"
            icon="refresh"
            style={{ marginLeft: 8 }}
            onClick={() => this.setState({ hasError: false })}
          />
        </Callout>
      );
    }
    return this.props.children;
  }
}
