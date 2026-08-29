// どこか1か所でエラーが起きても、アプリ全体が真っ白にならないようにする受け皿。
// React の「エラー境界」という仕組みを使っています。

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** どの画面で起きたか（メッセージに出す） */
  where?: string;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 開発中に原因を追えるようにコンソールにだけ出す。外部には送りません。
    console.error('画面でエラーが起きました:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app">
        <div className="card">
          <h1>うまく ひょうじ できませんでした</h1>
          <p>
            {this.props.where ? `「${this.props.where}」の` : ''}
            がめんで もんだいが おきました。
            <br />
            きろくは きえていないので、あんしんしてね。
          </p>
          <div className="row">
            <button
              className="primary"
              onClick={() => this.setState({ error: null })}
            >
              もういちど ためす
            </button>
          </div>
          <button
            className="ghost wide"
            style={{ marginTop: 8 }}
            onClick={() => window.location.reload()}
          >
            アプリを さいきどうする
          </button>
          <details style={{ marginTop: 16 }}>
            <summary className="muted">おうちの人へ（技術的な内容）</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#6b655c' }}>
              {error.message}
              {'\n'}
              {error.stack}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
