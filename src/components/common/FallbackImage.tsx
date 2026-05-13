'use client'

import { useEffect, useState } from 'react'

type FallbackImageProps = {
  src: string
  alt: string
  className?: string
  wrapperClassName?: string
  fallbackText?: string
  width?: number
  height?: number
  loading?: 'lazy' | 'eager'
}

export default function FallbackImage({
  src,
  alt,
  className,
  wrapperClassName,
  fallbackText = '图片加载失败',
  width,
  height,
  loading = 'lazy',
}: FallbackImageProps) {
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    setLoadFailed(false)
  }, [src])

  return (
    <div className={wrapperClassName}>
      {loadFailed ? (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-sm text-slate-600">
          {fallbackText}
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className={className}
          loading={loading}
          decoding="async"
          width={width}
          height={height}
          onError={() => setLoadFailed(true)}
        />
      )}
    </div>
  )
}
