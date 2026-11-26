import { zite } from '#db';
import { currentLiveShow } from './liveShow';

/**
 * Ticket 7e928a80 (J Navaratne): "add a live stream between stage left and stage
 * right", where a screen opts in to share its camera and an admin decides which
 * screens watch which camera.
 *
 * Stage screens have no websocket anywhere else in this app, so the WebRTC
 * handshake travels as rows that each side picks up on its next poll. Both
 * screens are in the same building, usually on the same wifi, so the stream is
 * peer to peer and never passes through the server.
 */

/** A signal older than this is worthless: the peer that wanted it has moved on. */
export const SIGNAL_TTL_MS = 120_000;
/** Never store more than this per poll, and never let one device queue thousands. */
export const SIGNAL_LIMIT = 40;
export const PAYLOAD_MAX = 16_000;

export type VideoRole = 'screen' | 'camera';
export const isVideoRole = (v: unknown): v is VideoRole => v === 'screen' || v === 'camera';

export type VideoPeer = {
  deviceKey: string;
  name: string;
  role: VideoRole;
  sharing: boolean;
  watching: string;
  lastSeenAt: string;
};

export const mapVideoPeer = (r: Record<string, any>): VideoPeer => ({
  deviceKey: String(r.deviceKey ?? ''),
  name: String(r.name ?? ''),
  role: isVideoRole(r.role) ? r.role : 'screen',
  sharing: !!r.sharing,
  watching: String(r.watching ?? ''),
  lastSeenAt: String(r.lastSeenAt ?? ''),
});

/** A device that has not polled in this long is not on the network any more. */
export const PEER_STALE_MS = 90_000;

export async function liveShowForVideo(liveShowId?: string) {
  if (liveShowId) {
    const row = await zite.liveShows.findOne({ id: liveShowId }).catch(() => null);
    if (row) return row;
  }
  return currentLiveShow();
}

/** Every device that is still polling, sharing or not, for the picker to show. */
export async function loadVideoPeers(liveShowId: string): Promise<VideoPeer[]> {
  const { records } = await zite.stageVideo.findAll({ filters: { liveShow: liveShowId }, limit: 50 });
  const now = Date.now();
  return records
    .map(mapVideoPeer)
    .filter((p) => p.deviceKey && now - Date.parse(p.lastSeenAt) < PEER_STALE_MS)
    .sort((a, b) => Number(b.sharing) - Number(a.sharing) || a.name.localeCompare(b.name));
}

/** Old handshakes are no use to anyone, and this table must not grow for ever. */
export async function sweepSignals(liveShowId: string): Promise<void> {
  const cutoff = new Date(Date.now() - SIGNAL_TTL_MS).toISOString();
  await zite.sql({
    query: 'DELETE FROM "StageSignals" WHERE "liveShow" = $1 AND "createdAt" < $2',
    params: [liveShowId, cutoff],
  }).catch(() => undefined);
}

/**
 * Take the signals waiting for this device, oldest first. They are read and then
 * deleted, because an offer applied twice puts the connection in a state
 * neither side can recover from without starting again.
 */
export async function claimSignals(liveShowId: string, deviceKey: string) {
  const { rows } = await zite.sql({
    query: `DELETE FROM "StageSignals"
      WHERE "id" IN (
        SELECT "id" FROM "StageSignals"
        WHERE "liveShow" = $1 AND "toKey" = $2
        ORDER BY "createdAt" ASC
        LIMIT ${SIGNAL_LIMIT}
      )
      RETURNING "id", "fromKey", "kind", "payload"`,
    params: [liveShowId, deviceKey],
  });
  return rows.map((r: Record<string, any>) => ({
    id: String(r.id),
    fromKey: String(r.fromKey ?? ''),
    kind: String(r.kind ?? ''),
    payload: String(r.payload ?? ''),
  }));
}

/**
 * Where to look for the other screen. A public STUN server is enough for two
 * devices on the same network; there is deliberately no TURN, because a stream
 * that silently relays through a third party is not what was asked for.
 */
export const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * The picture relay, for networks that will not pass peer-to-peer video.
 *
 * A school wifi with client isolation never gives the two browsers a candidate
 * they can reach, so the peer connection sits at "connecting" for ever. The
 * camera can instead post one JPEG at a time over the same HTTPS connection the
 * app already needs, and the screens show the newest one. Slower and coarser
 * than WebRTC, but it works wherever the site works.
 */
export const FRAME_MAX = 400_000;
/** A frame older than this is not worth showing: the camera has stopped posting. */
export const FRAME_TTL_MS = 8_000;

export async function putFrame(deviceKey: string, liveShowId: string, frame: string) {
  const existing = await zite.stageVideo.findOne({ filters: { deviceKey } }).catch(() => null);
  const now = new Date().toISOString();
  if (!existing) return false;
  await zite.stageVideo.update({
    id: String(existing.id),
    record: { frame, frameAt: now, lastSeenAt: now, liveShow: liveShowId },
  });
  return true;
}

/** The newest frame from one camera, or '' if it has gone quiet. */
export async function readFrame(deviceKey: string) {
  const row = await zite.stageVideo.findOne({ filters: { deviceKey } }).catch(() => null);
  if (!row) return { frame: '', ageMs: -1 };
  const at = row.frameAt ? Date.parse(String(row.frameAt)) : 0;
  const ageMs = at ? Date.now() - at : -1;
  if (!row.frame || ageMs < 0 || ageMs > FRAME_TTL_MS) return { frame: '', ageMs };
  return { frame: String(row.frame), ageMs };
}
