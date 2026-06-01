import type { Map as MapLibreMap } from 'maplibre-gl'

type MapLibreModule = typeof import('maplibre-gl')

let modulePromise: Promise<MapLibreModule> | null = null

/** Load MapLibre JS + CSS on demand (keeps initial bundle small). */
export async function loadMapLibre(): Promise<MapLibreModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      await import('maplibre-gl/dist/maplibre-gl.css')
      return import('maplibre-gl')
    })()
  }

  return modulePromise
}

export type { MapLibreMap }
