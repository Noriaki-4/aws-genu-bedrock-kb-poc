/* eslint-disable i18nhelper/no-jp-string */
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SqlTemplateError } from './errors';

export interface SqlTemplateRepository {
  getCatalog(): Promise<string>;
  getTemplate(id: string): Promise<string>;
  getMock(reference: string): Promise<string>;
}

export class S3SqlTemplateRepository implements SqlTemplateRepository {
  private readonly client: S3Client;
  private readonly prefix: string;

  constructor(
    private readonly bucket: string,
    prefix: string,
    region: string
  ) {
    this.prefix = prefix.replace(/^\/+|\/+$/g, '');
    this.client = new S3Client({ region });
  }

  private async get(key: string, label: string): Promise<string> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: `${this.prefix}/${key}`,
        })
      );
      if (!response.Body) throw new Error('S3 response body is empty');
      return await response.Body.transformToString('utf-8');
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'NoSuchKey' || name === 'NotFound') {
        throw new SqlTemplateError(
          404,
          'NOT_FOUND',
          `${label}が見つかりません`
        );
      }
      if (error instanceof SqlTemplateError) throw error;
      console.error(`Failed to read ${label} from S3`, error);
      throw new SqlTemplateError(
        500,
        'STORAGE_ERROR',
        `${label}を取得できませんでした`
      );
    }
  }

  getCatalog() {
    return this.get('catalog.yaml', 'SQLテンプレート一覧');
  }

  getTemplate(id: string) {
    return this.get(`templates/${id}.yaml`, 'SQLテンプレート');
  }

  getMock(reference: string) {
    if (!/^mocks\/[a-z][a-z0-9-]{0,63}\.json$/.test(reference)) {
      throw new SqlTemplateError(
        500,
        'TEMPLATE_CONFIGURATION_ERROR',
        'モック参照が不正です'
      );
    }
    return this.get(reference, 'モック結果');
  }
}
