import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { adminGetSupport, adminUpdateTicket, type AdminGetSupportOutputType } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Badge } from '@project/components/ui/badge';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import { Checkbox } from '@project/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { AlertCircle, ArrowUpRight, Loader2, MessageSquare, Settings2, Sparkles, X } from 'lucide-react';
import { useAdminData } from '../../lib/useAdminData';
import { TYPE_STYLE, STATUS_STYLE, OPENCODE_TAG, OPENCODE_TAG_STYLE } from '../../lib/supportStyle';

type Ticket = AdminGetSupportOutputType['tickets'][number];

export default function Support() {
  const { data } = useAdminData();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('active');
  const [onlyAwaiting, setOnlyAwaiting] = useState(false);
  const [onlyReferred, setOnlyReferred] = useState(false);
  const [busyTag, setBusyTag] = useState('');
  const load = useCallback(() => adminGetSupport({}).then((r) => setTickets(r.tickets)), []);
  useEffect(() => { load(); }, [load]);

  const name = (id: string) => { const m = data?.members.find((x) => x.id === id); return m ? `${m.firstName} ${m.lastName}` : 'Unknown'; };
  const list = useMemo(() => (tickets ?? []).filter((t) =>
    (type === 'all' || t.type === type) &&
    (status === 'all' || (status === 'active' ? ['Open', 'In Progress'].includes(t.status) : t.status === status)) &&
    (!onlyAwaiting || t.awaitingReply) &&
    (!onlyReferred || t.referToOpencode) &&
    `${t.subject} ${t.message}`.toLowerCase().includes(q.toLowerCase())), [tickets, type, status, onlyAwaiting, onlyReferred, q]);

  if (!tickets || !data) return <Skeleton className="h-96 rounded-2xl" />;
  // Untagging from the list saves opening the ticket just to clear a label.
  const untag = async (id: string) => {
    if (busyTag) return;
    setBusyTag(id);
    try {
      await adminUpdateTicket({ id, referToOpencode: false });
      setTickets((prev) => (prev ?? []).map((t) => (t.id === id ? { ...t, referToOpencode: false } : t)));
      toast.success('Tag removed');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyTag(''); }
  };
  const maintainers = data.members.filter((m) => m.isAdmin && !m.isPreview && m.isMaintainer);
  const count = (s: string) => tickets.filter((t) => t.status === s).length;
  const awaiting = tickets.filter((t) => ['Open', 'In Progress'].includes(t.status) && t.awaitingReply).length;
  const referred = tickets.filter((t) => t.referToOpencode).length;
  const age = (iso: string) => {
    const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
    return days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`;
  };

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Support</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {count('Open')} open · {count('In Progress')} in progress · {count('Resolved')} resolved
              {awaiting > 0 && <span className="text-orange-400"> · {awaiting} awaiting a reply</span>}
            </p>
          </div>
          <Button variant="outline" onClick={async () => { await load(); toast.success('Refreshed'); }}>Refresh</Button>
        </div>

        <div className="grid sm:grid-cols-3 gap-2">
          <div className="relative"><AlertCircle className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" /><Input data-tour="support-search" className="pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All types</SelectItem>{Object.keys(TYPE_STYLE).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="active">Open & in progress</SelectItem><SelectItem value="all">All statuses</SelectItem>{Object.keys(STATUS_STYLE).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={onlyAwaiting} onCheckedChange={(c) => setOnlyAwaiting(!!c)} />
            Only tickets waiting on a maintainer
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox data-tour="support-referred" checked={onlyReferred} onCheckedChange={(c) => setOnlyReferred(!!c)} />
            Only {OPENCODE_TAG.toLowerCase()} ({referred})
          </label>
        </div>

        <div className="rounded-2xl border bg-card divide-y">
          {list.length === 0 && <p className="p-6 text-sm text-muted-foreground">No tickets here. 🎉</p>}
          {list.map((t) => (
            <Link key={t.id} to={`/admin/support/${t.id}`} target="_blank" rel="noopener"
              className="w-full p-4 flex flex-col md:flex-row md:items-center gap-2 hover:bg-muted/40">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate flex items-center gap-1.5">
                  {t.subject}
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </p>
                <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>{name(t.submittedById)}</span>
                  <span>· {t.submittedAt && new Date(t.submittedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  {t.assignedMaintainerIds.length > 0 && (
                    <span>· assigned to {t.assignedMaintainerIds.map(name).join(', ')}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  {t.awaitingReply && ['Open', 'In Progress'].includes(t.status)
                    ? <span className="text-orange-400 flex items-center gap-1"><AlertCircle className="h-3 w-3" />waiting on a reply · {age(t.lastReplyAt || t.submittedAt)}</span>
                    : <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{t.replyCount} {t.replyCount === 1 ? 'reply' : 'replies'}</span>}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0 items-center">
                {t.referToOpencode && (
                  <Badge variant="outline" className={OPENCODE_TAG_STYLE}>
                    <Sparkles className="h-3 w-3 mr-1" />{OPENCODE_TAG}
                    <button
                      type="button"
                      title={`Remove the ${OPENCODE_TAG} tag`}
                      aria-label={`Remove the ${OPENCODE_TAG} tag`}
                      disabled={busyTag === t.id}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); untag(t.id); }}
                      className="ml-1.5 -mr-1 rounded-full p-0.5 hover:bg-purple-500/25 disabled:opacity-50"
                    >
                      {busyTag === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                    </button>
                  </Badge>
                )}
                <Badge variant="outline" className={TYPE_STYLE[t.type]}>{t.type}</Badge>
                <Badge variant="outline" className={STATUS_STYLE[t.status]}>{t.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <aside className="rounded-2xl border bg-card p-4 h-fit space-y-3">
        <div className="flex items-center gap-2 font-semibold"><Settings2 className="h-4 w-4 text-primary" />Maintainers</div>
        <p className="text-xs text-muted-foreground">
          {maintainers.length === 0
            ? 'Nobody is a maintainer yet, so bug reports and feature requests go to every admin.'
            : `${maintainers.map((m) => `${m.firstName} ${m.lastName}`).join(', ')} ${maintainers.length === 1 ? 'is' : 'are'} emailed about bug reports and feature requests.`}
        </p>
        <p className="text-xs text-muted-foreground">General support goes to all admins who aren’t staff.</p>
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link to="/admin/settings">Manage in Settings</Link>
        </Button>
      </aside>
    </div>
  );
}
