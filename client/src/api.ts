// Typed RPC client for the standalone server. `api.listMembers({})` POSTs
// `{ action: "listMembers", args: {} }` to /api/actions and returns the typed
// response. Types come straight from `server/src/actions.ts` — no codegen,
// and `import type` keeps server code out of the client bundle.

import type { z } from "zod";
import type { Actions } from "../../server/src/actions";

export type { Actions };

type ActionDef = { request: z.ZodTypeAny; response: z.ZodTypeAny };

type ActionClient<A> = {
  [K in keyof A]: A[K] extends ActionDef
    ? (args: z.infer<A[K]["request"]>) => Promise<z.infer<A[K]["response"]>>
    : never;
};

// Convenience types for deriving request/response shapes from an action name:
//   type Appointment = ApiResponse<"listAppointments">["appointments"][number];
export type ApiRequest<K extends keyof Actions> = Actions[K] extends ActionDef
  ? z.infer<Actions[K]["request"]>
  : never;
export type ApiResponse<K extends keyof Actions> = Actions[K] extends ActionDef
  ? z.infer<Actions[K]["response"]>
  : never;

function createActionClient<A>(baseUrl = "/api/actions"): ActionClient<A> {
  return new Proxy({} as ActionClient<A>, {
    get:
      (_target, prop: string) =>
      async (args: unknown): Promise<unknown> => {
        const res = await fetch(baseUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: prop, args }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
        return body;
      },
  });
}

export const api = createActionClient<Actions>();
