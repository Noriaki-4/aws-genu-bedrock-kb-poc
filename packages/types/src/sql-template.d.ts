export type SqlTemplateFieldType =
  | 'text'
  | 'date'
  | 'integer'
  | 'decimal'
  | 'select';

export type SqlTemplateDateFormat = 'yyyyMMdd' | 'yyyy-MM-dd' | 'yyyy/MM/dd';

export interface SqlTemplateOption {
  value: string;
  label: string;
}

export interface SqlTemplateField {
  id: string;
  label: string;
  type: SqlTemplateFieldType;
  required: boolean;
  description?: string;
  placeholder?: string;
  multiline?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number | string;
  max?: number | string;
  decimalPlaces?: number;
  options?: SqlTemplateOption[];
  transform?: { dateFormat: SqlTemplateDateFormat };
  sqlLiteral?: 'string' | 'integer' | 'decimal';
}

export interface SqlTemplateDateOrderRule {
  type: 'dateOrder';
  from: string;
  to: string;
  message?: string;
}

export interface SqlTemplateCatalogItem {
  id: string;
  version: string;
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
}

export interface SqlTemplateCatalog {
  schemaVersion: 1;
  templates: SqlTemplateCatalogItem[];
}

export interface SqlTemplateFormDefinition extends SqlTemplateCatalogItem {
  schemaVersion: 1;
  fields: SqlTemplateField[];
  rules?: SqlTemplateDateOrderRule[];
}

export interface SqlTemplateDefinition extends SqlTemplateFormDefinition {
  sql: string;
  mockResultRef: string;
}

export type SqlTemplateValues = Record<string, string>;

export interface SqlTemplateRenderRequest {
  version: string;
  values: SqlTemplateValues;
}

export interface SqlTemplateRenderResponse {
  templateId: string;
  version: string;
  sql: string;
  normalizedValues: SqlTemplateValues;
}

export type SqlTemplateCell = string | number | boolean | null;

export interface SqlTemplateMockColumn {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
}

export interface SqlTemplateMockResult {
  columns: SqlTemplateMockColumn[];
  rows: Record<string, SqlTemplateCell>[];
}

export interface SqlTemplateMockResponse extends SqlTemplateRenderResponse {
  result: SqlTemplateMockResult;
}

export interface SqlTemplateApiError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  formErrors?: string[];
}
