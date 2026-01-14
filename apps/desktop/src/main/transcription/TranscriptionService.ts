/**
 * TranscriptionService.ts
 *
 * Servico orquestrador que coordena captura de audio e transcricao.
 * Une o WasapiLoopbackCapture (audio) com o WhisperTranscriber (texto)
 * para fornecer transcricao em tempo real do audio do sistema.
 *
 * @module transcription
 */

import * as path from "path";
import * as fs from "fs";
import { WasapiLoopbackCapture, AudioChunkEvent } from "../audio/WasapiLoopbackCapture";
import { WhisperTranscriber, WhisperConfig } from "./WhisperTranscriber";

/**
 * Configuracao do TranscriptionService.
 */
export interface TranscriptionServiceConfig {
  /** Configuracao do WhisperTranscriber */
  whisperConfig: WhisperConfig;

  /** Diretorio para arquivos WAV temporarios */
  tempDirectory: string;

  /** Duracao de cada chunk de audio em segundos (padrao: 6) */
  chunkDurationSeconds?: number;
}

/**
 * Transcricao com metadados de timestamp.
 * Cada chunk de audio gera uma transcricao tagueada.
 */
export interface TaggedTranscription {
  /** Texto transcrito do chunk */
  text: string;

  /** Indice sequencial do chunk (0, 1, 2...) */
  chunkIndex: number;

  /** Momento de inicio do chunk */
  startTime: Date;

  /** Momento de fim do chunk */
  endTime: Date;

  /** Timestamp formatado: "DD/MM/YYYY [HH:MM:SS -> HH:MM:SS]" */
  formattedTimestamp: string;
}

/**
 * Callback invocado quando uma nova transcricao esta disponivel.
 */
export type TranscriptionCallback = (transcription: TaggedTranscription) => void;

/**
 * Servico que coordena captura de audio e transcricao em tempo real.
 *
 * Fluxo de operacao:
 * 1. start() inicia captura de audio via WASAPI loopback
 * 2. A cada N segundos, um chunk WAV e gerado
 * 3. Chunk e adicionado a fila de processamento
 * 4. processQueue() envia chunk para WhisperTranscriber
 * 5. Texto transcrito e emitido via callback com timestamp
 * 6. Arquivo WAV temporario e deletado
 *
 * @example
 * ```typescript
 * const service = new TranscriptionService({
 *   whisperConfig: { ... },
 *   tempDirectory: "/tmp/audio",
 *   chunkDurationSeconds: 6
 * });
 *
 * service.start((transcription) => {
 *   console.log(`[${transcription.formattedTimestamp}] ${transcription.text}`);
 * });
 *
 * // Mais tarde...
 * await service.stop();
 * service.cleanup();
 * ```
 */
export class TranscriptionService {
  /** Configuracao do servico */
  private config: TranscriptionServiceConfig;

  /** Instancia do capturador de audio WASAPI */
  private audioCapture: WasapiLoopbackCapture | null = null;

  /** Instancia do transcriber Whisper */
  private transcriber: WhisperTranscriber;

  /** Flag indicando se o servico esta rodando */
  private isRunning: boolean = false;

  /** Fila de chunks aguardando processamento */
  private processingQueue: Array<{ path: string; timestamp: Date }> = [];

  /** Flag indicando se a fila esta sendo processada */
  private isProcessingQueue: boolean = false;

  /** Callback para emitir transcricoes */
  private onTranscriptionCallback: TranscriptionCallback | null = null;

  /** Momento de inicio da sessao de captura */
  private sessionStartTime: Date | null = null;

  /**
   * Cria uma nova instancia do TranscriptionService.
   *
   * @param config - Configuracao do servico
   */
  constructor(config: TranscriptionServiceConfig) {
    // Merge com valores padrao
    this.config = {
      chunkDurationSeconds: 6,
      ...config
    };

    // Criar instancia do transcriber
    this.transcriber = new WhisperTranscriber(config.whisperConfig);

    // Garantir que diretorio temporario existe
    if (!fs.existsSync(this.config.tempDirectory)) {
      fs.mkdirSync(this.config.tempDirectory, { recursive: true });
    }
  }

  /**
   * Inicia o servico de transcricao.
   *
   * Configura captura de audio WASAPI e comeca a processar chunks.
   * Cada chunk transcrito e emitido via callback.
   *
   * @param callback - Funcao chamada quando uma transcricao esta pronta
   */
  start(callback: TranscriptionCallback): void {
    // Evitar iniciar multiplas vezes
    if (this.isRunning) {
      console.log("[TranscriptionService] Servico ja esta rodando");
      return;
    }

    console.log("[TranscriptionService] Iniciando servico de transcricao...");

    // Configurar estado inicial
    this.isRunning = true;
    this.onTranscriptionCallback = callback;
    this.processingQueue = [];
    this.sessionStartTime = new Date();

    // ========================================
    // CONFIGURAR CAPTURA DE AUDIO
    // ========================================

    // Criar instancia do capturador WASAPI loopback
    this.audioCapture = new WasapiLoopbackCapture({
      outputDirectory: this.config.tempDirectory,
      chunkDurationSeconds: this.config.chunkDurationSeconds!
    });

    // Listener: quando um chunk de audio estiver pronto
    this.audioCapture.on("chunk", (event: AudioChunkEvent) => {
      console.log(`[TranscriptionService] Chunk ${event.chunkIndex} pronto para transcricao`);

      // Adicionar chunk a fila com seu timestamp
      this.processingQueue.push({
        path: event.chunkPath,
        timestamp: event.timestamp
      });

      // Iniciar processamento da fila (se nao estiver rodando)
      this.processQueue();
    });

    // Listener: erros na captura
    this.audioCapture.on("error", (err: Error) => {
      console.error("[TranscriptionService] Erro na captura:", err.message);
    });

    // Iniciar captura de audio
    this.audioCapture.start();
  }

