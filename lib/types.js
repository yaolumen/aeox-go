// @ts-check
'use strict';

/**
 * @typedef {Object} I18nString
 * @property {string} [en]
 * @property {string} [zh]
 * @property {string} [es]
 * @property {string} [de]
 */

/**
 * @typedef {Object} DownloadItem
 * @property {string} url
 * @property {string} [label]
 */

/**
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} shortId
 * @property {string[]} [locales]
 * @property {I18nString|string} [title]
 * @property {string} [cover]
 * @property {number} [price]
 * @property {I18nString|string} [desc]
 * @property {I18nString} [whatYouLearn]
 * @property {I18nString} [whatYouGet]
 * @property {I18nString} [whoIsFor]
 * @property {string} [bookLang]
 * @property {string} [format]
 * @property {string} [fileSize]
 * @property {DownloadItem[]|Record<string, DownloadItem[]>} [downloads]
 * @property {{ primary?: string, backup?: string }|string} [drive]
 * @property {string} [stripeLink]
 * @property {string} [kofiLink]
 * @property {{ pv: number, sales: number }} [stats]
 * @property {'active'|'archived'} [status]
 * @property {string[]} [tags]
 * @property {string} [categoryId]
 * @property {boolean} [featured]
 * @property {{ mode: string, products: any[] }} [upsell]
 * @property {string} [createdAt]
 */

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} slug
 * @property {I18nString|string} name
 * @property {string} [description]
 * @property {number} [sort]
 * @property {'active'|'archived'} [status]
 * @property {string} [createdAt]
 */

/**
 * @typedef {Object} Tag
 * @property {string} id
 * @property {string} name
 * @property {string} [color]
 * @property {string} [createdAt]
 */

/**
 * @typedef {Object} Order
 * @property {string} id
 * @property {string} [productId]
 * @property {string} [productTitle]
 * @property {string} [shortId]
 * @property {string} [stripeSessionId]
 * @property {string} [stripePaymentIntent]
 * @property {number} [amount]
 * @property {string} [currency]
 * @property {string} [customerEmail]
 * @property {string} [customerName]
 * @property {'paid'|'refunded'} [status]
 * @property {'none'|'refunded'} [refundStatus]
 * @property {string} [stripeRefundId]
 * @property {string} [refundNote]
 * @property {string} [downloadToken]
 * @property {'paid'|'opted_in'|'skipped'} [leadType]
 * @property {string} [createdAt]
 * @property {string} [refundedAt]
 */

/**
 * @typedef {Object} ApiKey
 * @property {string} id
 * @property {string} name
 * @property {string} key
 * @property {Array<'read'|'write'|'admin'|'*'>} scopes
 * @property {boolean} enabled
 * @property {string} [createdAt]
 * @property {string|null} [lastUsedAt]
 * @property {string} [revokedAt]
 */

/**
 * @typedef {Object} AIProvider
 * @property {string} id
 * @property {string} name
 * @property {string} [vendor]
 * @property {string} [baseUrl]
 * @property {string} [model]
 * @property {string} [apiKey]
 * @property {number} [priority]
 * @property {boolean} [enabled]
 * @property {string|null} [lastUsedAt]
 * @property {string} [createdAt]
 * @property {string} [lastErrorAt]
 * @property {string} [lastErrorMsg]
 * @property {string} [cooldownUntil]
 * @property {number} [dailyQuota]
 * @property {number} [usedToday]
 */

/**
 * @typedef {Object} SiteConfig
 * @property {string} [siteName]
 * @property {string} [siteDescription]
 * @property {string} [heroTagline]
 * @property {string} [keywords]
 * @property {string} [supportEmail]
 * @property {string} [heroCtaPrimary]
 * @property {string} [heroCtaSecondary]
 * @property {{ twitter: string, instagram: string }} [socialLinks]
 * @property {string} [footerCopyright]
 * @property {{ selectedId: string, src: string, darkSrc: string, bannerSrc: string, bannerDarkSrc: string }} [logo]
 * @property {string} [defaultLang]
 * @property {string[]} [availableLangs]
 * @property {'kofi'|'stripe'} [paymentMode]
 * @property {string} [kofiLink]
 * @property {{ sessionTimeout: number, adminEntryKey: string }} [security]
 * @property {{ blockedPaths: string[], blockAI: boolean, blockedBots: string[] }} [seo]
 * @property {{ secretKey: string, mode: 'live'|'test' }} [stripe]
 * @property {{ enabled: boolean, text: string, contactEmail: string }} [refundPolicy]
 */

/**
 * @typedef {Object} ShortLink
 * @property {string} slug
 * @property {string} url
 * @property {string} [description]
 * @property {number} [clicks]
 * @property {string} [createdAt]
 */

/**
 * @typedef {Object} Sample
 * @property {string} id
 * @property {string} shortId
 * @property {string|null} [productId]
 * @property {I18nString|string} [title]
 * @property {string} [cover]
 * @property {string} [buyLink]
 * @property {boolean} [enabled]
 * @property {Object} [content]
 * @property {any[]} [relatedProducts]
 * @property {'auto'|'manual'|'none'} [upsellMode]
 * @property {string[]} [autoTags]
 * @property {string} [category]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} EmailEntry
 * @property {string} id
 * @property {string} email
 * @property {string} shortId
 * @property {string} [source]
 * @property {string[]} [tags]
 * @property {string} [category]
 * @property {boolean} [notified]
 * @property {string} [createdAt]
 * @property {string} [lang]
 * @property {string[]} [sources]
 */

/**
 * @typedef {Object} StatEvent
 * @property {string} type
 * @property {string} productId
 * @property {number} ts
 * @property {string} day
 */

/**
 * @typedef {Object} StatsData
 * @property {StatEvent[]} [events]
 * @property {Record<string, { pv: number, checkout: number, download: number }>} [byDay]
 * @property {Record<string, { pv: number, checkout: number, download: number }>} [byProduct]
 */

/**
 * @typedef {Object} OrderInput
 * @property {string} [productId]
 * @property {string} [productTitle]
 * @property {string} [shortId]
 * @property {string} [stripeSessionId]
 * @property {string} [stripePaymentIntent]
 * @property {number} [amount]
 * @property {string} [currency]
 * @property {string} [customerEmail]
 * @property {string} [customerName]
 * @property {string} [downloadToken]
 * @property {'paid'|'opted_in'|'skipped'} [leadType]
 */

/**
 * @typedef {Object} OrderStats
 * @property {number} totalSales
 * @property {number} totalRevenue
 * @property {number} totalRefunds
 * @property {number} totalRefunded
 * @property {number} netRevenue
 * @property {number} leadsOptedIn
 * @property {number} leadsSkipped
 */

/**
 * @typedef {Object} AiCallResult
 * @property {boolean} ok
 * @property {string} [content]
 * @property {string} [error]
 * @property {import('stream').Readable} [stream]
 */

module.exports = {};
