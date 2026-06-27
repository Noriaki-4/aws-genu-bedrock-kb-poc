import { Langfuse } from 'langfuse';
import type { LangfuseTraceClient } from 'langfuse';

declare global {
  namespace Express {
    interface Request {
      langfuseTrace?: LangfuseTraceClient;
    }
  }
}

// null when LANGFUSE_ENABLED is not 'true' so every call site can no-op cheaply
export const langfuse: Langfuse | null =
  process.env.LANGFUSE_ENABLED === 'true'
    ? new Langfuse({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_HOST,
      })
    : null;
