#include "audio_capture.h"
#include <functiondiscoverykeys_devpkey.h>
#include <cstring>

// Link required libraries
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "winmm.lib")

// WASAPI constants
const CLSID CLSID_MMDeviceEnumerator = __uuidof(MMDeviceEnumerator);
const IID IID_IMMDeviceEnumerator = __uuidof(IMMDeviceEnumerator);
const IID IID_IAudioClient = __uuidof(IAudioClient);
const IID IID_IAudioCaptureClient = __uuidof(IAudioCaptureClient);

AudioCapture::AudioCapture() {
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
}

AudioCapture::~AudioCapture() {
    Stop();
    Cleanup();
    CoUninitialize();
}

bool AudioCapture::Initialize() {
    return InitializeWASAPI();
}

bool AudioCapture::InitializeWASAPI() {
    HRESULT hr;

    // Create device enumerator
    hr = CoCreateInstance(
        CLSID_MMDeviceEnumerator,
        nullptr,
        CLSCTX_ALL,
        IID_IMMDeviceEnumerator,
        (void**)&m_deviceEnumerator
    );

    if (FAILED(hr)) {
        m_lastError = "Failed to create device enumerator";
        return false;
    }

    // Get default audio endpoint (render device for loopback)
    hr = m_deviceEnumerator->GetDefaultAudioEndpoint(
        eRender,  // We want the render device (speakers/headphones)
        eConsole,
        &m_device
    );

    if (FAILED(hr)) {
        m_lastError = "Failed to get default audio endpoint";
        return false;
    }

    // Activate audio client
    hr = m_device->Activate(
        IID_IAudioClient,
        CLSCTX_ALL,
        nullptr,
        (void**)&m_audioClient
    );

    if (FAILED(hr)) {
        m_lastError = "Failed to activate audio client";
        return false;
    }

    // Get mix format
    hr = m_audioClient->GetMixFormat(&m_waveFormat);

    if (FAILED(hr)) {
        m_lastError = "Failed to get mix format";
        return false;
    }

    m_sampleRate = m_waveFormat->nSamplesPerSec;
    m_channels = m_waveFormat->nChannels;

    // Initialize audio client for loopback capture
    // AUDCLNT_STREAMFLAGS_LOOPBACK is the key flag for capturing system audio
    hr = m_audioClient->Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK,
        10000000,  // 1 second buffer (in 100-nanosecond units)
        0,
        m_waveFormat,
        nullptr
    );

    if (FAILED(hr)) {
        m_lastError = "Failed to initialize audio client for loopback. Error: " + std::to_string(hr);
        return false;
    }

    // Get buffer size
    hr = m_audioClient->GetBufferSize(&m_bufferFrameCount);

    if (FAILED(hr)) {
        m_lastError = "Failed to get buffer size";
        return false;
    }

    // Get capture client
    hr = m_audioClient->GetService(
        IID_IAudioCaptureClient,
        (void**)&m_captureClient
    );

    if (FAILED(hr)) {
        m_lastError = "Failed to get capture client";
        return false;
    }

    return true;
}

bool AudioCapture::Start(AudioDataCallback callback) {
    if (m_isCapturing) {
        m_lastError = "Already capturing";
        return false;
    }

    if (!m_audioClient) {
        m_lastError = "Audio client not initialized";
        return false;
    }

    m_callback = callback;
    m_isCapturing = true;

    // Start the audio client
    HRESULT hr = m_audioClient->Start();
    if (FAILED(hr)) {
        m_isCapturing = false;
        m_lastError = "Failed to start audio client";
        return false;
    }

    // Start capture thread
    m_captureThread = std::thread(&AudioCapture::CaptureThread, this);

    return true;
}

void AudioCapture::Stop() {
    if (!m_isCapturing) return;

    m_isCapturing = false;

    if (m_captureThread.joinable()) {
        m_captureThread.join();
    }

    if (m_audioClient) {
        m_audioClient->Stop();
    }
}

void AudioCapture::CaptureThread() {
    HRESULT hr;
    UINT32 packetLength = 0;

    while (m_isCapturing) {
        // Get next packet size
        hr = m_captureClient->GetNextPacketSize(&packetLength);

        if (FAILED(hr)) {
            break;
        }

        while (packetLength != 0) {
            BYTE* data;
            UINT32 numFramesAvailable;
            DWORD flags;

            // Get buffer
            hr = m_captureClient->GetBuffer(
                &data,
                &numFramesAvailable,
                &flags,
                nullptr,
                nullptr
            );

            if (FAILED(hr)) {
                break;
            }

            // Process audio data
            if (m_callback && numFramesAvailable > 0) {
                // Convert to 16-bit PCM if needed
                std::vector<int16_t> samples;

                if (m_waveFormat->wFormatTag == WAVE_FORMAT_IEEE_FLOAT ||
                    (m_waveFormat->wFormatTag == WAVE_FORMAT_EXTENSIBLE)) {
                    // Convert float to int16
                    float* floatData = (float*)data;
                    int numSamples = numFramesAvailable * m_channels;
                    samples.resize(numSamples);

                    for (int i = 0; i < numSamples; i++) {
                        float sample = floatData[i];
                        // Clamp and convert
                        if (sample > 1.0f) sample = 1.0f;
                        if (sample < -1.0f) sample = -1.0f;
                        samples[i] = (int16_t)(sample * 32767.0f);
                    }
                } else if (m_waveFormat->wBitsPerSample == 16) {
                    // Already 16-bit PCM
                    int16_t* pcmData = (int16_t*)data;
                    int numSamples = numFramesAvailable * m_channels;
                    samples.assign(pcmData, pcmData + numSamples);
                }

                if (!samples.empty() && !(flags & AUDCLNT_BUFFERFLAGS_SILENT)) {
                    m_callback(samples, m_sampleRate, m_channels);
                }
            }

            // Release buffer
            hr = m_captureClient->ReleaseBuffer(numFramesAvailable);

            if (FAILED(hr)) {
                break;
            }

            // Get next packet size
            hr = m_captureClient->GetNextPacketSize(&packetLength);

            if (FAILED(hr)) {
                break;
            }
        }

        // Sleep a bit to avoid busy waiting
        Sleep(10);
    }
}

void AudioCapture::Cleanup() {
    if (m_captureClient) {
        m_captureClient->Release();
        m_captureClient = nullptr;
    }

    if (m_audioClient) {
        m_audioClient->Release();
        m_audioClient = nullptr;
    }

    if (m_device) {
        m_device->Release();
        m_device = nullptr;
    }

    if (m_deviceEnumerator) {
        m_deviceEnumerator->Release();
        m_deviceEnumerator = nullptr;
    }

    if (m_waveFormat) {
        CoTaskMemFree(m_waveFormat);
        m_waveFormat = nullptr;
    }
}
