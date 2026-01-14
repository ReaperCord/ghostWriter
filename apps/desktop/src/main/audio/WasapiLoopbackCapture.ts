/**
 * WasapiLoopbackCapture.ts
 *
 * Captura de audio do sistema Windows usando WASAPI em modo loopback.
 * Permite gravar o audio que esta sendo reproduzido nos speakers/fones
 * sem precisar de microfone ou configuracao adicional.
 *
 * Usa um addon nativo C++ (native/wasapi-loopback) para acessar as APIs
 * Windows Audio Session API (WASAPI) diretamente.
 *
 * @module audio
 */

import * as path from "path";
import * as fs from "fs";
import { EventEmitter } from "events";
import { AudioCapture } from "./AudioCapture";

// ========================================
// CARREGAMENTO DO ADDON NATIVO
// ========================================

// Import do addon nativo WASAPI
// O caminho e relativo ao dist/main/audio/ apos compilacao TypeScript
// Por isso subimos 3 niveis (../../../) para chegar em native/
// eslint-disable-next-line @typescript-eslint/no-var-requires
const addonPath = path.join(__dirname, "../../../native/wasapi-loopback");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WasapiLoopback } = require(addonPath);

/**
 * Configuracao do WasapiLoopbackCapture.
 */
export interface LoopbackCaptureConfig {
  /** Diretorio onde os arquivos WAV temporarios serao salvos */
  outputDirectory: string;

  /** Duracao de cada chunk de audio em segundos */
  chunkDurationSeconds: number;
}

/**
 * Evento emitido quando um chunk de audio esta pronto.
 */
export interface AudioChunkEvent {
  /** Caminho completo do arquivo WAV gerado */
  chunkPath: string;

  /** Indice sequencial do chunk (0, 1, 2...) */
  chunkIndex: number;

  /** Momento em que o chunk foi salvo */
  timestamp: Date;
}

/**
 * Capturador de audio do sistema usando WASAPI loopback.
 *
 * Funciona capturando o audio que esta sendo enviado para os speakers,
 * sem precisar de microfone. Ideal para gravar reunioes onde o audio
 * vem de aplicativos como Teams, Zoom, etc.
 *
 * Gera arquivos WAV em formato compativel com Whisper:
 * - 16kHz sample rate
 * - Mono
 * - 16-bit PCM
 *
 * @example
 * ```typescript
 * const capture = new WasapiLoopbackCapture({
 *   outputDirectory: "/tmp/audio",
 *   chunkDurationSeconds: 6
 * });
 *
 * capture.on("chunk", (event) => {
 *   console.log("Chunk pronto:", event.chunkPath);
 * });
 *
 * capture.start();
 * // ... aguardar ...
 * capture.stop();
 * capture.cleanup();
 * ```
 *
 * @fires chunk - Quando um chunk de audio esta pronto
 * @fires error - Quando ocorre um erro na captura
 */
export class WasapiLoopbackCapture extends EventEmitter implements AudioCapture {
  /** Configuracao do capturador */
  private config: LoopbackCaptureConfig;

  /** Instancia do addon nativo WASAPI */
  private wasapi: typeof WasapiLoopback | null = null;

  /** Contador de chunks gerados */
  private chunkIndex: number = 0;

  /** Flag indicando se a captura esta ativa */
  private isCapturing: boolean = false;

  /** Timer para geracao periodica de chunks */
  private captureInterval: NodeJS.Timeout | null = null;

  /**
   * Cria uma nova instancia do WasapiLoopbackCapture.
   *
   * @param config - Configuracao do capturador
   */
  constructor(config: LoopbackCaptureConfig) {
    super();
    this.config = { ...config };

    // Garantir que o diretorio de saida existe
    if (!fs.existsSync(this.config.outputDirectory)) {
      fs.mkdirSync(this.config.outputDirectory, { recursive: true });
    }
  }

