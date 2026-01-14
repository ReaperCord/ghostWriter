/**
 * WhisperTranscriber.ts
 *
 * Wrapper Node.js para o executavel whisper.exe (Whisper.cpp).
 * Responsavel por transcrever arquivos WAV para texto usando o modelo
 * de reconhecimento de fala Whisper da OpenAI, executado localmente.
 *
 * @module transcription
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";

/**
 * Configuracao do WhisperTranscriber.
 * Define caminhos, idioma e parametros de execucao.
 */
export interface WhisperConfig {
  /** Caminho absoluto para o executavel whisper.exe */
  executablePath: string;

  /** Caminho absoluto para o arquivo de modelo .bin (ex: ggml-base.bin) */
  modelPath: string;

  /** Codigo do idioma para transcricao (ex: "pt" para portugues) */
  language: string;

  /** Numero de threads de CPU a usar (padrao: 4) */
  threads?: number;

  /** Timeout maximo em milissegundos (padrao: 30000) */
  timeoutMs?: number;
}

/**
 * Resultado de uma transcricao.
 * Contem o texto transcrito ou informacao de erro.
 */
export interface TranscriptionResult {
  /** Texto transcrito (vazio se falhou) */
  text: string;

  /** Indica se a transcricao foi bem-sucedida */
  success: boolean;

  /** Mensagem de erro (presente apenas se success = false) */
  error?: string;
}

/**
 * Classe que encapsula a execucao do Whisper.cpp.
 *
 * Gerencia o ciclo de vida do processo whisper.exe:
 * - Validacao de arquivos de entrada
 * - Spawn do processo com argumentos corretos
 * - Captura de stdout/stderr
 * - Timeout e cleanup
 * - Parsing do output para extrair texto limpo
 *
 * @example
 * ```typescript
 * const transcriber = new WhisperTranscriber({
 *   executablePath: "./whisper.exe",
 *   modelPath: "./models/ggml-base.bin",
 *   language: "pt"
 * });
 *
 * const result = await transcriber.transcribe("audio.wav");
 * if (result.success) {
 *   console.log(result.text);
 * }
 * ```
 */
export class WhisperTranscriber {
  /** Configuracao do transcriber */
  private config: WhisperConfig;

  /** Referencia ao processo whisper.exe em execucao (null se ocioso) */
  private currentProcess: ChildProcess | null = null;

  /**
   * Cria uma nova instancia do WhisperTranscriber.
   *
   * @param config - Configuracao do transcriber
   */
  constructor(config: WhisperConfig) {
    // Merge com valores padrao
    this.config = {
      threads: 4,
      timeoutMs: 30000,
      ...config
    };
  }

