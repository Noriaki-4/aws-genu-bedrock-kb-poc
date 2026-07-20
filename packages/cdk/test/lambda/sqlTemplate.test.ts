/* eslint-disable i18nhelper/no-jp-string */
import { SqlTemplateDefinition } from 'generative-ai-use-cases';
import { readFileSync } from 'fs';
import path from 'path';
import { SqlTemplateError } from '../../lambda/sqlTemplate/errors';
import { renderSql } from '../../lambda/sqlTemplate/renderer';
import { SqlTemplateRepository } from '../../lambda/sqlTemplate/repository';
import { SqlTemplateService } from '../../lambda/sqlTemplate/service';
import {
  parseCatalog,
  parseMockResult,
  parseTemplate,
} from '../../lambda/sqlTemplate/schemas';
import { validateValues } from '../../lambda/sqlTemplate/validator';

const definition: SqlTemplateDefinition = {
  schemaVersion: 1,
  id: 'sales-summary',
  version: '1.0.0',
  title: '売上集計',
  fields: [
    {
      id: 'startDate',
      label: '開始日',
      type: 'date',
      required: true,
      transform: { dateFormat: 'yyyyMMdd' },
      sqlLiteral: 'string',
    },
    {
      id: 'endDate',
      label: '終了日',
      type: 'date',
      required: true,
      transform: { dateFormat: 'yyyyMMdd' },
      sqlLiteral: 'string',
    },
    {
      id: 'department',
      label: '部門',
      type: 'select',
      required: true,
      options: [
        { value: "sales'west", label: '営業西部' },
        { value: 'support', label: 'サポート' },
      ],
      sqlLiteral: 'string',
    },
  ],
  rules: [
    {
      type: 'dateOrder',
      from: 'startDate',
      to: 'endDate',
      message: '開始日は終了日以前にしてください',
    },
  ],
  sql: 'SELECT * FROM sales WHERE sold_at BETWEEN {{startDate}} AND {{endDate}} AND department = {{department}}',
  mockResultRef: 'mocks/sales-summary.json',
};

describe('SQL Template Assistant', () => {
  test('リポジトリ同梱のS3サンプル資材がデータ契約に適合する', () => {
    const assets = path.resolve(
      __dirname,
      '../../../../local/sql-template-assets'
    );
    const catalog = parseCatalog(
      readFileSync(path.join(assets, 'catalog.yaml'), 'utf8')
    );
    const template = parseTemplate(
      readFileSync(path.join(assets, 'templates/sales-summary.yaml'), 'utf8')
    );
    const mock = parseMockResult(
      readFileSync(path.join(assets, 'mocks/sales-summary.json'), 'utf8')
    );

    expect(catalog.templates).toHaveLength(2);
    expect(template.id).toBe('sales-summary');
    expect(template.sql).toContain('INNER JOIN departments');
    expect(mock.rows).toHaveLength(2);
  });

  test('日付を変換し、文字列リテラルを安全にエスケープする', () => {
    const values = validateValues(definition, {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      department: "sales'west",
    });

    expect(values.startDate).toBe('20260701');
    expect(renderSql(definition, values)).toContain(
      "department = 'sales''west'"
    );
  });

  test('必須、select、日付順序のエラーを構造化して返す', () => {
    try {
      validateValues(definition, {
        startDate: '2026-08-01',
        endDate: '2026-07-31',
        department: 'unknown',
      });
      throw new Error('validation must fail');
    } catch (error) {
      expect(error).toBeInstanceOf(SqlTemplateError);
      const typed = error as SqlTemplateError;
      expect(typed.statusCode).toBe(422);
      expect(typed.fieldErrors?.department).toBeDefined();
      expect(typed.formErrors).toEqual(['開始日は終了日以前にしてください']);
    }
  });

  test('フォーム取得レスポンスからSQLとモック参照を除外する', async () => {
    const repository: SqlTemplateRepository = {
      getCatalog: async () =>
        `schemaVersion: 1\ntemplates:\n  - id: sales-summary\n    version: '1.0.0'\n    title: 売上集計\n`,
      getTemplate: async () =>
        `schemaVersion: 1\nid: sales-summary\nversion: '1.0.0'\ntitle: 売上集計\nfields:\n  - id: department\n    label: 部門\n    type: select\n    required: true\n    options:\n      - value: sales\n        label: 営業\n    sqlLiteral: string\nsql: SELECT * FROM sales WHERE department = {{department}}\nmockResultRef: mocks/sales-summary.json\n`,
      getMock: async () => '{"columns":[],"rows":[]}',
    };
    const form = await new SqlTemplateService(repository).form('sales-summary');

    expect(form).not.toHaveProperty('sql');
    expect(form).not.toHaveProperty('mockResultRef');
  });
});
