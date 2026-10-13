import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPaymentBatch, addPaymentsToBatch, removePaymentFromBatch,
  generateBankFile, submitPaymentBatch, markPaymentBatchPaid,
  discardPaymentBatch, downloadBankFile, listPayments,
  ApiError, type Payment,
} from '../lib/api';
import { useAuth } from '../lib/auth-context';
import AddPaymentsDialog from './payments/AddPaymentsDialog';
import MarkPaidDialog from './payments/MarkPaidDialog';

const naira = (v: string) =>
  '₦' + Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2 });

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  READY: 'Ready',
  SENT: 'Sent to bank',
  PAID: 'Paid',
  PARTIAL: 'Partial',
  FAILED: 'Failed',
};

export default function PaymentBatchDetail({
  batchId,
  onClose,
}: {
  batchId: string;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const canCreate = can('payment.create');
  const canExecute = can('payment.execute');
  const qc = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [showAddPayments, setShowAddPayments] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);

  const { data: batch, isLoading } = useQuery({
    queryKey: ['payment-batch', batchId],
    queryFn: () => getPaymentBatch(batchId),
  });

  const { data: pendingPayments } = useQuery({
    queryKey: ['payments', 'PENDING'],
    queryFn: () => listPayments({ status: 'PENDING' }),
    enabled: showAddPayments,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['payment-batch', batchId] });
    qc.invalidateQueries({ queryKey: ['payment-batches'] });
    qc.invalidateQueries({ queryKey: ['payments'] });
    setError(null);
  };

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : 'Something went wrong.');

  const addPayments = useMutation({
    mutationFn: (paymentIds: string[]) => addPaymentsToBatch(batchId, paymentIds),
    onSuccess: () => { refresh(); setShowAddPayments(false); },
    onError: fail,
  });

  const removePayment = useMutation({
    mutationFn: (paymentId: string) => removePaymentFromBatch(batchId, paymentId),
    onSuccess: refresh,
    onError: fail,
  });

  const genFile = useMutation({
    mutationFn: () => generateBankFile(batchId),
    onSuccess: refresh,
    onError: fail,
  });

  const submit = useMutation({
    mutationFn: () => submitPaymentBatch(batchId),
    onSuccess: refresh,
    onError: fail,
  });

  const markPaid = useMutation({
    mutationFn: (data: { paidAt: string; externalReference?: string; notes?: string }) =>
      markPaymentBatchPaid(batchId, data),
    onSuccess: () => { refresh(); setShowMarkPaid(false); },
    onError: fail,
  });

  const discard = useMutation({
    mutationFn: () => discardPaymentBatch(batchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-batches'] });
      onClose();
    },
    onError: fail,
  });

  if (isLoading || !batch) return <div className="loading">Loading batch…</div>;

  const busy = genFile.isPending || submit.isPending || markPaid.isPending || discard.isPending;

  return (
    <>
      <header className="topbar">
        <div className="crumb">
          <button className="linkact" type="button" onClick={onClose}>
            ← Payments
          </button>
        </div>
        <div className="titlerow">
          <div>
            <h2 className="page">{batch.reference}</h2>
            <span style={{ fontSize: 12, color: 'var(--slate-2)' }}>
              {batch.description}
            </span>
          </div>
          <div className="acts">
            {canCreate && batch.status === 'DRAFT' ? (
              <button className="btn" type="button"
                onClick={() => setShowAddPayments(true)}>
                Add payments
              </button>
            ) : null}
            {canCreate && batch.status === 'DRAFT' ? (
              <button className="btn pri" type="button" disabled={busy}
                onClick={() => {
                  if (confirm('Generate the bank file?')) genFile.mutate();
                }}>
                {genFile.isPending ? 'Generating…' : 'Generate bank file'}
              </button>
            ) : null}
            {canCreate && batch.status === 'READY' && batch.bankFileGeneratedAt ? (
              <button className="btn" type="button"
                onClick={() =>
                  downloadBankFile(batch.id, batch.bankFileOriginalName!)
                }>
                Download file
              </button>
            ) : null}
            {canExecute && batch.status === 'READY' ? (
              <button className="btn pri" type="button" disabled={busy}
                onClick={() => {
                  if (confirm('Mark as submitted to the bank?')) submit.mutate();
                }}>
                {submit.isPending ? 'Submitting…' : 'Mark submitted'}
              </button>
            ) : null}
            {canExecute && batch.status === 'SENT' ? (
              <button className="btn pri" type="button"
                onClick={() => setShowMarkPaid(true)}>
                Mark as paid
              </button>
            ) : null}
            {canCreate && batch.status === 'DRAFT' ? (
              <button className="btn" type="button" disabled={busy}
                onClick={() => {
                  if (confirm(`Discard ${batch.reference}?`)) discard.mutate();
                }}>
                Discard
              </button>
            ) : null}
            <button className="btn" type="button" onClick={onClose}>Close</button>
          </div>
        </div>
      </header>

      <div className="body">
        {error ? <div className="dbanner err" style={{ marginBottom: 14 }}>{error}</div> : null}

        <div className="runsummary">
          <div>
            <span>Status</span>
            <b>{STATUS_LABELS[batch.status] ?? batch.status}</b>
          </div>
          <div>
            <span>Payments</span>
            <b className="mono">{batch.payments?.length ?? 0}</b>
          </div>
          <div className="net">
            <span>Total</span>
            <b className="mono">{naira(batch.totalAmount)}</b>
          </div>
        </div>

        <div className="fsection">
          <h4>Payments in this batch</h4>
          {!batch.payments?.length ? (
            <p className="fnote" style={{ padding: 0 }}>
              No payments yet. Add pending payments to this batch.
            </p>
          ) : (
            <div className="tablewrap">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Payee</th>
                    <th>Bank</th>
                    <th>Account</th>
                    <th className="num">Amount</th>
                    {batch.status === 'DRAFT' ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {batch.payments.map((p: Payment) => (
                    <tr key={p.id}>
                      <td className="mono">{p.reference}</td>
                      <td>{p.beneficiaryAccountName ?? p.payeeName}</td>
                      <td>{p.beneficiaryBank ?? '—'}</td>
                      <td className="mono">{p.beneficiaryAccount ?? '—'}</td>
                      <td className="num mono">{naira(p.netAmount)}</td>
                      {batch.status === 'DRAFT' ? (
                        <td className="num">
                          <button className="linkact danger" type="button"
                            disabled={removePayment.isPending}
                            onClick={() => {
                              if (confirm(`Remove ${p.reference} from batch?`)) {
                                removePayment.mutate(p.id);
                              }
                            }}>
                            Remove
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showAddPayments && pendingPayments ? (
        <AddPaymentsDialog
          payments={pendingPayments}
          onClose={() => setShowAddPayments(false)}
          onSubmit={(ids) => addPayments.mutate(ids)}
          busy={addPayments.isPending}
        />
      ) : null}

      {showMarkPaid ? (
        <MarkPaidDialog
          onClose={() => setShowMarkPaid(false)}
          onSubmit={(data) => markPaid.mutate(data)}
          busy={markPaid.isPending}
        />
      ) : null}
    </>
  );
}