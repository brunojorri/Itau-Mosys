# Itaú Mosys

Itaú Mosys é um painel autoral para Adobe After Effects que organiza e importa assets da biblioteca oficial compartilhada pelo Dropbox.

## Estado atual

- Versão: `0.7.0`
- Biblioteca oficial: `Itaú Digital Craft_/_MotionSystem` dentro do Dropbox sincronizado localmente.
- O painel não permite escolher outra pasta; ele encontra automaticamente a biblioteca oficial no Dropbox de cada usuário.
- Formatos suportados incluem projetos do After Effects, MOGRTs, presets, scripts, imagens, vídeos e áudio.

## Desenvolvimento local

O painel CEP está em [`panel/`](panel/). Para testar no Windows:

1. Feche o After Effects.
2. Execute `panel/install-dev.cmd`.
3. Abra o After Effects e acesse **Janela > Extensões (Legado) > Itaú Mosys**.

O modo de desenvolvimento CEP é necessário enquanto o painel não estiver distribuído como pacote assinado.

## Distribuição

Este repositório é a fonte do código. Não armazene arquivos da biblioteca de assets aqui; eles permanecem no Dropbox. Certificados e chaves de assinatura também não devem ser enviados ao GitHub.

## Estrutura

```text
panel/
  CSXS/manifest.xml
  client/
  host/
  install-dev.cmd
```
