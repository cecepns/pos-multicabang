import api from './api';

export const miniAtmService = {
  context: (params) => api.get('/api/mini-atm/context', { params }).then((r) => r.data),
  summary: (params) => api.get('/api/mini-atm/summary', { params }).then((r) => r.data),
  updateBalances: (body) => api.put('/api/mini-atm/balances', body).then((r) => r.data),
  listTransactions: (params) => api.get('/api/mini-atm/transactions', { params }).then((r) => r.data),
  createTransaction: (body) => api.post('/api/mini-atm/transactions', body).then((r) => r.data),
  updateTransaction: (id, body) => api.put(`/api/mini-atm/transactions/${id}`, body).then((r) => r.data),
  deleteTransaction: (id) => api.delete(`/api/mini-atm/transactions/${id}`).then((r) => r.data),
  auditLogs: (params) => api.get('/api/mini-atm/audit-logs', { params }).then((r) => r.data),
};
