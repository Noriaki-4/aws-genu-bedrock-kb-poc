import { SqlTemplateApiError } from 'generative-ai-use-cases';

export class SqlTemplateError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string>,
    readonly formErrors?: string[]
  ) {
    super(message);
    this.name = 'SqlTemplateError';
  }

  toResponse(): SqlTemplateApiError {
    return {
      code: this.code,
      message: this.message,
      ...(this.fieldErrors ? { fieldErrors: this.fieldErrors } : {}),
      ...(this.formErrors ? { formErrors: this.formErrors } : {}),
    };
  }
}

export const configurationError = (message: string) =>
  new SqlTemplateError(500, 'TEMPLATE_CONFIGURATION_ERROR', message);
