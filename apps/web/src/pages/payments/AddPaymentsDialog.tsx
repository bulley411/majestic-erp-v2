import { useState } from 'react';
import type { Payment } from '../../lib/api';

const naira = (v: string) =>
  '₦' + Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2 });

export default function AddPaymentsDialog({
  payments,
  onClose,
  onSubmit,
  busy,
}: {
  payments: Payment[];
  onClose: () => void;
  onSubmit: (ids: string[]) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAll = () => setSelected(new Set(payments.map((p) => p.id)));
  const clearAll = () => setSelected(new Set());

  const total = payments
    .filter((p) => selected.has(p.id))
    .reduce((sum, p) => sum + Number(p.netAmount), 0);

  return (
    <div className="drawerwrap" role="dialog" aria-modal="true">
      <div className="drawerscrim" onClick={onClose} />
      <div className="drawer" style={{ width: 'min(720px, 100%)' }}>
        <header className="dhead">
          <div>
            <h2 className="page">Add payments to batch</h2>
            <span style={{ fontSize: 12, color: 'var(--slate-2)' }}>
              {selected.size} selected · {naira(String(total))}
            </span>
          </div>
          <div className="acts">
            <button className="btn" type="button" onClick={selectAll}>Select all</button>
            <button className="btn" type="button" onClick={clearAll}>Clear</button>
            <button className="btn pri" type="button"
              disabled={busy || selected.size === 0}
              onClick={() => onSubmit([...selected])}>
              {busy ? 'Adding…' : `Add ${selected.size}`}
            </button>
            <button className="btn" type="button" onClick={onClose}>Cancel</button>
          </div>
        </header>
        <div className="dbody">
          {!payments.length ? (
            <div className="empty">
              <h3>No pending payments</h3>
              <p>Create payments from approved vouchers first.</p>
            </div>
          ) : (
            <div className="tablewrap">
              <table className="dtable">
                <thead>
                  <tr>
                    <th style={{ width: 40 }} />
                    <th>Reference</th>
                    <th>Payee</th>
                    <th>Type</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <input type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggle(p.id)} />
                      </td>
                      <td className="mono">{p.reference}</td>
                      <td>{p.payeeName}</td>
                      <td><span className="tag info">{p.type}</span></td>
                      <td className="num mono">{naira(p.netAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}