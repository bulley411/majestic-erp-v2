import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listPayments, listPaymentBatches, deletePayment,
  ApiError, type PaymentBatch,
} from '../lib/api';
import { useAuth } from '../lib/auth-context';
import PaymentBatchDetail from './PaymentBatchDetail';
import NewBatchDialog from './payments/NewBatchDialog';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'info',
  BATCHED: 'info',
  SENT: 'warn',
  PAID: 'ok',
  FAILED: 'warn',
  CANCELLED: 'warn',
  DRAFT: 'info',
  READY: 'info',
  PARTIAL: 'warn',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  BATCHED: 'Batched',
  SENT: 'Sent',
  PAID: 'Paid',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  DRAFT: 'Draft',
  READY: 'Ready',
  PARTIAL: 'Partial',
};

const TYPE_LABELS: Record<string, string> = {
  VOUCHER: 'Voucher',
  COMMISSION: 'Commission',
  PAYROLL_NET: 'Payroll net',
  PAYROLL_PAYE: 'PAYE',
  PAYROLL_PENSION: 'Pension',
  PAYROLL_NHF: 'NHF',
  OTHER: 'Other',
};

const naira = (v: string) =>
  '₦' + Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2 });

export default function Payments() {
  const { can } = useAuth();
  const canCreate = can('payment.create');
  
  const qc = useQueryClient();

  const [tab, setTab] = useState<'payments' | 'batches'>('payments');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments', status, type],
    queryFn: () => listPayments({
      status: status || undefined,
      type: type || undefined,
    }),
    enabled: tab === 'payments',
  });

  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ['payment-batches'],
    queryFn: () => listPaymentBatches(),
    enabled: tab === 'batches',
  });

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : 'Something went wrong.');

  const remove = useMutation({
    mutationFn: deletePayment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      setError(null);
    },
    onError: fail,
  });

  if (openBatch) {
    return (
      <PaymentBatchDetail
        batchId={openBatch}
        onClose={() => setOpenBatch(null)}
      />
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="crumb">Finance</div>
        <div className="titlerow">
          <h2 className="page">
            Payments
            <span className="count">
              {tab === 'payments'
                ? `${payments?.length ?? 0} payment(s)`
                : `${batches?.length ?? 0} batch(es)`}
            </span>
          </h2>
          {canCreate && tab === 'batches' ? (
            <div className="acts">
              <button
                className="btn pri"
                type="button"
                onClick={() => setShowNewBatch(true)}
              >
                New batch
              </button>
            </div>
          ) : null}
        </div>
        <nav className="tabs">
          <button
            type="button"
            className={`tab${tab === 'payments' ? ' on' : ''}`}
            onClick={() => setTab('payments')}
          >
            All payments
          </button>
          <button
            type="button"
            className={`tab${tab === 'batches' ? ' on' : ''}`}
            onClick={() => setTab('batches')}
          >
            Batches
          </button>
        </nav>
      </header>

      {tab === 'payments' ? (
        <div className="filters">
          <label className="ffield" style={{ maxWidth: 150 }}>
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="BATCHED">Batched</option>
              <option value="SENT">Sent</option>
              <option value="PAID">Paid</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          <label className="ffield" style={{ maxWidth: 150 }}>
            <span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All</option>
              <option value="VOUCHER">Voucher</option>
              <option value="COMMISSION">Commission</option>
              <option value="PAYROLL_NET">Payroll net</option>
              <option value="PAYROLL_PAYE">PAYE</option>
              <option value="PAYROLL_PENSION">Pension</option>
              <option value="PAYROLL_NHF">NHF</option>
            </select>
          </label>
        </div>
      ) : null}

      <div className="body">
        {error ? <div className="dbanner err" style={{ marginBottom: 14 }}>{error}</div> : null}

        {tab === 'payments' ? (
          <>
            {paymentsLoading ? <div className="loading">Loading payments…</div> : null}
            {!paymentsLoading && !payments?.length ? (
              <div className="empty">
                <h3>No payments yet</h3>
                <p>Create a payment from an approved voucher.</p>
              </div>
            ) : null}
            {payments?.length ? (
              <div className="fsection">
                <div className="tablewrap">
                  <table className="dtable">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Payee</th>
                        <th>Type</th>
                        <th className="num">Amount</th>
                        <th>Status</th>
                        <th>Batch</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td className="mono">
                            <b>{p.reference}</b>
                            {p.voucher ? (
                              <em className="mono">{p.voucher.voucherNo}</em>
                            ) : null}
                          </td>
                          <td>{p.payeeName}</td>
                          <td>
                            <span className="tag info">
                              {TYPE_LABELS[p.type] ?? p.type}
                            </span>
                          </td>
                          <td className="num mono">{naira(p.netAmount)}</td>
                          <td>
                            <span className={`tag ${STATUS_COLORS[p.status] ?? ''}`}>
                              {STATUS_LABELS[p.status] ?? p.status}
                            </span>
                          </td>
                          <td className="mono" style={{ fontSize: 11 }}>
                            {p.batch ? p.batch.reference : '—'}
                          </td>
                          <td>
                            {canCreate && p.status === 'PENDING' ? (
                              <button
                                className="linkact danger"
                                type="button"
                                disabled={remove.isPending}
                                onClick={() => {
                                  if (confirm(`Delete ${p.reference}?`)) {
                                    remove.mutate(p.id);
                                  }
                                }}
                              >
                                Delete
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {batchesLoading ? <div className="loading">Loading batches…</div> : null}
            {!batchesLoading && !batches?.length ? (
              <div className="empty">
                <h3>No batches yet</h3>
                <p>
                  Create a batch to group pending payments, then generate a bank file.
                </p>
              </div>
            ) : null}
            {batches?.length ? (
              <div className="fsection">
                <ul className="typelist">
                  {batches.map((b: PaymentBatch) => (
                    <li key={b.id}>
                      <div
                        className="typemain"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setOpenBatch(b.id)}
                      >
                        <b className="mono">{b.reference}</b>
                        <em>{b.description}</em>
                        <div className="typetags">
                          <span className={`tag ${STATUS_COLORS[b.status] ?? ''}`}>
                            {STATUS_LABELS[b.status] ?? b.status}
                          </span>
                          <span className="tag">
                            {b._count?.payments ?? b.paymentCount} payment(s)
                          </span>
                          <span className="tag mono">
                            {naira(b.totalAmount)}
                          </span>
                          {b.bankFileGeneratedAt ? (
                            <span className="tag ok">File generated</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="typeacts">
                        <button
                          className="linkact"
                          type="button"
                          onClick={() => setOpenBatch(b.id)}
                        >
                          Open
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>

      {showNewBatch ? (
        <NewBatchDialog
          onClose={() => setShowNewBatch(false)}
          onCreated={(b) => {
            setShowNewBatch(false);
            qc.invalidateQueries({ queryKey: ['payment-batches'] });
            setOpenBatch(b.id);
          }}
        />
      ) : null}
    </>
  );
}