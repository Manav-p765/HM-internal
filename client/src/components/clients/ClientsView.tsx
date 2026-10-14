import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Building2, ChevronLeft, ChevronRight, Edit2, Eye, Plus, Power, RotateCcw, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { clientsApi } from '../../api/clients';
import { errorMessage } from '../../api/client';
import { useApiData } from '../../api/useApiData';
import { Client, ClientStatus } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Modal } from '../common/Modal';
import { ClientModal } from './ClientModal';
import { ClientDetailModal } from './ClientDetailModal';

const PAGE_SIZE = 50;

// Client companies (admin, manager). Only admins can deactivate/reactivate; nothing is ever deleted.
export const ClientsView: React.FC = () => {
  const { currentUser, showToast } = useApp();
  const isAdmin = currentUser.role === 'admin';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | ClientStatus>('');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const list = useApiData(
    () => clientsApi.list({ search, status: statusFilter || undefined, limit: PAGE_SIZE, offset }),
    [search, statusFilter, offset],
  );
  const clients = list.data?.clients ?? [];
  const total = list.data?.total ?? 0;

  const { id: viewId } = useParams();
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
  const [clientToDeactivate, setClientToDeactivate] = useState<Client | null>(null);
  const [clientToReactivate, setClientToReactivate] = useState<Client | null>(null);
  const [restoreLogins, setRestoreLogins] = useState(false);

  const openAdd = () => {
    setClientToEdit(null);
    setIsModalOpen(true);
  };
  const openEdit = (client: Client) => {
    setClientToEdit(client);
    setIsModalOpen(true);
  };

  const handleDeactivate = async () => {
    const target = clientToDeactivate;
    if (!target) return;
    setClientToDeactivate(null);
    try {
      await clientsApi.deactivate(target.id);
      showToast('success', `${target.companyName} deactivated; ${target.activePortalUsers} portal login(s) disabled`);
      list.reload();
    } catch (err) {
      showToast('error', errorMessage(err));
    }
  };

  const handleReactivate = async () => {
    const target = clientToReactivate;
    if (!target) return;
    setClientToReactivate(null);
    try {
      await clientsApi.reactivate(target.id, restoreLogins);
      showToast('success', restoreLogins ? `${target.companyName} reactivated with its portal logins` : `${target.companyName} reactivated`);
      list.reload();
    } catch (err) {
      showToast('error', errorMessage(err));
    }
  };

  const hasFilters = Boolean(search || statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">Clients</h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">Client companies and their portal access</p>
        </div>
        <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openAdd}>
          Add Client
        </Button>
      </div>

      <Card padding="sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label="Search clients"
              placeholder="Search by company, contact name or email..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value as '' | ClientStatus);
              setOffset(0);
            }}
            className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        {list.error ? (
          <LoadError message={list.error} onRetry={list.reload} />
        ) : list.isLoading && !list.data ? (
          <p className="py-12 text-center text-xs text-[#7185A5]" role="status">
            Loading clients...
          </p>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-6 h-6" />}
            title={hasFilters ? 'No clients found' : 'No clients yet'}
            description={hasFilters ? 'No clients match your search or filter.' : 'Add your first client company.'}
            actionLabel={hasFilters ? undefined : 'Add Client'}
            onAction={openAdd}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-4">Company Name</th>
                  <th className="py-3 px-4">Primary Contact</th>
                  <th className="py-3 px-4">Contact Email</th>
                  <th className="py-3 px-4">Portal Access</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {clients.map(client => (
                  <tr key={client.id} className="hover:bg-[#F7F9FC]/60 transition-colors">
                    <td className="py-3 px-4 font-semibold text-[#111827]">{client.companyName}</td>
                    <td className="py-3 px-4 text-[#475569]">{client.contactName || '—'}</td>
                    <td className="py-3 px-4 text-[#475569]">{client.contactEmail || '—'}</td>
                    <td className="py-3 px-4 text-[#475569] whitespace-nowrap">
                      {client.portalUsers === 0 ? (
                        <span className="text-[#7185A5]">No logins</span>
                      ) : (
                        `${client.activePortalUsers} of ${client.portalUsers} login${client.portalUsers === 1 ? '' : 's'} active`
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant={client.status === 'active' ? 'success' : 'neutral'} size="sm">
                        {client.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/clients/${client.id}`)}
                          className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                          title="View client and portal users"
                          aria-label={`View ${client.companyName}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEdit(client)}
                          className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                          title="Edit client"
                          aria-label={`Edit ${client.companyName}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin &&
                          (client.status === 'active' ? (
                            <button
                              onClick={() => setClientToDeactivate(client)}
                              className="p-1.5 text-[#7185A5] hover:text-[#E11D48] hover:bg-[#F1F5F9] rounded cursor-pointer"
                              title="Deactivate client (disables all its portal logins)"
                              aria-label={`Deactivate ${client.companyName}`}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setRestoreLogins(false);
                                setClientToReactivate(client);
                              }}
                              className="p-1.5 text-[#047857] hover:bg-[#047857]/10 rounded cursor-pointer"
                              title="Reactivate client"
                              aria-label={`Reactivate ${client.companyName}`}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#DFE6F1] text-xs text-[#7185A5]">
            <span>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" icon={<ChevronLeft className="w-3.5 h-3.5" />} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <ClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        clientToEdit={clientToEdit}
        onSaved={(saved, created) => {
          showToast('success', created ? `${saved.companyName} added` : `${saved.companyName} updated`);
          list.reload();
          if (created) navigate(`/clients/${saved.id}`);
        }}
      />

      {viewId && (
        <ClientDetailModal
          clientId={viewId}
          onClose={() => navigate('/clients')}
          onEdit={openEdit}
          onChanged={list.reload}
        />
      )}

      <ConfirmDialog
        isOpen={!!clientToDeactivate}
        onClose={() => setClientToDeactivate(null)}
        onConfirm={handleDeactivate}
        title="Deactivate Client"
        message={`Deactivate ${clientToDeactivate?.companyName}? All ${clientToDeactivate?.portalUsers ?? 0} of its portal logins will be disabled and signed out immediately. Its records are kept.`}
        confirmLabel="Deactivate"
        isDestructive
      />

      <Modal
        isOpen={!!clientToReactivate}
        onClose={() => setClientToReactivate(null)}
        title="Reactivate Client"
        description={clientToReactivate?.companyName}
        size="sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#475569]">The company will be active again.</p>
          {(clientToReactivate?.portalUsers ?? 0) > 0 && (
            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-[#DFE6F1] bg-[#F7F9FC] cursor-pointer">
              <input type="checkbox" checked={restoreLogins} onChange={e => setRestoreLogins(e.target.checked)} className="mt-0.5 accent-[#5038F5]" />
              <span>
                <span className="font-semibold text-[#111827] block">Also restore its portal logins</span>
                <span className="text-[#7185A5]">Re-enables the disabled logins with their existing passwords.</span>
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setClientToReactivate(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleReactivate}>
              Reactivate
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
