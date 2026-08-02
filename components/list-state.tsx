export function ListState({
  empty,
  error,
  hasData,
  isEmpty,
  loading,
  loadingLabel,
  onRetry,
  retryLabel,
}: {
  empty: string;
  error: string;
  hasData: boolean;
  isEmpty: boolean;
  loading: boolean;
  loadingLabel: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  if (!hasData && loading) {
    return (
      <p className="list-state list-state-loading" role="status">
        {loadingLabel}
      </p>
    );
  }
  if (error) {
    return (
      <div className="error-box retry-error" role="alert">
        <p>{error}</p>
        <button className="button secondary" onClick={onRetry} type="button">
          {retryLabel}
        </button>
      </div>
    );
  }
  if (loading) {
    return (
      <p aria-live="polite" className="list-progress" role="status">
        {loadingLabel}
      </p>
    );
  }
  if (isEmpty) return <div className="empty">{empty}</div>;
  return null;
}
