import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCommissionBatch, processCommissionBatch, syncCommissionBatch,
  retryCommissionRow, listExpenseCategories, listBanks,
  ApiError,
  type CommissionPayoutRow, type CommissionRowStatus,
} from '../lib/api';
import { useAuth } from '../lib/auth-context';

const STATUS_COLORS: Record<CommissionRowStatus, string> = {
  PENDING: 'info',
  PAID: 'ok',
  SYNCED: 'ok',
  SYNC_FAILED: 'warn',
  NO_ACCOUNT: 'warn',
};

const STATUS_LABELS: Record<CommissionRowStatus, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  SYNCED: 'Synced',
  SYNC_FAILED: 'Sync failed',
  NO_ACCOUNT: 'No account',
};

//const naira = (v: string) =>
  //'�₦'.replace('₦', '₦') + Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2 });

const ngn = (v: string) =>
  '₦' + Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2 });

export default function CommissionPayoutDetail({
  batchId,
  onClose,
}: {
  batchId: string;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const canProcess = can('commission.process');
  const qc = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showProcess, setShowProcess] = useState(false);

  const { data: batch, isLoading } = useQuery({
    queryKey: ['commission-batch', batchId],
    queryFn: () => getCommissionBatch(batchId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'SYNCING' ? 2000 : false;
    },
  });

  const flash = (m: string) => {
    setSuccess(m);
    setTimeout(() => setSuccess(null), 4000);
  };

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : 'Something went wrong.');

  const sync = useMutation({
    mutationFn: () => syncCommissionBatch(batchId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['commission-batch', batchId] });
      qc.invalidateQueries({ queryKey: ['commission-batches'] });
      flash(
        `Sync complete — applied ${res.response.applied}, ignored ${res.response.ignored}, rejected ${res.response.rejected.length}.`,
      );
      setError(null);
    },
    onError: fail,
  });

  const retry = useMutation({
    mutationFn: (rowId: string) => retryCommissionRow(batchId, rowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commission-batch', batchId] });
      qc.invalidateQueries({ queryKey: ['commission-batches'] });
      flash('Row retried.');
      setError(null);
    },
    onError: fail,
  });

  if (isLoading || !batch) {
    return (
      <>
        <header className="topbar">
          <div className="crumb">
            <button className="linkact" type="button" onClick={onClose}>
              ← All batches
            </button>
          </div>
          <div className="titlerow"><h2 className="page">Loading…</h2></div>
        </header>
        <div className="body"><div className="loading">Loading batch…</div></div>
      </>
    );
  }

  const canProcessNow = canProcess && batch.status === 'DRAFT';
  const canSync =
    canProcess &&
    ['PAID', 'SYNC_FAILED', 'SYNCING'].includes(batch.status) &&
    batch.rows.some((r) => r.status === 'PAID' || r.status === 'SYNC_FAILED');

  const paidRows = batch.rows.filter((r) => r.status === 'PAID' || r.status === 'SYNCED').length;
  const failedRows = batch.rows.filter((r) => r.status === 'SYNC_FAILED').length;

  return (
    <>
      <header className="topbar">
        <div className="crumb">
          <button className="linkact" type="button" onClick={onClose}>
            ← All commission batches
          </button>
        </div>
        <div className="titlerow">
          <h2 className="page">
            {batch.fileName}
            <span className="count">
              <span className={`tag ${STATUS_COLORS[batch.status as never] ?? 'info'}`}>
                {batch.status.replace('_', ' ').toLowerCase()}
              </span>
              {batch.voucher ? (
                <span className="tag" style={{ marginLeft: 8 }}>
                  Voucher {batch.voucher.voucherNo}
                </span>
              ) : null}
            </span>
          </h2>
          <div className="acts">
            {canProcessNow ? (
              <button
                className="btn pri"
                type="button"
                disabled={sync.isPending}
                onClick={() => setShowProcess(true)}
              >
                Process batch
              </button>
            ) : null}
            {canSync ? (
              <button
                className="btn pri"
                type="button"
                disabled={sync.isPending}
                onClick={() => sync.mutate()}
              >
                {sync.isPending ? 'Syncing…' : 'Sync to portal'}
              </button>
            ) : null}
            <button className="btn" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </header>

      <div className="body">
        {error ? <div className="dbanner err" style={{ marginBottom: 14 }}>{error}</div> : null}
        {success ? <div className="dbanner" style={{ marginBottom: 14 }}>{success}</div> : null}

        {/* Summary */}
        <div className="fsection">
          <div className="entry-detail-header">
            <div>
              <span className="photolabel">Period</span>
              <b>
                {new Date(batch.dateFrom).toLocaleDateString('en-NG')} →{' '}
                {new Date(batch.dateTo).toLocaleDateString('en-NG')}
              </b>
            </div>
            <div>
              <span className="photolabel">Total amount</span>
              <b className="mono">{ngn(batch.totalAmount)}</b>
            </div>
            <div>
              <span className="photolabel">Rows</span>
              <b>
                {batch.totalRows}
                {batch.noAccountRows > 0 ? (
                  <em style={{ color: 'var(--amber, #b8862b)', marginLeft: 6 }}>
                    ({batch.noAccountRows} no account)
                  </em>
                ) : null}
              </b>
            </div>
            <div>
              <span className="photolabel">Payment progress</span>
              <b>
                {paidRows} / {batch.totalRows - batch.noAccountRows} paid
                {failedRows > 0 ? (
                  <em style={{ color: 'var(--rose)', marginLeft: 6 }}>
                    · {failedRows} sync failed
                  </em>
                ) : null}
              </b>
            </div>
          </div>
        </div>

        {/* Rows */}
        <div className="fsection">
          <h4>Payment rows</h4>
          <div className="tablewrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Pay code</th>
                  <th>Agent</th>
                  <th className="num">Records</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((r: CommissionPayoutRow) => (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontSize: 11 }}>{r.payCode}</td>
                    <td className="mono">{r.agentCode}</td>
                    <td className="num mono">{r.recordCount}</td>
                    <td className="num mono">{ngn(r.rate)}</td>
                    <td className="num mono">{ngn(r.amount)}</td>
                    <td style={{ fontSize: 11 }}>
                      {r.bank ? (
                        <>
                          <b>{r.bank}</b>
                          <em className="mono" style={{ display: 'block' }}>
                            {r.accountNumber}
                          </em>
                        </>
                      ) : (
                        <span style={{ color: 'var(--slate-2)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`tag ${STATUS_COLORS[r.status]}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                      {r.lastSyncError ? (
                        <em
                          style={{
                            display: 'block',
                            fontSize: 10,
                            color: 'var(--rose)',
                            marginTop: 2,
                          }}
                          title={r.lastSyncError}
                        >
                          {r.lastSyncError.slice(0, 40)}
                          {r.lastSyncError.length > 40 ? '…' : ''}
                        </em>
                      ) : null}
                    </td>
                    <td>
                      {canProcess && r.status === 'SYNC_FAILED' ? (
                        <button
                          className="linkact"
                          type="button"
                          disabled={retry.isPending}
                          onClick={() => retry.mutate(r.id)}
                        >
                          Retry
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sync log */}
        {batch.syncLogs?.length ? (
          <div className="fsection">
            <h4>Sync log</h4>
            <ul className="typelist">
              {batch.syncLogs.map((log) => (
                <li key={log.id}>
                  <div className="typemain">
                    <b>{log.action}</b>
                    <em>
                      {new Date(log.createdAt).toLocaleString('en-NG')}
                      {log.statusCode ? ` · HTTP ${log.statusCode}` : ''}
                      {log.durationMs ? ` · ${log.durationMs} ms` : ''}
                    </em>
                    {log.errorMessage ? (
                      <div className="typetags">
                        <span className="tag warn">{log.errorMessage}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="typeacts">
                    <span className={log.success ? 'tag ok' : 'tag warn'}>
                      {log.success ? 'Success' : 'Failed'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="fnote">
          Processing this batch creates a voucher for the total payable amount and
          starts the standard approval workflow. Once that voucher is marked paid
          via Finance → Payments, all rows become eligible for webhook sync to the
          agent portal. Retries are manual.
        </p>
      </div>

      {showProcess ? (
        <ProcessBatchDialog
          batchId={batchId}
          onClose={() => setShowProcess(false)}
          onProcessed={(voucherNo) => {
            setShowProcess(false);
            qc.invalidateQueries({ queryKey: ['commission-batch', batchId] });
            qc.invalidateQueries({ queryKey: ['commission-batches'] });
            qc.invalidateQueries({ queryKey: ['vouchers'] });
            flash(`Batch processed. Voucher ${voucherNo} created and submitted for approval.`);
          }}
        />
      ) : null}
    </>
  );
}

/* ----------------------- Process dialog ----------------------- */

function ProcessBatchDialog({
  batchId,
  onClose,
  onProcessed,
}: {
  batchId: string;
  onClose: () => void;
  onProcessed: (voucherNo: string) => void;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [bankId, setBankId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['expense-categories-options'],
    queryFn: () => listExpenseCategories(false),
  });

  const { data: banks } = useQuery({
    queryKey: ['banks'],
    queryFn: listBanks,
  });

  const process = useMutation({
    mutationFn: () =>
      processCommissionBatch(batchId, {
        categoryId: categoryId || undefined,
        bankId: bankId || undefined,
      }),
    onSuccess: (res) => onProcessed(res.voucher.voucherNo),
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'Could not process batch.'),
  });

  return (
    <div className="drawerwrap" role="dialog" aria-modal="true">
      <div className="drawerscrim" onClick={onClose} />
      <div className="drawer" style={{ width: 'min(560px, 100%)' }}>
        <header className="dhead">
          <div>
            <div className="crumb">Commission payouts</div>
            <h2 className="page">Process batch</h2>
          </div>
          <div className="acts">
            <button className="btn" type="button" onClick={onClose}>Close</button>
          </div>
        </header>

        {error ? <div className="dbanner err">{error}</div> : null}

        <div className="dbody">
          <div className="fsection">
            <p className="fnote" style={{ padding: 0, marginBottom: 14 }}>
              A voucher will be created for the payable total and will enter the
              normal approval workflow. Leave the fields blank to auto-detect a
              sensible default.
            </p>

            <div className="fgrid">
              <label className="ffield span2">
                <span>Expense category</span>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">— Auto-detect —</option>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                  ))}
                </select>
              </label>
              <label className="ffield span2">
                <span>Bank to debit</span>
                <select value={bankId} onChange={(e) => setBankId(e.target.value)}>
                  <option value="">— Auto-detect —</option>
                  {banks?.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="acts" style={{ marginTop: 14 }}>
              <button
                className="btn pri"
                type="button"
                disabled={process.isPending}
                onClick={() => process.mutate()}
              >
                {process.isPending ? 'Processing…' : 'Create voucher'}
              </button>
              <button className="btn" type="button" onClick={onClose}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}