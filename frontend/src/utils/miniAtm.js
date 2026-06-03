export const MINI_ATM_DEFAULT_ADMIN_FEE = 1450;

export const MINI_ATM_TX_TYPES = [
  { value: 'tarik_tunai', label: 'Tarik Tunai' },
  { value: 'transfer', label: 'Transfer' },
];

export const MINI_ATM_CARD_STATUS = [
  { value: 'pakai_kartu', label: 'Pakai Kartu' },
  { value: 'tanpa_kartu', label: 'Tanpa Kartu' },
];

export const MINI_ATM_ADMIN_FEE_TYPES = [
  { value: 'potong_dalam', label: 'Potong Dalam' },
  { value: 'potong_luar', label: 'Potong Luar' },
];

export const MINI_ATM_TX_LABELS = Object.fromEntries(MINI_ATM_TX_TYPES.map((x) => [x.value, x.label]));
export const MINI_ATM_CARD_LABELS = Object.fromEntries(MINI_ATM_CARD_STATUS.map((x) => [x.value, x.label]));
export const MINI_ATM_ADMIN_FEE_LABELS = Object.fromEntries(MINI_ATM_ADMIN_FEE_TYPES.map((x) => [x.value, x.label]));

export function computeMiniAtmDeltas({ transactionType, cardStatus, nominal, adminFee, adminFeeType }) {
  const n = Math.max(0, Number(nominal) || 0);
  const af = Math.max(0, Number(adminFee) || 0);
  let cashDelta = 0;
  let bankDelta = 0;

  if (transactionType === 'transfer') {
    if (cardStatus === 'tanpa_kartu') {
      cashDelta = n;
      bankDelta = -(n + af);
    }
  } else if (transactionType === 'tarik_tunai') {
    cashDelta = -n;
  }

  if (adminFeeType === 'potong_luar') {
    if (transactionType === 'transfer' && cardStatus === 'tanpa_kartu') {
      cashDelta += af;
    } else if (transactionType === 'tarik_tunai') {
      cashDelta += af;
    }
  }

  return { cashDelta, bankDelta };
}

export function computeMiniAtmPreview({ openingCash, openingBank, transactionType, cardStatus, nominal, adminFee, adminFeeType }) {
  const { cashDelta, bankDelta } = computeMiniAtmDeltas({
    transactionType,
    cardStatus,
    nominal,
    adminFee,
    adminFeeType,
  });
  const oc = Number(openingCash) || 0;
  const ob = Number(openingBank) || 0;
  const closingCash = oc + cashDelta;
  const closingBank = ob + bankDelta;
  return {
    cashDelta,
    bankDelta,
    closingCash,
    closingBank,
    cashInsufficient: closingCash < 0,
    bankInsufficient: closingBank < 0,
  };
}

export function parseRupiahInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits === '' ? '' : Number(digits);
}

export function formatRupiahInput(value) {
  const n = parseRupiahInput(value);
  if (n === '') return '';
  return new Intl.NumberFormat('id-ID').format(n);
}

export const EMPTY_MINI_ATM_FORM = {
  transaction_type: '',
  card_status: '',
  nominal: '',
  admin_fee: String(MINI_ATM_DEFAULT_ADMIN_FEE),
  admin_fee_type: '',
  notes: '',
};
