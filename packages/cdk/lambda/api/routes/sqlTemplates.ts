/* eslint-disable i18nhelper/no-jp-string */
import { NextFunction, Request, Response, Router } from 'express';
import { SqlTemplateError } from '../../sqlTemplate/errors';
import { S3SqlTemplateRepository } from '../../sqlTemplate/repository';
import { parseRenderRequest } from '../../sqlTemplate/schemas';
import { SqlTemplateService } from '../../sqlTemplate/service';

export const router = Router();

const enabled = process.env.SQL_TEMPLATE_ASSISTANT_ENABLED === 'true';
const bucket = process.env.SQL_TEMPLATE_BUCKET_NAME ?? '';
const prefix = process.env.SQL_TEMPLATE_PREFIX ?? '';
const region =
  process.env.SQL_TEMPLATE_BUCKET_REGION ?? process.env.AWS_REGION ?? '';

const service =
  enabled && bucket && prefix && region
    ? new SqlTemplateService(
        new S3SqlTemplateRepository(bucket, prefix, region)
      )
    : undefined;

const handle =
  (fn: (req: Request) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!enabled) {
        throw new SqlTemplateError(
          404,
          'FEATURE_DISABLED',
          'SQL作成アシスタントは無効です'
        );
      }
      if (!service) {
        throw new SqlTemplateError(
          500,
          'CONFIGURATION_ERROR',
          'SQL作成アシスタントのS3設定が不足しています'
        );
      }
      res.json(await fn(req));
    } catch (error) {
      if (error instanceof SqlTemplateError) {
        res.status(error.statusCode).json(error.toResponse());
        return;
      }
      next(error);
    }
  };

const validId = (value: string) => /^[a-z][a-z0-9-]{0,63}$/.test(value);
const id = (req: Request) => {
  if (!validId(req.params.id)) {
    throw new SqlTemplateError(
      400,
      'INVALID_REQUEST',
      'テンプレートIDが不正です'
    );
  }
  return req.params.id;
};

router.get(
  '/',
  handle(async () => service!.list())
);
router.get(
  '/:id',
  handle(async (req) => service!.form(id(req)))
);
router.post(
  '/:id/render',
  handle(async (req) => service!.render(id(req), parseRenderRequest(req.body)))
);
router.post(
  '/:id/mock',
  handle(async (req) => service!.mock(id(req), parseRenderRequest(req.body)))
);
