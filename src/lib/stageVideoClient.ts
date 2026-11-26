import { useCallback, useEffect, useRef, useState } from 'react';
import { stageVideoSignal, stageVideoState } from '#api';

/**
 * Ticket 7e928a80 ("A live stream"). The browser half of the stage video.
 *
 * Two screens are on the same network, so the stream itself is peer to peer and
 * the server only carries the handshake: this hook polls for the other screens
 * and for the offer/answer/ICE rows addressed to it, and keeps one peer
 * connection per screen it is watching or being watched by.
 *
 * The viewer always offers and the camera always answers, so there is never a
 * race over who starts.
 */

export const POLL_MS = 700;

export type VideoPeerInfo = {
  deviceKey: string;
  name: string;
  role: string;
  sharing: boolean;
  watching: string;
};

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

export function useStageVideo(opts: {
  deviceKey: string;
  name: string;
  enabled: boolean;
  liveShowId?: string;
}) {
  const { deviceKey, name, enabled, liveShowId } = opts;
  const [peers, setPeers] = useState<VideoPeerInfo[]>([]);
  const [sharing, setSharing] = useState(false);
  const [watching, setWatching] = useState('');
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');

  const localStream = useRef<MediaStream | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const busy = useRef(new Set<string>());
  const alive = useRef(true);

  const send = useCallback(
    (toKey: string, kind: 'offer' | 'answer' | 'ice', payload: unknown) =>
      stageVideoSignal({ deviceKey, toKey, kind, payload: JSON.stringify(payload), liveShowId }).catch(
        () => undefined,
      ),
    [deviceKey, liveShowId],
  );

  const closePeer = useCallback((key: string) => {
    const pc = pcs.current.get(key);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.close();
      pcs.current.delete(key);
    }
    busy.current.delete(key);
  }, []);

  const newPeer = useCallback(
    (key: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE });
      pc.onicecandidate = (e) => {
        if (e.candidate) void send(key, 'ice', e.candidate.toJSON());
      };
      pc.ontrack = (e) => {
        const [stream] = e.streams;
        if (stream) setRemote(stream);
      };
      pcs.current.set(key, pc);
      return pc;
    },
    [send],
  );

  /** The viewer side: offer to the camera this screen has been pointed at. */
  const offerTo = useCallback(
    async (key: string) => {
      if (pcs.current.has(key) || busy.current.has(key)) return;
      busy.current.add(key);
      try {
        const pc = newPeer(key);
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await send(key, 'offer', offer);
      } catch (e) {
        setError((e as Error).message);
        busy.current.delete(key);
      }
    },
    [newPeer, send],
  );

  const handleSignal = useCallback(
    async (sig: { fromKey: string; kind: string; payload: string }) => {
      let data: any;
      try {
        data = JSON.parse(sig.payload);
      } catch {
        return;
      }
      const from = sig.fromKey;
      try {
        if (sig.kind === 'offer') {
          // We are the camera here: answer with the local camera on the stream.
          const pc = pcs.current.get(from) ?? newPeer(from);
          const stream = localStream.current;
          if (stream) {
            for (const track of stream.getTracks()) {
              if (!pc.getSenders().some((s) => s.track === track)) pc.addTrack(track, stream);
            }
          }
          await pc.setRemoteDescription(data);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await send(from, 'answer', answer);
        } else if (sig.kind === 'answer') {
          // No connection for this sender means the offer is long gone; the next
          // tick offers again rather than sitting on a half-open handshake.
          await pcs.current.get(from)?.setRemoteDescription(data);
        } else if (sig.kind === 'ice') {
          const pc = pcs.current.get(from);
          if (pc) await pc.addIceCandidate(data).catch(() => undefined);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [newPeer, send],
  );

  const signalRef = useRef(handleSignal);
  signalRef.current = handleSignal;

  useEffect(() => {
    alive.current = true;
    if (!enabled) return;
    let timer: number | null = null;

    const tick = async () => {
      try {
        const state = await stageVideoState({ deviceKey, name, liveShowId });
        if (!alive.current) return;
        setPeers(state.peers);
        setSharing(state.me.sharing);
        setWatching(state.me.watching);
        for (const sig of state.signals) await signalRef.current(sig);
        // A connection that died is dropped so the next tick can offer again.
        for (const [key, pc] of [...pcs.current.entries()]) {
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            closePeer(key);
            setRemote(null);
          }
        }
        // Pointed at a camera that is actually sharing? Start on it.
        const target = state.peers.find((p) => p.deviceKey === state.me.watching);
        if (state.me.watching && target?.sharing) void offerTo(state.me.watching);
        // Anything we are no longer watching or no longer sharing gets closed.
        for (const key of [...pcs.current.keys()]) {
          const peer = state.peers.find((p) => p.deviceKey === key);
          const keep = key === state.me.watching || (state.me.sharing && peer?.watching === deviceKey);
          if (!keep) closePeer(key);
        }
        setError('');
      } catch (e) {
        if (alive.current) setError((e as Error).message);
      }
      if (alive.current) timer = window.setTimeout(tick, POLL_MS);
    };

    void tick();
    return () => {
      alive.current = false;
      if (timer) window.clearTimeout(timer);
      for (const key of [...pcs.current.keys()]) closePeer(key);
    };
  }, [deviceKey, name, enabled, liveShowId, offerTo, closePeer]);

  // A camera that stops sharing has to drop the camera light, not keep filming.
  const setLocal = useCallback((stream: MediaStream | null) => {
    localStream.current = stream;
    for (const pc of pcs.current.values()) {
      for (const sender of pc.getSenders()) {
        if (sender.track) void pc.removeTrack(sender);
      }
      if (!stream) continue;
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
    }
  }, []);

  const reset = useCallback(() => {
    for (const key of [...pcs.current.keys()]) closePeer(key);
    setRemote(null);
  }, [closePeer]);

  return { peers, sharing, watching, remote, error, setLocal, reset };
}