  /**
   * Transcreve um arquivo WAV para texto.
   *
   * Processo:
   * 1. Valida existencia de arquivos (WAV, executavel, modelo)
   * 2. Spawna whisper.exe com argumentos apropriados
   * 3. Aguarda conclusao ou timeout
   * 4. Parseia output removendo logs internos
   * 5. Retorna texto transcrito ou erro
   *
   * @param wavPath - Caminho absoluto para o arquivo WAV
   * @returns Promise com resultado da transcricao
   */
  async transcribe(wavPath: string): Promise<TranscriptionResult> {
    // ========================================
    // VALIDACAO DE ARQUIVOS
    // ========================================

    // Validar que o arquivo WAV existe
    if (!fs.existsSync(wavPath)) {
      return {
        text: "",
        success: false,
        error: `Arquivo WAV nao encontrado: ${wavPath}`
      };
    }

    // Validar que o executavel whisper.exe existe
    if (!fs.existsSync(this.config.executablePath)) {
      return {
        text: "",
        success: false,
        error: `Whisper executavel nao encontrado: ${this.config.executablePath}`
      };
    }

    // Validar que o modelo .bin existe
    if (!fs.existsSync(this.config.modelPath)) {
      return {
        text: "",
        success: false,
        error: `Modelo nao encontrado: ${this.config.modelPath}`
      };
    }

    // ========================================
    // EXECUCAO DO WHISPER
    // ========================================

    return new Promise((resolve) => {
      // Montar argumentos CLI do whisper.exe
      // -m: modelo, -f: arquivo, -l: idioma, -t: threads
      // -nf: no fallback (nao muda idioma), -nt: no timestamps
      const args = [
        "-m", this.config.modelPath,
        "-f", wavPath,
        "-l", this.config.language,
        "-t", String(this.config.threads),
        "-nf",  // No fallback language - mantem idioma especificado
        "-nt"   // No timestamps - nao inclui marcacoes de tempo no output
      ];

      console.log(`[WhisperTranscriber] Executando: ${this.config.executablePath}`);
      console.log(`[WhisperTranscriber] Args: ${args.join(" ")}`);

      // Buffers para capturar output do processo
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      // Spawnar processo whisper.exe
      // windowsHide: true evita janela de console aparecer
      this.currentProcess = spawn(this.config.executablePath, args, {
        cwd: path.dirname(this.config.executablePath),
        windowsHide: true
      });

      // Configurar timeout para evitar processos travados
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        this.abort();
      }, this.config.timeoutMs);

      // Capturar stdout (contem o texto transcrito)
      this.currentProcess.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString("utf8");
      });

      // Capturar stderr (contem logs e erros)
      this.currentProcess.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString("utf8");
      });

      // Handler para quando o processo termina
      this.currentProcess.on("close", (code) => {
        clearTimeout(timeoutHandle);
        this.currentProcess = null;

        // Verificar se foi timeout
        if (timedOut) {
          resolve({
            text: "",
            success: false,
            error: `Timeout apos ${this.config.timeoutMs}ms`
          });
          return;
        }

        // Verificar codigo de saida
        if (code !== 0) {
          console.error(`[WhisperTranscriber] Erro (code ${code}): ${stderr}`);
          resolve({
            text: "",
            success: false,
            error: `Whisper falhou com codigo ${code}: ${stderr}`
          });
          return;
        }

        // Processar output - remover linhas de log do whisper
        const transcribedText = this.parseOutput(stdout);

        console.log(`[WhisperTranscriber] Transcricao: "${transcribedText.substring(0, 100)}..."`);

        resolve({
          text: transcribedText,
          success: true
        });
      });

      // Handler para erros de spawn (ex: executavel nao encontrado)
      this.currentProcess.on("error", (err) => {
        clearTimeout(timeoutHandle);
        this.currentProcess = null;
        resolve({
          text: "",
          success: false,
          error: `Erro ao executar Whisper: ${err.message}`
        });
      });
    });
  }

  /**
   * Parseia o output do whisper.exe para extrair apenas o texto transcrito.
   *
   * O Whisper imprime varias linhas de log antes do texto real:
   * - Linhas comecando com "whisper_" (info de modelo)
   * - Linhas comecando com "system_info" (info de sistema)
   * - Linhas com timestamps "[00:00:00 -> 00:00:05]"
   *
   * Este metodo filtra essas linhas e retorna apenas o texto util.
   *
   * @param output - Output bruto do stdout do whisper.exe
   * @returns Texto transcrito limpo
   */
  private parseOutput(output: string): string {
    const lines = output.split("\n");
    const textLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Ignorar linhas vazias
      if (!trimmed) continue;

      // Ignorar linhas de log do whisper (info de modelo/sistema)
      if (trimmed.startsWith("whisper_") || trimmed.startsWith("system_info")) continue;

      // Ignorar linhas de progresso com timestamps [HH:MM:SS -> HH:MM:SS]
      if (trimmed.match(/^\[\d{2}:\d{2}:\d{2}/)) continue;

      // Linha valida - adicionar ao resultado
      textLines.push(trimmed);
    }

    // Juntar linhas com espaco e limpar espacos extras
    return textLines.join(" ").trim();
  }

  /**
   * Aborta o processo de transcricao em andamento.
   *
   * Envia SIGTERM primeiro, e se o processo nao terminar em 2 segundos,
   * envia SIGKILL para forcsar encerramento.
   *
   * Chamado automaticamente em caso de timeout.
   */
  abort(): void {
    if (this.currentProcess) {
      console.log("[WhisperTranscriber] Abortando processo...");

      // Tentar terminar graciosamente
      this.currentProcess.kill("SIGTERM");

      // Force kill apos 2 segundos se nao terminar
      setTimeout(() => {
        if (this.currentProcess) {
          this.currentProcess.kill("SIGKILL");
        }
      }, 2000);
    }
  }

  /**
   * Verifica se ha uma transcricao em andamento.
   *
   * @returns true se um processo whisper.exe esta rodando
   */
  isProcessing(): boolean {
    return this.currentProcess !== null;
  }
}
