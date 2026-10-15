import { api } from './client';
import { CompanySettings } from '../types/invoices';

export type CompanySettingsInput = Partial<
  Pick<
    CompanySettings,
    | 'companyName'
    | 'companyAddress'
    | 'companyPhone'
    | 'companyEmail'
    | 'companyGstin'
    | 'defaultGstRate'
    | 'invoicePrefix'
    | 'bankDetails'
    | 'terms'
  >
>;

// Admins and managers may read; only admins may change (the server enforces both).
export const settingsApi = {
  company: () => api<{ company: CompanySettings }>('/settings/company').then(r => r.company),

  updateCompany: (changes: CompanySettingsInput) =>
    api<{ company: CompanySettings }>('/settings/company', { method: 'PATCH', body: changes }).then(r => r.company),
};
