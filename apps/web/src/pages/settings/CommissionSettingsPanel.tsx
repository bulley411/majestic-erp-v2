import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCommissionSettings, updateCommissionSettings, testCommissionWebhook,
  ApiError, type CommissionSettings,
} from '../../lib/api';

export default function CommissionSettingsPanel({
  manage,
  onError,
}: {
  manage: boolean;
  onError: (m: string | null) => void;
}) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['commission-settings'],
    queryFn: getCommissionSettings,
  });

  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [sharedSecret, setSharedSecret] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Sync local form state when server data arrives / refreshes.
  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setBaseUrl(data.baseUrl);
    setAutoSync(data.autoSyncOnPayment);
    setSharedSecret(''); // never populate the secret input; leave blank unless changing
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      updateCommissionSettings({
        enabled,
        baseUrl: baseUrl.trim(),
        autoSyncOnPayment: autoSync,
        ...(sharedSecret.trim() ? { sharedSecret: sharedSecret.trim() } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commission-settings'] });
      setSharedSecret('');
      setTestResult(null);
      onError(null);
    },
    onError: (e) =>
      onError(e instanceof ApiError ? e.message : 'Could not save settings.'),
  });

  const test = useMutation({
    mutationFn: testCommissionWebhook,
    onSuccess: (res) => setTestResult(res),
    onError: (e) =>
      setTestResult({
        ok: false,
        message: e instanceof ApiError ? e.message : 'Test failed.',
      }),
  });

  if (isLoading) return <div className="loading">Loading…</div>;

  const settings: CommissionSettings | undefined = data;
  const hasStoredSecret = settings?.hasSecret ?? false;

  return (
    <>
      <p className="fnote" style={{ padding: '0 0 14px' }}>
        The commission payout integration posts payment confirmations back to the
        agent portal when a commission voucher is marked paid. Configure the
        endpoint URL and shared secret below.
      </p>

      <div className="fsection">
        <h4>Integration</h4>
        <div className="fgrid">
          <label className="ffield span2">
            <span>Enable integration</span>
            <label className="inlinecheck" style={{ marginTop: 6 }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={!manage}
              />
              Accept commission payouts from imports and sync on payment
            </label>
          </label>

          <label className="ffield span2">
            <span>Base URL</span>
            <input
              type="text"
              placeholder="https://portal.example.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={!manage}
            />
            <em style={{ fontSize: 11, color: 'var(--slate-2)', marginTop: 4 }}>
              The system will POST to <code>{baseUrl || '<base-url>'}/api/v1/webhook/payment-schedules/payouts</code>
            </em>
          </label>

          <label className="ffield span2">
            <span>
              Shared secret
              {hasStoredSecret ? (
                <em style={{ fontSize: 11, color: 'var(--slate-2)', marginLeft: 8 }}>
                  (stored: {settings?.sharedSecretHint})
                </em>
              ) : null}
            </span>
            <input
              type="password"
              placeholder={hasStoredSecret ? 'Leave blank to keep current secret' : 'Enter shared secret'}
              value={sharedSecret}
              onChange={(e) => setSharedSecret(e.target.value)}
              disabled={!manage}
            />
            <em style={{ fontSize: 11, color: 'var(--slate-2)', marginTop: 4 }}>
              Used to sign each webhook payload as HMAC-SHA512 (hex), sent in the{' '}
              <code>x-signature</code> header.
            </em>
          </label>

          <label className="ffield span2">
            <span>Auto-sync on payment</span>
            <label className="inlinecheck" style={{ marginTop: 6 }}>
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                disabled={!manage}
              />
              Notify the agent portal automatically when the commission voucher is marked paid
            </label>
          </label>
        </div>

        {manage ? (
          <div className="acts" style={{ marginTop: 14 }}>
            <button
              className="btn pri"
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Saving…' : 'Save settings'}
            </button>
            <button
              className="btn"
              type="button"
              disabled={test.isPending || !baseUrl || (!hasStoredSecret && !sharedSecret)}
              onClick={() => test.mutate()}
            >
              {test.isPending ? 'Testing…' : 'Test connection'}
            </button>
          </div>
        ) : (
          <p className="fnote">You do not have permission to modify commission settings.</p>
        )}

        {testResult ? (
          <div
            className={testResult.ok ? 'dbanner' : 'dbanner err'}
            style={{ marginTop: 14 }}
          >
            {testResult.ok ? '✓ ' : '⚠️ '}
            {testResult.message}
          </div>
        ) : null}
      </div>

      <p className="fnote">
        Webhook retries are manual. Open an individual batch to retry failed rows.
        Only commission vouchers that are marked <b>paid</b> will trigger a sync.
      </p>
    </>
  );
}