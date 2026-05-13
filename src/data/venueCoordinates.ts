import venueCoordinatesData from '@/data/venueCoordinates.json'

export type VenueCoordinate = {
  name: string
  city: string
  latitude: number
  longitude: number
  aliases?: string[]
}

export const venueCoordinates = venueCoordinatesData as VenueCoordinate[]

export const findVenueCoordinate = (
  city: string | undefined,
  venue: string | undefined
): VenueCoordinate | undefined => {
  if (!city || !venue) {
    return undefined
  }

  const normalizedVenue = venue.trim()
  return venueCoordinates.find((coordinate) => {
    if (coordinate.city !== city) {
      return false
    }

    if (coordinate.name === normalizedVenue) {
      return true
    }

    return coordinate.aliases?.includes(normalizedVenue) ?? false
  })
}
