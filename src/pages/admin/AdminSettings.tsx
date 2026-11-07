import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { adminSetMaintainer } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Checkbox } from '@project/components/ui/checkbox';
import { Skeleton } from '@project/components/ui/skeleton';
import { Clock, LifeBuoy, Mail, Users } from 'lucide-react';
import { useAdminData } from '../../lib/useAdminData';
import { ESCALATION_HOURS } from '../../lib/support';

/**
 * Crew-wide settings.
 *
 * These apply to everyone, so they live here rather than on a member's profile
 * or in the browser. The maintainer list used to be tucked into the Support
 * page's sidebar, which made it look like a support filter rather than a
 * setting; it belongs with the other things that decide who gets emailed.
 */
export default function AdminSettings() {
  const { data, patchMember } = useAdminData();
  const [busy, setBusy] = useState('');

  const candidates = (data?.members ?? []).filter((m) => m.isAdmin && !m.isPreview);
  const maintainers = candidates.filter((m) => m.isMaintainer);
  const generalSupport = candidates.filter((m) => m.memberType !== 'Teacher' && m.year !== 'Staff');

  const toggle = async (id: string, value: boolean) => {
    if (busy) return;
    setBusy(id);
    patchMember(id, { isMaintainer: value });
    try {
      await adminSetMaintainer({ memberId: id, value });
      toast.success(value ? 'Added as a maintainer' : 'No longer a maintainer');
    } catch (e) {
      patchMember(id, { isMaintainer: !value });
      toast.error((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (!data) return <div className="max-w-2xl space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Crew-wide. Anything that only affects one browser is on the member Settings page instead.</p>
      </div>

      <div className="rounded-2xl border bg-card p-6 space-y-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-lg"><LifeBuoy className="h-4 w-4 text-primary" />Who gets support emails</h2>
          <p className="text-sm text-muted-foreground">
            Maintainers are emailed about bug reports and feature requests. General support goes to every admin who isn’t staff, so nobody has to be ticked for that.
          </p>
        </div>
        {candidates.length === 0 && <p className="text-sm text-muted-foreground">No admins to choose from yet.</p>}
        <div className="space-y-2">
          {candidates.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!!m.isMaintainer}
                disabled={busy === m.id}
                onCheckedChange={(c) => toggle(m.id, !!c)}
              />
              <span>{m.firstName} {m.lastName}</span>
              <span className="text-xs text-muted-foreground">{m.email}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {maintainers.length === 0
            ? 'Nobody ticked, so bug reports and feature requests fall back to every admin.'
            : `${maintainers.length} maintainer${maintainers.length === 1 ? '' : 's'} will be emailed.`}
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-6 space-y-3">
        <h2 className="flex items-center gap-2 font-semibold text-lg"><Clock className="h-4 w-4 text-primary" />Reminders</h2>
        <p className="text-sm text-muted-foreground">
          A ticket with no maintainer reply is re-sent to its assignees every {ESCALATION_HOURS} hours. Assigning someone on the ticket stops the reminders going to everyone else.
        </p>
        <Button asChild variant="outline" size="sm"><Link to="/admin/support">Open Support</Link></Button>
      </div>

      <div className="rounded-2xl border bg-card p-6 space-y-3">
        <h2 className="flex items-center gap-2 font-semibold text-lg"><Mail className="h-4 w-4 text-primary" />Email</h2>
        <p className="text-sm text-muted-foreground">
          Every message the hub sends is logged, with who sent it and who received it. Preview accounts are never emailed.
        </p>
        <Button asChild variant="outline" size="sm"><Link to="/admin/emails">Open the email log</Link></Button>
      </div>

      <div className="rounded-2xl border bg-card p-6 space-y-3">
        <h2 className="flex items-center gap-2 font-semibold text-lg"><Users className="h-4 w-4 text-primary" />Crew</h2>
        <p className="text-sm text-muted-foreground">
          Roles, staff status, years and who is an admin are set per person on the Crew page. {generalSupport.length} admin{generalSupport.length === 1 ? '' : 's'} currently receive general support.
        </p>
        <Button asChild variant="outline" size="sm"><Link to="/admin/members">Open Crew</Link></Button>
      </div>
    </div>
  );
}
