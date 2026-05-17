import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { useLocationContext } from '../context/LocationContext'
import { restaurantsApi } from '../api/restaurantsApi'
import { dishesApi } from '../api/dishesApi'
import { votesApi } from '../api/votesApi'
import { createClassifiedError } from '../utils/errorHandler'
import { logger } from '../utils/logger'
import { useDishes } from '../hooks/useDishes'
import { useDishPhotos } from '../hooks/useDishPhotos'
import { LoginModal } from '../components/Auth/LoginModal'
import { DishSelector, buildDishSections } from '../components/rate-meal/DishSelector'
import { BatchRatingCard } from '../components/rate-meal/BatchRatingCard'
import { BatchSummary } from '../components/rate-meal/BatchSummary'
import { AddPhotoNudge } from '../components/AddPhotoNudge'
import { useProfile } from '../hooks/useProfile'
import { getStorageItem, STORAGE_KEYS } from '../lib/storage'

function getDishClientId(dishId) {
  return 'dish-' + dishId
}

function getSpecialClientId(specialDishName) {
  return 'special-' + specialDishName.trim().toLowerCase().replace(/\s+/g, '-')
}

function createInitialRatingState(previousValue) {
  return previousValue || {
    rating10: 0,
    reviewText: '',
    photoFile: null,
  }
}

