import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/** Hidden helper for recording: visit /reset to restore the starting story. Not linked anywhere in the UI. */
export function ResetDemo() {
  const [error, setError] = useState('');
  useEffect(() => {
    api('/api/admin/reset', { method: 'POST' })
      .then(() => window.location.replace('/'))
      .catch(e => setError((e as Error).message));
  }, []);
  return <div className="empty">{error ? `Reset failed: ${error}` : 'Resetting the demo…'}</div>;
}
