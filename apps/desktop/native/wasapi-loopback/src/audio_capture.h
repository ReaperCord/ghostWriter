#ifndef AUDIO_CAPTURE_H
#define AUDIO_CAPTURE_H

#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <string>
#include <vector>
#include <functional>
#include <atomic>
#include <thread>

// Callback type for audio data
using AudioDataCallback = std::function<void(const std::vector<int16_t>&, int sampleRate, int channels)>;

class AudioCapture {
public:
    AudioCapture();
    ~AudioCapture();

    // Initialize WASAPI loopback capture
    bool Initialize();

    // Start capturing audio
    bool Start(AudioDataCallback callback);

    // Stop capturing
    void Stop();

    // Check if capturing
    bool IsCapturing() const { return m_isCapturing; }

    // Get last error message
    std::string GetLastError() const { return m_lastError; }

    // Get current sample rate
    int GetSampleRate() const { return m_sampleRate; }

    // Get number of channels
    int GetChannels() const { return m_channels; }

private:
    void CaptureThread();
    bool InitializeWASAPI();
    void Cleanup();

    IMMDeviceEnumerator* m_deviceEnumerator = nullptr;
    IMMDevice* m_device = nullptr;
    IAudioClient* m_audioClient = nullptr;
    IAudioCaptureClient* m_captureClient = nullptr;

    WAVEFORMATEX* m_waveFormat = nullptr;
    UINT32 m_bufferFrameCount = 0;

    std::atomic<bool> m_isCapturing{false};
    std::thread m_captureThread;
    AudioDataCallback m_callback;

    int m_sampleRate = 0;
    int m_channels = 0;
    std::string m_lastError;
};

#endif // AUDIO_CAPTURE_H
