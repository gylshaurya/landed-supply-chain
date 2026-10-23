import { useEffect, useState } from 'react';

let push: (msg: string) => void = () => {};
export const toast = (msg: string) => push(msg);

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    push = m => {
      setMsg(m);
      window.setTimeout(() => setMsg(cur => (cur === m ? null : cur)), 4500);
    };
  }, []);
  if (!msg) return null;
  return (
    <div className="toast" role="status">
      <i className="fa fa-circle-check" style={{ color: '#86efac', marginTop: 3 }} />
      <span>{msg}</span>
    </div>
  );
}
