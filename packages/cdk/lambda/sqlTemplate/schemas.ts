/* eslint-disable i18nhelper/no-jp-string */
import { z } from 'zod';
import { parse } from 'yaml';
import {
  SqlTemplateCatalog,
  SqlTemplateDefinition,
  SqlTemplateMockResult,
  SqlTemplateRenderRequest,
} from 'generative-ai-use-cases';
import { configurationError, SqlTemplateError } from './errors';

const catalogId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const fieldId = z.string().regex(/^[a-z][a-zA-Z0-9_]{0,63}$/);
const catalogItem = z.object({
  id: catalogId,
  version: z.string().min(1).max(32),
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

const field = z.object({
  id: fieldId,
  label: z.string().min(1).max(100),
  type: z.enum(['text', 'date', 'integer', 'decimal', 'select']),
  required: z.literal(true),
  description: z.string().max(500).optional(),
  placeholder: z.string().max(200).optional(),
  multiline: z.boolean().optional(),
  minLength: z.number().int().nonnegative().max(10000).optional(),
  maxLength: z.number().int().positive().max(10000).optional(),
  pattern: z.string().max(500).optional(),
  min: z.union([z.number(), z.string()]).optional(),
  max: z.union([z.number(), z.string()]).optional(),
  decimalPlaces: z.number().int().nonnegative().max(20).optional(),
  options: z
    .array(
      z.object({
        value: z.string().min(1).max(200),
        label: z.string().min(1).max(100),
      })
    )
    .max(100)
    .optional(),
  transform: z
    .object({ dateFormat: z.enum(['yyyyMMdd', 'yyyy-MM-dd', 'yyyy/MM/dd']) })
    .optional(),
  sqlLiteral: z.enum(['string', 'integer', 'decimal']).optional(),
});

const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  templates: z.array(catalogItem).max(100),
});

const templateSchema = catalogItem.extend({
  schemaVersion: z.literal(1),
  fields: z.array(field).min(1).max(50),
  rules: z
    .array(
      z.object({
        type: z.literal('dateOrder'),
        from: fieldId,
        to: fieldId,
        message: z.string().max(300).optional(),
      })
    )
    .max(20)
    .optional(),
  sql: z.string().min(1).max(100000),
  mockResultRef: z
    .string()
    .regex(/^mocks\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.json$/),
});

const renderRequestSchema = z.object({
  version: z.string().min(1).max(32),
  values: z.record(z.string().max(10000)),
});

const mockResultSchema = z.object({
  columns: z
    .array(
      z.object({
        key: fieldId,
        label: z.string().min(1).max(100),
        type: z.enum(['string', 'number', 'boolean']),
      })
    )
    .max(50),
  rows: z
    .array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .max(1000),
});

