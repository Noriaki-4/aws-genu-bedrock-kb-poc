import { useMemo } from 'react';
import {
  SqlTemplateCatalog,
  SqlTemplateFormDefinition,
  SqlTemplateMockResponse,
  SqlTemplateRenderRequest,
  SqlTemplateRenderResponse,
} from 'generative-ai-use-cases';
import useHttp from '../../hooks/useHttp';

const useSqlTemplatesApi = () => {
  const { api } = useHttp();
  return useMemo(
    () => ({
      list: () =>
        api.get<SqlTemplateCatalog>('/sql-templates').then((res) => res.data),
      get: (id: string) =>
        api
          .get<SqlTemplateFormDefinition>(`/sql-templates/${id}`)
          .then((res) => res.data),
      render: (id: string, request: SqlTemplateRenderRequest) =>
        api
          .post<SqlTemplateRenderResponse>(
            `/sql-templates/${id}/render`,
            request
          )
          .then((res) => res.data),
      mock: (id: string, request: SqlTemplateRenderRequest) =>
        api
          .post<SqlTemplateMockResponse>(`/sql-templates/${id}/mock`, request)
          .then((res) => res.data),
    }),
    [api]
  );
};

export default useSqlTemplatesApi;
