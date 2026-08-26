# Itaú Mosys — painel CEP para After Effects

Versão atual: `0.7.1`

Itaú Mosys é um painel autoral para organizar e importar assets no Adobe After Effects a partir da biblioteca oficial sincronizada pelo Dropbox.

## Recursos

- Localiza automaticamente `_MotionSystem` dentro do Dropbox local, esteja ela em `Itaú Digital Craft_/_MotionSystem` ou compartilhada diretamente na raiz do Dropbox.
- Navega por pastas, com busca, favoritos, grade/lista e ajuste de tamanho dos cartões.
- Mostra imagens estáticas e prévias animadas para vídeos e GIFs.
- Lê `thumb.png` e `thumb.mp4` inseridos em MOGRTs.
- Importa projetos e mídia, aplica presets `.ffx` e executa scripts `.jsx` e `.jsxbin` escolhidos na biblioteca.
- Prepara MOGRTs criados no After Effects e importa o projeto `.aep` interno quando disponível.

## Requisitos

- Adobe After Effects 2020 ou mais recente.
- Dropbox instalado, conectado e com a pasta oficial sincronizada localmente.
- Acesso concedido no Dropbox à pasta `Itaú Digital Craft_/_MotionSystem`.

## Instalação de desenvolvimento no Windows

1. Feche o After Effects.
2. Execute `install-dev.cmd`.
3. Escolha `S` quando o instalador solicitar o modo de desenvolvimento CEP.
4. Abra o After Effects e acesse **Janela > Extensões (Legado) > Itaú Mosys**.

O instalador copia o painel para `%APPDATA%\Adobe\CEP\extensions\motion-shelf`. A distribuição final será feita por pacote assinado e instalador próprio.

## Previews associados

Para um asset sem preview incorporado, use arquivos com o mesmo nome-base:

```text
botao_animado.mogrt
botao_animado_preview.mp4
```

São aceitos previews `.mp4`, `.webm`, `.mov`, `.gif`, `.png`, `.jpg`, `.jpeg` e `.webp`.