export function RateYourMeal() {
  var { restaurantId } = useParams()
  var navigate = useNavigate()
  var queryClient = useQueryClient()
  var { user } = useAuth()
  var { location, radius } = useLocationContext()
  var { uploadPhoto, uploading, analyzing } = useDishPhotos()
  var { profile, refetch: refetchProfile } = useProfile(user?.id)

  var [step, setStep] = useState('select')
  var [photoNudgeOpen, setPhotoNudgeOpen] = useState(false)
  var photoNudgeTimerRef = useRef(null)
  var [currentIndex, setCurrentIndex] = useState(0)
  var [searchQuery, setSearchQuery] = useState('')
  var [loginModalOpen, setLoginModalOpen] = useState(false)
  var [selectedDishIds, setSelectedDishIds] = useState({})
  var [specialDishEnabled, setSpecialDishEnabled] = useState(false)
  var [specialDishName, setSpecialDishName] = useState('')
  var [selectedDishes, setSelectedDishes] = useState([])
  var [ratingsById, setRatingsById] = useState({})
  var [submitError, setSubmitError] = useState(null)
  var [successCount, setSuccessCount] = useState(0)
  var [uploadStatus, setUploadStatus] = useState('')

  var { data: restaurant, isLoading: restaurantLoading, error: restaurantError } = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: function () {
      return restaurantsApi.getById(restaurantId)
    },
    enabled: !!restaurantId,
  })

  var { dishes, loading: dishesLoading, error: dishesError } = useDishes(location, radius, null, restaurantId)

  useEffect(function () {
    if (!user) {
      setLoginModalOpen(true)
    }
  }, [user])

  useEffect(function () {
    return function () {
      if (photoNudgeTimerRef.current) clearTimeout(photoNudgeTimerRef.current)
    }
  }, [])

  var submitMutation = useMutation({
    mutationFn: async function () {
      var resolvedDishes = selectedDishes.slice()

      try {
        var votes = []

        for (var i = 0; i < resolvedDishes.length; i += 1) {
          var dish = resolvedDishes[i]
          var rating = ratingsById[dish.clientId]
          var resolvedDish = dish

          if (resolvedDish.isSpecial && !resolvedDish.dishId) {
            var createdDish = await dishesApi.create({
              restaurantId,
              name: resolvedDish.name,
              category: resolvedDish.category || 'Special',
              price: null,
            })

            resolvedDish = {
              ...resolvedDish,
              dishId: createdDish.id,
              category: createdDish.category || resolvedDish.category,
            }
            resolvedDishes[i] = resolvedDish
          }

          if (rating.photoFile) {
            setUploadStatus('Uploading photo for ' + resolvedDish.name)
            await uploadPhoto(resolvedDish.dishId, rating.photoFile)
          }

          votes.push({
            dishId: resolvedDish.dishId,
            rating10: rating.rating10,
            reviewText: rating.reviewText,
          })
        }

        setUploadStatus('')

        var result = await votesApi.submitBatchVotes({ votes: votes })
        return {
          result: result,
          resolvedDishes: resolvedDishes,
        }
      } catch (error) {
        logger.error('Error submitting rate-your-meal batch:', error)
        var classifiedError = error.type ? error : createClassifiedError(error)
        classifiedError.resolvedDishes = classifiedError.resolvedDishes || resolvedDishes
        throw classifiedError
      }
    },
    onSuccess: function (data) {
      setUploadStatus('')
      setSubmitError(null)
      setSelectedDishes(data.resolvedDishes)
      setSuccessCount(data.result.submittedCount || data.result.submittedDishIds.length)
      setStep('success')

      queryClient.invalidateQueries({ queryKey: ['dishes'] })
      queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] })

      if (user && profile && !profile.avatar_url && !getStorageItem(STORAGE_KEYS.HAS_SEEN_PHOTO_NUDGE)) {
        photoNudgeTimerRef.current = setTimeout(function () { setPhotoNudgeOpen(true) }, 700)
      }
    },
    onError: function (error) {
      setUploadStatus('')
      if (error.resolvedDishes) {
        setSelectedDishes(error.resolvedDishes)
      }
      setSubmitError(error)
      setStep('summary')
    },
  })

  function handleToggleDish(dish) {
    setSelectedDishIds(function (previous) {
      var next = { ...previous }
      if (next[dish.dish_id]) {
        delete next[dish.dish_id]
      } else {
        next[dish.dish_id] = true
      }
      return next
    })
  }

  function buildSelectedDishes() {
    var sections = buildDishSections(dishes, restaurant?.menu_section_order || [], '')
    var nextSelectedDishes = []

    sections.forEach(function (section) {
      section.dishes.forEach(function (dish) {
        if (selectedDishIds[dish.dish_id]) {
          nextSelectedDishes.push({
            clientId: getDishClientId(dish.dish_id),
            dishId: dish.dish_id,
            name: dish.dish_name,
            category: dish.category || section.name,
            menuSection: dish.menu_section || section.name,
            isSpecial: false,
          })
        }
      })
    })

    if (specialDishEnabled && specialDishName.trim()) {
      nextSelectedDishes.push({
        clientId: getSpecialClientId(specialDishName),
        dishId: null,
        name: specialDishName.trim(),
        category: 'Special',
        menuSection: 'Special',
        isSpecial: true,
      })
    }

    return nextSelectedDishes
  }

  function handleContinueFromSelector() {
    var nextSelectedDishes = buildSelectedDishes()
    if (nextSelectedDishes.length === 0) {
      return
    }

    setSelectedDishes(nextSelectedDishes)
    setRatingsById(function (previous) {
      var next = {}
      nextSelectedDishes.forEach(function (dish) {
        next[dish.clientId] = createInitialRatingState(previous[dish.clientId])
      })
      return next
    })
    setSubmitError(null)
    setCurrentIndex(0)
    setStep('rate')
  }

  function handleRatingChange(clientId, nextValue) {
    setRatingsById(function (previous) {
      return {
        ...previous,
        [clientId]: nextValue,
      }
    })
  }

  function handleBack() {
    if (step === 'select') {
      navigate('/restaurants/' + restaurantId)
      return
    }

    if (step === 'rate') {
      if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1)
        return
      }

      setStep('select')
      return
    }

    if (step === 'summary') {
      setCurrentIndex(selectedDishes.length > 0 ? selectedDishes.length - 1 : 0)
      setStep('rate')
      return
    }

    navigate('/restaurants/' + restaurantId)
  }

  function handleNextCard() {
    if (currentIndex >= selectedDishes.length - 1) {
      setSubmitError(null)
      setStep('summary')
      return
    }

    setCurrentIndex(currentIndex + 1)
  }

  function handleEditDish(index) {
    setCurrentIndex(index)
    setStep('rate')
  }

  function handleSubmitAll() {
    setSubmitError(null)
    submitMutation.mutate()
  }

  if (restaurantLoading || dishesLoading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <div className="px-4 py-6 space-y-4 animate-pulse">
          <div className="h-10 w-40 rounded" style={{ background: 'var(--color-surface-elevated)' }} />
          <div className="h-64 rounded-3xl" style={{ background: 'var(--color-card)' }} />
          <div className="h-16 rounded-2xl" style={{ background: 'var(--color-card)' }} />
        </div>
      </div>
    )
  }

  if (restaurantError || dishesError) {
    var errorMessage = restaurantError?.message || dishesError?.message || 'Failed to load this restaurant'
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center">
          <p className="text-sm mb-4" style={{ color: 'var(--color-danger)' }}>
            {errorMessage}
          </p>
          <button
            onClick={function () { navigate('/restaurants/' + restaurantId) }}
            className="px-5 py-2.5 rounded-xl font-semibold"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
          >
            Back to Restaurant
          </button>
        </div>
      </div>
    )
  }

  if (!restaurant) {
    return null
  }

  if (!user) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
          <div
            className="rounded-3xl px-5 py-6 text-center"
            style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-divider)',
            }}
          >
            <h1
              style={{
                fontFamily: "'Amatic SC', cursive",
                fontSize: '34px',
                color: 'var(--color-text-primary)',
              }}
            >
              Sign in to Rate Your Meal
            </h1>
            <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
              This flow saves a vote for each dish you ate.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={function () { navigate('/restaurants/' + restaurantId) }}
                className="flex-1 rounded-2xl py-3 font-semibold"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text-primary)', border: '1px solid var(--color-divider)' }}
              >
                Back
              </button>
              <button
                onClick={function () { setLoginModalOpen(true) }}
                className="flex-1 rounded-2xl py-3 font-semibold"
                style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
        <LoginModal
          isOpen={loginModalOpen}
          onClose={function () { setLoginModalOpen(false) }}
        />
      </>
    )
  }

  if ((dishes || []).length === 0 && step === 'select') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
        <div
          className="rounded-3xl px-5 py-6 text-center"
          style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-divider)',
          }}
        >
          <h1
            style={{
              fontFamily: "'Amatic SC', cursive",
              fontSize: '34px',
              color: 'var(--color-text-primary)',
            }}
          >
            No Menu Yet
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
            This restaurant needs dishes before the batch flow can start.
          </p>
          <button
            onClick={function () { navigate('/restaurants/' + restaurantId) }}
            className="mt-5 rounded-2xl px-5 py-3 font-semibold"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
          >
            Back to Restaurant
          </button>
        </div>
      </div>
    )
  }

  if (step === 'select') {
    return (
      <>
        <DishSelector
          dishes={dishes}
          loading={dishesLoading}
          error={dishesError}
          menuSectionOrder={restaurant.menu_section_order || []}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          selectedDishIds={selectedDishIds}
          specialDishEnabled={specialDishEnabled}
          specialDishName={specialDishName}
          onToggleDish={handleToggleDish}
          onSpecialToggle={function () { setSpecialDishEnabled(!specialDishEnabled) }}
          onSpecialDishNameChange={setSpecialDishName}
          onBack={handleBack}
          onContinue={handleContinueFromSelector}
        />
        <LoginModal
          isOpen={loginModalOpen}
          onClose={function () { setLoginModalOpen(false) }}
        />
      </>
    )
  }

  if (step === 'rate') {
    var currentDish = selectedDishes[currentIndex]

    return (
      <>
        <BatchRatingCard
          dish={currentDish}
          value={ratingsById[currentDish.clientId]}
          index={currentIndex}
          total={selectedDishes.length}
          onBack={handleBack}
          onNext={handleNextCard}
          onChange={function (nextValue) { handleRatingChange(currentDish.clientId, nextValue) }}
        />
        <LoginModal
          isOpen={loginModalOpen}
          onClose={function () { setLoginModalOpen(false) }}
        />
      </>
    )
  }

  if (step === 'summary') {
    return (
      <>
        <BatchSummary
          restaurantName={restaurant.name}
          dishes={selectedDishes}
          ratingsById={ratingsById}
          onBack={handleBack}
          onEdit={handleEditDish}
          onSubmit={handleSubmitAll}
          submitting={submitMutation.isPending}
          submitError={submitError}
          uploadStatus={uploading || analyzing ? uploadStatus || 'Uploading photo...' : ''}
        />
        <LoginModal
          isOpen={loginModalOpen}
          onClose={function () { setLoginModalOpen(false) }}
        />
      </>
    )
  }

  return (
    <>
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
        <div
          className="rounded-[32px] px-6 py-8 text-center"
          style={{
            background: 'linear-gradient(180deg, var(--color-primary-muted), var(--color-card))',
            border: '1px solid var(--color-divider)',
          }}
        >
          <div
            className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h1
            className="mt-5"
            style={{
              fontFamily: "'Amatic SC', cursive",
              fontSize: '40px',
              color: 'var(--color-text-primary)',
            }}
          >
            Meal Rated
          </h1>
          <p className="text-base font-semibold mt-2" style={{ color: 'var(--color-text-primary)' }}>
            Rated {successCount} dish{successCount === 1 ? '' : 'es'} at {restaurant.name}
          </p>
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
            Every dish was saved as its own vote.
          </p>
          <button
            onClick={function () { navigate('/restaurants/' + restaurantId) }}
            className="mt-6 w-full rounded-2xl py-3.5 font-bold"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
          >
            Back to Restaurant
          </button>
        </div>
      </div>
      <LoginModal
        isOpen={loginModalOpen}
        onClose={function () { setLoginModalOpen(false) }}
      />
      <AddPhotoNudge
        isOpen={photoNudgeOpen}
        onClose={function () { setPhotoNudgeOpen(false) }}
        onUploaded={refetchProfile}
      />
    </>
  )
}
