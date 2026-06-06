import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin, LogIn, LogOut, Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { attendanceService } from '@/services/attendanceService';
import { formatDate } from '@/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import { confirmToast } from '@/utils/confirm';
import { iconActionDelete, iconActionEdit } from '@/utils/iconActionButton';

function fmtTime(t) {
  if (!t) return '—';
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function toDatetimeLocalValue(str) {
  if (!str) return '';
  const m = String(str).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return '';
  return `${m[1]}T${m[2]}:${m[3]}`;
}

function fromDatetimeLocalValue(v) {
  if (!v) return '';
  return `${v.replace('T', ' ')}:00`;
}

const STATUS_OPTIONS = [
  { value: 'hadir', label: 'Hadir' },
  { value: 'telat', label: 'Telat' },
  { value: 'tidak_hadir', label: 'Tidak hadir' },
];

const emptyForm = {
  employee_id: '',
  work_shift_id: '',
  clock_in_at: '',
  clock_out_at: '',
  status: 'hadir',
  late_minutes: '0',
  notes: '',
};

export default function AttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role_slug === 'super_admin' || user?.role_slug === 'admin_cabang';
  const isStaff = user?.role_slug === 'kasir' || user?.role_slug === 'karyawan';

  const fetcher = useCallback((p) => attendanceService.list(p), []);
  const t = useServerTable(fetcher);
  const [gps, setGps] = useState({ lat: '', lng: '' });
  const [ctx, setCtx] = useState(null);

  const [modal, setModal] = useState({ open: false, row: null });
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formOpts, setFormOpts] = useState({ branches: [], employees: [], shifts: [], branch_id: null });
  const [formBranchId, setFormBranchId] = useState('');

  const loadCtx = useCallback(async () => {
    try {
      const res = await attendanceService.context();
      if (res.success) setCtx(res.data);
      else setCtx(null);
    } catch {
      setCtx(null);
    }
  }, []);

  const loadFormOptions = useCallback(async (branchId) => {
    if (!isAdmin) return;
    try {
      const params = {};
      if (branchId) params.branch_id = Number(branchId);
      const res = await attendanceService.formOptions(params);
      if (res.success) {
        setFormOpts(res.data || { branches: [], employees: [], shifts: [] });
        if (!formBranchId && res.data?.branch_id) setFormBranchId(String(res.data.branch_id));
      }
    } catch {
      /* */
    }
  }, [isAdmin, formBranchId]);

  useEffect(() => {
    loadCtx();
  }, [loadCtx]);

  useEffect(() => {
    if (!modal.open || !isAdmin) return;
    loadFormOptions(formBranchId || undefined);
  }, [modal.open, isAdmin, formBranchId, loadFormOptions]);

  useEffect(() => {
    if (!modal.open) return;
    if (modal.row) {
      setForm({
        employee_id: String(modal.row.employee_id || ''),
        work_shift_id: modal.row.work_shift_id != null ? String(modal.row.work_shift_id) : '',
        clock_in_at: toDatetimeLocalValue(modal.row.clock_in_at),
        clock_out_at: toDatetimeLocalValue(modal.row.clock_out_at),
        status: modal.row.status || 'hadir',
        late_minutes: String(modal.row.late_minutes ?? 0),
        notes: modal.row.notes || '',
      });
      setFormBranchId(String(modal.row.branch_id || ''));
    } else {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const localNow = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
      setForm({ ...emptyForm, clock_in_at: localNow });
    }
  }, [modal]);

  const locate = () => {
    if (!navigator.geolocation) return toast.error('Browser tidak mendukung GPS');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps({ lat: p.coords.latitude, lng: p.coords.longitude });
        toast.success('Lokasi diperbarui');
      },
      () => toast.error('Izin lokasi ditolak'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const clockIn = async () => {
    if (gps.lat === '' || gps.lng === '') return toast.error('Ambil lokasi terlebih dahulu');
    try {
      const res = await attendanceService.clockIn({ latitude: gps.lat, longitude: gps.lng });
      if (!res.success) throw new Error(res.message);
      toast.success(`Clock in — ${res.data.status}`);
      t.reload();
      loadCtx();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const clockOut = async () => {
    if (gps.lat === '' || gps.lng === '') return toast.error('Ambil lokasi terlebih dahulu');
    try {
      const res = await attendanceService.clockOut({ latitude: gps.lat, longitude: gps.lng });
      if (!res.success) throw new Error(res.message);
      toast.success('Clock out berhasil');
      t.reload();
      loadCtx();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const saveAdmin = async (e) => {
    e.preventDefault();
    if (!form.clock_in_at) return toast.error('Jam masuk wajib');
    setSaving(true);
    try {
      const body = {
        work_shift_id: form.work_shift_id ? Number(form.work_shift_id) : null,
        clock_in_at: fromDatetimeLocalValue(form.clock_in_at),
        clock_out_at: form.clock_out_at ? fromDatetimeLocalValue(form.clock_out_at) : null,
        status: form.status,
        late_minutes: Number(form.late_minutes) || 0,
        notes: form.notes,
      };
      if (modal.row) {
        const res = await attendanceService.update(modal.row.id, body);
        if (!res.success) throw new Error(res.message);
        toast.success(res.message || 'Absensi diperbarui');
      } else {
        if (!form.employee_id) return toast.error('Pilih karyawan');
        body.employee_id = Number(form.employee_id);
        const res = await attendanceService.create(body);
        if (!res.success) throw new Error(res.message);
        toast.success(res.message || 'Absensi ditambahkan');
      }
      setModal({ open: false, row: null });
      t.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeRow = async (row) => {
    if (!(await confirmToast(`Hapus absensi ${row.full_name} (${formatDate(row.clock_in_at)})?`))) return;
    try {
      const res = await attendanceService.remove(row.id);
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Absensi dihapus');
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const shift = ctx?.shift;
  const hasInactive = shift && shift.inactive;
  const showClockPanel = isStaff || (ctx?.employee && !isAdmin);

  return (
    <div>
      <PageHeader
        title="Absensi"
        subtitle={
          isAdmin
            ? 'Kelola absensi karyawan — tambah, ubah, hapus manual. Kasir/karyawan tetap bisa clock in/out GPS.'
            : 'Clock in/out dengan radius GPS cabang — waktu mengikuti shift Anda.'
        }
        action={
          isAdmin ? (
            <button
              type="button"
              onClick={() => setModal({ open: true, row: null })}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" /> Tambah absensi
            </button>
          ) : null
        }
      />

      {showClockPanel && ctx?.employee && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
          {hasInactive ? (
            <p className="font-medium text-amber-800">{shift.message}</p>
          ) : shift?.name ? (
            <div className="space-y-1">
              <p>
                <span className="text-slate-600">Shift:</span>{' '}
                <span className="font-semibold text-slate-900">{shift.name}</span>
              </p>
              <p className="text-xs text-slate-600">
                Jam masuk (acuan): <strong>{fmtTime(shift.time_in)}</strong> · toleransi telat:{' '}
                <strong>{shift.grace_in_minutes ?? 0} menit</strong> · jam keluar: <strong>{fmtTime(shift.time_out)}</strong>
              </p>
              {ctx.open_attendance ? (
                <p className="text-xs text-emerald-800">Sesi hari ini sudah clock in — silakan clock out saat selesai.</p>
              ) : (
                <p className="text-xs text-slate-600">Belum clock in hari ini.</p>
              )}
            </div>
          ) : (
            <p className="text-amber-800">Shift belum ditetapkan untuk akun Anda. Hubungi admin cabang.</p>
          )}
        </div>
      )}

      {showClockPanel && (
        <div className="mb-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
          <div className="sm:col-span-2">
            <p className="text-sm font-medium text-slate-700">Koordinat</p>
            <p className="mt-1 text-xs text-slate-500">
              Lat: {gps.lat || '—'} Lng: {gps.lng || '—'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={locate} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium">
              <MapPin className="h-4 w-4" /> GPS
            </button>
            <button type="button" onClick={clockIn} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">
              <LogIn className="h-4 w-4" /> In
            </button>
            <button type="button" onClick={clockOut} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
              <LogOut className="h-4 w-4" /> Out
            </button>
          </div>
        </div>
      )}

      <DataTable
        columns={[
          { key: 'employee_code', label: 'Kode' },
          { key: 'full_name', label: 'Nama' },
          { key: 'branch_name', label: 'Cabang' },
          { key: 'shift_name', label: 'Shift', render: (r) => r.shift_name || '—' },
          { key: 'clock_in_at', label: 'Masuk', sortable: true, render: (r) => formatDate(r.clock_in_at) },
          { key: 'clock_out_at', label: 'Keluar', render: (r) => (r.clock_out_at ? formatDate(r.clock_out_at) : '-') },
          {
            key: 'status',
            label: 'Status',
            sortable: true,
            render: (r) => (
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  r.status === 'telat'
                    ? 'bg-amber-100 text-amber-900'
                    : r.status === 'tidak_hadir'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {r.status}
              </span>
            ),
          },
          { key: 'late_minutes', label: 'Telat (m)', render: (r) => r.late_minutes ?? 0 },
          { key: 'distance_in_meters', label: 'Jarak (m)', render: (r) => r.distance_in_meters ?? '-' },
          ...(isAdmin
            ? [
                {
                  key: 'actions',
                  label: '',
                  render: (r) => (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        title="Ubah"
                        className={iconActionEdit}
                        onClick={() => setModal({ open: true, row: r })}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" title="Hapus" className={iconActionDelete} onClick={() => removeRow(r)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ),
                },
              ]
            : []),
        ]}
        rows={t.rows}
        loading={t.loading}
        search={t.search}
        onSearchChange={t.setSearch}
        sortKey={t.sort}
        sortOrder={t.order}
        onSort={t.setSort}
        limit={t.limit}
        onLimitChange={t.setLimit}
        pagination={{ page: t.page, totalPages: t.totalPages, total: t.total, onPage: t.setPage }}
      />

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, row: null })}
        title={modal.row ? 'Edit absensi' : 'Tambah absensi'}
        size="lg"
      >
        <form onSubmit={saveAdmin} className="grid gap-3 sm:grid-cols-2">
          {user?.role_slug === 'super_admin' && (
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-slate-600">Cabang</label>
              <select
                value={formBranchId}
                onChange={(e) => {
                  setFormBranchId(e.target.value);
                  setForm((f) => ({ ...f, employee_id: '', work_shift_id: '' }));
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {(formOpts.branches || []).map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!modal.row && (
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-slate-600">Karyawan *</label>
              <select
                required
                value={form.employee_id}
                onChange={(e) => {
                  const emp = (formOpts.employees || []).find((x) => String(x.id) === e.target.value);
                  setForm((f) => ({
                    ...f,
                    employee_id: e.target.value,
                    work_shift_id: emp?.work_shift_id ? String(emp.work_shift_id) : '',
                  }));
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Pilih karyawan</option>
                {(formOpts.employees || []).map((emp) => (
                  <option key={emp.id} value={String(emp.id)}>
                    {emp.full_name} ({emp.employee_code}) — {emp.branch_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {modal.row && (
            <div className="sm:col-span-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <strong>{modal.row.full_name}</strong> · {modal.row.employee_code} · {modal.row.branch_name}
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">Shift</label>
            <select
              value={form.work_shift_id}
              onChange={(e) => setForm((f) => ({ ...f, work_shift_id: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">— Ikuti shift karyawan —</option>
              {(formOpts.shifts || []).map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name} ({fmtTime(s.time_in)} – {fmtTime(s.time_out)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Jam masuk *</label>
            <input
              type="datetime-local"
              required
              value={form.clock_in_at}
              onChange={(e) => setForm((f) => ({ ...f, clock_in_at: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Jam keluar</label>
            <input
              type="datetime-local"
              value={form.clock_out_at}
              onChange={(e) => setForm((f) => ({ ...f, clock_out_at: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Telat (menit)</label>
            <input
              type="number"
              min={0}
              value={form.late_minutes}
              onChange={(e) => setForm((f) => ({ ...f, late_minutes: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">Catatan</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Opsional"
            />
          </div>

          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal({ open: false, row: null })} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
