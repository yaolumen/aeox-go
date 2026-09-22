// @ts-check
'use strict';

/** @type {import('zod')} */
const { z } = require('zod');

const I18nString = z.object({
  en: z.string().optional().default(''),
  zh: z.string().optional().default(''),
  es: z.string().optional().default(''),
  de: z.string().optional().default('')
}).passthrough();

const LoginSchema = z.object({
  password: z.string().min(1)
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

const CacheInvalidateSchema = z.object({
  files: z.array(z.string()).optional()
});

const TrackEventSchema = z.object({
  productId: z.string().min(1)
});

const CategoryCreateSchema = z.object({
  name: z.union([z.string().min(1), I18nString]),
  slug: z.string().optional(),
  description: z.string().optional(),
  sort: z.number().int().positive().optional()
});

const CategoryUpdateSchema = z.object({
  name: z.union([z.string(), I18nString]).optional(),
  slug: z.string().optional(),
  description: z.string().optional(),
  sort: z.number().int().positive().optional(),
  status: z.enum(['active', 'archived']).optional()
});

const TagCreateSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional()
});

const TagUpdateSchema = z.object({
  name: z.string().optional(),
  color: z.string().optional()
});

const ApiKeyCreateSchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.enum(['read', 'write', 'admin', '*'])).optional()
});

const ApiKeyUpdateSchema = z.object({
  name: z.string().optional(),
  scopes: z.array(z.enum(['read', 'write', 'admin', '*'])).optional(),
  enabled: z.boolean().optional()
});

const DownloadItem = z.object({
  url: z.string().min(1),
  label: z.string().optional().default('')
});

const ProductCreateSchema = z.object({
  id: z.string().optional(),
  shortId: z.string().optional(),
  locales: z.array(z.string()).optional(),
  title: z.union([z.string().min(1), I18nString]),
  cover: z.string().optional(),
  price: z.number().min(0).optional(),
  desc: z.union([z.string(), I18nString]).optional(),
  whatYouLearn: I18nString.optional(),
  whatYouGet: I18nString.optional(),
  whoIsFor: I18nString.optional(),
  bookLang: z.string().optional(),
  format: z.string().optional(),
  fileSize: z.string().optional(),
  downloads: z.union([z.array(DownloadItem), z.record(z.array(DownloadItem))]).optional(),
  drive: z.any().optional(),
  stripeLink: z.string().optional(),
  kofiLink: z.string().optional(),
  stats: z.object({ pv: z.number(), sales: z.number() }).optional(),
  status: z.enum(['active', 'archived']).optional(),
  tags: z.array(z.string()).optional(),
  categoryId: z.string().optional(),
  featured: z.boolean().optional(),
  upsell: z.any().optional(),
  createdAt: z.string().optional()
}).passthrough();

const ProductUpdateSchema = z.object({
  shortId: z.string().optional(),
  locales: z.array(z.string()).optional(),
  title: z.union([z.string(), I18nString]).optional(),
  cover: z.string().optional(),
  price: z.number().min(0).optional(),
  desc: z.union([z.string(), I18nString]).optional(),
  whatYouLearn: I18nString.optional(),
  whatYouGet: I18nString.optional(),
  whoIsFor: I18nString.optional(),
  bookLang: z.string().optional(),
  format: z.string().optional(),
  fileSize: z.string().optional(),
  downloads: z.union([z.array(DownloadItem), z.record(z.array(DownloadItem))]).optional(),
  drive: z.any().optional(),
  stripeLink: z.string().optional(),
  kofiLink: z.string().optional(),
  status: z.enum(['active', 'archived']).optional(),
  tags: z.array(z.string()).optional(),
  categoryId: z.string().optional(),
  featured: z.boolean().optional(),
  upsell: z.any().optional(),
  refundStatus: z.enum(['none', 'refunded']).optional(),
  refundNote: z.string().optional()
}).passthrough();

const CheckoutSchema = z.object({
  email: z.string().optional(),
  lang: z.string().optional()
});

const VerifyDownloadSchema = z.object({
  shortId: z.string().min(1),
  token: z.string().nullable().optional(),
  lang: z.string().optional()
});

const RecoverDownloadSchema = z.object({
  email: z.string().min(1)
});

const OrderStatusUpdateSchema = z.object({
  refundStatus: z.enum(['none', 'refunded']).optional(),
  refundNote: z.string().optional(),
  stripeRefundId: z.string().optional()
}).refine(data => data.refundStatus !== undefined || data.refundNote !== undefined || data.stripeRefundId !== undefined, {
  message: '缺少 refundStatus、stripeRefundId 或 refundNote'
});

