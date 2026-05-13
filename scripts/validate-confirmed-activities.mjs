import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const confirmedActivitiesPath = path.join(rootDir, 'src', 'data', 'confirmedActivities.json')
const venueCoordinatesPath = path.join(rootDir, 'src', 'data', 'venueCoordinates.json')

const REQUIRED_STRING_FIELDS = [
  'id',
  'slug',
  'title',
  'date',
  'city',
  'venue',
  'markerThumbnail',
  'coverImage',
  'summary',
  'description',
  'eventType',
]

const readJson = async (filePath, fallback) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback
    }
    throw error
  }
}

const isNonEmptyString = (value) =>
  typeof value === 'string' && value.trim().length > 0

const isFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value)

const isValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return false
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime())
}

const extractBvid = (value) =>
  typeof value === 'string' ? value.match(/BV[a-zA-Z0-9]{8,}/)?.[0] ?? null : null

const buildVenueLookup = (venueCoordinates) =>
  new Set(
    venueCoordinates.flatMap((venue) => [
      `${venue.city}::${venue.name}`,
      ...(venue.aliases ?? []).map((alias) => `${venue.city}::${alias}`),
    ])
  )

const hasKnownVenueCoordinate = (venueLookup, city, venue) =>
  isNonEmptyString(city) && isNonEmptyString(venue) && venueLookup.has(`${city}::${venue}`)

const isRemoteImagePath = (value) =>
  typeof value === 'string' && /^https:\/\//.test(value)

const isFormalLocalImagePath = (value) =>
  typeof value === 'string' && value.startsWith('/images/')

const imagePublicFileExists = async (value) => {
  const normalizedPath = value.replace(/^\/+/, '').replace(/\//g, path.sep)
  const filePath = path.join(rootDir, 'public', normalizedPath)

  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const validateImagePath = async (value, label, prefix) => {
  const errors = []

  if (!isNonEmptyString(value)) {
    errors.push(`${prefix}: ${label} is required`)
    return errors
  }

  if (isRemoteImagePath(value)) {
    return errors
  }

  if (!isFormalLocalImagePath(value)) {
    errors.push(`${prefix}: ${label} must use /images/... or an https URL`)
    return errors
  }

  if (!(await imagePublicFileExists(value))) {
    errors.push(`${prefix}: ${label} file does not exist under public${value}`)
  }

  return errors
}

const validateActivity = async (activity, index, venueLookup) => {
  const prefix = `activity[${index}] ${activity?.id ?? '(missing id)'}`
  const errors = []

  if (!activity || typeof activity !== 'object' || Array.isArray(activity)) {
    return [`${prefix}: record must be an object`]
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!isNonEmptyString(activity[field])) {
      errors.push(`${prefix}: missing required string field "${field}"`)
    }
  }

  if (!isValidDate(activity.date)) {
    errors.push(`${prefix}: date must use YYYY-MM-DD`)
  }

  if (!Number.isInteger(activity.year)) {
    errors.push(`${prefix}: year must be an integer`)
  } else if (isValidDate(activity.date)) {
    const dateYear = Number.parseInt(activity.date.slice(0, 4), 10)
    if (activity.year !== dateYear) {
      errors.push(`${prefix}: year ${activity.year} does not match date ${activity.date}`)
    }
  }

  if (!isFiniteNumber(activity.latitude) || activity.latitude < -90 || activity.latitude > 90) {
    errors.push(`${prefix}: latitude must be a number from -90 to 90`)
  }

  if (!isFiniteNumber(activity.longitude) || activity.longitude < -180 || activity.longitude > 180) {
    errors.push(`${prefix}: longitude must be a number from -180 to 180`)
  }

  if (!Array.isArray(activity.members) || activity.members.length === 0) {
    errors.push(`${prefix}: members must be a non-empty array`)
  }

  if (!Array.isArray(activity.tags)) {
    errors.push(`${prefix}: tags must be an array`)
  }

  if (!Array.isArray(activity.bilibiliVideos) || activity.bilibiliVideos.length === 0) {
    errors.push(`${prefix}: bilibiliVideos must contain at least one source link`)
  } else {
    for (const [videoIndex, video] of activity.bilibiliVideos.entries()) {
      if (!isNonEmptyString(video.id)) {
        errors.push(`${prefix}: bilibiliVideos[${videoIndex}] missing id`)
      }
      if (!isNonEmptyString(video.title)) {
        errors.push(`${prefix}: bilibiliVideos[${videoIndex}] missing title`)
      }
      if (!isNonEmptyString(video.cover)) {
        if (!extractBvid(video.url)) {
          errors.push(
            `${prefix}: bilibiliVideos[${videoIndex}] missing cover; add a cover or use a Bilibili BV URL for runtime cover lookup`
          )
        }
      } else {
        const coverErrors = await validateImagePath(
          video.cover,
          `bilibiliVideos[${videoIndex}].cover`,
          prefix
        )

        if (coverErrors.length > 0 && !extractBvid(video.url)) {
          errors.push(...coverErrors)
        }
      }
      if (!isNonEmptyString(video.url) || !video.url.startsWith('https://')) {
        errors.push(`${prefix}: bilibiliVideos[${videoIndex}] url must be an https link`)
      }
      if (!['official', 'fan'].includes(video.sourceType)) {
        errors.push(`${prefix}: bilibiliVideos[${videoIndex}] sourceType must be official or fan`)
      }
    }
  }

  if (!hasKnownVenueCoordinate(venueLookup, activity.city, activity.venue)) {
    errors.push(
      `${prefix}: venue must exist in src/data/venueCoordinates.json before it can enter the map`
    )
  }

  errors.push(...(await validateImagePath(activity.markerThumbnail, 'markerThumbnail', prefix)))
  errors.push(...(await validateImagePath(activity.coverImage, 'coverImage', prefix)))

  return errors
}

const main = async () => {
  const confirmedActivities = await readJson(confirmedActivitiesPath, [])
  const venueCoordinates = await readJson(venueCoordinatesPath, [])
  const venueLookup = buildVenueLookup(venueCoordinates)
  const errors = []

  if (!Array.isArray(confirmedActivities)) {
    errors.push('confirmedActivities.json must contain an array')
  }

  if (!Array.isArray(venueCoordinates)) {
    errors.push('venueCoordinates.json must contain an array')
  }

  const ids = new Map()
  const slugs = new Map()

  if (Array.isArray(confirmedActivities)) {
    for (const [index, activity] of confirmedActivities.entries()) {
      errors.push(...(await validateActivity(activity, index, venueLookup)))

      if (isNonEmptyString(activity?.id)) {
        if (ids.has(activity.id)) {
          errors.push(`activity[${index}] ${activity.id}: duplicate id also used at activity[${ids.get(activity.id)}]`)
        }
        ids.set(activity.id, index)
      }

      if (isNonEmptyString(activity?.slug)) {
        if (slugs.has(activity.slug)) {
          errors.push(
            `activity[${index}] ${activity.id}: duplicate slug also used at activity[${slugs.get(activity.slug)}]`
          )
        }
        slugs.set(activity.slug, index)
      }
    }
  }

  if (errors.length > 0) {
    console.error('Activity validation failed:')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exitCode = 1
    return
  }

  console.log(`Validated ${confirmedActivities.length} confirmed activities.`)
  if (confirmedActivities.length === 0) {
    console.log('No confirmed activities yet; the app will continue to use mockActivities fallback.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
