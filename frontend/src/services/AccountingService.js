import api from './api';

export const fetchSalesCandidates = async (entityId) => {
  const response = await api.get(`/accounting/applications/sales/candidates?entity_id=${entityId}`);
  return response;
};

export const fetchSalesApplicationHistory = async (entityId) => {
  const response = await api.get(`/accounting/applications/sales/history?entity_id=${entityId}`);
  return response;
};

export const createSalesApplications = async (payload) => {
  const response = await api.post('/accounting/applications/sales', payload);
  return response;
};

export const voidSalesApplication = async (applicationId, reason = "Aplicación realizada por error") => {
  const response = await api.post(`/accounting/applications/sales/${applicationId}/void`, { reason });
  return response;
};
