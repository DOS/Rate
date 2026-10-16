'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildRadarIndex,
  unwrapRadarPayload,
  type CrossPlatformDealRadarResponse,
  type RadarIndex,
} from '@/lib/deal-radar';

const RADAR_ENDPOINT = '/api/v1/rate/deals?category=all&limit=36';
let radarRequest: Promise<CrossPlatformDealRadarResponse | null> | null = null;

/** One network request per page load, shared by every client consumer. */
export function fetchDealRadar(): Promise<CrossPlatformDealRadarResponse | null> {
  if (!radarRequest) {
    radarRequest = fetch(RADAR_ENDPOINT)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => unwrapRadarPayload(json))
      .catch(() => null)
      .then((payload) => {
        if (!payload) radarRequest = null;
        return payload;
      });
  }
  return radarRequest;
}

/**
 * Client hook returning the raw radar payload (null until loaded).
 * Pass `initial` when the server already resolved the payload.
 */
export function useDealRadarPayload(
  initial?: CrossPlatformDealRadarResponse | null
): CrossPlatformDealRadarResponse | null {
  const [payload, setPayload] = useState<CrossPlatformDealRadarResponse | null>(
    initial ?? null
  );
  useEffect(() => {
    if (initial) return;
    let active = true;
    void fetchDealRadar().then((p) => {
      if (active && p) setPayload(p);
    });
    return () => {
      active = false;
    };
  }, [initial]);
  return payload;
}

/** Client hook returning the shared slug -> signal index. */
export function useDealRadarIndex(
  initial?: CrossPlatformDealRadarResponse | null
): RadarIndex {
  const payload = useDealRadarPayload(initial);
  return useMemo(() => buildRadarIndex(payload), [payload]);
}