const parseYaml = (source: string, kind: string): unknown => {
  try {
    return parse(source, { maxAliasCount: 0 });
  } catch (error) {
    throw configurationError(
      `${kind} YAMLを解析できません: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const parseConfig = <T>(
  schema: z.ZodType<T>,
  value: unknown,
  kind: string
): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw configurationError(
      `${kind}の形式が不正です: ${result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ')}`
    );
  }
  return result.data;
};

export const parseCatalog = (source: string): SqlTemplateCatalog => {
  if (Buffer.byteLength(source, 'utf8') > 256 * 1024) {
    throw configurationError('catalog.yamlが256KBを超えています');
  }
  const catalog = parseConfig(
    catalogSchema,
    parseYaml(source, 'catalog.yaml'),
    'catalog.yaml'
  );
  if (
    new Set(catalog.templates.map((item) => item.id)).size !==
    catalog.templates.length
  ) {
    throw configurationError('catalog.yamlのテンプレートIDが重複しています');
  }
  return catalog;
};

export const parseTemplate = (source: string): SqlTemplateDefinition => {
  if (Buffer.byteLength(source, 'utf8') > 256 * 1024) {
    throw configurationError('SQLテンプレートが256KBを超えています');
  }
  const template = parseConfig(
    templateSchema,
    parseYaml(source, 'SQLテンプレート'),
    'SQLテンプレート'
  );
  const fieldIds = new Set<string>();
  for (const item of template.fields) {
    if (fieldIds.has(item.id)) {
      throw configurationError(`フィールドID ${item.id} が重複しています`);
    }
    fieldIds.add(item.id);
    if (
      item.type === 'select' &&
      (!item.options || item.options.length === 0)
    ) {
      throw configurationError(
        `selectフィールド ${item.id} にoptionsがありません`
      );
    }
    if (
      item.options &&
      new Set(item.options.map((option) => option.value)).size !==
        item.options.length
    ) {
      throw configurationError(
        `selectフィールド ${item.id} のoption valueが重複しています`
      );
    }
    if (item.pattern) {
      try {
        new RegExp(item.pattern);
      } catch {
        throw configurationError(`フィールド ${item.id} のpatternが不正です`);
      }
    }
    if (
      item.minLength !== undefined &&
      item.maxLength !== undefined &&
      item.minLength > item.maxLength
    ) {
      throw configurationError(
        `フィールド ${item.id} のminLengthがmaxLengthを超えています`
      );
    }
    if (
      item.min !== undefined &&
      item.max !== undefined &&
      typeof item.min === typeof item.max &&
      item.min > item.max
    ) {
      throw configurationError(
        `フィールド ${item.id} のminがmaxを超えています`
      );
    }
  }
  for (const rule of template.rules ?? []) {
    const from = template.fields.find((item) => item.id === rule.from);
    const to = template.fields.find((item) => item.id === rule.to);
    if (!from || !to || from.type !== 'date' || to.type !== 'date') {
      throw configurationError(
        'dateOrderが存在しないフィールドを参照しています'
      );
    }
  }
  const tokenMatches = [...template.sql.matchAll(/\{\{([^{}]+)\}\}/g)];
  const invalidToken = tokenMatches.find(
    (match) => !/^[a-z][a-zA-Z0-9_]{0,63}$/.test(match[1])
  );
  if (invalidToken) {
    throw configurationError(`SQL token ${invalidToken[0]} の形式が不正です`);
  }
  const withoutTokens = template.sql.replace(/\{\{([^{}]+)\}\}/g, '');
  if (withoutTokens.includes('{{') || withoutTokens.includes('}}')) {
    throw configurationError('SQLに閉じられていないtokenがあります');
  }
  const tokens = tokenMatches.map((match) => match[1]);
  const unknownToken = tokens.find((token) => !fieldIds.has(token));
  if (unknownToken) {
    throw configurationError(
      `SQLが未知のフィールド ${unknownToken} を参照しています`
    );
  }
  const unused = [...fieldIds].find((fieldId) => !tokens.includes(fieldId));
  if (unused) {
    throw configurationError(
      `フィールド ${unused} がSQLから参照されていません`
    );
  }
  return template;
};

export const parseRenderRequest = (
  value: unknown
): SqlTemplateRenderRequest => {
  const result = renderRequestSchema.safeParse(value);
  if (!result.success) {
    throw new SqlTemplateError(
      400,
      'INVALID_REQUEST',
      'リクエスト形式が不正です'
    );
  }
  return result.data;
};

export const parseMockResult = (source: string): SqlTemplateMockResult => {
  if (Buffer.byteLength(source, 'utf8') > 1024 * 1024) {
    throw configurationError('モック結果が1MBを超えています');
  }
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch (error) {
    throw configurationError(
      `モック結果JSONを解析できません: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const result = parseConfig(mockResultSchema, json, 'モック結果');
  const keys = new Set(result.columns.map((column) => column.key));
  if (
    new Set(result.columns.map((column) => column.key)).size !==
    result.columns.length
  ) {
    throw configurationError('モック結果の列keyが重複しています');
  }
  if (
    result.rows.some((row) => Object.keys(row).some((key) => !keys.has(key)))
  ) {
    throw configurationError('モック結果にcolumnsで未定義のkeyがあります');
  }
  return result;
};
