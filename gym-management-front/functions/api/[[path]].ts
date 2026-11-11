/**
 * Cloudflare Pages Function: encaminha /api/* para a API no Cloud Run.
 * Assim o front e a API ficam na mesma origem (sem CORS) e a URL do Cloud Run
 * não vai para o bundle.
 *
 * Configure no projeto do Pages (Configurações › Variáveis e segredos):
 *   API_ORIGIN = https://gym-api-xxxxxxxxxx.southamerica-east1.run.app  (sem barra no final)
 */
interface Env {
  API_ORIGIN?: string;
}

const json = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } });

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const origin = env.API_ORIGIN?.trim().replace(/\/+$/, '');
  if (!origin) return json(500, 'API_ORIGIN não configurada no Cloudflare Pages.');

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
};
