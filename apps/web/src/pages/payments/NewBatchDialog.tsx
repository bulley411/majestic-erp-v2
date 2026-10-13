import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createPaymentBatch, ApiError, type PaymentBatch } from '../../lib/api';

export default function NewBatchDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (batch: PaymentBatch) => void;
}) {
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createPaymentBatch({ description }),
    onSuccess: onCreated,
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'Could not create batch.'),
  });

  return (
    <div className="drawerwrap" role="dialog" aria-modal="true">
      <div className="drawerscrim" onClick={onClose} />
      <div className="drawer" style={{ width: 'min(500px, 100%)' }}>
        <header className="dhead">
          <h2 className="page">New payment batch</h2>
          <div className="acts">
            <button className="btn pri" type="button"
              disabled={create.isPending || description.trim().length < 3}
              onClick={() => create.mutate()}>
              {create.isPending ? 'Creating…' : 'Create batch'}
            </button>
            <button className="btn" type="button" onClick={onClose}>Cancel</button>
          </div>
        </header>
        <div className="dbody">
          {error ? <div className="dbanner err">{error}</div> : null}
          <div className="fsection">
            <div className="fgrid">
              <label className="ffield span2">
                <span>Description <b>*</b></span>
                <input
                  value={description}
                  autoFocus
                  placeholder="e.g. October 2026 vendor payouts"
                  onChange={(e) => setDescription(e.target.value)}
                />
                <em className="fhint">
                  A label to identify this batch in reports.
                </em>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}