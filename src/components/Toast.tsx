import { useEffect, useState } from 'react';
import { Icon } from './Icon';

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
      <Icon name="circle-check" />
      <span>{msg}</span>
    </div>
  );
}
