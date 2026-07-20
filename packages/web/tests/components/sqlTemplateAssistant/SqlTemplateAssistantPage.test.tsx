// Test fixtures and titles are Japanese on purpose: they mirror the SQL template
// catalog shipped in local/sql-template-assets.
/* eslint-disable i18nhelper/no-jp-string */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import {
  SqlTemplateApiError,
  SqlTemplateCatalog,
  SqlTemplateFormDefinition,
  SqlTemplateMockResponse,
  SqlTemplateRenderResponse,
} from 'generative-ai-use-cases';

// The page is exercised through its API boundary. useSqlTemplatesApi wraps
// useHttp (Cognito + API Gateway), so it is replaced wholesale here.
const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  render: vi.fn(),
  mock: vi.fn(),
}));

vi.mock(
  '../../../src/features/sqlTemplateAssistant/useSqlTemplatesApi',
  () => ({
    default: () => api,
  })
);

// Translation keys are asserted directly to keep the test independent of the
// yaml catalogs. `t` must keep a stable identity across renders, as the real
// react-i18next does: the page's loadCatalog useCallback depends on it, and an
// unstable `t` would re-run the catalog useEffect on every render.
const i18n = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock('react-i18next', () => ({
  useTranslation: () => i18n,
}));

// ButtonCopy pulls in the inter-use-case store, which is irrelevant here. The
// copy target is exposed as an attribute so it does not duplicate the SQL text
// in the DOM.
vi.mock('../../../src/components/ButtonCopy', () => ({
  default: ({ text }: { text: string }) => (
    <button data-testid="copy" data-text={text} />
  ),
}));

import SqlTemplateAssistantPage from '../../../src/pages/SqlTemplateAssistantPage';

const catalog: SqlTemplateCatalog = {
  schemaVersion: 1,
  templates: [
    {
      id: 'sales-summary',
      version: '1.0.0',
      title: '売上集計',
      description: '指定期間の売上を部門単位で集計します',
      category: '売上',
      tags: ['Monthly'],
    },
    {
      id: 'customer-orders',
      version: '1.0.0',
      title: '顧客別注文明細',
      description: '顧客と最低金額を指定して注文明細を抽出します',
      category: '注文',
      tags: ['Customer'],
    },
  ],
};

const form: SqlTemplateFormDefinition = {
  schemaVersion: 1,
  id: 'sales-summary',
  version: '1.0.0',
  title: '売上集計',
  fields: [
    { id: 'from', label: '開始日', type: 'date', required: true },
    { id: 'to', label: '終了日', type: 'date', required: true },
    {
      id: 'dept',
      label: '部門',
      type: 'select',
      required: false,
      options: [{ value: 'sales', label: '営業' }],
    },
  ],
};

const rendered: SqlTemplateRenderResponse = {
  templateId: 'sales-summary',
  version: '1.0.0',
  sql: "SELECT dept FROM sales WHERE d >= '20240101'",
  normalizedValues: { from: '20240101', to: '20240131', dept: 'sales' },
};

const apiError = (data: SqlTemplateApiError) =>
  new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    data,
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: {} as any,
  });

// The page renders each field's error message inside the same <label> as the
// input, so the accessible name grows once validation fails. Anchored patterns
// keep the queries working in both states.
const field = (label: RegExp) => screen.getByLabelText(label);

// Selects the template card and waits for the form to appear.
const openForm = async () => {
  fireEvent.click(await screen.findByText('売上集計'));
  await screen.findByLabelText(/^開始日/);
};

