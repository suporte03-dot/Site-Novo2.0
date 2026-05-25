# FinançasCasa — Site-Novo2.0

Gestão financeira residencial 100% offline (HTML + CSS + JS em `index.html`).

## Desenvolvimento local

**Windows:** dê duplo clique em `start.bat` ou, no terminal:

```bash
node serve.js
```

Abra `http://localhost:8000/` (Ctrl+F5 para limpar cache).

Se aparecer *“conexão recusada”*, o servidor parou — execute `start.bat` ou `node serve.js` de novo na pasta do projeto e recarregue a página.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `financas-casa`).
2. Envie os arquivos do projeto — **`index.html` na raiz** é obrigatório.
3. No GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
4. Branch: `main` (ou `master`), pasta: **`/ (root)`**.
5. Aguarde alguns minutos. A URL será: `https://SEU-USUARIO.github.io/SEU-REPO/`

### Arquivos necessários para publicação

| Arquivo | Obrigatório |
|---------|-------------|
| `index.html` | Sim — app completo |
| `serve.js` | Não — só para dev local |

> O app não usa build nem dependências externas. Funciona direto no GitHub Pages.

### Antes de publicar

- Faça backup local (módulo Backup) se já tiver dados no navegador de teste.
- Teste em celular (DevTools → modo responsivo ou dispositivo real).
- Confirme que o Console do navegador está sem erros.

## Backup e dados

Todos os dados ficam em `localStorage` com prefixo `financasCasa_`. Exporte backups periodicamente pelo módulo **Backup**.
