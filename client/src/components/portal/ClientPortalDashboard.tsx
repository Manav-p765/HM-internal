import React from 'react';
import { FolderKanban } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../common/Card';

export const ClientPortalDashboard: React.FC = () => {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">Welcome</h1>
        <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
          You are signed in to the Hybrid Monks client portal for <span className="font-semibold text-[#111827]">{user?.clientName}</span>.
        </p>
      </div>
      <Card padding="lg" className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-[#5038F5]/10 text-[#5038F5] flex items-center justify-center shrink-0">
          <FolderKanban className="w-5 h-5" />
        </div>
        <div className="text-xs text-[#475569]">
          <p className="font-semibold text-[#111827] text-sm mb-1">Your projects will appear here</p>
          <p>Project status and updates from the Hybrid Monks team are coming to this portal soon.</p>
        </div>
      </Card>
    </div>
  );
};
