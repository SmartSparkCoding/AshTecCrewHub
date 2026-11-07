import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Cog, Monitor, Moon, RotateCcw, Sun } from 'lucide-react';
import { useMe } from '../lib/me';
import { useTheme, type Theme } from '../lib/theme';
import { SEEN_KEY } from '../lib/tutorial';
import { cn } from '@project/components/lib/utils';

const THEMES: { value: Theme; label: string; icon: typeof Moon }[] = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'Match this device', icon: Monitor },
];

/**
 * Per-device settings.
 *
 * Anything that follows the browser rather than the person lives here: the
 * theme, and whether the guided tour has been seen. Everything that applies to
 * the whole crew is on the admin settings page instead, so the two never get
 * confused for each other.
 */
export default function Settings() {
  const { me } = useMe();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();

  const replayTour = () => {
    localStorage.removeItem(SEEN_KEY(me.id));
    toast.success('The tour will start again on your next page');
    nav('/');
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">These follow this browser, not your account. Sign in on another device and it keeps its own.</p>
      </div>

      <div className="rounded-2xl border bg-card p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Appearance</h2>
          <p className="text-sm text-muted-foreground">Dark is the house style. Light is easier on a projector or a bright room.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <Button
              key={t.value}
              variant={theme === t.value ? 'default' : 'outline'}
              onClick={() => setTheme(t.value)}
              className={cn('gap-2', theme === t.value && 'ring-2 ring-primary/40')}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Guided tour</h2>
          <p className="text-sm text-muted-foreground">The walkthrough that points at each part of the hub. It only ever reads, so it is safe to run again.</p>
        </div>
        <Button variant="outline" onClick={replayTour}>
          <RotateCcw className="mr-2 h-4 w-4" />Replay the tour
        </Button>
      </div>

      <div className="rounded-2xl border bg-card p-6 space-y-3">
        <div>
          <h2 className="font-semibold text-lg">Everything else</h2>
          <p className="text-sm text-muted-foreground">
            Your name, year, school email and preferred roles are on your profile. Crew roles, staff status and who gets emailed are set by a crew admin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link to="/profile">My Profile</Link></Button>
          {me.isAdmin && (
            <Button asChild variant="outline"><Link to="/admin/settings"><Cog className="mr-2 h-4 w-4" />Crew-wide settings</Link></Button>
          )}
        </div>
      </div>
    </div>
  );
}
