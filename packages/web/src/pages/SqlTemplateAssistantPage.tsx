import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import {
  SqlTemplateApiError,
  SqlTemplateCatalogItem,
  SqlTemplateFormDefinition,
  SqlTemplateMockResponse,
  SqlTemplateRenderResponse,
  SqlTemplateValues,
} from 'generative-ai-use-cases';
import { PiDatabase, PiMagnifyingGlass, PiUser } from 'react-icons/pi';
import Button from '../components/Button';
import ButtonCopy from '../components/ButtonCopy';
import useSqlTemplatesApi from '../features/sqlTemplateAssistant/useSqlTemplatesApi';
import {
  csvFileName,
  downloadCsv,
  toCsv,
} from '../features/sqlTemplateAssistant/csv';

const errorData = (error: unknown): SqlTemplateApiError | undefined =>
  error instanceof AxiosError
    ? (error.response?.data as SqlTemplateApiError)
    : undefined;

const Bubble: React.FC<{ user?: boolean; children: React.ReactNode }> = ({
  user,
  children,
}) => (
  <div className={`flex gap-2 ${user ? 'justify-end' : 'justify-start'}`}>
    {!user && (
      <div className="bg-aws-squid-ink mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-white">
        <PiDatabase />
      </div>
    )}
    <div
      className={`max-w-4xl rounded-xl px-4 py-3 ${
        user ? 'bg-aws-sky/20' : 'border border-gray-200 bg-white shadow-sm'
      }`}>
      {children}
    </div>
    {user && (
      <div className="bg-aws-smile mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-white">
        <PiUser />
      </div>
    )}
  </div>
);

