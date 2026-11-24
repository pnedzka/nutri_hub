import { ExternalLink, Mail, Phone, Smartphone } from 'lucide-react';
import type { TeamMember } from '../../../shared/profile.ts';

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

const contactClass = 'inline-flex items-center gap-2 min-w-0 min-h-11 sm:min-h-0 pointer-coarse:min-h-11 text-sm text-gray-600 hover:text-[#CC1F1F] [overflow-wrap:anywhere]';

/** E-mail, phones and LinkedIn of a person, one link per line. */
export function ContactLinks({ person }: { person: TeamMember }) {
  return (
    <div className="flex flex-col">
      <a href={`mailto:${person.email}`} className={contactClass}>
        <Mail size={14} className="shrink-0" /> {person.email}
      </a>
      {person.phone && (
        <a href={tel(person.phone)} className={contactClass}>
          <Phone size={14} className="shrink-0" /> {person.phone}
        </a>
      )}
      {person.mobile && (
        <a href={tel(person.mobile)} className={contactClass}>
          <Smartphone size={14} className="shrink-0" /> {person.mobile}
        </a>
      )}
      {person.linkedin && (
        <a href={person.linkedin} target="_blank" rel="noreferrer" className={contactClass}>
          <ExternalLink size={14} className="shrink-0" /> LinkedIn
        </a>
      )}
    </div>
  );
}
