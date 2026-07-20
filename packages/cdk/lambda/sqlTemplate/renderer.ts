/* eslint-disable i18nhelper/no-jp-string */
import {
  SqlTemplateDefinition,
  SqlTemplateValues,
} from 'generative-ai-use-cases';
import { configurationError } from './errors';

const stringLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

export const renderSql = (
  template: SqlTemplateDefinition,
  normalizedValues: SqlTemplateValues
): string => {
  const fields = new Map(template.fields.map((field) => [field.id, field]));
  return template.sql.replace(
    /\{\{([a-zA-Z0-9_-]+)\}\}/g,
    (_token, id: string) => {
      const field = fields.get(id);
      if (!field)
        throw configurationError(
          `SQLが未知のフィールド ${id} を参照しています`
        );
      const value = normalizedValues[id];
      if (value === undefined)
        throw configurationError(`フィールド ${id} の値がありません`);
      const literal =
        field.sqlLiteral ??
        (field.type === 'integer' || field.type === 'decimal'
          ? field.type
          : 'string');
      return literal === 'string' ? stringLiteral(value) : value;
    }
  );
};
