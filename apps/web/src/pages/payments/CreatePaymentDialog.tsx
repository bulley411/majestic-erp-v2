import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createPaymentFromVoucher, ApiError } from '../../lib/api';

export default function CreatePaymentDialog({
  voucherId,
  onClose,
  onCreated,
}: {
  voucherId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createPaymentFromVoucher(voucherId, { notes: notes || undefined }),
    onSuccess: onCreated,
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'Could not create payment.'),
  });

  return (
    <div className="drawerwrap" role="dialog" aria-modal="true">
      <div className="drawerscrim" onClick={onClose} />
      <div className="drawer" style={{ width: 'min(500px, 100%)' }}>
        <header className="dhead">
          <h2 className="page">Create payment</h2>
          <div className="acts">
            <button className="btn pri" type="button" disabled={create.isPending}
              onClick={() => create.mutate()}>
              {create.isPending ? 'Creating…' : 'Create payment'}
            </button>
            <button className="btn" type="button" onClick={onClose}>Cancel</button>
          </div>
        </header>
        <div className="dbody">
          {error ? <div className="dbanner err">{error}</div> : null}
          <div className="fsection">
            <p className="fnote" style={{ padding: '0 0 12px' }}>
              This creates a pending payment ready to be added to a batch. No ledger
              entries are posted until the batch is marked as paid.
            </p>
            <div className="fgrid">
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