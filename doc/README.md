# GhostWriter - Documentacao Tecnica

## Visao Geral

GhostWriter e uma aplicacao desktop Windows para criacao de notas de reuniao em tempo real. Opera sem gravar reunioes, entrar em chamadas ou competir pela atencao do usuario.

**Principios Core:**
- Idle por padrao
- Acao explicita do usuario
- Processamento local/efemero
- Zero configuracao manual

---

## Arquitetura

### Stack Tecnologico

| Componente | Tecnologia |
|------------|------------|
| Framework | Electron |
| Linguagem | TypeScript |
| Runtime | Node.js |
| Audio | WASAPI (Windows Audio Session API) |
| Transcricao | Whisper.cpp (local) |
| UI | Vanilla JS + CSS |

### Modelo de Processos Electron

```
+------------------+     IPC      +------------------+
|   Main Process   | <----------> | Renderer Process |
|   (Node.js)      |              |   (Chromium)     |
+------------------+              +------------------+
        |
        v
+------------------+
|  Native Addons   |
|  (WASAPI C++)    |
+------------------+
```

**Main Process (`src/main/`):**
- Ambiente Node.js
- Gerencia APIs do sistema
- Controla maquina de estados
- Orquestra captura de audio e transcricao

**Renderer Process (`src/renderer/`):**
- Ambiente browser (Chromium)
- Renderiza UI baseada em estado
- Despacha eventos via IPC

---

## Estrutura de Diretorios

```
ghostWriter/
├── apps/
│   └── desktop/
│       ├── src/
│       │   ├── main/           # Processo principal Electron
│       │   │   ├── audio/      # Captura de audio
│       │   │   ├── cognitive/  # Buffer de texto
│       │   │   ├── state/      # Maquina de estados
│       │   │   ├── transcription/ # Integracao Whisper
│       │   │   ├── main.ts     # Entry point
│       │   │   └── preload.ts  # Bridge IPC
│       │   └── renderer/       # UI (browser)
│       │       └── renderer.ts
│       ├── native/
│       │   ├── wasapi-loopback/ # Addon C++ para captura
│       │   └── whisper/         # Binarios Whisper.cpp
│       ├── dist/               # Build output
│       └── index.html          # HTML + CSS
└── doc/                        # Documentacao
```

---

## Maquina de Estados

A aplicacao usa uma maquina de estados finita com tres estados:

```
     START_MEETING              STOP_MEETING
IDLE ───────────────> CAPTURING ───────────────> REVIEW
  ^                                                 |
  |                    SAVE_NOTES                   |
  +────────────────────────────────────────────────+
  |                   DISCARD_NOTES                 |
  +<────────────────────────────────────────────────+
```

### Estados

| Estado | Descricao |
|--------|-----------|
| `IDLE` | Aguardando usuario iniciar reuniao |
| `CAPTURING` | Capturando audio e transcrevendo em tempo real |
| `REVIEW` | Exibindo notas geradas para revisao/edicao |

### Eventos

| Evento | Transicao |
|--------|-----------|
| `START_MEETING` | IDLE → CAPTURING |
| `STOP_MEETING` | CAPTURING → REVIEW |
| `SAVE_NOTES` | REVIEW → IDLE |
| `DISCARD_NOTES` | REVIEW → IDLE |

---

## Modulos Principais

### 1. Audio (`src/main/audio/`)

Responsavel pela captura de audio do sistema Windows.

**Arquivos:**
- `AudioCapture.ts` - Interface abstrata
- `WasapiLoopbackCapture.ts` - Implementacao WASAPI loopback
- `NullAudioCapture.ts` - Mock para testes

**Addon Nativo (`native/wasapi-loopback/`):**
- Captura audio do dispositivo de saida padrao
- Usa WASAPI com flag `AUDCLNT_STREAMFLAGS_LOOPBACK`
- Gera chunks WAV (16kHz, mono, 16-bit PCM)

### 2. Transcricao (`src/main/transcription/`)

Integra Whisper.cpp para transcricao local.

**Arquivos:**
- `WhisperTranscriber.ts` - Wrapper para whisper.exe
- `TranscriptionService.ts` - Orquestrador (audio → texto)

**Configuracao Whisper:**
```
Modelo: ggml-base.bin (147MB)
Idioma: pt (Portugues)
Flags: -nf (no fallback) -nt (no timestamps)
```

### 3. Estado (`src/main/state/`)

Gerencia transicoes de estado da aplicacao.

**Arquivos:**
- `StateEvents.ts` - Tipos de estado e eventos
- `StateMachine.ts` - Logica de transicao

### 4. Cognitivo (`src/main/cognitive/`)

Armazena e processa texto transcrito.

**Arquivos:**
- `TextBuffer.ts` - Buffer de chunks de texto

---

## Fluxo de Dados

```
1. Usuario clica "Iniciar Reuniao"
          |
          v
2. Renderer envia evento START_MEETING via IPC
          |
          v
3. Main process transiciona para CAPTURING
          |
          v
4. WasapiLoopbackCapture inicia captura de audio
          |
          v
5. A cada 6 segundos, um chunk WAV e gerado
          |
          v
6. TranscriptionService envia chunk para Whisper
          |
          v
7. Texto transcrito e adicionado ao TextBuffer
          |
          v
8. Main envia atualizacao para Renderer via IPC
          |
          v
9. UI atualiza com novo texto + auto-scroll
```

---

## Comunicacao IPC

O Renderer comunica com Main via canais IPC expostos em `window.ghostWriter`:

| Canal | Direcao | Descricao |
|-------|---------|-----------|
| `get-app-state` | Renderer → Main | Retorna estado atual |
| `dispatch-event` | Renderer → Main | Envia evento, retorna novo estado |
| `get-transcription` | Renderer → Main | Retorna texto transcrito |
| `transcription-update` | Main → Renderer | Atualiza UI com novo texto |

---

## Requisitos de Audio

O Whisper.cpp requer formato especifico:

| Parametro | Valor |
|-----------|-------|
| Formato | WAV PCM |
| Bits | 16-bit signed |
| Canais | Mono (1) |
| Sample Rate | 16kHz |

O addon WASAPI converte automaticamente do formato do sistema para este padrao.

---

## Build e Desenvolvimento

```bash
# Instalar dependencias
cd apps/desktop
npm install

# Compilar addon nativo (requer VS Build Tools)
cd native/wasapi-loopback
npm install
npm run build

# Build TypeScript
cd ../..
npm run build

# Executar em desenvolvimento
npm run dev
```

---

## Versao Atual

**v0.5 - MVP Funcional**

Features implementadas:
- [x] Captura de audio do sistema (WASAPI loopback)
- [x] Transcricao local com Whisper.cpp
- [x] UI com estados IDLE/CAPTURING/REVIEW
- [x] Timestamps em cada chunk transcrito
- [x] Auto-scroll na area de transcricao
- [x] Paragrafos separados por chunk
- [x] Layout fixo sem overflow

Pendente:
- [ ] Geracao de notas estruturadas (key points, decisoes, acoes)
- [ ] Captura de microfone (V2)
- [ ] Identificacao de falantes (V2)
- [ ] Exportacao para formatos externos

---

## Proximos Passos

1. Integrar LLM para geracao de notas estruturadas
2. Melhorar reconhecimento de palavras estrangeiras
3. Adicionar opcao de modelo Whisper (base/medium/large)
4. Implementar captura de microfone
5. Adicionar persistencia de configuracoes
