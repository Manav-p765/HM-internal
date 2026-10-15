import React from 'react';
import { UserCheck } from 'lucide-react';
import { portalTeamApi } from '../../api/team';
import { useApiData } from '../../api/useApiData';
import { Avatar } from '../common/Avatar';
import { LoadError } from '../common/LoadError';
import { AvailabilityBadge } from '../attendance/AvailabilityBadge';

// The people working on this company's projects. The API returns only name, designation, avatar,
// today's status and project names; nothing else about staff is shown or fetched.
export const PortalTeamView: React.FC = () => {
  const { data: team, error, isLoading, reload } = useApiData(() => portalTeamApi.list(), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#111827]">Team</h1>
        <p className="text-xs text-[#7185A5] mt-1">The Hybrid Monks people working on your projects.</p>
        <p className="text-[11px] text-[#7185A5] mt-1">Status reflects today's availability.</p>
      </div>

      {error ? (
        <div className="bg-white rounded-xl border border-[#DFE6F1]">
          <LoadError message={error} onRetry={reload} />
        </div>
      ) : isLoading && !team ? (
        <div className="py-10 text-center text-xs text-[#7185A5]">Loading team…</div>
      ) : team!.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#DFE6F1] p-12 text-center text-[#7185A5]">
          <UserCheck className="w-10 h-10 mx-auto text-[#CBD5E1] mb-2" />
          <h3 className="font-semibold text-sm text-[#111827]">No team members yet</h3>
          <p className="text-xs mt-1">People appear here once they are added to one of your projects.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {team!.map((person, index) => (
            <div
              key={`${person.name}-${index}`}
              className="bg-white rounded-xl border border-[#DFE6F1] p-5 flex flex-col shadow-sm"
              data-testid="portal-team-card"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <Avatar name={person.name} url={person.avatarUrl} size="lg" />
                {person.status && <AvailabilityBadge status={person.status} />}
              </div>
              <h3 className="font-bold text-sm text-[#111827]">{person.name}</h3>
              <p className="text-xs text-[#5038F5] font-medium mt-0.5">{person.designation}</p>
              <div className="mt-4 pt-3 border-t border-[#DFE6F1]">
                <span className="text-[10px] uppercase font-bold text-[#7185A5] block mb-1.5">Projects</span>
                <div className="flex flex-wrap gap-1">
                  {person.projects.map(name => (
                    <span key={name} className="text-[11px] bg-[#F8FAFC] text-[#475569] border border-[#DFE6F1] px-2 py-0.5 rounded">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
