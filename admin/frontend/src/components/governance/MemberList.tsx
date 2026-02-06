import { Hash, Box, Tag, Eye, EyeOff, ShieldAlert, Edit2 } from 'lucide-react';
import type { MemberWithGovernance } from '../../api/client';

interface MemberListProps {
  members: MemberWithGovernance[];
  onSelect: (member: MemberWithGovernance) => void;
}

export default function MemberList({ members, onSelect }: MemberListProps) {
  if (members.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">No members match your filters</p>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b">
            <th className="text-left py-3 px-4 font-medium text-gray-600">Member</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Type</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Restrictions</th>
            <th className="py-3 px-4"></th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr
              key={member.name}
              className="border-b hover:bg-gray-50 cursor-pointer"
              onClick={() => onSelect(member)}
            >
              <td className="py-3 px-4">
                <div>
                  <p className="font-mono text-sm">{member.name}</p>
                  {member.title && (
                    <p className="text-xs text-gray-500">{member.title}</p>
                  )}
                </div>
              </td>
              <td className="py-3 px-4">
                <TypeBadge type={member.type} />
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  {member.exposed ? (
                    <span className="flex items-center gap-1 text-green-600 text-sm">
                      <Eye className="w-4 h-4" />
                      Exposed
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-gray-500 text-sm">
                      <EyeOff className="w-4 h-4" />
                      Hidden
                    </span>
                  )}
                  {member.pii && (
                    <span className="flex items-center gap-1 text-red-600 text-sm">
                      <ShieldAlert className="w-4 h-4" />
                      PII
                    </span>
                  )}
                </div>
              </td>
              <td className="py-3 px-4">
                <div className="flex flex-wrap gap-1">
                  {member.allowedGroupBy && member.allowedGroupBy.length > 0 && (
                    <span className="badge badge-blue text-xs">
                      Allowed: {member.allowedGroupBy.length}
                    </span>
                  )}
                  {member.deniedGroupBy && member.deniedGroupBy.length > 0 && (
                    <span className="badge badge-red text-xs">
                      Denied: {member.deniedGroupBy.length}
                    </span>
                  )}
                  {member.requiresTimeDimension && (
                    <span className="badge badge-yellow text-xs">
                      Requires Time
                    </span>
                  )}
                  {member.hasOverride && (
                    <span className="badge badge-gray text-xs">
                      Override
                    </span>
                  )}
                </div>
              </td>
              <td className="py-3 px-4">
                <button className="p-2 hover:bg-gray-100 rounded">
                  <Edit2 className="w-4 h-4 text-gray-400" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TypeBadge({ type }: { type: 'measure' | 'dimension' | 'segment' }) {
  const config = {
    measure: { icon: Hash, className: 'badge-blue' },
    dimension: { icon: Box, className: 'badge-green' },
    segment: { icon: Tag, className: 'badge-yellow' },
  };

  const { icon: Icon, className } = config[type];

  return (
    <span className={`badge ${className} flex items-center gap-1`}>
      <Icon className="w-3 h-3" />
      {type}
    </span>
  );
}
