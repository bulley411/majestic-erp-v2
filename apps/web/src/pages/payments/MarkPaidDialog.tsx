import { useState } from 'react';

export default function MarkPaidDialog({
  onClose,
  onSubmit,
  busy,
}: {
  onClose: () => void;
  onSubmit: (data: {
    paidAt: string;
    externalReference?: string;
    notes?: string;
  }) => void;
  busy: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString().slice(11, 16);

  const [paidDate, setPaidDate] = useState(today);
  const [paidTime, setPaidTime] = useState(now);
  const [externalReference, setExternalReference] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    const paidAt = new Date(`${paidDate}T${paidTime}:00`).toISOString();
    onSubmit({
      paidAt,
      externalReference: externalReference || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <div className="drawerwrap" role="dialog" aria-modal="true">
      <div className="drawerscrim" onClick={onClose} />
      <div className="drawer" style={{ width: 'min(560px, 100%)' }}>
        <header className="dhead">
          <h2 className="page">Mark batch as paid</h2>
          <div className="acts">
            <button className="btn pri" type="button" disabled={busy}
              onClick={handleSubmit}>
              {busy ? 'Saving…' : 'Confirm payment'}
            </button>
            <button className="btn" type="button" onClick={onClose}>Cancel</button>
          </div>
        </header>
        <div className="dbody">
          <div className="fsection">
            <p className="fnote" style={{ padding: '0 0 12px' }}>
              This will post ledger entries for each payment in the batch. Once done,
              this action cannot be undone.
            </p>
            <div className="fgrid">
              <label className="ffield">
                <span>Payment date <b>*</b></span>
                <input type="date" value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)} />
              </label>
              <label className="ffield">
                <span>Payment time <b>*</b></span>
                <input type="time" value={paidTime}
                  onChange={(e) => setPaidTime(e.target.value)} />
              </label>
              <label className="ffield span2">
                <span>External reference</span>
                <input value={externalReference}
                  onChange={(e) => setExternalReference(e.target.value)}
                  placeholder="e.g. bank batch number" />
              </label>
              <label className="ffield span2">
                <span>Notes</span>
                <input value={notes}
                  onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}