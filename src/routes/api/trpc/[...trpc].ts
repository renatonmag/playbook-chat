import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createTRPCContext } from "~/server/trpc/context";
import { appRouter } from "~/server/trpc/router";

const handler = (request: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: createTRPCContext
  });

export const GET = ({ request }: { request: Request }) => handler(request);
export const POST = ({ request }: { request: Request }) => handler(request);
