# Zhijiang Memory Map

枝江娱乐线下活动回忆地图。当前版本是部署前 beta：以高德地图为主视图，展示正式活动数据、活动海报 marker、筛选、活动列表、详情面板、详情页和 B 站相关视频。

## Tech Stack

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- 高德地图 JavaScript API
- 本地 JSON 数据源

## Run Locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local` 至少需要填写：

```env
NEXT_PUBLIC_AMAP_KEY=
NEXT_PUBLIC_AMAP_SECURITY_JS_CODE=
```

访问：

- `/`：地图首页
- `/?activity=event-hangzhou-2026-04-18`：打开指定活动
- `/activities/bella-2nd-solo-live`：活动详情页

## Data And Assets

正式活动数据维护在 `src/data/confirmedActivities.json`。如果该文件为空，页面才会回退到 `src/data/mockActivities.ts`。

坐标标准为高德 GCJ-02，建议从高德坐标拾取器填写：

- `latitude`：纬度
- `longitude`：经度
- `src/data/venueCoordinates.json`：场馆坐标白名单，正式活动必须匹配这里的城市和场馆名

正式图片放在：

- marker 小海报：`public/images/activities/`
- 活动封面：`public/images/covers/`
- 视频封面：`public/images/videos/`

JSON 中图片路径写成 `/images/...`。视频封面 `cover` 可以留空；页面会根据 B 站 BV 号在运行时获取封面，并缓存在当前浏览器标签页的 `sessionStorage` 中。

## Bilibili Recommendations

活动详情会通过服务端 API 获取 B 站自动推荐视频：

```text
GET /api/bilibili/related-videos?activityId=...&page=...
```

上线保护：

- 服务端缓存同一推荐请求 1 天。
- 单个客户端每分钟最多请求 30 次推荐接口。
- 自动推荐最多开放 3 页，不承诺无限刷。
- 生产环境不会返回 `debug=1` 调试信息。
- `BILIBILI_COOKIE` 只能放在服务端环境变量中，不能使用 `NEXT_PUBLIC_` 前缀。

如果配置 `BILIBILI_COOKIE`，建议使用专门的小号，并准备随时轮换。所有用户的推荐请求都会经过你的服务端，不要把个人大号 Cookie 用于公开部署。

## Deployment

推荐先部署 beta 版本到 Vercel 或同类平台。部署环境变量：

```env
NEXT_PUBLIC_AMAP_KEY=
NEXT_PUBLIC_AMAP_SECURITY_JS_CODE=
BILIBILI_COOKIE=
```

高德 Key 必须在高德控制台绑定域名白名单。本地、预览、生产建议使用不同 Key。

不要提交：

- `.env.local`
- 真实高德 Key 或安全密钥
- B 站 Cookie
- 部署平台环境变量截图

## Validation

部署前必须通过：

```bash
npm run validate:activities
npm run build
```

人工回归范围：

- 首页地图加载、marker hover、marker 点击。
- 城市、年份、类型、成员、关键词筛选。
- 活动列表打开、关闭、点击定位。
- `activity` URL 参数恢复选中活动。
- 移动端筛选栏和底部详情抽屉不遮挡关键操作。
- B 站推荐失败时，预设视频仍正常显示，页面不崩溃。