  /**
   * Para o servico de transcricao.
   *
   * Para a captura de audio, aguarda processamento da fila terminar,
   * e aborta qualquer transcricao em andamento.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log("[TranscriptionService] Servico nao esta rodando");
      return;
    }

    console.log("[TranscriptionService] Parando servico...");
    this.isRunning = false;

    // Parar captura de audio
    if (this.audioCapture) {
      this.audioCapture.stop();
    }

    // Aguardar processamento da fila terminar (busy wait)
    while (this.isProcessingQueue) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Abortar qualquer transcricao em andamento no Whisper
    this.transcriber.abort();

    console.log("[TranscriptionService] Servico parado");
  }

  /**
   * Libera recursos do servico.
   *
   * Deve ser chamado apos stop() para cleanup completo.
   */
  cleanup(): void {
    console.log("[TranscriptionService] Limpando recursos...");

    // Liberar recursos do capturador
    if (this.audioCapture) {
      this.audioCapture.cleanup();
      this.audioCapture = null;
    }

    // Limpar fila e callback
    this.processingQueue = [];
    this.onTranscriptionCallback = null;
  }

  /**
   * Processa a fila de chunks pendentes.
   *
   * Executa sequencialmente (um chunk por vez) para evitar
   * sobrecarregar o Whisper com multiplas transcricoes simultaneas.
   *
   * @private
   */
  private async processQueue(): Promise<void> {
    // Evitar processamento concorrente
    if (this.isProcessingQueue || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    // Processar chunks enquanto houver itens e servico estiver rodando
    while (this.processingQueue.length > 0 && this.isRunning) {
      // Remover primeiro item da fila
      const chunkData = this.processingQueue.shift()!;
      const { path: chunkPath, timestamp: chunkEndTime } = chunkData;

      try {
        console.log(`[TranscriptionService] Transcrevendo: ${path.basename(chunkPath)}`);

        // Enviar para Whisper transcrever
        const result = await this.transcriber.transcribe(chunkPath);

        // Se transcricao bem-sucedida e com texto
        if (result.success && result.text.trim()) {
          console.log(`[TranscriptionService] Texto: "${result.text.substring(0, 50)}..."`);

          if (this.onTranscriptionCallback) {
            // Extrair indice do chunk do nome do arquivo (chunk_0.wav, chunk_1.wav...)
            const match = chunkPath.match(/chunk_(\d+)\.wav$/);
            const chunkIndex = match ? parseInt(match[1], 10) : 0;

            // Calcular timestamps do chunk
            // chunkEndTime e o momento que o chunk terminou
            // startTime e chunkEndTime menos a duracao do chunk
            const chunkDuration = this.config.chunkDurationSeconds! * 1000;
            const startTime = new Date(chunkEndTime.getTime() - chunkDuration);
            const endTime = chunkEndTime;

            // Formatar timestamp legivel
            const formattedTimestamp = this.formatTimestamp(startTime, endTime);

            // Montar objeto de transcricao tagueada
            const taggedTranscription: TaggedTranscription = {
              text: result.text.trim(),
              chunkIndex,
              startTime,
              endTime,
              formattedTimestamp
            };

            // Emitir para o callback
            this.onTranscriptionCallback(taggedTranscription);
          }
        } else if (!result.success) {
          console.error(`[TranscriptionService] Erro: ${result.error}`);
        }

        // Remover arquivo WAV temporario apos processar
        this.deleteChunkFile(chunkPath);

      } catch (err) {
        console.error("[TranscriptionService] Erro ao processar chunk:", err);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Formata timestamps de inicio e fim em string legivel.
   *
   * Formato: "DD/MM/YYYY [HH:MM:SS -> HH:MM:SS]"
   *
   * @param start - Data/hora de inicio
   * @param end - Data/hora de fim
   * @returns String formatada
   * @private
   */
  private formatTimestamp(start: Date, end: Date): string {
    // Formatar hora como HH:MM:SS
    const formatTime = (d: Date) => {
      const hh = d.getHours().toString().padStart(2, "0");
      const mm = d.getMinutes().toString().padStart(2, "0");
      const ss = d.getSeconds().toString().padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    };

    // Formatar data como DD/MM/YYYY
    const formatDate = (d: Date) => {
      const dd = d.getDate().toString().padStart(2, "0");
      const mo = (d.getMonth() + 1).toString().padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}/${mo}/${yyyy}`;
    };

    return `${formatDate(start)} [${formatTime(start)} -> ${formatTime(end)}]`;
  }

  /**
   * Deleta um arquivo WAV temporario.
   *
   * Chamado apos cada chunk ser processado para evitar acumulo de arquivos.
   *
   * @param filePath - Caminho do arquivo a deletar
   * @private
   */
  private deleteChunkFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[TranscriptionService] Chunk removido: ${path.basename(filePath)}`);
      }
    } catch (err) {
      console.error(`[TranscriptionService] Erro ao remover chunk:`, err);
    }
  }

  /**
   * Verifica se o servico esta ativo.
   *
   * @returns true se o servico esta rodando
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
