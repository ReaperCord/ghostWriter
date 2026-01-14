# Modulo de Transcricao

## Visao Geral

O modulo de transcricao integra o Whisper.cpp para converter audio em texto localmente, sem dependencias de nuvem.

---

## Arquivos

### `WhisperTranscriber.ts`

Wrapper Node.js para o executavel `whisper.exe`.

**Responsabilidades:**
- Validar existencia de arquivos (WAV, executavel, modelo)
- Spawnar processo whisper.exe com argumentos corretos
- Capturar stdout (texto UTF-8)
- Gerenciar timeout e cleanup de processo
- Parsear output removendo logs internos do Whisper

**Interface de Configuracao:**
```typescript
interface WhisperConfig {
  executablePath: string;  // Caminho para whisper.exe
  modelPath: string;       // Caminho para modelo .bin
  language: string;        // Codigo do idioma (ex: "pt")
  threads?: number;        // Threads de CPU (padrao: 4)
  timeoutMs?: number;      // Timeout em ms (padrao: 30000)
}
```

**Argumentos CLI:**
```
whisper.exe -m <modelo> -f <audio.wav> -l <idioma> -t <threads> -nf -nt
```

| Flag | Descricao |
|------|-----------|
| `-m` | Caminho do modelo |
| `-f` | Arquivo de audio WAV |
| `-l` | Idioma (pt = portugues) |
| `-t` | Numero de threads |
| `-nf` | No fallback - nao muda idioma automaticamente |
| `-nt` | No timestamps - nao inclui marcacoes de tempo |

---

### `TranscriptionService.ts`

Orquestrador que coordena captura de audio e transcricao.

**Responsabilidades:**
- Iniciar/parar captura de audio
- Gerenciar fila de processamento de chunks
- Invocar WhisperTranscriber para cada chunk
- Emitir transcricoes tagueadas com timestamps
- Limpar arquivos temporarios apos processamento

**Interface de Transcricao Tagueada:**
```typescript
interface TaggedTranscription {
  text: string;              // Texto transcrito
  chunkIndex: number;        // Indice do chunk (0, 1, 2...)
  startTime: Date;           // Inicio do chunk
  endTime: Date;             // Fim do chunk
  formattedTimestamp: string; // "DD/MM/YYYY [HH:MM:SS -> HH:MM:SS]"
}
```

**Fluxo de Processamento:**
```
1. WasapiLoopbackCapture emite evento "chunk"
          |
          v
2. TranscriptionService adiciona chunk a fila
          |
          v
3. processQueue() processa fila sequencialmente
          |
          v
4. WhisperTranscriber.transcribe() executa whisper.exe
          |
          v
5. Resultado parseado e formatado com timestamp
          |
          v
6. Callback invocado com TaggedTranscription
          |
          v
7. Arquivo WAV temporario deletado
```

---

## Modelo Whisper

**Modelo Atual:** `ggml-base.bin`

| Modelo | Tamanho | RAM | Velocidade | Precisao |
|--------|---------|-----|------------|----------|
| tiny | 75MB | ~1GB | Muito rapido | Baixa |
| base | 147MB | ~1GB | Rapido | Media |
| small | 488MB | ~2GB | Moderado | Boa |
| medium | 1.5GB | ~5GB | Lento | Muito boa |
| large | 3GB | ~10GB | Muito lento | Excelente |

**Recomendacao:** Para reunioes em portugues, `base` oferece bom equilibrio. Para maior precisao, considerar `small` ou `medium`.

---

## Formato de Audio

O Whisper requer formato WAV especifico:

```
Formato: PCM nao comprimido
Bits: 16-bit signed
Canais: Mono (1)
Sample Rate: 16kHz
```

O addon WASAPI converte automaticamente do formato do sistema.

---

## Chunks de Audio

**Duracao:** 6 segundos por chunk

**Justificativa:**
- Chunks curtos = menor latencia na UI
- Chunks longos = melhor contexto para Whisper
- 6 segundos e um equilibrio para "pseudo-streaming"

---

## Limitacoes Conhecidas

1. **Palavras estrangeiras:** Whisper com `-l pt` transcreve foneticamente (ex: "podcast" → "podcaste")

2. **Latencia:** ~3-5 segundos de delay entre fala e texto (tempo de processamento)

3. **Sobreposicao de falas:** Whisper nao identifica falantes diferentes

4. **Ruido de fundo:** Qualidade da transcricao depende da qualidade do audio

---

## Configuracao no Projeto

**Localizacao dos binarios:**
```
apps/desktop/native/whisper/
├── whisper.exe          # Executavel
├── whisper.dll          # Runtime
└── models/
    └── ggml-base.bin    # Modelo (147MB)
```

**Instanciacao em `main.ts`:**
```typescript
const transcriptionService = new TranscriptionService({
  whisperConfig: {
    executablePath: path.join(__dirname, "../native/whisper/whisper.exe"),
    modelPath: path.join(__dirname, "../native/whisper/models/ggml-base.bin"),
    language: "pt",
    threads: 4,
    timeoutMs: 30000
  },
  tempDirectory: path.join(app.getPath("temp"), "ghostwriter-audio"),
  chunkDurationSeconds: 6
});
```

---

## Testes Manuais

**Testar Whisper diretamente:**
```powershell
cd apps/desktop/native/whisper
.\whisper.exe -m models\ggml-base.bin -f teste.wav -l pt -nt
```

**Verificar processos:**
```powershell
tasklist | findstr whisper
```

Apos parar a aplicacao, nao deve haver processos whisper.exe rodando.
