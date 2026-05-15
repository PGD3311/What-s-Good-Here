import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { votesApi } from './votesApi'

// Mock dependencies
vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../lib/analytics', () => ({
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
}))

vi.mock('../lib/rateLimiter', () => ({
  checkVoteRateLimit: vi.fn(() => ({ allowed: true })),
}))

vi.mock('../lib/reviewBlocklist', () => ({
  containsBlockedContent: vi.fn(() => false),
}))

vi.mock('./jitterApi', () => ({
  jitterApi: {
    getTrustBadgeType: vi.fn(() => null),
  },
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

import { supabase } from '../lib/supabase'
import { checkVoteRateLimit } from '../lib/rateLimiter'
import { containsBlockedContent } from '../lib/reviewBlocklist'
import { capture } from '../lib/analytics'

describe('votesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: rate limit allows, no blocked content
    checkVoteRateLimit.mockReturnValue({ allowed: true })
    containsBlockedContent.mockReturnValue(false)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('submitVote', () => {
    const mockUser = { id: 'user-1' }

    beforeEach(() => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
      supabase.rpc.mockResolvedValue({ data: { allowed: true }, error: null })
    })

    it('should submit a basic vote successfully', async () => {
      supabase.rpc
        .mockResolvedValueOnce({ data: { allowed: true }, error: null })
        .mockResolvedValueOnce({ data: { id: 'vote-1' }, error: null })

      const result = await votesApi.submitVote({
        dishId: 'dish-1',
        rating10: 8,
      })

      expect(supabase.rpc).toHaveBeenCalledWith('submit_vote_atomic', expect.objectContaining({
        p_dish_id: 'dish-1',
        p_user_id: 'user-1',
        p_rating_10: 8,
      }))
      // Binary field must NOT be in the payload any more — server derives from rating.
      const submitCall = supabase.rpc.mock.calls.find(call => call[0] === 'submit_vote_atomic')
      expect(submitCall[1]).not.toHaveProperty('p_would_order_again')
      expect(result).toEqual({ success: true, vote: { id: 'vote-1' } })
    })

    it('should submit vote with review text', async () => {
      supabase.rpc
        .mockResolvedValueOnce({ data: { allowed: true }, error: null })
        .mockResolvedValueOnce({ data: { id: 'vote-1' }, error: null })

      await votesApi.submitVote({
        dishId: 'dish-1',
        rating10: 9,
        reviewText: 'Amazing lobster roll!',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('submit_vote_atomic', expect.objectContaining({
        p_review_text: 'Amazing lobster roll!',
      }))
    })

    it('should trim review text and treat empty string as null', async () => {
      supabase.rpc
        .mockResolvedValueOnce({ data: { allowed: true }, error: null })
        .mockResolvedValueOnce({ data: { id: 'vote-1' }, error: null })

      await votesApi.submitVote({
        dishId: 'dish-1',
        rating10: 8,
        reviewText: '   ',
      })

      const submitCall = supabase.rpc.mock.calls.find(call => call[0] === 'submit_vote_atomic')
      expect(submitCall[1].p_review_text).toBeNull()
    })

    it('should throw if client rate limit exceeded', async () => {
      checkVoteRateLimit.mockReturnValue({
        allowed: false,
        message: 'Too many votes, slow down!',
      })

      await expect(votesApi.submitVote({
        dishId: 'dish-1',
        rating10: 8,
      })).rejects.toThrow('Too many votes, slow down!')
    })

    it('should throw if review exceeds max length', async () => {
      const longReview = 'a'.repeat(300) // MAX_REVIEW_LENGTH is 200

      await expect(votesApi.submitVote({
        dishId: 'dish-1',
        rating10: 8,
        reviewText: longReview,
      })).rejects.toThrow(/characters over limit/)
    })

    it('should throw if review contains blocked content', async () => {
      containsBlockedContent.mockReturnValue(true)

      await expect(votesApi.submitVote({
        dishId: 'dish-1',
        rating10: 8,
        reviewText: 'inappropriate content here',
      })).rejects.toThrow('Review contains inappropriate content')
    })

    it('should throw if user not authenticated', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } })

      await expect(votesApi.submitVote({
        dishId: 'dish-1',
        rating10: 8,
      })).rejects.toThrow('You must be logged in to vote')
    })

    it('should throw if server rate limit exceeded', async () => {
      supabase.rpc.mockResolvedValue({
        data: { allowed: false, message: 'Server rate limit exceeded' },
        error: null,
      })

      await expect(votesApi.submitVote({
        dishId: 'dish-1',
        rating10: 8,
      })).rejects.toThrow('Server rate limit exceeded')
    })

    it('should block vote if server rate limit check fails (fail closed)', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })

      await expect(votesApi.submitVote({
        dishId: 'dish-1',
        rating10: 8,
      })).rejects.toThrow('Unable to verify vote limit. Please try again.')
    })

    it('emits rating_submitted with clean payload (no binary fields)', async () => {
      supabase.rpc
        .mockResolvedValueOnce({ data: { allowed: true }, error: null })
        .mockResolvedValueOnce({ data: { id: 'vote-1' }, error: null })

      await votesApi.submitVote({
        dishId: 'dish-1',
        rating10: 8,
        reviewText: 'Great!',
      })

      expect(capture).toHaveBeenCalledWith('rating_submitted', {
        dish_id: 'dish-1',
        rating: 8,
        has_review: true,
      })
      // Phase 2: vote_submitted is gone, binary_removed property is gone
      const allCalls = capture.mock.calls.map(c => c[0])
      expect(allCalls).not.toContain('vote_submitted')
    })

    it('does not send p_would_order_again to submit_vote_atomic', async () => {
      supabase.rpc
        .mockResolvedValueOnce({ data: { allowed: true }, error: null })
        .mockResolvedValueOnce({ data: { id: 'vote-1' }, error: null })

      await votesApi.submitVote({
        dishId: 'dish-1',
        rating10: 8,
      })

      const submitCall = supabase.rpc.mock.calls.find(c => c[0] === 'submit_vote_atomic')
      expect(submitCall).toBeTruthy()
      expect(submitCall[1]).not.toHaveProperty('p_would_order_again')
    })

    it('should throw classified error on database failure', async () => {
      supabase.rpc
        .mockResolvedValueOnce({ data: { allowed: true }, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'DB error', code: 'PGRST' } })

      await expect(votesApi.submitVote({
        dishId: 'dish-1',
        rating10: 8,
      })).rejects.toThrow('DB error')
    })
  })

  describe('getUserVotes', () => {
    it('should return empty object if user not logged in', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } })

      const result = await votesApi.getUserVotes()

      expect(result).toEqual({})
    })

    it('should return votes as a map keyed by dish_id', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

      const mockVotes = [
        { dish_id: 'dish-1', rating_10: 9 },
        { dish_id: 'dish-2', rating_10: 5 },
      ]

      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mockVotes, error: null }),
        }),
      })

      const result = await votesApi.getUserVotes()

      expect(result).toEqual({
        'dish-1': { rating10: 9 },
        'dish-2': { rating10: 5 },
      })
    })

    it('should return empty object when no votes exist', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      })

      const result = await votesApi.getUserVotes()

      expect(result).toEqual({})
    })

    it('should throw classified error on failure', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'Query failed' } }),
        }),
      })

      await expect(votesApi.getUserVotes()).rejects.toThrow('Query failed')
    })
  })

  describe('getDetailedVotesForUser', () => {
    it('should return empty array if no userId', async () => {
      const result = await votesApi.getDetailedVotesForUser(null)
      expect(result).toEqual([])
    })

    it('should return detailed votes with dish info', async () => {
      const mockVotes = [
        {
          id: 'vote-1',
          rating_10: 9,
          created_at: '2024-01-01',
          dishes: {
            id: 'dish-1',
            name: 'Lobster Roll',
            category: 'seafood',
            price: 28,
            photo_url: 'url',
            avg_rating: 9.2,
            total_votes: 42,
            restaurants: { name: "Nancy's" },
          },
        },
      ]

      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: mockVotes, error: null }),
            }),
          }),
        }),
      })

      const result = await votesApi.getDetailedVotesForUser('user-1')

      expect(result).toEqual(mockVotes)
    })

    it('should throw classified error on failure', async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
            }),
          }),
        }),
      })

      await expect(votesApi.getDetailedVotesForUser('user-1')).rejects.toThrow('Error')
    })
  })

  describe('deleteVote', () => {
    it('should throw if not authenticated', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } })

      await expect(votesApi.deleteVote('dish-1')).rejects.toThrow('Not authenticated')
    })

    it('should delete vote successfully', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      supabase.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      })

      const result = await votesApi.deleteVote('dish-1')

      expect(result).toEqual({ success: true })
    })

    it('should throw classified error on failure', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      supabase.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: { message: 'Delete failed' } }),
          }),
        }),
      })

      await expect(votesApi.deleteVote('dish-1')).rejects.toThrow('Delete failed')
    })
  })

  describe('getDishesHelpedRank', () => {
    it('should return 0 if no userId', async () => {
      const result = await votesApi.getDishesHelpedRank(null)
      expect(result).toBe(0)
    })

    it('should return 0 if user has no votes', async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      })

      const result = await votesApi.getDishesHelpedRank('user-1')

      expect(result).toBe(0)
    })

    it('should count dishes with 5+ total votes', async () => {
      // User voted on 3 dishes - now uses single query with JOIN to dishes.total_votes
      const votesWithDishCounts = [
        { dish_id: 'dish-1', dishes: { total_votes: 5 } },  // 5 votes - ranked
        { dish_id: 'dish-2', dishes: { total_votes: 7 } },  // 7 votes - ranked
        { dish_id: 'dish-3', dishes: { total_votes: 3 } },  // 3 votes - not ranked
      ]

      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: votesWithDishCounts, error: null }),
        }),
      })

      const result = await votesApi.getDishesHelpedRank('user-1')

      expect(result).toBe(2) // dish-1 and dish-2 have 5+ votes
    })
  })

  describe('getReviewsForDish', () => {
    it('should fetch paginated reviews and enrich with profiles and trust badges', async () => {
      const mockVoteRows = [
        {
          id: 'review-1',
          review_text: 'Great!',
          rating_10: 9,
          review_created_at: '2024-01-01',
          user_id: 'user-1',
          source: null,
          source_metadata: null,
        },
      ]

      const mockProfiles = [{ id: 'user-1', display_name: 'John' }]

      // First call: votes query
      supabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    range: vi.fn().mockResolvedValue({ data: mockVoteRows, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
      })
      // Second call: profiles query
      supabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: mockProfiles, error: null }),
        }),
      })
      // Third call: jitter badges via RPC
      supabase.rpc.mockResolvedValueOnce({ data: [], error: null })

      const result = await votesApi.getReviewsForDish('dish-1', { limit: 10, offset: 0 })

      expect(result).toHaveLength(1)
      expect(result[0].review_text).toBe('Great!')
      expect(result[0].profiles).toEqual({ id: 'user-1', display_name: 'John' })
      // trust_badge is set by jitterApi.getTrustBadgeType (mocked to null)
      expect('trust_badge' in result[0]).toBe(true)
    })

    it('should throw classified error on failure', async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    range: vi.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
                  }),
                }),
              }),
            }),
          }),
        }),
      })

      await expect(votesApi.getReviewsForDish('dish-1')).rejects.toThrow('Error')
    })
  })

  describe('getSmartSnippetForDish', () => {
    it('should return best review sorted by rating then date, enriched with profile', async () => {
      const mockVoteRow = {
        review_text: 'Amazing!',
        rating_10: 10,
        review_created_at: '2024-01-01',
        user_id: 'user-1',
      }

      const mockProfile = { id: 'user-1', display_name: 'Foodie' }

      // First call: votes query
      supabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({ data: [mockVoteRow], error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      })
      // Second call: profile lookup
      supabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      })

      const result = await votesApi.getSmartSnippetForDish('dish-1')

      expect(result.review_text).toBe('Amazing!')
      expect(result.rating_10).toBe(10)
      expect(result.profiles).toEqual(mockProfile)
    })

    it('should return null when no reviews exist', async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      })

      const result = await votesApi.getSmartSnippetForDish('dish-1')

      expect(result).toBeNull()
    })

    it('should return null on error (graceful degradation)', async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      })

      const result = await votesApi.getSmartSnippetForDish('dish-1')

      expect(result).toBeNull()
    })
  })

  describe('getReviewsForUser', () => {
    it('should return empty array if no userId', async () => {
      const result = await votesApi.getReviewsForUser(null)
      expect(result).toEqual([])
    })

    it('should fetch paginated reviews with dish info', async () => {
      const mockReviews = [
        {
          id: 'review-1',
          review_text: 'Delicious!',
          rating_10: 9,
          review_created_at: '2024-01-01',
          dish_id: 'dish-1',
          dishes: {
            id: 'dish-1',
            name: 'Lobster Roll',
            photo_url: 'url',
            category: 'seafood',
            price: 28,
            restaurants: { name: "Nancy's" },
          },
        },
      ]

      const publicVotesRows = mockReviews.map(({ dishes, ...review }) => review)
      const dishRows = mockReviews.map(review => review.dishes)

      supabase.from
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    range: vi.fn().mockResolvedValue({ data: publicVotesRows, error: null }),
                  }),
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: dishRows,
              error: null,
            }),
          }),
        })

      const result = await votesApi.getReviewsForUser('user-1', { limit: 20, offset: 0 })

      expect(result).toEqual(mockReviews)
    })

    it('should return empty array on error (graceful degradation)', async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
                }),
              }),
            }),
          }),
        }),
      })

      const result = await votesApi.getReviewsForUser('user-1')

      expect(result).toEqual([])
    })
  })
})
