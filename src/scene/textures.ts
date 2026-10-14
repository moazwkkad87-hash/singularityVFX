import { useTexture } from '@react-three/drei'
import { ClampToEdgeWrapping, NoColorSpace, RepeatWrapping, type Texture, type WebGLRenderer } from 'three'
import { TEXTURE_URLS, type TextureKey } from '../config/textureList'

export type SceneTextures = Record<TextureKey, Texture>

let anisotropy = 8
export function setMaxAnisotropy(gl: WebGLRenderer) {
  anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
}

/**
 * Suspends until every texture is downloaded and decoded.
 * Colour data is gamma-encoded and decoded in the shaders, so all textures
 * are loaded as raw data (NoColorSpace) with full mip chains.
 */
export function useSceneTextures(): SceneTextures {
  return useTexture(TEXTURE_URLS, (loaded) => {
    const list = Array.isArray(loaded) ? loaded : Object.values(loaded as Record<string, Texture>)
    for (const t of list) {
      t.colorSpace = NoColorSpace
      t.wrapS = RepeatWrapping
      t.wrapT = ClampToEdgeWrapping
      t.anisotropy = anisotropy
      t.needsUpdate = true
    }
  }) as unknown as SceneTextures
}
