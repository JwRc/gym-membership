/**
 * Worker da Cloudflare que serve o front (arquivos de dist/) e encaminha
 * /api/* para a API no Cloud Run. Assim o front e a API ficam na mesma origem
 * (sem CORS) e a URL do Cloud Run não vai para o bundle.
 *
 * Configure no Worker (Configurações › Variáveis e segredos), como variável de texto:
 *   API_ORIGIN = https://gym-api-xxxxxxxxxx.southamerica-east1.run.app  (sem barra no final)
 *
 * O roteamento (só /api/* passa por aqui; o resto são os arquivos, com fallback
 * de SPA) está no wrangler.jsonc.
 */
interface Env {
  API_ORIGIN?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const json = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } });

async function proxy(request: Request, env: Env): Promise<Response> {
  const origin = env.API_ORIGIN?.trim().replace(/\/+$/, '');
  if (!origin) return json(500, 'API_ORIGIN não configurada no Worker.');

  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete('host'); // o fetch usa o host do Cloud Run

  try {
    const res = await fetch(origin + url.pathname + url.search, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
    return new Response(res.body, res);
  } catch {
    return json(502, 'Não foi possível falar com a API. Tente de novo em instantes.');
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) return proxy(request, env);
    return env.ASSETS.fetch(request);
  },
};
