import { mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const publicDir = path.join(rootDir, 'public')

const activitiesPath = path.join(rootDir, 'src', 'data', 'confirmedActivities.json')
const cropConfigPath = path.join(__dirname, 'marker-thumbnail-crops.json')
const markerThumbnailPrefix = '/images/activities/marker-thumbnails/'

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'))

const toPublicFilePath = (publicPath) => {
  const normalizedPath = publicPath.replace(/^\/+/, '').replace(/\//g, path.sep)
  const filePath = path.resolve(publicDir, normalizedPath)

  if (!filePath.startsWith(`${publicDir}${path.sep}`)) {
    throw new Error(`Public path escapes the public directory: ${publicPath}`)
  }

  return filePath
}

const assertPositiveInteger = (value, label) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

const validateCrop = async (source, crop, config) => {
  if (!source.startsWith('/images/')) {
    throw new Error(`Marker source must be a local /images path: ${source}`)
  }

  if (!crop || typeof crop !== 'object' || Array.isArray(crop)) {
    throw new Error(`Missing crop configuration for ${source}`)
  }

  if (
    typeof crop.target !== 'string' ||
    !crop.target.startsWith(markerThumbnailPrefix) ||
    path.posix.extname(crop.target).toLowerCase() !== '.webp'
  ) {
    throw new Error(
      `${source}: target must be a .webp path under ${markerThumbnailPrefix}`
    )
  }

  assertPositiveInteger(crop.size, `${source}: size`)
  if (!Number.isInteger(crop.left) || crop.left < 0) {
    throw new Error(`${source}: left must be a non-negative integer`)
  }
  if (!Number.isInteger(crop.top) || crop.top < 0) {
    throw new Error(`${source}: top must be a non-negative integer`)
  }

  const sourceFile = toPublicFilePath(source)
  const metadata = await sharp(sourceFile).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error(`${source}: unable to read source dimensions`)
  }

  if (crop.left + crop.size > metadata.width || crop.top + crop.size > metadata.height) {
    throw new Error(
      `${source}: crop ${crop.left},${crop.top},${crop.size} exceeds ${metadata.width}x${metadata.height}`
    )
  }

  if (crop.target === source) {
    throw new Error(`${source}: target must not overwrite the original image`)
  }

  return {
    crop,
    source,
    sourceFile,
    targetFile: toPublicFilePath(crop.target),
    width: config.width,
    height: config.height,
  }
}

const main = async () => {
  const [activities, config] = await Promise.all([
    readJson(activitiesPath),
    readJson(cropConfigPath),
  ])

  if (!Array.isArray(activities)) {
    throw new Error('confirmedActivities.json must contain an array')
  }
  if (!config?.crops || typeof config.crops !== 'object' || Array.isArray(config.crops)) {
    throw new Error('marker-thumbnail-crops.json must contain a crops object')
  }

  assertPositiveInteger(config.width, 'width')
  assertPositiveInteger(config.height, 'height')
  assertPositiveInteger(config.quality, 'quality')
  assertPositiveInteger(config.maxFileSizeBytes, 'maxFileSizeBytes')
  assertPositiveInteger(config.maxTotalSizeBytes, 'maxTotalSizeBytes')

  if (config.format !== 'webp') {
    throw new Error('Only WebP marker thumbnails are supported')
  }
  if (config.quality > 100) {
    throw new Error('quality must not exceed 100')
  }

  const activitiesBySource = new Map()
  for (const activity of activities) {
    const source = activity?.coverImage
    if (typeof source !== 'string' || !source.startsWith('/images/')) {
      throw new Error(`${activity?.id ?? '(missing id)'}: coverImage must be a local /images path`)
    }

    const sourceActivities = activitiesBySource.get(source) ?? []
    sourceActivities.push(activity)
    activitiesBySource.set(source, sourceActivities)
  }

  const configuredSources = new Set(Object.keys(config.crops))
  for (const source of configuredSources) {
    if (!activitiesBySource.has(source)) {
      throw new Error(`Unused marker crop configuration: ${source}`)
    }
  }

  const jobs = []
  const targetSources = new Map()
  for (const [source, sourceActivities] of activitiesBySource) {
    const crop = config.crops[source]
    const job = await validateCrop(source, crop, config)

    const conflictingSource = targetSources.get(crop.target)
    if (conflictingSource && conflictingSource !== source) {
      throw new Error(`${crop.target}: target is shared by ${conflictingSource} and ${source}`)
    }
    targetSources.set(crop.target, source)

    for (const activity of sourceActivities) {
      if (activity.markerThumbnail !== crop.target) {
        throw new Error(
          `${activity.id}: markerThumbnail must be ${crop.target} for coverImage ${source}`
        )
      }
    }

    jobs.push(job)
  }

  const outputs = []
  for (const job of jobs) {
    await mkdir(path.dirname(job.targetFile), { recursive: true })
    await sharp(job.sourceFile)
      .extract({
        left: job.crop.left,
        top: job.crop.top,
        width: job.crop.size,
        height: job.crop.size,
      })
      .resize(job.width, job.height)
      .webp({ effort: 6, quality: config.quality })
      .toFile(job.targetFile)

    const outputStat = await stat(job.targetFile)
    if (outputStat.size > config.maxFileSizeBytes) {
      throw new Error(
        `${job.crop.target}: ${outputStat.size} bytes exceeds ${config.maxFileSizeBytes}`
      )
    }

    outputs.push({
      bytes: outputStat.size,
      source: job.source,
      subject: job.crop.subject,
      target: job.crop.target,
    })
  }

  const totalBytes = outputs.reduce((total, output) => total + output.bytes, 0)
  if (totalBytes > config.maxTotalSizeBytes) {
    throw new Error(`Marker thumbnails total ${totalBytes} bytes exceeds ${config.maxTotalSizeBytes}`)
  }

  for (const output of outputs) {
    console.log(`${output.target} ${output.bytes} bytes - ${output.subject}`)
  }
  console.log(`Generated ${outputs.length} marker thumbnails (${totalBytes} bytes total).`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
