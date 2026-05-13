export type VideoSourceType = 'official' | 'fan'

export type BilibiliVideo = {
  id: string
  title: string
  cover: string
  url: string
  sourceType: VideoSourceType
  note?: string
}

export type Activity = {
  id: string
  slug: string
  title: string
  date: string
  year: number
  city: string
  venue: string
  venueAddress?: string
  latitude: number
  longitude: number
  markerThumbnail: string
  coverImage: string
  summary: string
  description: string
  eventType: string
  members: string[]
  tags: string[]
  bilibiliVideos: BilibiliVideo[]
}
