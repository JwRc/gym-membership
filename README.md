# gym-management-front

Front-end do sistema de gestão de academias, baseado no protótipo **Academia Tatame v2**: tema escuro por padrão, tema claro opcional, fontes Geist e Geist Mono.

**Stack:** React 19 · TypeScript · Vite 7 · React Router 7 · TanStack Query 5 · axios

## Rodando localmente

Suba primeiro a API (`gym-management-back`). Depois:

```bash
npm install
npm run dev        # http://localhost:5173 (faz proxy de /api para http://localhost:3000)
```

Em desenvolvimento, a tela de login mostra as contas de demonstração; clique numa delas para preencher.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `VITE_API_URL` | `/api` | URL base da API no build |
| `VITE_API_PROXY` | `http://localhost:3000` | destino do proxy do `npm run dev` |
| `VITE_SHOW_DEMOS` | — | `true` para mostrar as contas de demonstração fora do modo dev |

## Telas

**Gestão (admin):**
- Início: painel ou primeiros passos, para academias novas
- Alunos: lista com filtros e Ctrl K para buscar, ficha do aluno e financeiro do aluno
- Turmas: calendário semanal; arraste para mover um horário, clique no vazio para criar, com aviso de conflito
- Graduação, Financeiro, Loja, Modalidades (catálogo × cópias da academia) e Configurações

**Área do aluno:** Início (próxima aula, graduação, turmas e dados) e Mensalidades (pagar com Pix, ainda fictício).

Modais: novo/editar aluno, registrar graduação, novo lançamento, lançar mensalidade, registrar pagamento, novo horário, produto, venda e editor de modalidade.

## Estrutura

```
src/
  api/          cliente axios (token JWT, 401 → logout) e tipos das respostas
  auth/         AppContext: sessão, tema, toast
  components/   UI base (botões, pills, faixa, avatar, modal), layout com sidebar e blocos reutilizados
  modals/       formulários em modal + useMutate (toast + invalidação das queries)
  pages/        telas de gestão e portal/ (área do aluno)
  lib/          formatação (R$, datas pt-BR) e tema
  styles.css    tokens de cor do design (escuro/claro) e classes de componentes
```

O layout é desktop-first (largura mínima de cerca de 1180px), como no protótipo.
