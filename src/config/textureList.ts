import { TEXTURE_SET } from './constants'

/**
 * Pre-baked textures, produced once by the bake tool (bake.html) and shipped
 * as WebP in /public/textures/{hd,sd}. Kept free of three/drei imports so the
 * preloader can start downloading them before the 3D engine chunk arrives.
 */
export const TEXTURE_FILES = {
  skyColor: 'sky_color',
  skyDust: 'sky_dust',
  disk: 'disk',
  giant: 'giant',
  oceanAlbedo: 'ocean_albedo',
  oceanNormal: 'ocean_normal',
  oceanWater: 'ocean_water',
  oceanClouds: 'ocean_clouds',
  barrenAlbedo: 'barren_albedo',
  barrenNormal: 'barren_normal',
  moonAlbedo: 'moon_albedo',
  moonNormal: 'moon_normal',
} as const

export type TextureKey = keyof typeof TEXTURE_FILES

const base = import.meta.env.BASE_URL

export const TEXTURE_URLS = Object.fromEntries(
  Object.entries(TEXTURE_FILES).map(([key, file]) => [key, `${base}textures/${TEXTURE_SET}/${file}.webp`]),
) as Record<TextureKey, string>

/** Kick off the downloads right away; the texture loader later hits the HTTP cache. */
export function prefetchTextures() {
  for (const url of Object.values(TEXTURE_URLS)) {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = url
    link.type = 'image/webp'
    link.crossOrigin = 'anonymous' // must match the texture loader's request mode
    document.head.appendChild(link)
  }
}
