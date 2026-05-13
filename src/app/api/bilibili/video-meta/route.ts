const BVID_PATTERN = /^BV[a-zA-Z0-9]{8,}$/

type BilibiliViewPayload = {
  code?: number
  message?: string
  data?: {
    bvid?: string
    title?: string
    pic?: string
  }
}

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const bvid = searchParams.get('bvid')?.trim()

  if (!bvid || !BVID_PATTERN.test(bvid)) {
    return Response.json({ error: 'Invalid bvid.' }, { status: 400 })
  }

  const apiUrl = new URL('https://api.bilibili.com/x/web-interface/view')
  apiUrl.searchParams.set('bvid', bvid)

  try {
    const response = await fetch(apiUrl, {
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
        referer: `https://www.bilibili.com/video/${bvid}`,
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      next: { revalidate: 0 },
    })

    if (!response.ok) {
      return Response.json(
        { error: `Bilibili request failed with HTTP ${response.status}.` },
        { status: 502 }
      )
    }

    const payload = (await response.json()) as BilibiliViewPayload
    if (payload.code !== 0 || !payload.data) {
      return Response.json(
        { error: payload.message || `Bilibili returned code ${payload.code}.` },
        { status: 502 }
      )
    }

    const cover = payload.data.pic?.replace(/^http:\/\//, 'https://') || ''

    return Response.json({
      id: payload.data.bvid || bvid,
      title: payload.data.title || '',
      cover,
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Bilibili metadata.' },
      { status: 502 }
    )
  }
}