const BatchTagsSchema = z.object({
  productIds: z.array(z.string()).min(1),
  tagIds: z.array(z.string()).min(1),
  mode: z.enum(['add', 'remove']).optional()
});

const ImportSchema = z.object({
  products: z.array(z.object({}).passthrough()).min(1),
  categories: z.array(z.object({}).passthrough()).optional(),
  tags: z.array(z.object({}).passthrough()).optional(),
  mode: z.enum(['merge', 'overwrite', 'skip']).optional()
});

const ImportPreviewSchema = z.object({
  products: z.array(z.object({}).passthrough()).min(1),
  categories: z.array(z.object({}).passthrough()).optional(),
  tags: z.array(z.object({}).passthrough()).optional()
});

const ShortLinkCreateSchema = z.object({
  slug: z.string().min(1).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  url: z.string().min(1).url().refine(v => v.startsWith('http://') || v.startsWith('https://'), {
    message: 'url must start with http:// or https://'
  }),
  description: z.string().optional()
});

const ShortLinkUpdateSchema = z.object({
  url: z.string().url().refine(v => v.startsWith('http://') || v.startsWith('https://'), {
    message: 'url must start with http:// or https://'
  }).optional(),
  description: z.string().optional()
});

const SampleCreateSchema = z.object({
  shortId: z.string().optional(),
  title: z.union([z.string(), I18nString]).optional(),
  cover: z.string().optional(),
  buyLink: z.string().optional(),
  content: z.any().optional(),
  enabled: z.boolean().optional(),
  relatedProducts: z.array(z.any()).optional(),
  upsellMode: z.enum(['auto', 'manual', 'none']).optional()
});

const SampleUpdateSchema = z.object({
  content: z.any().optional(),
  enabled: z.boolean().optional(),
  relatedProducts: z.array(z.any()).optional(),
  title: z.union([z.string(), I18nString]).optional(),
  cover: z.string().optional(),
  buyLink: z.string().optional(),
  upsellMode: z.enum(['auto', 'manual', 'none']).optional()
});

const SampleNotifySchema = z.object({
  shortId: z.string().min(1),
  email: z.string().min(1).email(),
  lang: z.string().optional()
});

const SampleViewSchema = z.object({
  shortId: z.string().min(1)
});

const BatchDeleteEmailsSchema = z.object({
  ids: z.array(z.string()).min(1)
});

const ProviderCreateSchema = z.object({
  name: z.string().min(1),
  vendor: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  priority: z.number().int().positive().optional()
});

const ProviderUpdateSchema = z.object({
  name: z.string().optional(),
  vendor: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  priority: z.number().int().positive().optional(),
  enabled: z.boolean().optional()
});

const AiChatSchema = z.object({
  message: z.string().min(1),
  stream: z.boolean().optional()
});

const AiGenerateSchema = z.object({
  prompt: z.string().min(1)
});

const AiTestSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  providerId: z.string().optional()
});

const SiteConfigUpdateSchema = z.object({}).passthrough();

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstError = result.error.issues[0];
      const message = firstError ? `${firstError.path.join('.')}: ${firstError.message}` : '请求参数验证失败';
      return res.status(400).json({ error: message });
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  validate,
  LoginSchema,
  ChangePasswordSchema,
  CacheInvalidateSchema,
  TrackEventSchema,
  CategoryCreateSchema,
  CategoryUpdateSchema,
  TagCreateSchema,
  TagUpdateSchema,
  ApiKeyCreateSchema,
  ApiKeyUpdateSchema,
  ProductCreateSchema,
  ProductUpdateSchema,
  CheckoutSchema,
  VerifyDownloadSchema,
  RecoverDownloadSchema,
  OrderStatusUpdateSchema,
  BatchTagsSchema,
  ImportSchema,
  ImportPreviewSchema,
  ShortLinkCreateSchema,
  ShortLinkUpdateSchema,
  SampleCreateSchema,
  SampleUpdateSchema,
  SampleNotifySchema,
  SampleViewSchema,
  BatchDeleteEmailsSchema,
  ProviderCreateSchema,
  ProviderUpdateSchema,
  AiChatSchema,
  AiGenerateSchema,
  AiTestSchema,
  SiteConfigUpdateSchema
};