  /**
   * Inicia a captura de audio do sistema.
   *
   * Processo:
   * 1. Cria instancia do addon nativo
   * 2. Inicializa WASAPI em modo loopback
   * 3. Inicia captura de audio
   * 4. Configura timer para gerar chunks periodicamente
   *
   * Emite evento "error" se falhar.
   */
  start(): void {
    // Evitar iniciar multiplas vezes
    if (this.isCapturing) {
      console.log("[WasapiLoopbackCapture] Ja esta capturando");
      return;
    }

    console.log("[WasapiLoopbackCapture] Iniciando captura de audio do sistema (WASAPI loopback)...");

    // ========================================
    // INICIALIZAR ADDON NATIVO
    // ========================================

    // Criar instancia do addon
    this.wasapi = new WasapiLoopback();

    // Inicializar WASAPI (configura COM, obtem dispositivo padrao, etc)
    if (!this.wasapi.initialize()) {
      const error = this.wasapi.getLastError();
      console.error("[WasapiLoopbackCapture] Erro ao inicializar WASAPI:", error);
      this.emit("error", new Error(error));
      return;
    }

    // Log info do dispositivo de audio
    console.log(`[WasapiLoopbackCapture] WASAPI inicializado - Sample Rate: ${this.wasapi.getSampleRate()}Hz, Channels: ${this.wasapi.getChannels()}`);

    // ========================================
    // INICIAR CAPTURA
    // ========================================

    // Iniciar captura de audio (comecar a acumular samples)
    if (!this.wasapi.start()) {
      const error = this.wasapi.getLastError();
      console.error("[WasapiLoopbackCapture] Erro ao iniciar captura:", error);
      this.emit("error", new Error(error));
      return;
    }

    this.isCapturing = true;
    this.chunkIndex = 0;

    // ========================================
    // CONFIGURAR TIMER DE CHUNKS
    // ========================================

    // Configurar intervalo para salvar chunks periodicamente
    // A cada N segundos, salvamos o audio acumulado como WAV
    const chunkMs = this.config.chunkDurationSeconds * 1000;
    this.captureInterval = setInterval(() => {
      this.saveChunk();
    }, chunkMs);

    console.log(`[WasapiLoopbackCapture] Captura iniciada - chunks de ${this.config.chunkDurationSeconds}s`);
  }

  /**
   * Para a captura de audio.
   *
   * Salva o ultimo chunk antes de parar e libera recursos do addon.
   */
  stop(): void {
    console.log("[WasapiLoopbackCapture] Parando captura...");
    this.isCapturing = false;

    // Parar timer de chunks
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    // Salvar ultimo chunk antes de parar (pode conter audio util)
    if (this.wasapi && this.wasapi.isCapturing()) {
      this.saveChunk();
      this.wasapi.stop();
    }

    // Liberar instancia do addon
    this.wasapi = null;
    console.log("[WasapiLoopbackCapture] Captura parada");
  }

  /**
   * Salva o audio acumulado como arquivo WAV.
   *
   * O addon nativo converte automaticamente para o formato Whisper:
   * - Resample para 16kHz
   * - Converte para mono
   * - Salva como WAV 16-bit PCM
   *
   * Emite evento "chunk" se o arquivo for valido (> 1000 bytes).
   * Arquivos muito pequenos (silencio) sao ignorados.
   *
   * @private
   */
  private saveChunk(): void {
    // Verificar se podemos salvar
    if (!this.wasapi || !this.isCapturing) return;

    // Montar caminho do arquivo
    const chunkPath = path.join(
      this.config.outputDirectory,
      `chunk_${this.chunkIndex}.wav`
    );

    console.log(`[WasapiLoopbackCapture] Salvando chunk ${this.chunkIndex}...`);

    // Salvar audio acumulado como WAV
    // O segundo parametro (16000) especifica o sample rate de saida para Whisper
    const success = this.wasapi.saveToWav(chunkPath, 16000);

    if (success && fs.existsSync(chunkPath)) {
      const stats = fs.statSync(chunkPath);

      // Verificar se o arquivo tem conteudo significativo
      // Arquivos < 1000 bytes geralmente sao silencio ou erro
      if (stats.size > 1000) {
        console.log(`[WasapiLoopbackCapture] Chunk ${this.chunkIndex} salvo: ${chunkPath} (${stats.size} bytes)`);

        // Emitir evento para o TranscriptionService processar
        const event: AudioChunkEvent = {
          chunkPath,
          chunkIndex: this.chunkIndex,
          timestamp: new Date()
        };
        this.emit("chunk", event);
        this.chunkIndex++;
      } else {
        // Arquivo muito pequeno - provavelmente silencio
        console.log(`[WasapiLoopbackCapture] Chunk ${this.chunkIndex} muito pequeno (silencio?), ignorando`);
        // Remover arquivo pequeno para nao acumular lixo
        try {
          fs.unlinkSync(chunkPath);
        } catch {
          // Ignorar erro ao deletar
        }
      }
    } else {
      console.log(`[WasapiLoopbackCapture] Falha ao salvar chunk ${this.chunkIndex}`);
    }
  }

  /**
   * Limpa arquivos WAV temporarios do diretorio de saida.
   *
   * Remove todos os arquivos chunk_*.wav gerados durante a captura.
   * Deve ser chamado apos stop() para liberar espaco em disco.
   */
  cleanup(): void {
    console.log("[WasapiLoopbackCapture] Limpando arquivos temporarios...");

    try {
      // Listar arquivos no diretorio
      const files = fs.readdirSync(this.config.outputDirectory);

      // Remover apenas arquivos de chunk
      for (const file of files) {
        if (file.startsWith("chunk_") && file.endsWith(".wav")) {
          const filePath = path.join(this.config.outputDirectory, file);
          fs.unlinkSync(filePath);
          console.log(`[WasapiLoopbackCapture] Removido: ${file}`);
        }
      }
    } catch (err) {
      console.error("[WasapiLoopbackCapture] Erro ao limpar:", err);
    }
  }
}
