import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPaymentPayableConfig, setPaymentPayableConfig, getAccounts,
  ApiError, type PaymentPayableMapping,
} from '../../lib/api';

export default function PaymentPayablesPanel({
  manage,
  onError,
}: {
  manage: boolean;
  onError: (m: string | null) => void;
}) {
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['payment-payable-config'],
    queryFn: getPaymentPayableConfig,
  });

  const { data: accounts } = useQuery({
    queryKey: ['accounts', false],
    queryFn: () => getAccounts(false),
  });

  const update = useMutation({
    mutationFn: ({ key, accountId }: { key: string; accountId: string }) =>
      setPaymentPayableConfig(key, accountId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-payable-config'] });
      onError(null);
    },
    onError: (e) =>
      onError(e instanceof ApiError ? e.message : 'Could not save.'),
  });

  if (isLoading) return <div className="loading">Loading…</div>;

  const list = Object.values(config || {}) as PaymentPayableMapping[];
  const liabilityAccounts = (accounts || []).filter(
    (a) => a.type === 'LIABILITY',
  );

  return (
    <>
      <p className="fnote" style={{ padding: '0 0 14px' }}>
        Configure the payable accounts used by the payment module. When a payment
        is marked paid, the ERP posts the entry against the corresponding payable
        account here.
      </p>

      <ul className="typelist">
        {list.map((m) => (
          <li key={m.key}>
            <div className="typemain">
              <b>{m.meta.label}</b>
              <em>{m.meta.description}</em>
              <div className="typetags">
                <span className="tag">
                  {m.meta.expectedType.toLowerCase()}
                </span>
                {m.isConfigured ? (
                  <span className="tag ok">Configured</span>
                ) : (
                  <span className="tag warn">Not configured</span>
                )}
              </div>
            </div>
            <div className="typeacts">
              {manage ? (
                <select
                  value={m.accountId || ''}
                  onChange={(e) =>
                    update.mutate({ key: m.key, accountId: e.target.value })
                  }
                  className="linkselect"
                  style={{ minWidth: 260 }}
                  disabled={update.isPending}
                >
                  <option value="">— Select account —</option>
                  {liabilityAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="mono">
                  {m.accountCode
                    ? `${m.accountCode} - ${m.accountName}`
                    : 'Not configured'}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="fnote">
        Payments cannot be created until both payable accounts are configured.
      </p>
    </>
  );
}