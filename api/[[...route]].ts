import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { cors } from "hono/cors";

export const config = {
  runtime: 'edge'
}

const app = new Hono().basePath('/api')

// CORS configuration for all routes
app.use(
  "*",
  cors({
    origin: [
      "*"
    ],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Type"],
    maxAge: 86400,
  }),
);

app.get('/', (c) => {
  return c.json({ message: 'Hello Hono!' })
})

app.get('/hello', (c) => {
  return c.json({ message: 'Hello from Hono API!' })
})

// More specific 404 handler for API routes only
app.notFound((c) => {
  return c.json({ error: 'API route not found' }, 404)
})

// Register the handler for Vercel Edge Functions
export const GET = handle(app);
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;

// Expose the app for `@hono/vite-dev-server`
export default app;