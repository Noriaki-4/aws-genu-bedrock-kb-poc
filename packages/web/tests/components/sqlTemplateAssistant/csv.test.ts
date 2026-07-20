// Fixtures are Japanese on purpose: they mirror the SQL template mock results
// shipped in local/sql-template-assets.
/* eslint-disable i18nhelper/no-jp-string */
import { describe, expect, it } from 'vitest';
import { SqlTemplateMockResult } from 'generative-ai-use-cases';
import {
  csvFileName,
  toCsv,
} from '../../../src/features/sqlTemplateAssistant/csv';

const result = (
  partial: Partial<SqlTemplateMockResult>
): SqlTemplateMockResult => ({
  columns: [
    { key: 'department', label: '部門', type: 'string' },
    { key: 'totalAmount', label: '売上合計', type: 'number' },
  ],
  rows: [],
  ...partial,
});

describe('toCsv', () => {
  it('列ラベルをヘッダーにし、列定義の順で値を並べる', () => {
    // Keys are deliberately out of order to prove the column definition wins.
    const csv = toCsv(
      result({
        rows: [
          { totalAmount: 1200000, department: '営業' },
          { department: 'サポート', totalAmount: 450000 },
        ],
      })
    );

    expect(csv).toBe(
      ['部門,売上合計', '営業,1200000', 'サポート,450000'].join('\r\n')
    );
  });

  it('カンマ・改行・ダブルクォートを含む値を引用符で囲む', () => {
    const csv = toCsv(
      result({
        rows: [
          { department: '営業,第一', totalAmount: 1 },
          { department: '営業\n第二', totalAmount: 2 },
          { department: '営業"第三"', totalAmount: 3 },
        ],
      })
    );

    expect(csv.split('\r\n').slice(1)).toEqual([
      '"営業,第一",1',
      '"営業\n第二",2',
      '"営業""第三""",3',
    ]);
  });

  it('null・欠損セル・真偽値を変換する', () => {
    const csv = toCsv({
      columns: [
        { key: 'name', label: '名前', type: 'string' },
        { key: 'active', label: '有効', type: 'boolean' },
      ],
      rows: [
        { name: null, active: true },
        { name: '未設定', active: false },
        // 'active' is missing entirely.
        { name: '欠損' },
      ],
    });

    expect(csv.split('\r\n').slice(1)).toEqual([
      ',true',
      '未設定,false',
      '欠損,',
    ]);
  });

  it('行が無い場合はヘッダーだけを返す', () => {
    expect(toCsv(result({ rows: [] }))).toBe('部門,売上合計');
  });

  it('ラベル自体のエスケープも行う', () => {
    const csv = toCsv({
      columns: [{ key: 'a', label: '金額,税込', type: 'number' }],
      rows: [],
    });

    expect(csv).toBe('"金額,税込"');
  });
});

describe('csvFileName', () => {
  it('テンプレートIDと日付からファイル名を作る', () => {
    expect(csvFileName('sales-summary', new Date(2026, 6, 20))).toBe(
      'sales-summary_20260720.csv'
    );
  });

  it('月日を2桁でゼロ埋めする', () => {
    expect(csvFileName('customer-orders', new Date(2026, 0, 5))).toBe(
      'customer-orders_20260105.csv'
    );
  });
});
