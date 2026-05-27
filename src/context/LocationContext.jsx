/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { capture } from '../lib/analytics'
import { logger } from '../utils/logger'
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '../lib/storage'
import { detectRegion } from '../constants/towns'

// Default location: Martha's Vineyard center (between Vineyard Haven, Oak Bluffs, Edgartown)
const DEFAULT_LOCATION = {
  lat: 41.43,
  lng: -70.56,
}

// On native iOS (Capacitor WKWebView), browser `navigator.geolocation` does
// not persist permission grants across cold launches — every app open shows
// a fresh web-style prompt instead of iOS's native "While Using App" sheet.
// Routing through @capacitor/geolocation uses CoreLocation: iOS shows the
// native permission dialog once, persists the choice in Settings forever,
// and silent reads return cached coordinates without re-prompting.
const isNative = Capacitor.isNativePlatform()

const LocationContext = createContext(null)

export function LocationProvider({ children }) {
  // Start with default location immediately - don't block on geolocation
  const [location, setLocation] = useState(DEFAULT_LOCATION)
  const [radius, setRadiusState] = useState(() => {
    const saved = getStorageItem(STORAGE_KEYS.RADIUS)
    if (saved !== null && saved !== undefined) {
      const parsed = parseInt(saved, 10)
      // 0 = Anywhere (no distance limit), 1-250 = miles
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 250) {
        return parsed
      }
    }
    return 5
  })

  // Wrap setRadius to track filter changes and persist to localStorage
  const setRadius = useCallback((newRadius) => {
    setRadiusState(prevRadius => {
      if (newRadius !== prevRadius) {
        capture('filter_applied', {
          filter_type: 'radius',
          radius_miles: newRadius,
          previous_radius: prevRadius,
        })
        setStorageItem(STORAGE_KEYS.RADIUS, String(newRadius))
      }
      return newRadius
    })
  }, [])

  // Auto-detect region from coordinates
  const [region, setRegion] = useState(() => detectRegion(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng))

  useEffect(() => {
    if (location) {
      setRegion(detectRegion(location.lat, location.lng))
    }
  }, [location])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [permissionState, setPermissionState] = useState('prompt') // 'prompt' | 'granted' | 'denied' | 'unsupported'
  const [hasAskedBefore, setHasAskedBefore] = useState(false)

  // Check if we've asked before
  useEffect(() => {
    const asked = getStorageItem(STORAGE_KEYS.LOCATION_PERMISSION)
    if (asked) {
      setHasAskedBefore(true)
    }
  }, [])

  // Tracks whether the provider is still mounted across awaits — without it,
  // async native paths can setState() after unmount and log a React warning.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Silent fetch — assumes permission is already granted. Never triggers a
  // permission prompt. Used on mount when checkPermissions() returns granted,
  // and from inside requestLocation() after explicit consent.
  const fetchCurrentPositionNative = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 300000,
      })
      if (!mountedRef.current) return
      setLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      })
      setPermissionState('granted')
      setLoading(false)
    } catch (err) {
      if (!mountedRef.current) return
      logger.warn('Native getCurrentPosition error:', err?.message || err)
      setError('unavailable')
      setLocation(DEFAULT_LOCATION)
      setLoading(false)
    }
  }, [])

  const requestLocation = useCallback(async () => {
    if (isNative) {
      // Marks "we've asked in-app" — UX flag for showing the LocationBanner
      // CTA differently. iOS itself remembers the OS-level grant in Settings,
      // independent of this localStorage key.
      setStorageItem(STORAGE_KEYS.LOCATION_PERMISSION, 'true')
      setHasAskedBefore(true)
      setLoading(true)
      setError(null)
      try {
        // requestPermissions() triggers iOS's native "While Using App / Once
        // / Don't Allow" sheet on first call. Subsequent calls return the
        // persisted choice without re-prompting.
        const perm = await Geolocation.requestPermissions({ permissions: ['location'] })
        if (!mountedRef.current) return
        if (perm.location === 'denied') {
          setPermissionState('denied')
          setError('denied')
          setLocation(DEFAULT_LOCATION)
          setLoading(false)
          return
        }
        await fetchCurrentPositionNative()
      } catch (err) {
        if (!mountedRef.current) return
        logger.warn('Native requestPermissions error:', err?.message || err)
        setError('unavailable')
        setLocation(DEFAULT_LOCATION)
        setLoading(false)
      }
      return
    }

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser')
      setPermissionState('unsupported')
      setLocation(DEFAULT_LOCATION)
      return
    }

    setLoading(true)
    setError(null)
    setStorageItem(STORAGE_KEYS.LOCATION_PERMISSION, 'true')
    setHasAskedBefore(true)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mountedRef.current) return
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
        setPermissionState('granted')
        setLoading(false)
        setError(null)
      },
      (err) => {
        if (!mountedRef.current) return
        logger.warn('Geolocation error:', err.message)
        // GeolocationPositionError codes:
        //   1 PERMISSION_DENIED — real denial, don't auto-reprompt.
        //   2 POSITION_UNAVAILABLE — GPS/network failed, retryable.
        //   3 TIMEOUT — too slow, retryable.
        // Previously every code collapsed to permissionState='denied',
        // which caused promptForLocation() to refuse to retry on the next
        // call. Branch the codes so transient failures stay retryable.
        if (err.code === 1) {
          setPermissionState('denied')
          setError('denied')
        } else {
          setError(err.code === 3 ? 'timeout' : 'unavailable')
          // Leave permissionState as-is so a later promptForLocation()
          // can issue a fresh request.
        }
        setLocation(DEFAULT_LOCATION)
        setLoading(false)
      },
      {
        enableHighAccuracy: false,
        timeout: 5000, // 5 second timeout - don't make users wait
        maximumAge: 300000, // Cache for 5 minutes
      }
    )
  }, [fetchCurrentPositionNative])

  // Check permission state on mount and auto-request location if already granted
  useEffect(() => {
    if (isNative) {
      // checkPermissions() NEVER prompts — it only reads cached OS state.
      // If already granted, fetch position silently (no native dialog).
      Geolocation.checkPermissions()
        .then((perm) => {
          if (!mountedRef.current) return
          // 'prompt-with-rationale' is an Android-only state; iOS returns
          // prompt|granted|denied. Normalize to 'prompt' just in case.
          const normalized = perm.location === 'prompt-with-rationale' ? 'prompt' : perm.location
          setPermissionState(normalized)
          if (normalized === 'granted') {
            // Silent fetch — bypasses requestPermissions() so no dialog fires.
            fetchCurrentPositionNative()
          }
        })
        .catch((err) => {
          if (!mountedRef.current) return
          logger.warn('Native checkPermissions failed:', err?.message || err)
        })
      return
    }

    if (!navigator.geolocation) {
      setPermissionState('unsupported')
      return
    }

    let permissionStatus = null
    let handlePermissionChange = null

    // Check permission API if available
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        permissionStatus = result
        setPermissionState(result.state)

        // Auto-request only if permission was previously granted
        if (result.state === 'granted') {
          requestLocation()
        }

        // Listen for permission changes
        handlePermissionChange = () => {
          setPermissionState(result.state)
          if (result.state === 'granted') {
            requestLocation()
          }
        }

        result.addEventListener('change', handlePermissionChange)
      }).catch(() => {
        // Permission API not supported, will prompt on request
      })
    }

    // Cleanup function to remove listener when component unmounts
    return () => {
      if (permissionStatus && handlePermissionChange) {
        permissionStatus.removeEventListener('change', handlePermissionChange)
      }
    }
  }, [requestLocation, fetchCurrentPositionNative])

  const useDefaultLocation = useCallback(() => {
    setLocation(DEFAULT_LOCATION)
    setError(null)
    setLoading(false)
  }, [])

  // Components call this to trigger location permission on demand.
  // Won't re-prompt if user already denied — avoids nagging.
  const promptForLocation = useCallback(() => {
    if (permissionState === 'denied' || permissionState === 'unsupported') {
      return
    }
    if (permissionState === 'granted') {
      // Already granted — just refresh the position
      requestLocation()
      return
    }
    requestLocation()
  }, [permissionState, requestLocation])

  const isUsingDefault = location?.lat === DEFAULT_LOCATION.lat && location?.lng === DEFAULT_LOCATION.lng

  return (
    <LocationContext.Provider value={{
      location,
      radius,
      setRadius,
      region,
      loading,
      error,
      permissionState,
      hasAskedBefore,
      requestLocation,
      promptForLocation,
      useDefaultLocation,
      isUsingDefault,
    }}>
      {children}
    </LocationContext.Provider>
  )
}

export function useLocationContext() {
  const context = useContext(LocationContext)
  if (!context) {
    throw new Error('useLocationContext must be used within a LocationProvider')
  }
  return context
}
