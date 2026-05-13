export type AmapLngLat = [number, number]

export const AMAP_MAP_CENTER: AmapLngLat = [118.6, 31.2]
export const AMAP_MAP_ZOOM = 5
export const AMAP_MAP_MIN_ZOOM = 4
export const AMAP_MAP_MAX_ZOOM = 17
export const AMAP_INITIAL_FIT_MAX_ZOOM = 9
export const AMAP_INITIAL_SINGLE_MARKER_ZOOM = 11
export const AMAP_FOCUS_MIN_ZOOM = 12

export const AMAP_KEY = process.env.NEXT_PUBLIC_AMAP_KEY ?? ''
export const AMAP_SECURITY_JS_CODE = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE ?? ''

export const isAmapConfigured = (): boolean => AMAP_KEY.trim().length > 0

export const configureAmapSecurity = (): void => {
  if (typeof window === 'undefined' || AMAP_SECURITY_JS_CODE.trim().length === 0) {
    return
  }

  window._AMapSecurityConfig = {
    securityJsCode: AMAP_SECURITY_JS_CODE,
  }
}

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode?: string
    }
  }
}
