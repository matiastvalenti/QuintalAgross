import React from 'react';
import DetailedErrorView from './DetailedErrorView';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
        hasError: false, 
        error: null, 
        errorInfo: null 
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <DetailedErrorView 
            title="Algo salió mal en esta sección"
            message={this.state.error?.message || this.state.error?.toString() || 'Ocurrió un error inesperado al renderizar el componente.'}
            cause={this.state.error?.stack || this.state.errorInfo?.componentStack || 'No hay traza disponible.'}
            status="Render Crash"
            onReset={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                if (this.props.onReset) this.props.onReset();
                else window.location.reload();
            }}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
