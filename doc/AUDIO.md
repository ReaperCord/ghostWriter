# Modulo de Audio

## Visao Geral

O modulo de audio captura som do sistema Windows usando WASAPI (Windows Audio Session API) em modo loopback.

---

## Arquitetura

```
+-------------------+     +----------------------+     +------------------+
| Sistema de Audio  | --> | WASAPI Loopback      | --> | WAV Files        |
| (speakers/fones)  |     | (addon nativo C++)   |     | (16kHz, mono)    |
+-------------------+     +----------------------+     +------------------+
                                    |
                                    v
                          +----------------------+
                          | WasapiLoopbackCapture|
                          | (wrapper TypeScript) |
                          +----------------------+
                                    |
                                    v
                          +----------------------+
                          | TranscriptionService |
                          +----------------------+
```

---

## Arquivos TypeScript

### `AudioCapture.ts`

Interface abstrata para captura de audio.

```typescript
interface AudioCapture {
  start(): void;
  stop(): void;
  cleanup(): void;
}
```

### `WasapiLoopbackCapture.ts`

Implementacao WASAPI que usa addon nativo.

**Responsabilidades:**
- Carregar addon nativo (`native/wasapi-loopback`)
- Iniciar/parar captura
- Gerar chunks WAV em intervalos regulares
- Emitir eventos quando chunks estao prontos
- Cleanup de recursos

**Eventos Emitidos:**
```typescript
// Quando um chunk de audio esta pronto
interface AudioChunkEvent {
  chunkPath: string;    // Caminho do arquivo WAV
  chunkIndex: number;   // Indice sequencial
  timestamp: Date;      // Momento da captura
}

// Emissao
this.emit("chunk", event);
this.emit("error", error);
```

**Configuracao:**
```typescript
interface LoopbackCaptureConfig {
  outputDirectory: string;      // Diretorio para WAV temporarios
  chunkDurationSeconds: number; // Duracao de cada chunk (padrao: 6s)
}
```

### `NullAudioCapture.ts`

Mock para testes e desenvolvimento sem audio real.

---

## Addon Nativo C++

### Localizacao

```
apps/desktop/native/wasapi-loopback/
├── binding.gyp          # Configuracao node-gyp
├── package.json         # Dependencias (node-addon-api)
├── index.js             # Entry point
├── index.d.ts           # Tipos TypeScript
└── src/
    ├── audio_capture.h      # Header da classe
    ├── audio_capture.cpp    # Implementacao WASAPI
    └── wasapi_loopback.cpp  # Bindings Node.js
```

### Como Funciona

1. **Inicializacao COM:**
   ```cpp
   CoInitializeEx(nullptr, COINIT_MULTITHREADED);
   ```

2. **Obter dispositivo de audio padrao:**
   ```cpp
   IMMDeviceEnumerator* enumerator;
   enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &device);
   ```

3. **Ativar cliente de audio em modo loopback:**
   ```cpp
   device->Activate(IID_IAudioClient, ...);
   audioClient->Initialize(
     AUDCLNT_SHAREMODE_SHARED,
     AUDCLNT_STREAMFLAGS_LOOPBACK,  // <- Captura o que sai nos speakers
     ...
   );
   ```

4. **Capturar pacotes de audio:**
   ```cpp
   captureClient->GetBuffer(&data, &numFrames, ...);
   // Processar samples...
   captureClient->ReleaseBuffer(numFrames);
   ```

5. **Converter para formato Whisper:**
   - Resample para 16kHz
   - Converter para mono
   - Salvar como WAV 16-bit PCM

### Compilacao

**Requisitos:**
- Visual Studio Build Tools
- Workload "Desktop development with C++"
- Node.js headers

**Comandos:**
```bash
cd apps/desktop/native/wasapi-loopback
npm install
npm run build
```

**Bibliotecas Windows linkadas:**
- `ole32.lib` (COM)
- `oleaut32.lib` (COM Automation)
- `winmm.lib` (Multimedia)

---

## Formato WAV

### Especificacao para Whisper

| Parametro | Valor |
|-----------|-------|
| Container | RIFF WAV |
| Codec | PCM |
| Bits per sample | 16 |
| Canais | 1 (mono) |
| Sample rate | 16000 Hz |
| Byte rate | 32000 bytes/s |

### Header WAV

```
Bytes 0-3:   "RIFF"
Bytes 4-7:   Tamanho do arquivo - 8
Bytes 8-11:  "WAVE"
Bytes 12-15: "fmt "
Bytes 16-19: 16 (tamanho do chunk fmt)
Bytes 20-21: 1 (PCM)
Bytes 22-23: 1 (mono)
Bytes 24-27: 16000 (sample rate)
Bytes 28-31: 32000 (byte rate)
Bytes 32-33: 2 (block align)
Bytes 34-35: 16 (bits per sample)
Bytes 36-39: "data"
Bytes 40-43: Tamanho dos dados
Bytes 44+:   Dados PCM
```

---

## Fluxo de Captura

```
1. WasapiLoopbackCapture.start() chamado
          |
          v
2. Addon nativo inicializa WASAPI loopback
          |
          v
3. Timer de 6 segundos inicia
          |
          v
4. Ao completar 6s:
   a. Addon salva buffer para WAV
   b. WasapiLoopbackCapture emite "chunk"
   c. Timer reinicia
          |
          v
5. Repete ate stop() ser chamado
          |
          v
6. cleanup() libera recursos COM
```

---

## Resolucao de Problemas

### "Nenhum som capturado"

1. Verificar se ha audio tocando no sistema
2. Verificar dispositivo de saida padrao no Windows
3. Alguns apps usam audio exclusivo - fechar e reabrir

### "Erro ao inicializar WASAPI"

1. Verificar se addon foi compilado corretamente
2. Verificar se Visual C++ Redistributable esta instalado
3. Reiniciar aplicacao

### "Arquivo WAV corrompido"

1. Verificar espaco em disco
2. Verificar permissoes no diretorio temp
3. Chunk pode ter sido cortado - normal no stop()

---

## Limitacoes

1. **Apenas Windows:** WASAPI e API especifica do Windows

2. **Nao captura microfone:** Loopback captura apenas saida (speakers)
   - Microfone sera feature V2

3. **Dispositivo padrao:** Captura do dispositivo de saida padrao
   - Mudar dispositivo requer reiniciar captura

4. **Audio exclusivo:** Alguns jogos/apps usam audio exclusivo e bloqueiam loopback
