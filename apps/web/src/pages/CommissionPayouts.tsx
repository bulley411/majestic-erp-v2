import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listCommissionBatches, importCommissionBatch, cancelCommissionBatch,
  ApiError, type CommissionPayoutBatch, type CommissionBatchStatus,
} from '../lib/api';
import { useAuth } from '../lib/auth-context';
import CommissionPayoutDetail from './CommissionPayoutDetail';

const STATUS_COLORS: Record<CommissionBatchStatus, string> = {
  DRAFT: 'info',
  PROCESSING: 'warn',
  APPROVED: 'ok',
  PAID: 'ok',
  SYNCING: 'warn',
  SYNCED: 'ok',
  SYNC_FAILED: 'warn',
  CANCELLED: 'warn',
};

const STATUS_LABELS: Record<CommissionBatchStatus, string> = {
  DRAFT: 'Draft',
  PROCESSING: 'Processing',
  APPROVED: 'Approved',
  PAID: 'Paid',
  SYNCING: 'Syncing',
  SYNCED: 'Synced',
  SYNC_FAILED: 'Sync failed',
  CANCELLED: 'Cancelled',
};

const naira = (v: string) =>
  '₦' + Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2 });

export default function CommissionPayouts() {
  const { can } = useAuth();
  const canImport = can('commission.import');
  const qc = useQueryClient();

  const [status, setStatus] = useState('');
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: batches, isLoading } = useQuery({
    queryKey: ['commission-batches', status],
    queryFn: () => listCommissionBatches(status || undefined),
  });

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : 'Something went wrong.');

  const flash = (m: string) => {
    setSuccess(m);
    setTimeout(() => setSuccess(null), 4000);
  };

  const cancel = useMutation({
    mutationFn: cancelCommissionBatch,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commission-batches'] });
      flash('Batch cancelled.');
      setError(null);
    },
    onError: fail,
  });

  if (openBatch) {
    return (
      <CommissionPayoutDetail
        batchId={openBatch}
        onClose={() => {
          setOpenBatch(null);
          qc.invalidateQueries({ queryKey: ['commission-batches'] });
        }}
      />
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="crumb">Finance</div>
        <div className="titlerow">
          <h2 className="page">
            Commission payouts
            <span className="count">
              {isLoading ? 'Loading…' : `${batches?.length ?? 0} batch(es)`}
            </span>
          </h2>
          {canImport ? (
            <div className="acts">
              <button
                className="btn pri"
                type="button"
                onClick={() => setShowImport(true)}
              >
                Import schedule
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="filters">
        <label className="ffield" style={{ maxWidth: 180 }}>
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="PROCESSING">Processing</option>
            <option value="PAID">Paid</option>
            <option value="SYNCED">Synced</option>
            <option value="SYNC_FAILED">Sync failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
        <div className="regmeta">
          <span className="tag">
            {batches?.filter((b) => b.status === 'SYNC_FAILED').length ?? 0} needing retry
          </span>
        </div>
      </div>

      <div className="body">
        {error ? <div className="dbanner err" style={{ marginBottom: 14 }}>{error}</div> : null}
        {success ? <div className="dbanner" style={{ marginBottom: 14 }}>{success}</div> : null}

        {isLoading ? <div className="loading">Loading batches…</div> : null}
        {!isLoading && !batches?.length ? (
          <div className="empty">
            <h3>No commission batches yet</h3>
            <p>
              Import an Excel schedule from the agent portal to create a payout batch.
              Each batch becomes a voucher, follows the approval workflow, and syncs
              payment confirmations back on mark-paid.
            </p>
          </div>
        ) : null}

        {batches?.length ? (
          <div className="fsection">
            <ul className="typelist">
              {batches.map((b: CommissionPayoutBatch) => (
                <li key={b.id}>
                  <div
                    className="typemain"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setOpenBatch(b.id)}
                  >
                    <b className="mono">{b.fileName}</b>
                    <em>
                      {new Date(b.dateFrom).toLocaleDateString('en-NG')} →{' '}
                      {new Date(b.dateTo).toLocaleDateString('en-NG')}
                      {b.voucher ? ` · Voucher ${b.voucher.voucherNo}` : ''}
                    </em>
                    <div className="typetags">
                      <span className={`tag ${STATUS_COLORS[b.status]}`}>
                        {STATUS_LABELS[b.status]}
                      </span>
                      <span className="tag">
                        {b.totalRows} row{b.totalRows !== 1 ? 's' : ''}
                      </span>
                      {b.noAccountRows > 0 ? (
                        <span className="tag warn">
                          {b.noAccountRows} no account
                        </span>
                      ) : null}
                      {b.failedRows > 0 ? (
                        <span className="tag warn">
                          {b.failedRows} sync failed
                        </span>
                      ) : null}
                      <span className="tag mono">{naira(b.totalAmount)}</span>
                    </div>
                  </div>
                  <div className="typeacts">
                    <button
                      className="linkact"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenBatch(b.id);
                      }}
                    >
                      Open
                    </button>
                    {canImport && b.status === 'DRAFT' ? (
                      <button
                        className="linkact danger"
                        type="button"
                        disabled={cancel.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Cancel batch "${b.fileName}"? This cannot be undone.`)) {
                            cancel.mutate(b.id);
                          }
                        }}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="fnote">
          Commission payouts follow the same voucher approval flow as other expenses.
          Once the voucher is marked paid (via Finance → Payments), each row is
          pushed to the agent portal webhook. Failed rows can be retried manually
          from the batch detail.
        </p>
      </div>

      {showImport ? (
        <ImportCommissionDialog
          onClose={() => setShowImport(false)}
          onImported={(batchId, fileName, rows, noAccount) => {
            setShowImport(false);
            qc.invalidateQueries({ queryKey: ['commission-batches'] });
            flash(`Imported ${rows} row(s) from ${fileName}${noAccount ? ` (${noAccount} without bank account)` : ''}.`);
            setOpenBatch(batchId);
          }}
        />
      ) : null}
    </>
  );
}

/* ----------------------- Import dialog ----------------------- */

function ImportCommissionDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (batchId: string, fileName: string, rows: number, noAccount: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [requireEd, setRequireEd] = useState(true);
  const [requireMd, setRequireMd] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<string[]>([]);

  const upload = useMutation({
    mutationFn: () =>
      importCommissionBatch(file!, {
        requireEdApproval: requireEd,
        requireMdApproval: requireMd,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (res) => {
      onImported(res.id, res.fileName, res.totalRows, res.noAccountRows);
    },
    onError: (e) => {
      const err = e as ApiError & { rows?: string[] };
      setError(err.message);
      setRowErrors(err.rows ?? []);
    },
  });

  return (
    <div className="drawerwrap" role="dialog" aria-modal="true">
      <div className="drawerscrim" onClick={onClose} />
      <div className="drawer" style={{ width: 'min(640px, 100%)' }}>
        <header className="dhead">
          <div>
            <div className="crumb">Commission payouts</div>
            <h2 className="page">Import schedule</h2>
          </div>
          <div className="acts">
            <button className="btn" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        {error ? (
          <div className="dbanner err" style={{ marginBottom: 14 }}>
            <b>{error}</b>
            {rowErrors.length ? (
              <ul style={{ margin: '8px 0 0 18px', padding: 0 }}>
                {rowErrors.slice(0, 10).map((r, i) => (
                  <li key={i} style={{ fontSize: 12 }}>{r}</li>
                ))}
                {rowErrors.length > 10 ? (
                  <li style={{ fontSize: 12, fontStyle: 'italic' }}>
                    …and {rowErrors.length - 10} more.
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="dbody">
          <div className="fsection">
            <h4>Excel file</h4>
            <p className="fnote" style={{ padding: 0, marginBottom: 12 }}>
              Sheet must be named <code>Payment schedule</code>. Row 3 must contain
              the headers, data starts at row 4, and rows flagged red (missing bank
              account) will be recorded as <code>NO_ACCOUNT</code>.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: 'none' }}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
                setRowErrors([]);
              }}
            />

            <div className="acts" style={{ marginBottom: 14 }}>
              <button
                className="btn"
                type="button"
                onClick={() => fileRef.current?.click()}
              >
                {file ? 'Choose a different file' : 'Choose file'}
              </button>
              {file ? (
                <span className="mono" style={{ fontSize: 12 }}>
                  {file.name} · {(file.size / 1024).toFixed(1)} KB
                </span>
              ) : null}
            </div>

            <div className="fgrid">
              <label className="ffield span2">
                <span>Approval requirements</span>
                <label className="inlinecheck" style={{ marginTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={requireEd}
                    onChange={(e) => setRequireEd(e.target.checked)}
                  />
                  ED approval required
                </label>
                <label className="inlinecheck" style={{ marginTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={requireMd}
                    onChange={(e) => setRequireMd(e.target.checked)}
                  />
                  MD approval required
                </label>
              </label>

              <label className="ffield span2">
                <span>Notes (optional)</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reference or period notes"
                />
              </label>
            </div>

            <div className="acts" style={{ marginTop: 14 }}>
              <button
                className="btn pri"
                type="button"
                disabled={!file || upload.isPending}
                onClick={() => upload.mutate()}
              >
                {upload.isPending ? 'Importing…' : 'Import batch'}
              </button>
              <button className="btn" type="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}