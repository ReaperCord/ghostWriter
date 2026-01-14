declare class WasapiLoopback {
    constructor();

    /**
     * Initialize WASAPI loopback capture
     * @returns true if initialization succeeded
     */
    initialize(): boolean;

    /**
     * Start capturing audio from system output (loopback)
     * @returns true if capture started successfully
     */
    start(): boolean;

    /**
     * Stop capturing audio
     */
    stop(): void;

    /**
     * Check if currently capturing
     */
    isCapturing(): boolean;

    /**
     * Get last error message
     */
    getLastError(): string;

    /**
     * Save captured audio to WAV file
     * @param filePath Path to save the WAV file
     * @param targetSampleRate Target sample rate (default: 16000 for Whisper)
     * @returns true if save succeeded
     */
    saveToWav(filePath: string, targetSampleRate?: number): boolean;

    /**
     * Get the sample rate of the audio source
     */
    getSampleRate(): number;

    /**
     * Get the number of channels of the audio source
     */
    getChannels(): number;
}

export { WasapiLoopback };