const SqlTemplateAssistantPage: React.FC = () => {
  const { t } = useTranslation();
  const api = useSqlTemplatesApi();
  const [catalog, setCatalog] = useState<SqlTemplateCatalogItem[]>([]);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState<SqlTemplateFormDefinition>();
  const [values, setValues] = useState<SqlTemplateValues>({});
  const [rendered, setRendered] = useState<SqlTemplateRenderResponse>();
  const [mock, setMock] = useState<SqlTemplateMockResponse>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadCatalog = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .list()
      .then((data) => setCatalog(data.templates))
      .catch((cause) =>
        setError(errorData(cause)?.message ?? t('sql_template.load_error'))
      )
      .finally(() => setLoading(false));
  }, [api, t]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return catalog;
    return catalog.filter((item) =>
      [item.title, item.description, item.category, ...(item.tags ?? [])]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }, [catalog, filter]);

  const setFieldValue = useCallback((id: string, value: string) => {
    setValues((current) => ({ ...current, [id]: value }));
    setRendered(undefined);
    setMock(undefined);
    setError('');
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setFormErrors([]);
  }, []);

  const choose = useCallback(
    async (item: SqlTemplateCatalogItem) => {
      setLoading(true);
      setError('');
      setRendered(undefined);
      setMock(undefined);
      setFieldErrors({});
      setFormErrors([]);
      try {
        const next = await api.get(item.id);
        setForm(next);
        setValues(
          Object.fromEntries(next.fields.map((field) => [field.id, '']))
        );
      } catch (cause) {
        setError(errorData(cause)?.message ?? t('sql_template.load_error'));
      } finally {
        setLoading(false);
      }
    },
    [api, t]
  );

  const generate = useCallback(async () => {
    if (!form) return;
    setLoading(true);
    setError('');
    setFieldErrors({});
    setFormErrors([]);
    setMock(undefined);
    try {
      setRendered(await api.render(form.id, { version: form.version, values }));
    } catch (cause) {
      const data = errorData(cause);
      setFieldErrors(data?.fieldErrors ?? {});
      setFormErrors(data?.formErrors ?? []);
      setError(data?.message ?? t('sql_template.render_error'));
    } finally {
      setLoading(false);
    }
  }, [api, form, t, values]);

  const execute = useCallback(async () => {
    if (!form) return;
    setLoading(true);
    setError('');
    try {
      setMock(await api.mock(form.id, { version: form.version, values }));
    } catch (cause) {
      const data = errorData(cause);
      setFieldErrors(data?.fieldErrors ?? {});
      setFormErrors(data?.formErrors ?? []);
      setError(data?.message ?? t('sql_template.execute_error'));
    } finally {
      setLoading(false);
    }
  }, [api, form, t, values]);

  const download = (response: SqlTemplateMockResponse) => {
    downloadCsv(csvFileName(response.templateId), toCsv(response.result));
  };

  const reset = () => {
    setForm(undefined);
    setRendered(undefined);
    setMock(undefined);
    setValues({});
    setError('');
    setFieldErrors({});
    setFormErrors([]);
  };

  const retrySameTemplate = () => {
    if (!form) return;
    setValues(Object.fromEntries(form.fields.map((field) => [field.id, ''])));
    setRendered(undefined);
    setMock(undefined);
    setError('');
    setFieldErrors({});
    setFormErrors([]);
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-3 py-5 lg:px-8">
      <h1 className="text-center text-xl font-semibold">
        {t('sql_template.title')}
      </h1>

      <Bubble>
        <p>{t('sql_template.choose_prompt')}</p>
        {!form && (
          <div className="mt-3">
            <label className="relative block">
              <PiMagnifyingGlass className="absolute left-3 top-3 text-gray-500" />
              <input
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3"
                value={filter}
                placeholder={t('sql_template.search_placeholder')}
                onChange={(event) => setFilter(event.target.value)}
              />
            </label>
            <div className="mt-3 grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  className="hover:border-aws-smile rounded-lg border border-gray-200 p-3 text-left hover:bg-orange-50 disabled:opacity-50"
                  disabled={loading}
                  onClick={() => choose(item)}>
                  <span className="font-semibold">{item.title}</span>
                  {item.description && (
                    <span className="mt-1 line-clamp-2 block text-sm text-gray-600">
                      {item.description}
                    </span>
                  )}
                  {item.category && (
                    <span className="mt-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs">
                      {item.category}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </Bubble>

      {form && (
        <>
          <Bubble user>
            <p>{form.title}</p>
          </Bubble>
          <Bubble>
            <p className="font-semibold">{t('sql_template.input_prompt')}</p>
            {form.description && (
              <p className="mt-1 text-sm text-gray-600">{form.description}</p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {form.fields.map((field) => (
                <label
                  key={field.id}
                  className={field.multiline ? 'sm:col-span-2' : ''}>
                  <span className="text-sm font-medium">{field.label}</span>
                  {field.description && (
                    <span className="ml-2 text-xs text-gray-500">
                      {field.description}
                    </span>
                  )}
                  {field.type === 'select' ? (
                    <select
                      className="mt-1 w-full rounded border border-gray-300 p-2"
                      value={values[field.id] ?? ''}
                      onChange={(event) =>
                        setFieldValue(field.id, event.target.value)
                      }>
                      <option value="">
                        {t('sql_template.select_placeholder')}
                      </option>
                      {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.multiline ? (
                    <textarea
                      className="mt-1 w-full rounded border border-gray-300 p-2"
                      rows={3}
                      value={values[field.id] ?? ''}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        setFieldValue(field.id, event.target.value)
                      }
                    />
                  ) : (
                    <input
                      className="mt-1 w-full rounded border border-gray-300 p-2"
                      type={
                        field.type === 'date'
                          ? 'date'
                          : field.type === 'text'
                            ? 'text'
                            : 'number'
                      }
                      step={field.type === 'decimal' ? 'any' : undefined}
                      min={field.min}
                      max={field.max}
                      value={values[field.id] ?? ''}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        setFieldValue(field.id, event.target.value)
                      }
                    />
                  )}
                  {fieldErrors[field.id] && (
                    <span className="mt-1 block text-sm text-red-600">
                      {fieldErrors[field.id]}
                    </span>
                  )}
                </label>
              ))}
            </div>
            {formErrors.map((message) => (
              <p key={message} className="mt-2 text-sm text-red-600">
                {message}
              </p>
            ))}
            <div className="mt-4 flex justify-end gap-2">
              <Button outlined onClick={reset}>
                {t('sql_template.change_template')}
              </Button>
              <Button loading={loading} onClick={generate}>
                {t('sql_template.generate')}
              </Button>
            </div>
          </Bubble>
        </>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-red-700">
          <span>{error}</span>
          {!form && catalog.length === 0 && (
            <Button className="mt-2" outlined onClick={loadCatalog}>
              {t('sql_template.retry')}
            </Button>
          )}
        </div>
      )}

      {rendered && (
        <Bubble>
          <p className="font-semibold">{t('sql_template.generated')}</p>
          <div className="relative mt-2 overflow-x-auto rounded bg-gray-900 p-4 text-sm text-gray-100">
            <pre>{rendered.sql}</pre>
            <ButtonCopy
              className="absolute right-2 top-2 text-white"
              text={rendered.sql}
            />
          </div>
          <p className="mt-4">{t('sql_template.execute_prompt')}</p>
          <div className="mt-3 flex justify-end">
            <Button loading={loading} onClick={execute}>
              {t('sql_template.execute')}
            </Button>
          </div>
        </Bubble>
      )}

      {mock && (
        <Bubble>
          <p className="font-semibold">{t('sql_template.mock_result')}</p>
          <p className="mt-1 text-xs text-gray-500">
            {t('sql_template.mock_notice')}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  {mock.result.columns.map((column) => (
                    <th
                      key={column.key}
                      className="border bg-gray-100 px-3 py-2 text-left">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mock.result.rows.map((row, index) => (
                  <tr key={index}>
                    {mock.result.columns.map((column) => (
                      <td key={column.key} className="border px-3 py-2">
                        {String(row[column.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button outlined onClick={() => download(mock)}>
              {t('sql_template.download_csv')}
            </Button>
            <Button outlined onClick={reset}>
              {t('sql_template.another_template')}
            </Button>
            <Button onClick={retrySameTemplate}>
              {t('sql_template.same_template')}
            </Button>
          </div>
        </Bubble>
      )}
    </div>
  );
};

export default SqlTemplateAssistantPage;