describe('SqlTemplateAssistantPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue(catalog);
    api.get.mockResolvedValue(form);
    api.render.mockResolvedValue(rendered);
  });

  it('カタログを取得し、タグや説明にも大文字小文字を無視して絞り込む', async () => {
    render(<SqlTemplateAssistantPage />);

    expect(await screen.findByText('売上集計')).toBeTruthy();
    expect(screen.queryByText('顧客別注文明細')).toBeTruthy();

    // Tag "Customer" is matched case-insensitively even though it is not shown.
    fireEvent.change(
      screen.getByPlaceholderText('sql_template.search_placeholder'),
      { target: { value: 'cUsToMeR' } }
    );

    expect(screen.queryByText('売上集計')).toBeNull();
    expect(screen.queryByText('顧客別注文明細')).toBeTruthy();

    // Description-only match keeps the other template.
    fireEvent.change(
      screen.getByPlaceholderText('sql_template.search_placeholder'),
      { target: { value: '部門単位' } }
    );

    expect(screen.queryByText('売上集計')).toBeTruthy();
    expect(screen.queryByText('顧客別注文明細')).toBeNull();
  });

  it('テンプレートを選ぶとフォームが空値で初期化される', async () => {
    render(<SqlTemplateAssistantPage />);
    await openForm();

    expect(api.get).toHaveBeenCalledWith('sales-summary');
    expect((field(/^開始日/) as HTMLInputElement).value).toBe('');
    expect((field(/^部門/) as HTMLSelectElement).value).toBe('');
    // The catalog picker is replaced by the form.
    expect(
      screen.queryByPlaceholderText('sql_template.search_placeholder')
    ).toBeNull();
  });

  it('生成失敗時にフィールド単位と全体のエラーを表示する', async () => {
    api.render.mockRejectedValue(
      apiError({
        code: 'VALIDATION_ERROR',
        message: 'sql_template.render_error',
        fieldErrors: { from: '開始日は必須です', to: '終了日は必須です' },
        formErrors: ['開始日は終了日以前にしてください'],
      })
    );

    render(<SqlTemplateAssistantPage />);
    await openForm();
    fireEvent.click(screen.getByText('sql_template.generate'));

    expect(await screen.findByText('開始日は必須です')).toBeTruthy();
    expect(screen.getByText('終了日は必須です')).toBeTruthy();
    expect(screen.getByText('開始日は終了日以前にしてください')).toBeTruthy();
  });

  it('フィールド編集で該当エラーだけを消し、生成済みSQLを破棄する', async () => {
    api.render.mockRejectedValueOnce(
      apiError({
        code: 'VALIDATION_ERROR',
        message: 'sql_template.render_error',
        fieldErrors: { from: '開始日は必須です', to: '終了日は必須です' },
      })
    );

    render(<SqlTemplateAssistantPage />);
    await openForm();
    fireEvent.click(screen.getByText('sql_template.generate'));
    await screen.findByText('開始日は必須です');

    fireEvent.change(field(/^開始日/), { target: { value: '2024-01-01' } });

    expect(screen.queryByText('開始日は必須です')).toBeNull();
    // The untouched field keeps its error.
    expect(screen.queryByText('終了日は必須です')).toBeTruthy();

    // A successful render, then a further edit, must drop the stale SQL.
    fireEvent.click(screen.getByText('sql_template.generate'));
    expect(await screen.findByText(rendered.sql)).toBeTruthy();

    fireEvent.change(field(/^終了日/), { target: { value: '2024-01-31' } });
    expect(screen.queryByText(rendered.sql)).toBeNull();
  });

  it('モック実行結果を列定義の順で描画し、欠損セルを空にする', async () => {
    const mockResponse: SqlTemplateMockResponse = {
      ...rendered,
      result: {
        columns: [
          { key: 'dept', label: '部門', type: 'string' },
          { key: 'amount', label: '金額', type: 'number' },
        ],
        rows: [{ dept: '営業', amount: 100 }, { dept: '開発' }],
      },
    };
    api.mock.mockResolvedValue(mockResponse);

    render(<SqlTemplateAssistantPage />);
    await openForm();
    fireEvent.click(screen.getByText('sql_template.generate'));
    fireEvent.click(await screen.findByText('sql_template.execute'));

    await screen.findByText('sql_template.mock_result');

    const headers = screen
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['部門', '金額']);

    const rows = screen.getAllByRole('row').slice(1);
    expect(
      rows.map((row) =>
        Array.from(row.querySelectorAll('td')).map((td) => td.textContent)
      )
    ).toEqual([
      ['営業', '100'],
      ['開発', ''],
    ]);

    expect(api.mock).toHaveBeenCalledWith('sales-summary', {
      version: '1.0.0',
      values: { from: '', to: '', dept: '' },
    });
  });

  it('モック結果をBOM付きCSVとしてダウンロードする', async () => {
    const mockResponse: SqlTemplateMockResponse = {
      ...rendered,
      result: {
        columns: [
          { key: 'dept', label: '部門', type: 'string' },
          { key: 'amount', label: '金額', type: 'number' },
        ],
        rows: [{ dept: '営業', amount: 100 }],
      },
    };
    api.mock.mockResolvedValue(mockResponse);

    // jsdom implements neither of these.
    const createObjectURL = vi.fn((blob: Blob) => `blob:stub?${blob.size}`);
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    render(<SqlTemplateAssistantPage />);
    await openForm();
    fireEvent.click(screen.getByText('sql_template.generate'));
    fireEvent.click(await screen.findByText('sql_template.execute'));
    fireEvent.click(await screen.findByText('sql_template.download_csv'));

    expect(click).toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0][0] as unknown as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8;');

    // Blob.text() UTF-8-decodes, and that strips the leading BOM, so the raw
    // bytes are checked instead: Excel only reads UTF-8 when EF BB BF is first.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(await blob.text()).toBe('部門,金額\r\n営業,100');
    // The object URL must not be leaked.
    expect(revokeObjectURL).toHaveBeenCalledWith(
      createObjectURL.mock.results[0].value
    );
  });

  it('カタログ取得失敗時に再試行できる', async () => {
    api.list.mockRejectedValueOnce(
      apiError({ code: 'S3_ERROR', message: 'sql_template.load_error' })
    );

    render(<SqlTemplateAssistantPage />);

    expect(await screen.findByText('sql_template.load_error')).toBeTruthy();
    fireEvent.click(screen.getByText('sql_template.retry'));

    expect(await screen.findByText('売上集計')).toBeTruthy();
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('sql_template.load_error')).toBeNull();
  });
});
