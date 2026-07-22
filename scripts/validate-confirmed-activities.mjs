import { access, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const confirmedActivitiesPath = path.join(rootDir, 'src', 'data', 'confirmedActivities.json')
const venueCoordinatesPath = path.join(rootDir, 'src', 'data', 'venueCoordinates.json')
const markerThumbnailCropsPath = path.join(rootDir, 'scripts', 'marker-thumbnail-crops.json')

const MARKER_THUMBNAIL_PREFIX = '/images/activities/marker-thumbnails/'
const MARKER_THUMBNAIL_SIZE = 192
const MARKER_THUMBNAIL_MAX_BYTES = 50 * 1024
const MARKER_THUMBNAILS_MAX_TOTAL_BYTES = 100 * 1024

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

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0

const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0

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

const toPublicFilePath = (value) => {
  const normalizedPath = value.replace(/^\/+/, '').replace(/\//g, path.sep)
  return path.join(rootDir, 'public', normalizedPath)
}

const imageInspectionCache = new Map()

const inspectPublicImage = (value) => {
  const cached = imageInspectionCache.get(value)
  if (cached) {
    return cached
  }

  const filePath = toPublicFilePath(value)
  const inspection = Promise.all([sharp(filePath).metadata(), stat(filePath)]).then(
    ([metadata, fileStat]) => ({ metadata, size: fileStat.size })
  )
  imageInspectionCache.set(value, inspection)
  return inspection
}

const imagePublicFileExists = async (value) => {
  const filePath = toPublicFilePath(value)

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

const validateMarkerCropConfig = async (activities, config) => {
  const errors = []

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return ['marker-thumbnail-crops.json must contain an object']
  }
  if (!config.crops || typeof config.crops !== 'object' || Array.isArray(config.crops)) {
    return ['marker-thumbnail-crops.json must contain a crops object']
  }

  if (config.width !== MARKER_THUMBNAIL_SIZE || config.height !== MARKER_THUMBNAIL_SIZE) {
    errors.push(`marker thumbnails must be ${MARKER_THUMBNAIL_SIZE}x${MARKER_THUMBNAIL_SIZE}`)
  }
  if (config.format !== 'webp') {
    errors.push('marker thumbnail format must be webp')
  }
  if (!isPositiveInteger(config.quality) || config.quality > 100) {
    errors.push('marker thumbnail quality must be an integer from 1 to 100')
  }
  if (config.maxFileSizeBytes !== MARKER_THUMBNAIL_MAX_BYTES) {
    errors.push(`marker thumbnail maxFileSizeBytes must be ${MARKER_THUMBNAIL_MAX_BYTES}`)
  }
  if (config.maxTotalSizeBytes !== MARKER_THUMBNAILS_MAX_TOTAL_BYTES) {
    errors.push(
      `marker thumbnail maxTotalSizeBytes must be ${MARKER_THUMBNAILS_MAX_TOTAL_BYTES}`
    )
  }

  const usedSources = new Set()
  for (const activity of activities) {
    const source = activity?.coverImage
    if (!isFormalLocalImagePath(source)) {
      continue
    }

    usedSources.add(source)
    const crop = config.crops[source]
    if (!crop || typeof crop !== 'object' || Array.isArray(crop)) {
      errors.push(`${activity.id}: missing marker crop configuration for ${source}`)
      continue
    }

    if (
      typeof crop.target !== 'string' ||
      !crop.target.startsWith(MARKER_THUMBNAIL_PREFIX) ||
      path.posix.extname(crop.target).toLowerCase() !== '.webp'
    ) {
      errors.push(
        `${source}: crop target must be a .webp path under ${MARKER_THUMBNAIL_PREFIX}`
      )
    }
    if (!isNonNegativeInteger(crop.left)) {
      errors.push(`${source}: crop left must be a non-negative integer`)
    }
    if (!isNonNegativeInteger(crop.top)) {
      errors.push(`${source}: crop top must be a non-negative integer`)
    }
    if (!isPositiveInteger(crop.size)) {
      errors.push(`${source}: crop size must be a positive integer`)
    }
    if (!isNonEmptyString(crop.subject)) {
      errors.push(`${source}: crop subject description is required`)
    }

    if (
      isNonNegativeInteger(crop.left) &&
      isNonNegativeInteger(crop.top) &&
      isPositiveInteger(crop.size)
    ) {
      try {
        const { metadata } = await inspectPublicImage(source)
        if (!metadata.width || !metadata.height) {
          errors.push(`${source}: unable to read source dimensions`)
        } else if (
          crop.left + crop.size > metadata.width ||
          crop.top + crop.size > metadata.height
        ) {
          errors.push(
            `${source}: crop ${crop.left},${crop.top},${crop.size} exceeds ${metadata.width}x${metadata.height}`
          )
        }
      } catch {
        errors.push(`${source}: source image cannot be inspected`)
      }
    }
  }

  for (const source of Object.keys(config.crops)) {
    if (!usedSources.has(source)) {
      errors.push(`${source}: unused marker crop configuration`)
    }
  }

  return errors
}

const validateMarkerThumbnail = async (activity, prefix, cropConfig) => {
  const errors = await validateImagePath(activity.markerThumbnail, 'markerThumbnail', prefix)
  const markerThumbnail = activity.markerThumbnail

  if (!isNonEmptyString(markerThumbnail)) {
    return errors
  }
  if (isRemoteImagePath(markerThumbnail)) {
    errors.push(`${prefix}: markerThumbnail must use a generated local WebP image`)
    return errors
  }
  if (
    !markerThumbnail.startsWith(MARKER_THUMBNAIL_PREFIX) ||
    path.posix.extname(markerThumbnail).toLowerCase() !== '.webp'
  ) {
    errors.push(
      `${prefix}: markerThumbnail must be a .webp path under ${MARKER_THUMBNAIL_PREFIX}`
    )
    return errors
  }

  const crop = cropConfig?.crops?.[activity.coverImage]
  if (crop?.target && markerThumbnail !== crop.target) {
    errors.push(
      `${prefix}: markerThumbnail must be ${crop.target} for coverImage ${activity.coverImage}`
    )
  }

  if (errors.some((error) => error.includes('file does not exist'))) {
    return errors
  }

  try {
    const { metadata, size } = await inspectPublicImage(markerThumbnail)
    if (
      metadata.format !== 'webp' ||
      metadata.width !== MARKER_THUMBNAIL_SIZE ||
      metadata.height !== MARKER_THUMBNAIL_SIZE
    ) {
      errors.push(
        `${prefix}: markerThumbnail must be a ${MARKER_THUMBNAIL_SIZE}x${MARKER_THUMBNAIL_SIZE} WebP image`
      )
    }
    if (size > MARKER_THUMBNAIL_MAX_BYTES) {
      errors.push(
        `${prefix}: markerThumbnail ${size} bytes exceeds ${MARKER_THUMBNAIL_MAX_BYTES}`
      )
    }
  } catch {
    errors.push(`${prefix}: markerThumbnail cannot be inspected`)
  }

  return errors
}

const validateActivity = async (activity, index, venueLookup, cropConfig) => {
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

  errors.push(...(await validateMarkerThumbnail(activity, prefix, cropConfig)))
  errors.push(...(await validateImagePath(activity.coverImage, 'coverImage', prefix)))

  return errors
}

const main = async () => {
  const [confirmedActivities, venueCoordinates, markerThumbnailCrops] = await Promise.all([
    readJson(confirmedActivitiesPath, []),
    readJson(venueCoordinatesPath, []),
    readJson(markerThumbnailCropsPath, null),
  ])
  const venueLookup = buildVenueLookup(venueCoordinates)
  const errors = []

  if (!Array.isArray(confirmedActivities)) {
    errors.push('confirmedActivities.json must contain an array')
  }

  if (!Array.isArray(venueCoordinates)) {
    errors.push('venueCoordinates.json must contain an array')
  }

  if (Array.isArray(confirmedActivities)) {
    errors.push(...(await validateMarkerCropConfig(confirmedActivities, markerThumbnailCrops)))
  }

  const ids = new Map()
  const slugs = new Map()

  if (Array.isArray(confirmedActivities)) {
    for (const [index, activity] of confirmedActivities.entries()) {
      errors.push(...(await validateActivity(activity, index, venueLookup, markerThumbnailCrops)))

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

  if (Array.isArray(confirmedActivities)) {
    const markerThumbnails = Array.from(
      new Set(
        confirmedActivities
          .map((activity) => activity?.markerThumbnail)
          .filter((value) =>
            isNonEmptyString(value) && value.startsWith(MARKER_THUMBNAIL_PREFIX)
          )
      )
    )

    let totalBytes = 0
    for (const markerThumbnail of markerThumbnails) {
      try {
        totalBytes += (await inspectPublicImage(markerThumbnail)).size
      } catch {
        // The per-activity validation reports the missing or unreadable file.
      }
    }
    if (totalBytes > MARKER_THUMBNAILS_MAX_TOTAL_BYTES) {
      errors.push(
        `marker thumbnails total ${totalBytes} bytes exceeds ${MARKER_THUMBNAILS_MAX_TOTAL_BYTES}`
      )
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
