import type { LangfuseTraceClient } from 'langfuse';
export { langfuse } from '../utils/langfuse';

declare global {
  namespace Express {
    interface Request {
      langfuseTrace?: LangfuseTraceClient;
    }
  }
}
