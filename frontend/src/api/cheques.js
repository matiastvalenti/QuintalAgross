import api from "../services/api";

export const chequeService = {
  importExcel: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return await api.post("/finance/cheques/import-excel", formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  fetchCheques: async (filters = {}) => {
    return await api.get("/finance/cheques/", { params: filters });
  },

  updateCheque: async (id, data) => {
    return await api.patch(`/finance/cheques/${id}`, data);
  },

  runAlerts: async () => {
    return await api.post("/finance/cheques/alerts/run");
  },

  sendStockReport: async () => {
    return await api.post("/finance/cheques/reports/stock");
  },

  sendRejectedReport: async () => {
    return await api.post("/finance/cheques/reports/rejected");
  },

  getExportExcelUrl: (filters = {}) => {
    const queryParams = new URLSearchParams(filters);
    const costCenter = localStorage.getItem('costCenter') || '1';
    if (!queryParams.has('cost_center')) queryParams.append('cost_center', costCenter);
    
    const baseUrl = window.API_URL || "http://localhost:8000";
    return `${baseUrl}/finance/cheques/export/excel?${queryParams.toString()}`;
  },

  getExportPdfUrl: (filters = {}) => {
    const queryParams = new URLSearchParams(filters);
    const costCenter = localStorage.getItem('costCenter') || '1';
    if (!queryParams.has('cost_center')) queryParams.append('cost_center', costCenter);
    
    const baseUrl = window.API_URL || "http://localhost:8000";
    return `${baseUrl}/finance/cheques/export/pdf?${queryParams.toString()}`;
  },

  endorse: async (data) => {
    return await api.post("/finance/cheques/endorse", data);
  },

  deposit: async (data) => {
    return await api.post("/finance/cheques/deposit", data);
  },

  reject: async (id, data) => {
    return await api.post(`/finance/cheques/${id}/reject`, data);
  },

  clear: async (id, data = null) => {
    return await api.post(`/finance/cheques/${id}/clear`, data);
  },

  fetchNdDiferida: async () => {
    return await api.get("/finance/cheques/nd-diferida");
  },

  bulkNdDiferida: async (chequeIds, ndDiferida, notas = null) => {
    const payload = { cheque_ids: chequeIds, nd_diferida: ndDiferida };
    if (notas) payload.nd_diferida_notas = notas;
    return await api.post("/finance/cheques/nd-diferida/bulk", payload);
  },
};
