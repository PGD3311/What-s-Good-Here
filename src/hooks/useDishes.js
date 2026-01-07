import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useDishes(location, radius, category = null, restaurantId = null) {
  const [dishes, setDishes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!location) return

    async function fetchDishes() {
      try {
        setLoading(true)
        setError(null)

        // If restaurant is selected, fetch dishes directly from the dishes table
        if (restaurantId) {
          let query = supabase
            .from('dishes')
            .select(`
              id,
              name,
              category,
              price,
              photo_url,
              restaurant_id,
              restaurants (
                id,
                name,
                address,
                lat,
                lng
              )
            `)
            .eq('restaurant_id', restaurantId)

          // Apply category filter if selected
          if (category) {
            query = query.eq('category', category)
          }

          const { data: dishesData, error: dishesError } = await query

          if (dishesError) throw dishesError

          // Transform data to match the format from get_ranked_dishes
          const transformedData = dishesData.map(dish => ({
            dish_id: dish.id,
            dish_name: dish.name,
            restaurant_name: dish.restaurants.name,
            category: dish.category,
            price: dish.price,
            photo_url: dish.photo_url,
            total_votes: 0,
            yes_votes: 0,
            percent_worth_it: 0,
            distance_miles: 0,
          }))

          setDishes(transformedData)
        } else {
          // Use the RPC function for location-based search
          const { data, error: rpcError } = await supabase.rpc('get_ranked_dishes', {
            user_lat: location.lat,
            user_lng: location.lng,
            radius_miles: radius,
            filter_category: category,
          })

          if (rpcError) {
            throw rpcError
          }

          setDishes(data || [])
        }
      } catch (err) {
        console.error('Error fetching dishes:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchDishes()
  }, [location, radius, category, restaurantId])

  const refetch = async () => {
    if (!location) return

    try {
      setLoading(true)

      if (restaurantId) {
        let query = supabase
          .from('dishes')
          .select(`
            id,
            name,
            category,
            price,
            photo_url,
            restaurant_id,
            restaurants (
              id,
              name,
              address,
              lat,
              lng
            )
          `)
          .eq('restaurant_id', restaurantId)

        if (category) {
          query = query.eq('category', category)
        }

        const { data: dishesData, error: dishesError } = await query

        if (dishesError) throw dishesError

        const transformedData = dishesData.map(dish => ({
          dish_id: dish.id,
          dish_name: dish.name,
          restaurant_name: dish.restaurants.name,
          category: dish.category,
          price: dish.price,
          photo_url: dish.photo_url,
          total_votes: 0,
          yes_votes: 0,
          percent_worth_it: 0,
          distance_miles: 0,
        }))

        setDishes(transformedData)
      } else {
        const { data, error: rpcError } = await supabase.rpc('get_ranked_dishes', {
          user_lat: location.lat,
          user_lng: location.lng,
          radius_miles: radius,
          filter_category: category,
        })

        if (rpcError) throw rpcError
        setDishes(data || [])
      }
    } catch (err) {
      console.error('Error refetching dishes:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return {
    dishes,
    loading,
    error,
    refetch,
  }
}
