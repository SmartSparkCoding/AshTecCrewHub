import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, ShieldCheck, X } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { getLiveShowAdmins, stageVideoShare } from '#api';
import { useStageVideo } from '../../lib/stageVideoClient';

/**
 * Ticket 7e928a80, the phone half: "/show-dash-video for phones/cameras that opt
 * in to have the screen go dim and live stream the show".
 *
 * Open it on a phone, pick an admin, type their cat-login PIN, and it films
 * whatever it is pointed at. The screen dims while it streams so a phone in the
 * wings is not a torch, and one tap brings the controls back.
 */
const KEY_STORE = 'ashtec-show-device-key';
const NAME_STORE = 'ashtec-show-device-name';

function deviceKey() {
  let key = localStorage.getItem(KEY_STORE);
  if (!key) {
    key = `cam-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(KEY_STORE, key);
  }
  return key;
}

export default function ShowDashVideo() {
  const key = useMemo(deviceKey, []);
  const [name, setName] = useState(() => localStorage.getItem(NAME_STORE) || 'Stage camera');
  const [admins, setAdmins] = useState<{ id: string; name: string }[]>([]);
  const [memberId, setMemberId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dim, setDim] = useState(true);
  const [live, setLive] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const preview = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Only poll while streaming: a phone that is not filming has nothing to answer.
  const video = useStageVideo({ deviceKey: key, name, enabled: live });

  useEffect(() => {
    void getLiveShowAdmins({}).then((r) => setAdmins(r.admins.map((a) => ({ id: a.id, name: a.name })))).catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem(NAME_STORE, name);
  }, [name]);

  // The preview element is a different node once the screen goes dark, so the
  // stream is attached again here rather than only at the moment the camera opens.
  // Muted, because a phone that plays its own microphone back howls.
  useEffect(() => {
    const el = preview.current;
    const stream = streamRef.current;
    if (!el || !stream || el.srcObject === stream) return;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [live]);

  const start = async () => {
    if (busy) return;
    if (!memberId) { setErr('Pick which admin is allowing this.'); return; }
    if (!pin) { setErr("Enter that admin's cat-login PIN."); return; }
    setBusy(true);
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true,
      });
      video.setLocal(stream);
      streamRef.current = stream;
      await stageVideoShare({ deviceKey: key, name, role: 'camera', sharing: true, memberId, pin });
      setLive(true);
      setDim(true);
    } catch (e) {
      const message = (e as Error).message || 'Could not start the camera.';
      setErr(
        /permission|NotAllowed|denied/i.test(message)
          ? 'The browser blocked the camera. Allow it for this page and press start again.'
          : message,
      );
      video.setLocal(null);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await stageVideoShare({ deviceKey: key, name, role: 'camera', sharing: false, memberId, pin });
    } catch {
      // even if the server is unreachable the camera light has to go out
    }
    video.setLocal(null);
    video.reset();
    streamRef.current = null;
    if (preview.current) preview.current.srcObject = null;
    setLive(false);
    setBusy(false);
  };

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setShowControls(false), 6000);
    return () => window.clearInterval(id);
  }, [live, showControls]);

  if (live) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white"
        onClick={() => { setDim(false); setShowControls(true); }}
      >
        <video ref={preview} muted playsInline className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className={dim && !showControls ? 'opacity-20' : 'opacity-100'}>
          <div className="relative z-10 flex flex-col items-center gap-2 text-center">
            <Camera className="h-8 w-8" />
            <p className="text-sm font-medium">{name} is streaming</p>
            <p className="max-w-xs text-xs text-white/60">
              The screen is dim on purpose. Tap anywhere for the controls.
            </p>
          </div>
        </div>
        {showControls && (
          <div className="absolute inset-x-0 bottom-0 z-20 space-y-2 bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" className="w-full" disabled={busy} onClick={(e) => { e.stopPropagation(); void stop(); }}>
              <CameraOff className="mr-2 h-4 w-4" /> Stop streaming
            </Button>
            <Button variant="ghost" className="w-full text-white/70" onClick={(e) => { e.stopPropagation(); setShowControls(false); setDim(true); }}>
              Keep it dark
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">Stage camera</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Point this at the stage and the other screens can watch it live. Nothing streams until an admin
          allows it, and the screen goes dark while it does.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border bg-card p-5">
        <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">What is this camera?</label>
        <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Stage left phone" />
        <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">Which admin is allowing it?</label>
        <select
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
        >
          <option value="">Pick an admin</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <Input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Cat-login PIN"
        />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button className="w-full" disabled={busy} onClick={() => void start()}>
          <Camera className="mr-2 h-4 w-4" /> {busy ? 'Starting…' : 'Start streaming'}
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Needs an admin account and their cat PIN, like the live controls.
        </p>
      </div>
      <video ref={preview} muted playsInline className="hidden" />
    </div>
  );
}
