import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ApiError, errorMessage } from '../../api/client';
import { transactionsApi } from '../../api/transactions';
import { useApiData } from '../../api/useApiData';
import { TxnCategory, TxnType, TXN_TYPE_LABEL } from '../../types/ledger';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { LoadError } from '../common/LoadError';
import { Check, Edit2, Plus, X } from 'lucide-react';

const inputClass = 'text-xs px-2.5 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5] min-w-0';

const firstError = (err: unknown) => (err instanceof ApiError && err.details?.[0]?.message) || errorMessage(err);

// Ledger categories (admin): add, rename (existing rows follow, on the server) and deactivate (hidden from
// pickers; rows keep it). "Invoice Payment" and "Salary" are system categories and can't be changed.
export const CategoriesManager: React.FC<{ onClose: () => void; onChanged: () => void }> = ({ onClose, onChanged }) => {
  const { showToast } = useApp();
  const list = useApiData(() => transactionsApi.categories(), []);
  const [name, setName] = useState('');
  const [type, setType] = useState<TxnType>('expense');
  const [addError, setAddError] = useState('');
  const [busy, setBusy] = useState(false);

  const changed = async () => {
    await list.reload();
    onChanged();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setBusy(true);
    try {
      const created = await transactionsApi.createCategory({ name: name.trim(), type });
      showToast('success', `Category "${created.name}" added`);
      setName('');
      await changed();
    } catch (err) {
      setAddError(firstError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Categories" description="Rename or deactivate ledger categories. Renaming updates existing entries." maxWidth="lg">
      <div className="space-y-5" data-testid="categories-manager">
        <form onSubmit={add} noValidate className="flex flex-wrap items-start gap-2 p-3 rounded-lg border border-dashed border-[#DFE6F1]" aria-label="Add category">
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="New category name" className={`${inputClass} flex-1`} aria-label="New category name" />
          <select value={type} onChange={e => setType(e.target.value as TxnType)} className={inputClass} aria-label="New category type">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <Button type="submit" variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} disabled={busy}>
            Add
          </Button>
          {addError && (
            <p className="w-full text-[11px] text-[#E11D48]" role="alert">
              {addError}
            </p>
          )}
        </form>

        {list.error ? (
          <LoadError message={list.error} onRetry={list.reload} />
        ) : !list.data ? (
          <p className="py-6 text-center text-xs text-[#7185A5]">Loading categories…</p>
        ) : (
          (['income', 'expense'] as const).map(t => (
            <section key={t}>
              <h4 className="text-xs font-semibold text-[#111827] mb-2">{TXN_TYPE_LABEL[t]}</h4>
              <ul className="divide-y divide-[#DFE6F1] border border-[#DFE6F1] rounded-lg">
                {list.data!
                  .filter(c => c.type === t)
                  .map(c => (
                    <CategoryRow key={c.id} category={c} onChanged={changed} />
                  ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </Modal>
  );
};

const CategoryRow: React.FC<{ category: TxnCategory; onChanged: () => Promise<void> }> = ({ category, onChanged }) => {
  const { showToast } = useApp();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (changes: { name?: string; active?: boolean }, message: string) => {
    setError('');
    setBusy(true);
    try {
      await transactionsApi.updateCategory(category.id, changes);
      showToast('success', message);
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(firstError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="px-3 py-2 text-xs" data-testid={`category-${category.name}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {editing ? (
          <form
            className="flex items-center gap-1.5 flex-1 min-w-0"
            onSubmit={e => {
              e.preventDefault();
              save({ name: name.trim() }, `Renamed to "${name.trim()}"`);
            }}
          >
            <input value={name} onChange={e => setName(e.target.value)} maxLength={60} className={`${inputClass} flex-1`} aria-label={`Rename ${category.name}`} autoFocus />
            <button type="submit" disabled={busy} className="p-1.5 text-[#047857] hover:bg-[#047857]/10 rounded cursor-pointer" aria-label="Save name">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(category.name);
                setError('');
              }}
              className="p-1.5 text-[#7185A5] hover:bg-[#F1F5F9] rounded cursor-pointer"
              aria-label="Cancel rename"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <span className={`flex-1 min-w-0 font-medium ${category.active ? 'text-[#111827]' : 'text-[#94A3B8] line-through'}`}>{category.name}</span>
        )}
        <span className="text-[11px] text-[#7185A5] whitespace-nowrap">
          {category.usageCount} {category.usageCount === 1 ? 'entry' : 'entries'}
        </span>
        {category.isSystem ? (
          <Badge variant="purple" size="sm">
            System
          </Badge>
        ) : (
          !editing && (
            <>
              {!category.active && (
                <Badge variant="neutral" size="sm">
                  Inactive
                </Badge>
              )}
              <button onClick={() => setEditing(true)} className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer" aria-label={`Rename ${category.name}`}>
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  save({ active: !category.active }, category.active ? `"${category.name}" deactivated` : `"${category.name}" reactivated`)
                }
                className="px-2 py-1 text-[11px] font-semibold rounded text-[#475569] hover:bg-[#F1F5F9] cursor-pointer"
              >
                {category.active ? 'Deactivate' : 'Activate'}
              </button>
            </>
          )
        )}
      </div>
      {error && (
        <p className="text-[11px] text-[#E11D48] mt-1" role="alert">
          {error}
        </p>
      )}
    </li>
  );
};
