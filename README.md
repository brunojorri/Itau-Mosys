# Itaú Mosys

Itaú Mosys é um painel autoral para Adobe After Effects que organiza, visualiza e importa os assets oficiais do Motion System hospedados no Cloudflare.

## Estado atual

- Versão: `0.7.1`
- Biblioteca oficial: catálogo privado hospedado no Cloudflare R2.
- O painel não permite escolher outra pasta: ele se conecta somente à biblioteca oficial do Motion System.
- Ao clicar em **Conectar**, o navegador solicita uma autorização única para aquele computador. Em seguida, o painel exibe capas e previews em movimento e baixa o asset selecionado quando ele for utilizado.
- Formatos disponíveis atualmente: MOGRTs, SVGs e vídeos.

## Desenvolvimento local

O painel CEP está em [`panel/`](panel/). Para testar no Windows:

1. Feche o After Effects.
2. Execute `panel/install-dev.cmd`.
3. Abra o After Effects e acesse **Janela > Extensões (Legado) > Itaú Mosys**.

O modo de desenvolvimento CEP é necessário enquanto o painel não estiver distribuído como pacote assinado.

## Instalação rápida no Windows

Feche o After Effects, abra o **PowerShell** e execute uma única vez:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force; irm https://raw.githubusercontent.com/brunojorri/Itau-Mosys/main/install/windows/bootstrap.ps1 | iex
```

O comando baixa a versão oficial deste repositório, instala o painel para o usuário atual e ativa o modo de desenvolvimento CEP 12 necessário para o protótipo. Depois, abra-o e acesse **Janela > Extensões (Legado) > Itaú Mosys**. Use o botão **Conectar** no topo do painel, confirme o acesso no navegador com o e-mail autorizado e retorne ao After Effects.

Não é necessário instalar, sincronizar ou ter acesso ao Dropbox.

## Distribuição

Este repositório é a fonte do código. Os assets, capas e previews permanecem em uma biblioteca privada no Cloudflare R2 e não são enviados ao GitHub. Certificados, chaves de assinatura e tokens de acesso também não devem ser enviados ao GitHub.

## Estrutura

```text
panel/
  CSXS/manifest.xml
  client/
  host/
  install-dev.cmd
```
