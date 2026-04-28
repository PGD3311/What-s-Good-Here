import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './context/AuthContext'
import { LocationProvider } from './context/LocationContext'

import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout } from './components/Layout'
import { BottomNav } from './components/BottomNav'
import { ProtectedRoute } from './components/ProtectedRoute'
import { WelcomeModal } from './components/Auth/WelcomeModal'
import { AuthLifecycle } from './components/Auth/AuthLifecycle'
import { RouteProgress } from './components/RouteProgress'
import { preloadSounds } from './lib/sounds'
import { preloadCategoryImages } from './constants/categories'
import { isChunkLoadError, tryChunkReload, clearChunkReloadState } from './utils/chunkReload'

function lazyWithRetry(importFn, namedExport) {
  return lazy(() =>
    importFn()
      .then(m => {
        clearChunkReloadState()
        return { default: namedExport ? m[namedExport] : m.default }
      })
      .catch((error) => {
        if (isChunkLoadError(error) && tryChunkReload()) {
          return { default: () => null }
        }
        throw error
      })
  )
}

// Lazy load pages for code splitting
const Browse = lazyWithRetry(() => import('./pages/Browse'), 'Browse')
const Dish = lazyWithRetry(() => import('./pages/Dish'), 'Dish')
const Restaurants = lazyWithRetry(() => import('./pages/Restaurants'), 'Restaurants')
const RestaurantDetail = lazyWithRetry(() => import('./pages/RestaurantDetail'), 'RestaurantDetail')
const RateYourMeal = lazyWithRetry(() => import('./pages/RateYourMeal'), 'RateYourMeal')
const Profile = lazyWithRetry(() => import('./pages/Profile'), 'Profile')
const Admin = lazyWithRetry(() => import('./pages/Admin'), 'Admin')
const Login = lazyWithRetry(() => import('./pages/Login'), 'Login')
const Privacy = lazyWithRetry(() => import('./pages/Privacy'), 'Privacy')
const Terms = lazyWithRetry(() => import('./pages/Terms'), 'Terms')
const Support = lazyWithRetry(() => import('./pages/Support'), 'Support')
const UserProfile = lazyWithRetry(() => import('./pages/UserProfile'), 'UserProfile')
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword'), 'ResetPassword')
const CrossDevicePkce = lazyWithRetry(() => import('./pages/CrossDevicePkce'))
const AcceptInvite = lazyWithRetry(() => import('./pages/AcceptInvite'), 'AcceptInvite')
const AcceptCuratorInvite = lazyWithRetry(() => import('./pages/AcceptCuratorInvite'), 'AcceptCuratorInvite')
const MyList = lazyWithRetry(() => import('./pages/MyList'), 'MyList')
const ManageRestaurant = lazyWithRetry(() => import('./pages/ManageRestaurant'), 'ManageRestaurant')
const MapPage = lazyWithRetry(() => import('./pages/Map'), 'Map')
const HowReviewsWork = lazyWithRetry(() => import('./pages/HowReviewsWork'), 'HowReviewsWork')
const ForRestaurants = lazyWithRetry(() => import('./pages/ForRestaurants'), 'ForRestaurants')
const JitterLanding = lazyWithRetry(() => import('./pages/JitterLanding'))
const RestaurantReviews = lazyWithRetry(() => import('./pages/RestaurantReviews'), 'RestaurantReviews')
const PlaylistPage = lazyWithRetry(() => import('./pages/Playlist'), 'Playlist')
const Locals = lazyWithRetry(() => import('./pages/Locals'), 'Locals')
const LocalsCurator = lazyWithRetry(() => import('./pages/LocalsCurator'), 'LocalsCurator')
const NotFound = lazyWithRetry(() => import('./pages/NotFound'), 'NotFound')

// Prefetch functions for smoother navigation - call on hover/focus
export const prefetchRoutes = {
  browse: () => import('./pages/Browse'),
  dish: () => import('./pages/Dish'),
  map: () => import('./pages/Map'),
  restaurants: () => import('./pages/Restaurants'),
  restaurantDetail: () => import('./pages/RestaurantDetail'),
  profile: () => import('./pages/Profile'),
}

// Loading fallback
const PageLoader = () => (
  <div
    role="status"
    aria-label="Loading page"
    className="min-h-screen flex items-center justify-center"
    style={{ background: 'var(--color-surface)' }}
  >
    <div className="animate-pulse text-center">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full" style={{ background: 'var(--color-divider)' }} />
      <div className="h-4 w-24 mx-auto rounded" style={{ background: 'var(--color-divider)' }} />
      <span className="sr-only">Loading...</span>
    </div>
  </div>
)

function App() {
  // Preload sounds and category images on app start
  useEffect(() => {
    preloadSounds()
    preloadCategoryImages()
  }, [])

  return (
    <ErrorBoundary>
      <Toaster
        position="top-center"
        richColors
        expand={false}
        duration={4000}
        closeButton
        toastOptions={{
          style: {
            padding: '16px',
            borderRadius: '12px',
          },
        }}
      />
      <AuthProvider>
      <LocationProvider>
        <BrowserRouter>
          <AuthLifecycle />
          <RouteProgress />
          <WelcomeModal />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<><MapPage /><BottomNav /></>} />
              <Route path="/map" element={<Navigate to="/" replace />} />
              <Route path="/browse" element={<Layout><Browse /></Layout>} />
              <Route path="/dish/:dishId" element={<Layout><Dish /></Layout>} />
              <Route path="/restaurants" element={<Layout><Restaurants /></Layout>} />
              <Route path="/restaurants/:restaurantId" element={<Layout><RestaurantDetail /></Layout>} />
              <Route path="/restaurants/:restaurantId/rate" element={<Layout><RateYourMeal /></Layout>} />
              <Route path="/restaurants/:restaurantId/reviews" element={<Layout><RestaurantReviews /></Layout>} />
              <Route path="/profile" element={<ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>} />
              <Route path="/user/:userId" element={<Layout><UserProfile /></Layout>} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/auth/cross-device" element={<CrossDevicePkce />} />
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
              <Route path="/invite/:token" element={<AcceptInvite />} />
              <Route path="/curator-invite/:token" element={<AcceptCuratorInvite />} />
              <Route path="/my-list" element={<ProtectedRoute><Layout><MyList /></Layout></ProtectedRoute>} />
              <Route path="/manage" element={<ProtectedRoute><ManageRestaurant /></ProtectedRoute>} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/support" element={<Support />} />
              <Route path="/how-reviews-work" element={<Layout><HowReviewsWork /></Layout>} />
              <Route path="/for-restaurants" element={<ForRestaurants />} />
              <Route path="/playlist/:id" element={<Layout><PlaylistPage /></Layout>} />
              <Route path="/jitter" element={<Layout><JitterLanding /></Layout>} />
              <Route path="/locals" element={<Layout><Locals /></Layout>} />
              <Route path="/locals/:userId" element={<Layout><LocalsCurator /></Layout>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </LocationProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
