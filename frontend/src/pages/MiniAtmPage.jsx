import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Banknote,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Landmark,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { miniAtmService } from '@/services/miniAtmService';
import { formatCurrency, formatExportDateTime } from '@/utils/format';
import {
  computeMiniAtmPreview,
  EMPTY_MINI_ATM_FORM,
  formatRupiahInput,
  MINI_ATM_ADMIN_FEE_LABELS,
  MINI_ATM_ADMIN_FEE_TYPES,
  MINI_ATM_CARD_LABELS,
  MINI_ATM_CARD_STATUS,
  MINI_ATM_TX_LABELS,
  MINI_ATM_TX_TYPES,
  parseRupiahInput,
} from '@/utils/miniAtm';

function DeltaValue({ value }) {
  const n = Number(value) || 0;
  if (n === 0) return <span className="tabular-nums text-slate-500">Rp0</span>;
  const positive = n > 0;
  return (
    <span className={`tabular-nums font-medium ${positive ? 'text-emerald-600' : 'text-red-600'}`}>
      {positive ? '+' : ''}
      {formatCurrency(n)}
    </span>
  );
}

function TxBadge({ type }) {
  const isTransfer = type === 'transfer';
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        isTransfer ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'
      }`}
    >
      {MINI_ATM_TX_LABELS[type] || type}
    </span>
  );
}

function CardBadge({ status }) {
  const withCard = status === 'pakai_kartu';
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        withCard ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {MINI_ATM_CARD_LABELS[status] || status}
    </span>
  );
}

export default function MiniAtmPage() {
  const { user } = useAuth();
  const isSuper = user?.role_slug === 'super_admin';

  const [branchId, setBranchId] = useState(isSuper ? '' : String(user?.branch_id || ''));
  const [context, setContext] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingCtx, setLoadingCtx] = useState(true);

  const [form, setForm] = useState({ ...EMPTY_MINI_ATM_FORM });
  const [saving, setSaving] = useState(false);

  const [histRows, setHistRows] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histPage, setHistPage] = useState(1);
  const [histLimit, setHistLimit] = useState(10);
  const [histTotal, setHistTotal] = useState(0);
  const [histTotalPages, setHistTotalPages] = useState(1);
  const [histSearch, setHistSearch] = useState('');
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [histTxType, setHistTxType] = useState('');
  const [histCard, setHistCard] = useState('');

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ cash_balance: '', bank_balance: '', default_admin_fee: '' });
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const canWrite = context?.permissions?.can_write;
  const canManage = context?.permissions?.can_manage;

  const branchParams = useMemo(() => {
    const p = {};
    if (branchId) p.branch_id = Number(branchId);
    return p;
  }, [branchId]);

  const loadContext = useCallback(async () => {
    setLoadingCtx(true);
    try {
      const res = await miniAtmService.context(branchParams);
      if (!res.success) throw new Error(res.message);
      setContext(res.data);
      if (isSuper && !branchId && res.data?.branches?.[0]) {
        setBranchId(String(res.data.branches[0].id));
      }
    } catch (e) {
      toast.error(e.message);
      setContext(null);
    } finally {
      setLoadingCtx(false);
    }
  }, [branchParams, branchId, isSuper]);

  const loadSummary = useCallback(async () => {
    if (isSuper && !branchId) return;
    try {
      const res = await miniAtmService.summary(branchParams);
      if (res.success) setSummary(res.data);
    } catch {
      /* */
    }
  }, [branchParams, branchId, isSuper]);

  const loadHistory = useCallback(async () => {
    if (isSuper && !branchId) return;
    setHistLoading(true);
    try {
      const params = {
        ...branchParams,
        page: histPage,
        limit: histLimit,
        search: histSearch,
        sort: 'transaction_at',
        order: 'desc',
      };
      if (histFrom) params.from = histFrom;
      if (histTo) params.to = histTo;
      if (histTxType) params.transaction_type = histTxType;
      if (histCard) params.card_status = histCard;
      const res = await miniAtmService.listTransactions(params);
      if (!res.success) throw new Error(res.message);
      setHistRows(res.data || []);
      setHistTotal(res.pagination?.total ?? 0);
      setHistTotalPages(res.pagination?.totalPages ?? 1);
    } catch (e) {
      toast.error(e.message);
      setHistRows([]);
    } finally {
      setHistLoading(false);
    }
  }, [branchParams, branchId, histPage, histLimit, histSearch, histFrom, histTo, histTxType, histCard, isSuper]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  useEffect(() => {
    loadSummary();
    loadHistory();
  }, [loadSummary, loadHistory]);

  useEffect(() => {
    if (context?.default_admin_fee != null && form.admin_fee === String(EMPTY_MINI_ATM_FORM.admin_fee)) {
      setForm((f) => ({ ...f, admin_fee: String(context.default_admin_fee) }));
    }
  }, [context?.default_admin_fee]);

  const openingCash = context?.cash_balance ?? 0;
  const openingBank = context?.bank_balance ?? 0;
  const nominalNum = parseRupiahInput(form.nominal);
  const adminFeeNum = parseRupiahInput(form.admin_fee);

  const preview = useMemo(() => {
    if (!form.transaction_type || !form.card_status || !form.admin_fee_type || !nominalNum || nominalNum <= 0) {
      return null;
    }
    return computeMiniAtmPreview({
      openingCash,
      openingBank,
      transactionType: form.transaction_type,
      cardStatus: form.card_status,
      nominal: nominalNum,
      adminFee: adminFeeNum === '' ? 0 : adminFeeNum,
      adminFeeType: form.admin_fee_type,
    });
  }, [openingCash, openingBank, form, nominalNum, adminFeeNum]);

  const resetForm = () => {
    setForm({
      ...EMPTY_MINI_ATM_FORM,
      admin_fee: String(context?.default_admin_fee ?? EMPTY_MINI_ATM_FORM.admin_fee),
    });
  };

  const validateForm = () => {
    if (!form.transaction_type) return 'Jenis transaksi wajib dipilih';
    if (!form.card_status) return 'Status kartu wajib dipilih';
    if (!form.admin_fee_type) return 'Keterangan biaya admin wajib dipilih';
    if (!nominalNum || nominalNum <= 0) return 'Nominal wajib diisi dan lebih dari 0';
    if (preview?.cashInsufficient) return 'Saldo cash tidak mencukupi untuk transaksi ini';
    if (preview?.bankInsufficient) return 'Saldo rekening tidak mencukupi untuk transaksi ini';
    return null;
  };

  const saveTransaction = async (e) => {
    e.preventDefault();
    const err = validateForm();
    if (err) return toast.error(err);
    setSaving(true);
    try {
      const body = {
        ...branchParams,
        transaction_type: form.transaction_type,
        card_status: form.card_status,
        admin_fee_type: form.admin_fee_type,
        nominal: nominalNum,
        admin_fee: adminFeeNum === '' ? context?.default_admin_fee : adminFeeNum,
        notes: form.notes,
      };
      const res = await miniAtmService.createTransaction(body);
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Transaksi disimpan');
      resetForm();
      await loadContext();
      await loadSummary();
      await loadHistory();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openSettings = () => {
    setSettingsForm({
      cash_balance: String(context?.cash_balance ?? 0),
      bank_balance: String(context?.bank_balance ?? 0),
      default_admin_fee: String(context?.default_admin_fee ?? 1450),
    });
    setSettingsOpen(true);
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    try {
      const body = {
        ...branchParams,
        cash_balance: Number(parseRupiahInput(settingsForm.cash_balance)) || 0,
        bank_balance: Number(parseRupiahInput(settingsForm.bank_balance)) || 0,
        default_admin_fee: Number(parseRupiahInput(settingsForm.default_admin_fee)) || 1450,
      };
      const res = await miniAtmService.updateBalances(body);
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Pengaturan disimpan');
      setSettingsOpen(false);
      loadContext();
      loadSummary();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const removeTransaction = async (row) => {
    if (!window.confirm(`Hapus transaksi ${row.transaction_number}? Saldo akan dikembalikan.`)) return;
    try {
      const res = await miniAtmService.deleteTransaction(row.id);
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Transaksi dihapus');
      loadContext();
      loadSummary();
      loadHistory();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const res = await miniAtmService.auditLogs({ ...branchParams, page: 1, limit: 50 });
      if (!res.success) throw new Error(res.message);
      setAuditRows(res.data || []);
    } catch (e) {
      toast.error(e.message);
      setAuditRows([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const exportRows = (rows) =>
    rows.map((r) => ({
      Tanggal: formatExportDateTime(r.transaction_at),
      'Jenis Transaksi': MINI_ATM_TX_LABELS[r.transaction_type] || r.transaction_type,
      'Status Kartu': MINI_ATM_CARD_LABELS[r.card_status] || r.card_status,
      Nominal: Number(r.nominal) || 0,
      'Biaya Admin': Number(r.admin_fee) || 0,
      'Ket Biaya Admin': MINI_ATM_ADMIN_FEE_LABELS[r.admin_fee_type] || r.admin_fee_type,
      'Saldo Awal Cash': Number(r.opening_cash) || 0,
      'Saldo Akhir Cash': Number(r.closing_cash) || 0,
      'Saldo Awal Rekening': Number(r.opening_bank) || 0,
      'Saldo Akhir Rekening': Number(r.closing_bank) || 0,
      User: r.user_name || '—',
      Keterangan: r.notes || '',
    }));

  const fetchExportData = async () => {
    const params = {
      ...branchParams,
      page: 1,
      limit: 5000,
      search: histSearch,
      sort: 'transaction_at',
      order: 'desc',
    };
    if (histFrom) params.from = histFrom;
    if (histTo) params.to = histTo;
    if (histTxType) params.transaction_type = histTxType;
    if (histCard) params.card_status = histCard;
    const res = await miniAtmService.listTransactions(params);
    if (!res.success) throw new Error(res.message);
    return res.data || [];
  };

  const exportExcel = async () => {
    try {
      const rows = await fetchExportData();
      const sheet = XLSX.utils.json_to_sheet(exportRows(rows));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Mini ATM');
      XLSX.writeFile(wb, `mini-atm-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const exportPdf = async () => {
    try {
      const rows = await fetchExportData();
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(14);
      doc.text('Riwayat Mini ATM', 14, 16);
      autoTable(doc, {
        startY: 22,
        head: [['Tanggal', 'Jenis', 'Kartu', 'Nominal', 'Admin', 'Cash akhir', 'Rek akhir', 'User']],
        body: rows.map((r) => [
          formatExportDateTime(r.transaction_at),
          MINI_ATM_TX_LABELS[r.transaction_type],
          MINI_ATM_CARD_LABELS[r.card_status],
          formatCurrency(r.nominal),
          formatCurrency(r.admin_fee),
          formatCurrency(r.closing_cash),
          formatCurrency(r.closing_bank),
          r.user_name || '—',
        ]),
        styles: { fontSize: 7 },
      });
      doc.save(`mini-atm-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (loadingCtx) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mini ATM"
        subtitle="Catat transaksi tarik tunai & transfer — saldo cash & rekening otomatis"
        action={
          <div className="flex flex-wrap gap-2">
            {isSuper && context?.branches?.length ? (
              <select
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setHistPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {context.branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            ) : null}
            {canManage ? (
              <>
                <button
                  type="button"
                  onClick={openSettings}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                >
                  <Settings className="h-4 w-4" /> Saldo & biaya default
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuditOpen(true);
                    loadAudit();
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                >
                  Audit log
                </button>
              </>
            ) : null}
          </div>
        }
      />

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            { label: 'Transaksi hari ini', value: summary.total_trx_today, icon: CreditCard },
            { label: 'Transfer hari ini', value: summary.total_transfer_today, icon: Landmark },
            { label: 'Tarik tunai hari ini', value: summary.total_tarik_today, icon: Banknote },
            { label: 'Pendapatan biaya admin hari ini', value: formatCurrency(summary.total_admin_income_today), icon: Wallet },
            { label: 'Saldo cash saat ini', value: formatCurrency(summary.cash_balance), icon: Wallet, accent: true },
            { label: 'Saldo rekening saat ini', value: formatCurrency(summary.bank_balance), icon: Landmark, accent: true },
          ].map((c) => (
            <div key={c.label} className={`rounded-2xl border p-4 shadow-sm ${c.accent ? 'border-brand-200 bg-brand-50/40' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">{c.label}</p>
                <c.icon className={`h-4 w-4 ${c.accent ? 'text-brand-600' : 'text-slate-400'}`} />
              </div>
              <p className={`mt-2 text-xl font-bold tabular-nums ${c.accent ? 'text-brand-900' : 'text-slate-900'}`}>{c.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3 space-y-4">
          {canWrite ? (
            <form onSubmit={saveTransaction} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Form transaksi</h3>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Informasi saldo</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-slate-500">Saldo awal cash</p>
                      <p className="text-lg font-bold tabular-nums text-slate-900">{formatCurrency(openingCash)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Saldo akhir cash</p>
                      <p className="text-lg font-bold tabular-nums text-slate-900">
                        {preview ? formatCurrency(preview.closingCash) : formatCurrency(openingCash)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Saldo awal rekening</p>
                      <p className="text-lg font-bold tabular-nums text-slate-900">{formatCurrency(openingBank)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Saldo akhir rekening</p>
                      <p className="text-lg font-bold tabular-nums text-slate-900">
                        {preview ? formatCurrency(preview.closingBank) : formatCurrency(openingBank)}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Jenis transaksi *</label>
                  <select
                    required
                    value={form.transaction_type}
                    onChange={(e) => setForm((f) => ({ ...f, transaction_type: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">Pilih jenis</option>
                    {MINI_ATM_TX_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Status kartu *</label>
                  <select
                    required
                    value={form.card_status}
                    onChange={(e) => setForm((f) => ({ ...f, card_status: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">Pilih status</option>
                    {MINI_ATM_CARD_STATUS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Nominal *</label>
                  <input
                    required
                    inputMode="numeric"
                    value={formatRupiahInput(form.nominal)}
                    onChange={(e) => setForm((f) => ({ ...f, nominal: e.target.value }))}
                    placeholder="0"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Biaya admin</label>
                  <input
                    inputMode="numeric"
                    value={formatRupiahInput(form.admin_fee)}
                    onChange={(e) => setForm((f) => ({ ...f, admin_fee: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-slate-600">Keterangan biaya admin *</label>
                  <select
                    required
                    value={form.admin_fee_type}
                    onChange={(e) => setForm((f) => ({ ...f, admin_fee_type: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">Pilih keterangan</option>
                    {MINI_ATM_ADMIN_FEE_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-slate-600">Keterangan</label>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Catatan opsional"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Save className="h-4 w-4" /> {saving ? 'Menyimpan…' : 'Simpan transaksi'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700"
                >
                  <RefreshCw className="h-4 w-4" /> Reset form
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-500"
                >
                  <X className="h-4 w-4" /> Batal
                </button>
              </div>
            </form>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              Mode lihat saja — Anda tidak dapat menambah transaksi Mini ATM.
            </div>
          )}
        </div>

        <div className="xl:col-span-2">
          <div className="sticky top-4 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Preview perhitungan</h3>
            <p className="mt-1 text-xs text-slate-600">Diperbarui otomatis saat field berubah</p>
            {preview ? (
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Selisih cash</dt>
                  <dd>
                    <DeltaValue value={preview.cashDelta} />
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Selisih rekening</dt>
                  <dd>
                    <DeltaValue value={preview.bankDelta} />
                  </dd>
                </div>
                <div className="border-t border-indigo-100 pt-3">
                  <div className="flex justify-between gap-2">
                    <dt className="font-medium text-slate-700">Saldo akhir cash</dt>
                    <dd className={`font-semibold tabular-nums ${preview.cashInsufficient ? 'text-red-600' : 'text-emerald-700'}`}>
                      {formatCurrency(preview.closingCash)}
                    </dd>
                  </div>
                  <div className="mt-2 flex justify-between gap-2">
                    <dt className="font-medium text-slate-700">Saldo akhir rekening</dt>
                    <dd className={`font-semibold tabular-nums ${preview.bankInsufficient ? 'text-red-600' : 'text-emerald-700'}`}>
                      {formatCurrency(preview.closingBank)}
                    </dd>
                  </div>
                </div>
                {preview.cashInsufficient || preview.bankInsufficient ? (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    Saldo tidak mencukupi — periksa nominal atau set saldo awal di pengaturan admin.
                  </p>
                ) : null}
              </dl>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Lengkapi jenis, status kartu, nominal, dan keterangan biaya admin.</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Riwayat transaksi</h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportExcel} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </button>
            <button type="button" onClick={exportPdf} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
              <FileText className="h-3.5 w-3.5" /> PDF
            </button>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Dari tanggal</label>
            <input
              type="date"
              value={histFrom}
              onChange={(e) => {
                setHistFrom(e.target.value);
                setHistPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Sampai tanggal</label>
            <input
              type="date"
              value={histTo}
              onChange={(e) => {
                setHistTo(e.target.value);
                setHistPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Jenis</label>
            <select
              value={histTxType}
              onChange={(e) => {
                setHistTxType(e.target.value);
                setHistPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Semua</option>
              {MINI_ATM_TX_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Status kartu</label>
            <select
              value={histCard}
              onChange={(e) => {
                setHistCard(e.target.value);
                setHistPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Semua</option>
              {MINI_ATM_CARD_STATUS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DataTable
          columns={[
            {
              key: 'transaction_at',
              label: 'Tanggal',
              sortable: true,
              render: (r) => <span className="whitespace-nowrap text-xs">{formatExportDateTime(r.transaction_at)}</span>,
            },
            { key: 'transaction_type', label: 'Jenis', render: (r) => <TxBadge type={r.transaction_type} /> },
            { key: 'card_status', label: 'Kartu', render: (r) => <CardBadge status={r.card_status} /> },
            { key: 'nominal', label: 'Nominal', render: (r) => formatCurrency(r.nominal) },
            { key: 'admin_fee', label: 'Biaya admin', render: (r) => formatCurrency(r.admin_fee) },
            {
              key: 'admin_fee_type',
              label: 'Ket biaya',
              render: (r) => MINI_ATM_ADMIN_FEE_LABELS[r.admin_fee_type] || r.admin_fee_type,
            },
            { key: 'closing_cash', label: 'Cash akhir', render: (r) => formatCurrency(r.closing_cash) },
            { key: 'closing_bank', label: 'Rek akhir', render: (r) => formatCurrency(r.closing_bank) },
            { key: 'user_name', label: 'User', render: (r) => r.user_name || '—' },
            {
              key: 'notes',
              label: 'Ket.',
              render: (r) => <span className="max-w-[8rem] truncate text-xs text-slate-600">{r.notes || '—'}</span>,
            },
            ...(canManage
              ? [
                  {
                    key: 'actions',
                    label: '',
                    render: (r) => (
                      <button
                        type="button"
                        title="Hapus"
                        onClick={() => removeTransaction(r)}
                        className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ),
                  },
                ]
              : []),
          ]}
          rows={histRows}
          loading={histLoading}
          search={histSearch}
          onSearchChange={(v) => {
            setHistSearch(v);
            setHistPage(1);
          }}
          sortKey="transaction_at"
          sortOrder="desc"
          onSort={() => {}}
          limit={histLimit}
          onLimitChange={(v) => {
            setHistLimit(v);
            setHistPage(1);
          }}
          pagination={{ page: histPage, totalPages: histTotalPages, total: histTotal, onPage: setHistPage }}
        />
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Saldo awal & biaya admin default">
        <form onSubmit={saveSettings} className="space-y-3">
          <p className="text-xs text-slate-600">Atur saldo cash/rekening cabang dan biaya admin default (Admin).</p>
          <div>
            <label className="text-xs font-medium text-slate-600">Saldo cash</label>
            <input
              value={formatRupiahInput(settingsForm.cash_balance)}
              onChange={(e) => setSettingsForm((s) => ({ ...s, cash_balance: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Saldo rekening</label>
            <input
              value={formatRupiahInput(settingsForm.bank_balance)}
              onChange={(e) => setSettingsForm((s) => ({ ...s, bank_balance: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Biaya admin default</label>
            <input
              value={formatRupiahInput(settingsForm.default_admin_fee)}
              onChange={(e) => setSettingsForm((s) => ({ ...s, default_admin_fee: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setSettingsOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
              Batal
            </button>
            <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
              Simpan
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={auditOpen} onClose={() => setAuditOpen(false)} title="Audit log Mini ATM" size="lg">
        {auditLoading ? (
          <p className="text-sm text-slate-500">Memuat…</p>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto text-xs">
            {auditRows.map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold uppercase text-slate-800">{a.action}</span>
                  <span className="text-slate-500">{formatExportDateTime(a.created_at)}</span>
                </div>
                <p className="mt-1 text-slate-600">
                  {a.user_name || 'System'} · {a.entity} #{a.entity_id}
                </p>
              </li>
            ))}
            {!auditRows.length && <li className="text-slate-500">Belum ada audit log</li>}
          </ul>
        )}
      </Modal>
    </div>
  );
}
