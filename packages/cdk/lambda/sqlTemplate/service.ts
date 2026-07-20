/* eslint-disable i18nhelper/no-jp-string */
import {
  SqlTemplateCatalog,
  SqlTemplateDefinition,
  SqlTemplateFormDefinition,
  SqlTemplateMockResponse,
  SqlTemplateRenderRequest,
  SqlTemplateRenderResponse,
} from 'generative-ai-use-cases';
import { SqlTemplateError, configurationError } from './errors';
import { SqlTemplateRepository } from './repository';
import { parseCatalog, parseMockResult, parseTemplate } from './schemas';
import { validateValues } from './validator';
import { renderSql } from './renderer';

export class SqlTemplateService {
  constructor(private readonly repository: SqlTemplateRepository) {}

  async list(): Promise<SqlTemplateCatalog> {
    return parseCatalog(await this.repository.getCatalog());
  }

  private async load(id: string): Promise<SqlTemplateDefinition> {
    const [catalog, template] = await Promise.all([
      this.list(),
      this.repository.getTemplate(id).then(parseTemplate),
    ]);
    const item = catalog.templates.find((candidate) => candidate.id === id);
    if (!item)
      throw new SqlTemplateError(
        404,
        'NOT_FOUND',
        'SQLテンプレートが見つかりません'
      );
    if (item.version !== template.version || item.id !== template.id) {
      throw configurationError(
        'catalog.yamlとSQLテンプレートのIDまたはversionが一致しません'
      );
    }
    return template;
  }

  async form(id: string): Promise<SqlTemplateFormDefinition> {
    const template = await this.load(id);
    return {
      schemaVersion: template.schemaVersion,
      id: template.id,
      version: template.version,
      title: template.title,
      ...(template.description ? { description: template.description } : {}),
      ...(template.category ? { category: template.category } : {}),
      ...(template.tags ? { tags: template.tags } : {}),
      fields: template.fields,
      ...(template.rules ? { rules: template.rules } : {}),
    };
  }

  async render(
    id: string,
    request: SqlTemplateRenderRequest
  ): Promise<SqlTemplateRenderResponse> {
    const template = await this.load(id);
    if (request.version !== template.version) {
      throw new SqlTemplateError(
        409,
        'VERSION_CONFLICT',
        'テンプレートが更新されています。再読み込みしてください'
      );
    }
    const normalizedValues = validateValues(template, request.values);
    return {
      templateId: template.id,
      version: template.version,
      sql: renderSql(template, normalizedValues),
      normalizedValues,
    };
  }

  async mock(
    id: string,
    request: SqlTemplateRenderRequest
  ): Promise<SqlTemplateMockResponse> {
    const template = await this.load(id);
    if (request.version !== template.version) {
      throw new SqlTemplateError(
        409,
        'VERSION_CONFLICT',
        'テンプレートが更新されています。再読み込みしてください'
      );
    }
    const normalizedValues = validateValues(template, request.values);
    const rendered = {
      templateId: template.id,
      version: template.version,
      sql: renderSql(template, normalizedValues),
      normalizedValues,
    };
    const result = parseMockResult(
      await this.repository.getMock(template.mockResultRef)
    );
    return { ...rendered, result };
  }
}
