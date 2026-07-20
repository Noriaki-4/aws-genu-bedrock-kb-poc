/* eslint-disable i18nhelper/no-jp-string */
import {
  SqlTemplateDefinition,
  SqlTemplateField,
  SqlTemplateValues,
} from 'generative-ai-use-cases';
import { SqlTemplateError } from './errors';

const validDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const transformDate = (
  value: string,
  transform: SqlTemplateField['transform']
) => {
  const format = transform?.dateFormat;
  if (format === 'yyyyMMdd') return value.replace(/-/g, '');
  if (format === 'yyyy/MM/dd') return value.replace(/-/g, '/');
  return value;
};

export const validateValues = (
  template: SqlTemplateDefinition,
  values: SqlTemplateValues
): SqlTemplateValues => {
  const fieldErrors: Record<string, string> = {};
  const normalized: SqlTemplateValues = {};
  const known = new Set(template.fields.map((field) => field.id));
  const unknown = Object.keys(values).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new SqlTemplateError(
      400,
      'INVALID_REQUEST',
      `未知のフィールドが含まれています: ${unknown.join(', ')}`
    );
  }

  for (const field of template.fields) {
    const value = (values[field.id] ?? '').trim();
    if (!value) {
      if (field.required) fieldErrors[field.id] = `${field.label}は必須です`;
      normalized[field.id] = '';
      continue;
    }

    if (field.type === 'text') {
      if (field.minLength !== undefined && value.length < field.minLength)
        fieldErrors[field.id] =
          `${field.label}は${field.minLength}文字以上で入力してください`;
      if (field.maxLength !== undefined && value.length > field.maxLength)
        fieldErrors[field.id] =
          `${field.label}は${field.maxLength}文字以内で入力してください`;
      if (field.pattern && !new RegExp(field.pattern).test(value))
        fieldErrors[field.id] = `${field.label}の形式が正しくありません`;
      normalized[field.id] = value;
    } else if (field.type === 'date') {
      if (!validDate(value)) {
        fieldErrors[field.id] = `${field.label}は正しい日付を入力してください`;
      }
      if (typeof field.min === 'string' && value < field.min)
        fieldErrors[field.id] =
          `${field.label}は${field.min}以降の日付にしてください`;
      if (typeof field.max === 'string' && value > field.max)
        fieldErrors[field.id] =
          `${field.label}は${field.max}以前の日付にしてください`;
      normalized[field.id] = transformDate(value, field.transform);
    } else if (field.type === 'select') {
      if (!(field.options ?? []).some((option) => option.value === value)) {
        fieldErrors[field.id] = `${field.label}の選択値が正しくありません`;
      }
      normalized[field.id] = value;
    } else {
      const integer = /^-?\d+$/.test(value);
      const decimal = /^-?(?:\d+|\d*\.\d+)$/.test(value);
      if (
        (field.type === 'integer' && !integer) ||
        (field.type === 'decimal' && !decimal)
      ) {
        fieldErrors[field.id] =
          `${field.label}は${field.type === 'integer' ? '整数' : '数値'}で入力してください`;
      } else {
        const numberValue = Number(value);
        if (
          !Number.isFinite(numberValue) ||
          (field.type === 'integer' && !Number.isSafeInteger(numberValue))
        ) {
          fieldErrors[field.id] =
            `${field.label}が扱える数値の範囲を超えています`;
        }
        if (typeof field.min === 'number' && numberValue < field.min)
          fieldErrors[field.id] =
            `${field.label}は${field.min}以上で入力してください`;
        if (typeof field.max === 'number' && numberValue > field.max)
          fieldErrors[field.id] =
            `${field.label}は${field.max}以下で入力してください`;
        if (field.type === 'decimal' && field.decimalPlaces !== undefined) {
          const places = value.split('.')[1]?.length ?? 0;
          if (places > field.decimalPlaces)
            fieldErrors[field.id] =
              `${field.label}は小数点以下${field.decimalPlaces}桁以内で入力してください`;
        }
      }
      normalized[field.id] = value;
    }
  }

  const formErrors: string[] = [];
  for (const rule of template.rules ?? []) {
    const before = values[rule.from]?.trim();
    const after = values[rule.to]?.trim();
    if (
      before &&
      after &&
      validDate(before) &&
      validDate(after) &&
      before > after
    ) {
      formErrors.push(rule.message ?? '開始日は終了日以前の日付にしてください');
    }
  }
  if (Object.keys(fieldErrors).length > 0 || formErrors.length > 0) {
    throw new SqlTemplateError(
      422,
      'VALIDATION_ERROR',
      '入力内容を確認してください',
      fieldErrors,
      formErrors
    );
  }
  return normalized;
};
